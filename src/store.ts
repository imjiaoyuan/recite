// localStorage persistence: per-word SRS state (isolated per list) + global settings.
//
// In-memory caches parse each key once per tab, so the hot path — schedule() +
// bumpActivity() on every grade — no longer re-parses the whole SRS object each time.
// Caches are invalidated on cross-tab writes (a `storage` event listener) and on
// import/clear, so views never hold stale copies within a tab.
import type { Meta, WordState } from './types';

const STATE_KEY = 'recite:state';
const META_KEY = 'recite:meta';
const ACT_KEY = 'recite:activity';

const defaultMeta: Meta = {
  selectedList: null,
  voice: 'en-US',
  dailyLimit: 50,
  spellCountdown: 0,
  theme: 'auto',
  lang: 'auto',
  ttsEngine: 'system',
};

let stateCache: Record<string, WordState> | null = null;
let metaCache: Meta | null = null;
let actCache: Record<string, number> | null = null;

// Quota-exceeded is the one write failure the UI must surface (a grade would otherwise
// be silently lost). Registered by the app shell; store.ts stays free of UI deps.
let quotaHandler: (() => void) | null = null;
export function onQuotaExceeded(cb: (() => void) | null): void {
  quotaHandler = cb;
}

// Another tab wrote — drop our cache so the next read picks up the new value.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY) stateCache = null;
    else if (e.key === META_KEY) metaCache = null;
    else if (e.key === ACT_KEY) actCache = null;
  });
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn('[store] read failed', key, e);
    return fallback;
  }
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function write(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    if (isQuotaError(e)) {
      // Storage full — this write is lost. Surface it (never silent); keep going so
      // the grade flow doesn't crash. The in-memory cache still reflects the action
      // for the rest of the session.
      console.error('[store] quota exceeded — write lost', key, e);
      quotaHandler?.();
      return;
    }
    console.warn('[store] write failed', key, e);
  }
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wordKey(listId: string, word: string): string {
  return `${listId}:${word}`;
}

export function getState(): Record<string, WordState> {
  return (stateCache ??= read<Record<string, WordState>>(STATE_KEY, {}));
}

export function getWordState(listId: string, word: string): WordState | null {
  return getState()[wordKey(listId, word)] || null;
}

export function setWordState(listId: string, word: string, st: WordState): void {
  const s = getState();
  s[wordKey(listId, word)] = st;
  write(STATE_KEY, s);
}

// Drop a word's SRS entry entirely — used by study's undo to return a fresh word
// (graded by mistake) back to "unseen".
export function removeWordState(listId: string, word: string): void {
  const s = getState();
  delete s[wordKey(listId, word)];
  write(STATE_KEY, s);
}

export function getMeta(): Meta {
  return (metaCache ??= { ...defaultMeta, ...read<Partial<Meta>>(META_KEY, {}) });
}

export function setMeta(patch: Partial<Meta>): Meta {
  const m = { ...getMeta(), ...patch };
  metaCache = m;
  write(META_KEY, m);
  return m;
}

// ---- Daily activity (streak + heatmap) ----

export function getActivity(): Record<string, number> {
  return (actCache ??= read<Record<string, number>>(ACT_KEY, {}));
}

export function bumpActivity(n = 1): void {
  const a = getActivity();
  const t = todayStr();
  a[t] = (a[t] || 0) + n;
  write(ACT_KEY, a);
}

// ---- Difficult words ----

export function getDifficult(): { listId: string; word: string }[] {
  const state = getState();
  const out: { listId: string; word: string }[] = [];
  for (const k in state) {
    const st = state[k];
    if (st && st.diff) {
      const i = k.indexOf(':');
      out.push({ listId: k.slice(0, i), word: k.slice(i + 1) });
    }
  }
  return out;
}

// Per-list started/due counts in a single pass (replaces a full state scan per list).
export function statsByList(): Record<string, { started: number; due: number }> {
  const state = getState();
  const now = Date.now();
  const out: Record<string, { started: number; due: number }> = {};
  for (const k in state) {
    const st = state[k];
    if (!st) continue;
    const i = k.indexOf(':');
    const listId = i < 0 ? k : k.slice(0, i);
    const acc = (out[listId] ??= { started: 0, due: 0 });
    acc.started++;
    if (st.due <= now) acc.due++;
  }
  return out;
}

// ---- Backup / restore ----

function asObject(v: unknown, field: string): asserts v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Error(`backup field "${field}" must be a JSON object`);
}

export function exportData(): string {
  return JSON.stringify({
    version: 1,
    date: new Date().toISOString(),
    state: getState(),
    meta: getMeta(),
    activity: getActivity(),
  });
}

export function importData(jsonStr: string): void {
  const data = JSON.parse(jsonStr); // SyntaxError propagates -> caller surfaces importFail
  asObject(data, 'root');
  // Write each present section, then drop the caches so reads see the new data.
  if (data.state != null) {
    asObject(data.state, 'state');
    write(STATE_KEY, data.state);
  }
  if (data.meta != null) {
    asObject(data.meta, 'meta');
    write(META_KEY, { ...defaultMeta, ...(data.meta as Partial<Meta>) });
  }
  if (data.activity != null) {
    asObject(data.activity, 'activity');
    write(ACT_KEY, data.activity as Record<string, number>);
  }
  stateCache = metaCache = actCache = null;
}

// ---- Reset ----

// Wipe learning progress (SRS state + activity). Settings (meta) are kept.
export function clearAll(): void {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(ACT_KEY);
  stateCache = null;
  actCache = null;
}

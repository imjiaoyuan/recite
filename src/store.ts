// localStorage persistence: per-word SRS state (isolated per list) + global settings.
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
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn('[store] read failed', key, e);
    return fallback;
  }
}

function write(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn('[store] write failed', key, e);
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wordKey(listId: string, word: string): string {
  return `${listId}:${word}`;
}

export function getState(): Record<string, WordState> {
  return read<Record<string, WordState>>(STATE_KEY, {});
}

export function getWordState(listId: string, word: string): WordState | null {
  return getState()[wordKey(listId, word)] || null;
}

export function setWordState(listId: string, word: string, st: WordState): void {
  const s = getState();
  s[wordKey(listId, word)] = st;
  write(STATE_KEY, s);
}

export function getMeta(): Meta {
  return { ...defaultMeta, ...read<Partial<Meta>>(META_KEY, {}) };
}

export function setMeta(patch: Partial<Meta>): Meta {
  const m = { ...getMeta(), ...patch };
  write(META_KEY, m);
  return m;
}

// ---- Daily activity (streak + heatmap) ----

export function getActivity(): Record<string, number> {
  return read<Record<string, number>>(ACT_KEY, {});
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

// ---- Backup / restore ----

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
  const data = JSON.parse(jsonStr) as {
    state?: Record<string, WordState>;
    meta?: Partial<Meta>;
    activity?: Record<string, number>;
  };
  if (data.state) write(STATE_KEY, data.state);
  if (data.meta) write(META_KEY, { ...defaultMeta, ...data.meta });
  if (data.activity) write(ACT_KEY, data.activity);
}

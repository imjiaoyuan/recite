// localStorage persistence: per-word SRS state (isolated per list) + global settings.
//
// In-memory caches parse each key once per tab, so the hot path — schedule() +
// bumpActivity() on every grade — no longer re-parses the whole SRS object each time.
// Caches are invalidated on cross-tab writes (a `storage` event listener) and on
// import/clear, so views never hold stale copies within a tab.
import type { ListMeta, Meta, UserList, WordEntry, WordState } from './types';

const STATE_KEY = 'recite:state';
const META_KEY = 'recite:meta';
const ACT_KEY = 'recite:activity';
const USER_KEY = 'recite:userlists';
const DAILY_KEY = 'recite:daily';
// Deletion tombstones for sync: listId -> epoch-ms of deletion. Without these,
// device A deleting a user list would be undone by device B's next merge (B
// still has the list and would resurrect it). Tombstones older than 90 days are
// pruned on sync — every device has merged long before then.
export const TOMB_KEY = 'recite:tombs';

const defaultMeta: Meta = {
  selectedList: null,
  voice: 'en-US',
  dailyLimit: 50,
  spellCountdown: 0,
  theme: 'auto',
  lang: 'auto',
  langNotice: '',
  retention: 0.9,
  syncUrl: '',
  syncKey: '',
  syncToken: '',
  syncLast: 0,
  seenVersion: '',
};

let stateCache: Record<string, WordState> | null = null;
let metaCache: Meta | null = null;
let actCache: Record<string, number> | null = null;
let userListsCache: UserList[] | null = null;
let dailyCache: DailyNew | null = null;
let tombCache: Record<string, number> | null = null;

// Today's per-list new-word counts (drives the 每日新词 quota, which spans sessions).
export interface DailyNew {
  d: string; // YYYY-MM-DD the counts belong to
  n: Record<string, number>; // listId -> new words introduced that day
}

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
    else if (e.key === USER_KEY) userListsCache = null;
    else if (e.key === DAILY_KEY) dailyCache = null;
    else if (e.key === TOMB_KEY) tombCache = null;
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

// YYYY-MM-DD for any Date (local time). todayStr() below and the stats heatmap
// share this formatter.
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return dateKey(new Date());
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

// Wholesale replacers — used by the sync merge to write a whole merged dataset
// back in one pass (the caches are swapped in the same step so views stay fresh).
export function setState(s: Record<string, WordState>): void {
  stateCache = s;
  write(STATE_KEY, s);
}
export function setActivity(a: Record<string, number>): void {
  actCache = a;
  write(ACT_KEY, a);
}
export function setUserLists(lists: UserList[]): void {
  userListsCache = lists;
  write(USER_KEY, lists);
}
export function setDaily(d: DailyNew): void {
  dailyCache = d;
  write(DAILY_KEY, d);
}
export function setTombs(t: Record<string, number>): void {
  tombCache = t;
  write(TOMB_KEY, t);
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

// Bulk mark words as already-known: excluded from study, counted as learned (not due).
// Batched — one state read + one write regardless of how many words. A studied
// word keeps its full state (including the FSRS memory model) with only the
// flag flipped, so unmarking resumes exactly where it left off.
export function markKnown(listId: string, words: string[]): void {
  if (!words.length) return;
  const s = getState();
  const now = Date.now();
  for (const w of words) {
    const key = wordKey(listId, w);
    const prev = s[key];
    s[key] = prev
      ? { ...prev, known: true }
      : { reps: 0, ef: 2.5, interval: 0, due: now, seen: 0, known: true };
  }
  write(STATE_KEY, s);
}

// Reverse of markKnown. If the word was only ever bulk-marked (never studied), drop it
// so it becomes fresh again; otherwise keep its review history and just clear the flag.
export function unmarkKnown(listId: string, words: string[]): void {
  if (!words.length) return;
  const s = getState();
  for (const w of words) {
    const key = wordKey(listId, w);
    const prev = s[key];
    if (!prev) continue;
    if ((prev.seen || 0) > 0 || prev.lastReviewed != null) s[key] = { ...prev, known: false };
    else delete s[key];
  }
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

// ---- Daily new-word quota (墨墨-style: caps NEW words only, reviews unmetered) ----

function getDaily0(): DailyNew {
  dailyCache ??= read<DailyNew>(DAILY_KEY, { d: todayStr(), n: {} });
  // Stale date -> today's counters are all zero (rolled over lazily, no write here).
  return dailyCache.d === todayStr() ? dailyCache : { d: todayStr(), n: {} };
}

export function getDaily(): DailyNew {
  return getDaily0();
}

export function todayNew(listId: string): number {
  return getDaily0().n[listId] || 0;
}

// Count a fresh word introduction against the list's daily-new quota. Undo passes
// -1; clamped at 0 so a cross-midnight undo can't go negative on the new day.
export function bumpNew(listId: string, n = 1): void {
  const d = getDaily0();
  d.n[listId] = Math.max(0, (d.n[listId] || 0) + n);
  dailyCache = d;
  write(DAILY_KEY, d);
}

// ---- Difficult words ----

export function getDifficult(): { listId: string; word: string }[] {
  const state = getState();
  const out: { listId: string; word: string }[] = [];
  for (const k in state) {
    const st = state[k];
    if (st && st.diff && !st.known) {
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
    if (st.known) continue; // known counts as learned, never due
    if (st.due <= now) acc.due++;
  }
  return out;
}

// ---- Deletion tombstones (sync) ----

export function getTombs(): Record<string, number> {
  return (tombCache ??= read<Record<string, number>>(TOMB_KEY, {}));
}

export function addTomb(listId: string): void {
  const t = getTombs();
  t[listId] = Date.now();
  write(TOMB_KEY, t);
}

// ---- User-created word lists ----

export function getUserLists(): UserList[] {
  return (userListsCache ??= read<UserList[]>(USER_KEY, []));
}

// Project user lists into ListMeta shape so the home grid + stats treat them uniformly.
export function userListsAsMeta(): ListMeta[] {
  return getUserLists().map((u) => ({ id: u.id, name: u.name, desc: '', file: '', count: u.words.length }));
}

export function createUserList(name: string, words: WordEntry[]): string {
  const id = `user-${Date.now().toString(36)}`;
  const lists = getUserLists();
  lists.push({ id, name: name.trim(), words, createdAt: Date.now() });
  write(USER_KEY, lists);
  return id;
}

// Delete a user list and wipe its words' SRS state in one pass each.
export function deleteUserList(id: string): void {
  const lists = getUserLists().filter((u) => u.id !== id);
  userListsCache = lists;
  write(USER_KEY, lists);
  const s = getState();
  const prefix = `${id}:`;
  for (const k in s) if (k.startsWith(prefix)) delete s[k];
  write(STATE_KEY, s);
  // Record the deletion so a later sync merge doesn't resurrect the list
  // from a device that hasn't seen the delete yet.
  addTomb(id);
  // Stop the boot prefetch from 404-ing on the deleted list forever.
  if (getMeta().selectedList === id) setMeta({ selectedList: null });
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
    userlists: getUserLists(),
    daily: getDaily(),
    tombs: getTombs(),
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
  if (data.userlists != null) {
    if (!Array.isArray(data.userlists)) throw new Error('backup field "userlists" must be an array');
    write(USER_KEY, data.userlists);
  }
  if (data.daily != null) {
    asObject(data.daily, 'daily');
    write(DAILY_KEY, data.daily);
  }
  if (data.tombs != null) {
    asObject(data.tombs, 'tombs');
    write(TOMB_KEY, data.tombs);
  }
  stateCache = metaCache = actCache = userListsCache = dailyCache = tombCache = null;
}

// ---- Reset ----

// Wipe learning progress (SRS state + activity + daily-new counters). Settings (meta) are kept.
export function clearAll(): void {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(ACT_KEY);
  localStorage.removeItem(DAILY_KEY);
  stateCache = null;
  actCache = null;
  dailyCache = null;
}

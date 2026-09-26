// Cloud sync: local-first, dumb-storage backends, client-side merge.
//
// The cloud copy is never the source of truth — it is a mirror plus a merge
// point. One sync = 1 read + 1 write against a JSON blob keyed by the sync
// code, comfortably inside KV's free tier (100k reads / 1k writes per day).
//
// Merge rules (Anki-style last-write-wins per object):
//   state   — per word key, the copy with the newer lastReviewed wins; a copy
//             without lastReviewed (ancient SM-2 data) loses to one that has it
//   userlists  — union by id, newer createdAt-agnostic edit wins by a `mtime`
//             field (added by sync; lists created before sync exist have none,
//             treated as equal → keep local unless remote changed it)
//   daily      — same-day counts take the max per list; different days: the
//             newer day wins outright (the older day's quota is irrelevant now)
//   activity   — per-date max (the heatmap is additive, never conflicting)
//   meta       — NEVER merged; settings are per-device. Only syncLast is ours.
//   tombs      — union; entries older than 90 days are pruned, and any user
//             list whose id is tombstoned is dropped from the merged result
//
// Backends: 'worker' (Cloudflare Worker + KV, the one-button deploy in README)
// and 'webdav' (self-hosted Nextcloud etc. — most public WebDAV services don't
// send CORS headers, so this is an advanced option).
import { getMeta, setMeta, getState, setState, getActivity, setActivity, getUserLists, setUserLists, getDaily, setDaily, getTombs, setTombs } from './store';
import type { Meta, UserList, WordState } from './types';
import type { DailyNew } from './store';

// ---- Sync payload shape (what lives in the cloud) ----

export interface SyncPayload {
  v: 1;
  date: string; // ISO timestamp of the last write
  state: Record<string, WordState>;
  userlists: UserList[];
  daily: DailyNew | null;
  activity: Record<string, number>;
  tombs: Record<string, number>;
}

const TOMB_TTL = 90 * 24 * 3600 * 1000;

function snapshot(): SyncPayload {
  return {
    v: 1,
    date: new Date().toISOString(),
    state: getState(),
    userlists: getUserLists().map((u) => ({ ...u, mtime: u.mtime || Date.now() })),
    daily: getDaily(),
    activity: getActivity(),
    tombs: getTombs(),
  };
}

// ---- Merge (pure: no localStorage access) ----

function newerWordState(a: WordState, b: WordState): WordState {
  const ta = a.lastReviewed ?? 0;
  const tb = b.lastReviewed ?? 0;
  if (ta !== tb) return ta > tb ? a : b;
  // Same (or missing) review time — fall back to more recent reps (a word that
  // was graded more times carries more information).
  return (b.reps || 0) > (a.reps || 0) ? b : a;
}

export function merge(local: SyncPayload, remote: SyncPayload): SyncPayload {
  // 1. Word states: union of keys, newest review wins.
  const state: Record<string, WordState> = { ...local.state };
  for (const k in remote.state) {
    const r = remote.state[k];
    const l = state[k];
    state[k] = l ? newerWordState(l, r) : r;
  }

  // 2. Tombstones: union, then prune. A tombstone beats a same-id user list
  // unless the list was re-created AFTER the tombstone (deleted then rebuilt).
  const now = Date.now();
  const tombs: Record<string, number> = {};
  for (const src of [local.tombs, remote.tombs]) {
    for (const id in src) {
      const t = src[id];
      if (t > 0 && now - t < TOMB_TTL) tombs[id] = Math.max(tombs[id] || 0, t);
    }
  }

  // 3. User lists: union by id, newer mtime wins, tombstones respected.
  const lists: UserList[] = [];
  const seen = new Map<string, UserList>();
  for (const u of [...local.userlists, ...remote.userlists]) {
    const tomb = tombs[u.id] || 0;
    if (tomb && (u.mtime || 0) <= tomb) continue; // deleted, not re-created since
    const prev = seen.get(u.id);
    if (!prev || (u.mtime || 0) > (prev.mtime || 0)) {
      // Keep the winner, but let a newer tombstone still shadow it next round.
      seen.set(u.id, u);
    }
  }
  lists.push(...seen.values());

  // 4. Daily-new quota: counts only matter for *today*. Keep the entry whose
  // day is newer; equal days → per-list max (both devices introduced words).
  let daily: DailyNew | null = null;
  const ld = local.daily;
  const rd = remote.daily;
  if (!ld && !rd) daily = null;
  else if (!ld) daily = rd;
  else if (!rd) daily = ld;
  else if (ld.d === rd.d) {
    const n = { ...ld.n };
    for (const id in rd.n) n[id] = Math.max(n[id] || 0, rd.n[id]);
    daily = { d: ld.d, n };
  } else daily = ld.d > rd.d ? ld : rd;

  // 5. Activity: per-date max. Both are plain additive counters.
  const activity: Record<string, number> = { ...local.activity };
  for (const d in remote.activity) activity[d] = Math.max(activity[d] || 0, remote.activity[d]);

  return { v: 1, date: new Date().toISOString(), state, userlists: lists, daily, activity, tombs };
}

// Persist a merged payload back into this device. Meta is deliberately not
// touched (settings are per-device).
export function applyMerged(m: SyncPayload): void {
  setState(m.state);
  setUserLists(m.userlists);
  setActivity(m.activity);
  setDaily(m.daily || { d: '', n: {} });
  setTombs(m.tombs);
}

// ---- Backends ----

function authHeaders(meta: Meta): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (meta.syncToken) h['authorization'] = `Bearer ${meta.syncToken}`;
  return h;
}

// WebDAV is opted in EXPLICITLY via a `webdav://` (or `webdav+http://`) URL
// prefix, which also converts to a fetchable scheme. Guessing by hostname would
// misfire the moment someone fronts their Worker with a custom domain.
function webdavUrl(meta: Meta): string {
  const m = meta.syncUrl.match(/^webdav(?:\+(https?))?:\/\//i);
  const scheme = (m && m[1]) || 'https';
  const rest = meta.syncUrl.replace(/^webdav(?:\+https?)?:\/\//i, '').replace(/\/+$/, '');
  // The sync key is folded into the URL as a file name so several devices/users
  // can share one server. Credentials may live in the URL as userinfo.
  return `${scheme}://${rest}/recite-${meta.syncKey || 'default'}.json`;
}

function isWebdav(meta: Meta): boolean {
  return !sameOriginStore() && /^webdav(?:\+(https?))?:\/\//i.test(meta.syncUrl);
}

async function pullRemote(meta: Meta): Promise<SyncPayload | null> {
  const res = isWebdav(meta)
    ? await fetch(webdavUrl(meta), { method: 'GET', headers: authHeaders(meta) })
    : await fetch(`${serverUrl(meta).replace(/\/+$/, '')}/${encodeURIComponent(meta.syncKey)}`, { headers: authHeaders(meta) });
  if (res.status === 404) return null; // never synced — first device to arrive
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const body = await res.json();
  const data = (body && typeof body === 'object' && 'data' in body ? body.data : body) as SyncPayload | null;
  if (!data || typeof data !== 'object' || !data.state) return null;
  return {
    v: 1,
    date: data.date || '',
    state: data.state || {},
    userlists: Array.isArray(data.userlists) ? data.userlists : [],
    daily: data.daily && data.daily.d ? data.daily : null,
    activity: data.activity || {},
    tombs: data.tombs || {},
  };
}

async function pushMerged(meta: Meta, m: SyncPayload): Promise<void> {
  const res = isWebdav(meta)
    ? await fetch(webdavUrl(meta), { method: 'PUT', headers: authHeaders(meta), body: JSON.stringify(m) })
    : await fetch(`${serverUrl(meta).replace(/\/+$/, '')}/${encodeURIComponent(meta.syncKey)}`, { method: 'PUT', headers: authHeaders(meta), body: JSON.stringify(m) });
  if (!res.ok) throw new Error(`push ${res.status}`);
}

// ---- Orchestration ----

// The sync code is typed by the user (their own code, same on every device);
// we only sanity-check its shape: 4–64 url-safe chars, dotless single-segment
// path — the exact charset the worker routes to KV.
export function validSyncKey(k: string): boolean {
  return /^[A-Za-z0-9_-]{4,64}$/.test(k);
}

let syncing = false;

// Full round: pull → merge → apply locally → push. Guarded so overlapping calls
// (startup auto-sync racing a session-end sync) coalesce into one.
export async function runSync(): Promise<{ ok: boolean; error?: string }> {
  const meta = getMeta();
  if (!syncConfigured() || syncing) return { ok: false, error: 'busy' };
  syncing = true;
  try {
    const remote = await pullRemote(meta).catch((e) => {
      throw new Error(`pull failed: ${String(e && e.message ? e.message : e)}`);
    });
    const local = snapshot();
    const merged = remote ? merge(local, remote) : local;
    applyMerged(merged);
    await pushMerged(meta, merged).catch((e) => {
      throw new Error(`push failed: ${String(e && e.message ? e.message : e)}`);
    });
    setMeta({ syncLast: Date.now() });
    return { ok: true };
  } finally {
    syncing = false;
  }
}

// Background sync for startup / session end: silent on success, console-only on
// failure (the settings page shows the last error via syncLast).
export async function autoSync(): Promise<void> {
  if (!syncConfigured()) return;
  try {
    await runSync();
  } catch (e) {
    console.warn('[sync] auto-sync failed', e);
  }
}

// ---- Same-origin data store ----
// A deployment of the sync worker serves the app AND is its data store: the
// worker stamps <meta name="recite-sync"> into every HTML response, so the
// page knows "the origin I came from has the KV behind it". No probing, no
// URLs: on such a deployment the sync server is always location.origin and
// the settings UI hides the URL field entirely. GitHub Pages and other plain
// hosts have no marker — there the URL field stays and is filled by hand.
let storeMode: boolean | null = null;
export function sameOriginStore(): boolean {
  if (storeMode === null) {
    storeMode = !!document.querySelector('meta[name="recite-sync"]');
  }
  return storeMode;
}

// The sync server URL for the current page: this origin when served by a
// sync worker, else whatever the user configured (cross-origin / WebDAV).
export function serverUrl(m: Meta): string {
  return sameOriginStore() ? location.origin : m.syncUrl;
}

// Effective config check used by runSync/autoSync and the settings page.
export function syncConfigured(): boolean {
  const m = getMeta();
  return !!(m.syncKey && (sameOriginStore() || m.syncUrl));
}

// Session = SRS-due reviews first, then the next unseen words in order (personal
// progression). 墨墨-style daily quota: `limit` caps NEW words only and spans the
// whole day (counted in recite:daily, per list) — due reviews are NOT capped and
// don't consume the quota, so a backlog day still learns its full share of new
// words. The done screen can top the quota up by hand (加学): buildSession takes
// an `extraNew` argument, and topupOffer() sizes the button to what actually
// remains learnable — never offering more than the session can deliver.
import { getState, getMeta, todayNew } from './store';
import { shuffle } from './ui';
import type { Session, WordEntry } from './types';

// The daily new-word quota, with its default in one place (views used to hand-copy `|| 50`).
export function dailyLimit(): number {
  return getMeta().dailyLimit || 50;
}

// Hard cap on one top-up batch from the done screen (0 disables 加学 entirely).
const TOPUP_MAX = 100;

// How many NEW words today's quota still has room for, given `remaining` unseen
// words exist. The home badge and buildSession share this policy — keep them in
// sync here, not in two copies of the arithmetic.
export function newToday(listId: string, remaining: number): number {
  return Math.max(0, Math.min(dailyLimit() - todayNew(listId), remaining));
}

// Words of `list` never seen and not marked known — everything a future session
// (quota or 加学) could still introduce. Known words are skipped: they never
// enter a session, so promising them as "new" would be a lie on the button.
export function remainingFresh(list: WordEntry[], listId: string): number {
  const state = getState();
  let n = 0;
  for (const e of list) {
    const st = state[`${listId}:${e.word}`];
    if (!st) n++;
  }
  return n;
}

// Today's top-up offer for the done screen: how many new words could still be
// pulled by hand beyond the quota. Capped by TOPUP_MAX and by the words the
// list actually has left — the button never promises what buildSession can't
// deliver. `remaining` comes from remainingFresh() (exact, state-backed).
export function topupOffer(remaining: number): number {
  if (TOPUP_MAX <= 0) return 0;
  return Math.max(0, Math.min(remaining, TOPUP_MAX));
}

export function buildSession(list: WordEntry[], listId: string, limit: number, extraNew = 0, now = Date.now()): Session {
  const state = getState();
  const due: WordEntry[] = [];
  const fresh: WordEntry[] = [];
  for (const e of list) {
    const st = state[`${listId}:${e.word}`];
    if (st && !st.known && st.due <= now) due.push(e);
  }
  // `limit` is today's new-word quota; `extraNew` is the done screen's manual
  // top-up. Extras deliberately bypass recite:daily — 加学 is an explicit human
  // decision to exceed the daily quota, not an accounting error to correct.
  // Both are capped by the unseen words that actually exist.
  const quotaLeft = Math.max(0, limit - todayNew(listId));
  const want = quotaLeft + Math.min(extraNew, TOPUP_MAX);
  for (const e of list) {
    if (fresh.length >= want) break;
    const st = state[`${listId}:${e.word}`];
    if (!st) fresh.push(e);
  }
  shuffle(due);
  shuffle(fresh);
  return { due, fresh };
}

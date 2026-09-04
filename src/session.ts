// Session = SRS-due reviews first, then the next unseen words in order (personal
// progression). 墨墨-style daily quota: `limit` caps NEW words only and spans the
// whole day (counted in recite:daily, per list) — due reviews are NOT capped and
// don't consume the quota, so a backlog day still learns its full share of new
// words.
import { getMeta, getState, todayNew } from './store';
import { shuffle } from './ui';
import type { Session, WordEntry } from './types';

// The daily new-word quota, with its default in one place (views used to hand-copy `|| 50`).
export function dailyLimit(): number {
  return getMeta().dailyLimit || 50;
}

// How many NEW words today's quota still has room for, given `remaining` unseen
// words exist. The home badge and buildSession share this policy — keep them in
// sync here, not in two copies of the arithmetic.
export function newToday(listId: string, remaining: number): number {
  return Math.max(0, Math.min(dailyLimit() - todayNew(listId), remaining));
}

export function buildSession(list: WordEntry[], listId: string, limit: number, now = Date.now()): Session {
  const state = getState();
  const due: WordEntry[] = [];
  const fresh: WordEntry[] = [];
  for (const e of list) {
    const st = state[`${listId}:${e.word}`];
    if (st && !st.known && st.due <= now) due.push(e);
  }
  let freshCount = 0;
  for (const e of list) {
    if (freshCount >= limit - todayNew(listId)) break;
    const st = state[`${listId}:${e.word}`];
    if (!st) {
      fresh.push(e);
      freshCount += 1;
    }
  }
  shuffle(due);
  shuffle(fresh);
  return { due, fresh };
}

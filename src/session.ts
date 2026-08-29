// Session = SRS-due reviews first, then the next unseen words in order (personal
// progression). 墨墨-style daily quota: `limit` caps new + review TOGETHER — due
// reviews take priority, and new words fill the remaining slots. A backlog day
// therefore spends the whole quota on reviews and introduces no new words.
import { getMeta, getState } from './store';
import { shuffle } from './ui';
import type { Session, WordEntry } from './types';

// The daily quota, with its default in one place (views used to hand-copy `|| 50`).
export function dailyLimit(): number {
  return getMeta().dailyLimit || 50;
}

// How many NEW words today's quota still has room for, given `due` reviews
// already claimed their share and `remaining` unseen words exist. The home
// badge and buildSession share this policy — keep them in sync here, not in
// two copies of the arithmetic.
export function newToday(due: number, remaining: number): number {
  return Math.max(0, Math.min(dailyLimit() - due, remaining));
}

export function buildSession(list: WordEntry[], listId: string, limit: number, now = Date.now()): Session {
  const state = getState();
  const due: WordEntry[] = [];
  const fresh: WordEntry[] = [];
  for (const e of list) {
    if (due.length >= limit) break;
    const st = state[`${listId}:${e.word}`];
    if (st && !st.known && st.due <= now) due.push(e);
  }
  const freshQuota = Math.max(0, limit - due.length);
  let freshCount = 0;
  for (const e of list) {
    if (freshCount >= freshQuota) break;
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

// Session = SRS-due reviews first, then the next unseen words in order (personal
// progression). 墨墨-style daily quota: `limit` caps NEW words only and spans the
// whole day (counted in recite:daily, per list) — due reviews are NOT capped and
// don't consume the quota, so a backlog day still learns its full share of new
// words. The done screen can top the quota up by hand (加学): buildSession takes
// an `extraNew` argument, and topupOffer() computes what the button offers.
import { getMeta, getState, todayNew } from './store';
import { shuffle } from './ui';
import type { Session, WordEntry } from './types';

// The daily new-word quota, with its default in one place (views used to hand-copy `|| 50`).
export function dailyLimit(): number {
  return getMeta().dailyLimit || 50;
}

// Headroom the quota system always leaves for a manual top-up on the done
// screen. Not a display value — buildSession reserves this many slots on top
// of the quota, so 加学 still works when the list is nearly exhausted.
const TOPUP_RESERVE = 30;

// Hard cap on one top-up batch from the done screen (0 disables 加学 entirely).
const TOPUP_MAX = 100;

// How many NEW words today's quota still has room for, given `remaining` unseen
// words exist. The home badge and buildSession share this policy — keep them in
// sync here, not in two copies of the arithmetic.
export function newToday(listId: string, remaining: number): number {
  return Math.max(0, Math.min(dailyLimit() - todayNew(listId), remaining));
}

// Today's top-up offer for the done screen: how many new words could still be
// pulled by hand beyond the quota. Capped by TOPUP_MAX and by the words this
// list has left, padded by TOPUP_RESERVE so the offer survives a nearly-done
// list (buildSession reserves the same headroom — keep the two in sync).
export function topupOffer(listId: string, remaining: number): number {
  if (TOPUP_MAX <= 0) return 0;
  const room = Math.min(remaining + TOPUP_RESERVE, TOPUP_MAX);
  return Math.max(0, room);
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
  // top-up. Both may exceed the words actually left — the loop collects what
  // exists, and the tail room (TOPUP_RESERVE) keeps 加学 possible on a nearly
  // exhausted list: the scan may then return fewer than `quotaLeft` (no fake
  // shortage — fresh.slice below would hand back everything found).
  const quotaLeft = Math.max(0, limit - todayNew(listId));
  const want = quotaLeft + Math.min(extraNew, TOPUP_MAX) + TOPUP_RESERVE;
  let freshCount = 0;
  for (const e of list) {
    if (freshCount >= want) break;
    const st = state[`${listId}:${e.word}`];
    if (!st) {
      fresh.push(e);
      freshCount += 1;
    }
  }
  shuffle(due);
  shuffle(fresh);
  return { due, fresh: fresh.slice(0, quotaLeft + Math.min(extraNew, TOPUP_MAX)) };
}

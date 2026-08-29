// Spaced repetition via FSRS (open-sourced by MaiMemo, the default scheduler
// in modern Anki). The app's four grade buttons map onto FSRS ratings:
//   q=1 -> Again, q=3 -> Hard, q=4 -> Good, q=5 -> Easy
// Short-term learning steps are disabled: our 墨墨-style in-session requeue
// already handles same-session reinforcement, and the whole app assumes
// day-granularity due dates.
//
// Legacy SM-2 states (reps/ef/interval without FSRS fields) migrate lazily on
// the next grade: the old interval becomes the memory stability and the ease
// factor maps inversely onto FSRS difficulty.
import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
import type { Card, FSRS, Grade } from 'ts-fsrs';
import { getMeta, getWordState, setWordState } from './store';
import type { WordState } from './types';

const DAY = 24 * 60 * 60 * 1000;

// One scheduler per retention setting; rebuilt only when the setting changes.
let schedRetention = -1;
let sched: FSRS | null = null;
function scheduler(): FSRS {
  // Out-of-range retention would make fsrs() throw and brick every grade —
  // it can arrive via a hand-edited import. Fall back to the default instead.
  const raw = Number(getMeta().retention);
  const r = raw > 0 && raw <= 1 ? raw : 0.9;
  if (!sched || schedRetention !== r) {
    sched = fsrs({
      request_retention: r,
      enable_fuzz: true,
      enable_short_term: false,
      learning_steps: [],
      relearning_steps: [],
    });
    schedRetention = r;
  }
  return sched;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Rebuild the FSRS card from persisted state, migrating legacy SM-2 entries.
function toCard(prev: WordState | null, now: number): Card {
  if (!prev || (prev.seen || 0) === 0) return createEmptyCard(new Date(now));
  const last = prev.lastReviewed ?? prev.due - (prev.interval || 1) * DAY;
  if (prev.s != null && prev.d != null) {
    return {
      due: new Date(prev.due),
      stability: prev.s,
      difficulty: prev.d,
      elapsed_days: Math.max(0, Math.round((now - last) / DAY)),
      scheduled_days: Math.max(0, prev.interval || 0),
      learning_steps: 0,
      reps: prev.reps || 0,
      lapses: prev.l || 0,
      state: (prev.state ?? State.Review) as State,
      last_review: prev.lastReviewed ? new Date(prev.lastReviewed) : undefined,
    };
  }
  // Legacy SM-2 state: interval is a decent proxy for stability; low ease
  // factor (hard word) maps to high difficulty.
  const interval = Math.max(1, prev.interval || 1);
  return {
    due: new Date(prev.due),
    stability: interval,
    difficulty: clamp(Math.round((11 - 2.5 * (prev.ef || 2.5)) * 100) / 100, 1, 10),
    elapsed_days: Math.max(0, Math.round((now - last) / DAY)),
    scheduled_days: interval,
    learning_steps: 0,
    reps: prev.reps || 1,
    lapses: 0,
    state: State.Review,
    last_review: prev.lastReviewed ? new Date(prev.lastReviewed) : undefined,
  };
}

const RATING_BY_Q: Record<number, Grade> = {
  1: Rating.Again,
  3: Rating.Hard,
  4: Rating.Good,
  5: Rating.Easy,
};

// Schedule a word by grade q (1/3/4/5) and persist.
export function schedule(listId: string, word: string, q: number, now = Date.now()): WordState {
  const prev = getWordState(listId, word);
  const rating = RATING_BY_Q[q] ?? Rating.Good;
  const c = scheduler().next(toCard(prev, now), new Date(now), rating).card;
  const st: WordState = {
    reps: c.reps,
    ef: prev?.ef ?? 2.5, // legacy field, kept so old backups round-trip
    interval: Math.max(1, Math.round(c.scheduled_days || 1)),
    due: c.due.getTime(),
    seen: (prev?.seen || 0) + 1,
    lastReviewed: now,
    s: Math.round(c.stability * 100) / 100,
    d: Math.round(c.difficulty * 100) / 100,
    l: c.lapses,
    state: c.state,
    // Again flags a difficult word, Good/Easy clears it, Hard keeps the old flag.
    diff: rating === Rating.Again ? true : rating === Rating.Hard ? !!prev?.diff : false,
  };
  setWordState(listId, word, st);
  return st;
}

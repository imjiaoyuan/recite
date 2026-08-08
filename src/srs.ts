// SM-2 spaced repetition (the idea behind Anki).
import { getWordState, setWordState } from './store';
import type { WordState } from './types';

const DAY = 24 * 60 * 60 * 1000;

function newState(now = Date.now()): WordState {
  return { reps: 0, ef: 2.5, interval: 0, due: now, seen: 0 };
}

// Schedule a word by recall quality q (0..5) and persist.
//   q < 3  -> wrong: reset reps, interval back to 1 day
//   q >= 3 -> right: advance interval, update ease factor
export function schedule(listId: string, word: string, q: number, now = Date.now()): WordState {
  let st = getWordState(listId, word) || newState(now);
  st = { ...st };

  if (q < 3) {
    st.reps = 0;
    st.interval = 1;
  } else {
    if (st.reps === 0) st.interval = 1;
    else if (st.reps === 1) st.interval = 6;
    else st.interval = Math.max(1, Math.round(st.interval * st.ef));
    st.reps += 1;
  }

  let ef = st.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  st.ef = Math.round(ef * 100) / 100;

  st.seen = (st.seen || 0) + 1;
  st.lastReviewed = now;
  st.diff = q < 3 ? true : q >= 4 ? false : !!st.diff;
  st.due = now + st.interval * DAY;

  setWordState(listId, word, st);
  return st;
}

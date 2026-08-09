// Session = SRS-due reviews first, then the next unseen words in order (personal progression).
import { getState } from './store';
import { shuffle } from './ui';
import type { Session, WordEntry } from './types';

export function buildSession(list: WordEntry[], listId: string, limit: number, now = Date.now()): Session {
  const state = getState();
  const due: WordEntry[] = [];
  const fresh: WordEntry[] = [];
  let freshCount = 0;
  for (const e of list) {
    const st = state[`${listId}:${e.word}`];
    if (st?.known) continue; // already known — never queued for study
    if (!st) {
      if (freshCount < limit) {
        fresh.push(e);
        freshCount += 1;
      }
    } else if (st.due <= now) {
      due.push(e);
    }
  }
  shuffle(due);
  shuffle(fresh);
  return { due, fresh };
}

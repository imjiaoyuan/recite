import type { Grade } from './types';

// Grade-button q values (1/3/4/5), mapped onto FSRS ratings in srs.ts. Shared by study + drill.
export const GRADES: Grade[] = [
  { label: 'grade.again', q: 1, cls: 'again' },
  { label: 'grade.hard', q: 3, cls: 'hard' },
  { label: 'grade.good', q: 4, cls: 'good' },
  { label: 'grade.easy', q: 5, cls: 'easy' },
];

// In-session requeue passes granted by each grade (study + drill). Every click
// RESETS the word's remaining appearances for today to its tier — 忘了 comes
// back 4 more times, 困难 3, 良好 2, 简单 0. 良好's passes are a confirmation:
// a second 良好 in a row ends the word (else it would loop forever). Pending
// copies from a weaker grade are dropped on reset.
export const PASSES: Record<number, number> = { 1: 4, 3: 3, 4: 2, 5: 0 };

import type { Grade } from './types';

// Grade-button q values (1/3/4/5), mapped onto FSRS ratings in srs.ts. Shared by study + drill.
export const GRADES: Grade[] = [
  { label: 'grade.again', q: 1, cls: 'again' },
  { label: 'grade.hard', q: 3, cls: 'hard' },
  { label: 'grade.good', q: 4, cls: 'good' },
  { label: 'grade.easy', q: 5, cls: 'easy' },
];

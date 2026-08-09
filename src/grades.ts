import type { Grade } from './types';

// SM-2 quality values for the grade buttons (q < 3 resets). Shared by study + drill.
export const GRADES: Grade[] = [
  { label: 'grade.again', q: 1, cls: 'again' },
  { label: 'grade.hard', q: 3, cls: 'hard' },
  { label: 'grade.good', q: 4, cls: 'good' },
  { label: 'grade.easy', q: 5, cls: 'easy' },
];

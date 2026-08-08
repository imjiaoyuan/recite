// Shared types across the app.

export interface WordEntry {
  word: string;
  phonetic: string;
  pos: string;
  translation: string;
  definition: string;
}

export interface WordState {
  reps: number;
  ef: number;
  interval: number;
  due: number;
  seen: number;
  diff?: boolean;
  lastReviewed?: number;
}

export interface ListMeta {
  id: string;
  name: string;
  desc: string;
  file: string;
}

export interface Meta {
  selectedList: string | null;
  voice: string;
  dailyLimit: number;
  spellCountdown: number;
  theme: string;
  lang: string;
}

export interface Session {
  due: WordEntry[];
  fresh: WordEntry[];
}

export interface Example {
  en: string;
  zh: string;
}

export interface Ctx {
  navigate: (hash: string) => void;
}

export interface ViewResult {
  el: HTMLElement;
  cleanup?: () => void;
}

export interface Grade {
  label: string;
  q: number;
  cls: string;
}

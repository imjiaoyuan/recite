// Shared types across the app.

export interface WordEntry {
  word: string;
  phonetic: string;
  pos: string;
  translation: string;
  definition: string;
}

export interface UserList {
  id: string;
  name: string;
  words: WordEntry[];
  createdAt: number;
}

export interface WordState {
  reps: number;
  ef: number; // legacy SM-2 field, unused by FSRS (kept for old backups)
  interval: number; // days
  due: number; // ms epoch
  seen: number;
  diff?: boolean;
  lastReviewed?: number;
  known?: boolean;
  // FSRS memory state
  s?: number; // stability (days)
  d?: number; // difficulty (1..10)
  l?: number; // lapses
  state?: number; // ts-fsrs State enum value
}

export interface ListMeta {
  id: string;
  name: string;
  desc: string;
  file: string;
  count: number;
}

export interface Meta {
  selectedList: string | null;
  voice: string;
  dailyLimit: number;
  spellCountdown: number;
  theme: string;
  lang: string;
  langNotice: string; // browser language code already warned about ('' = never warned)
  retention: number; // FSRS target retention (0.8 / 0.9 / 0.95)
  // ttsEngine ('system' | 'kokoro') existed while the offline-TTS fallback did;
  // stored values from old installs/backups are tolerated and ignored.
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

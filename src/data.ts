// Lazy-load word lists / meta / sentences, with caching.
import type { ListMeta, WordEntry, Example } from './types';
import { getUserLists, userListsAsMeta } from './store';

const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function url(file: string): string {
  return `${base}/data/${file}`;
}

const cache = new Map<string, unknown>();

export async function loadMeta(): Promise<{ lists: ListMeta[]; source?: string }> {
  let catalog = cache.get('meta') as { lists: ListMeta[]; source?: string } | undefined;
  if (!catalog) {
    const r = await fetch(url('meta.json'));
    if (!r.ok) throw new Error(`meta.json load failed (${r.status})`);
    catalog = (await r.json()) as { lists: ListMeta[]; source?: string };
    cache.set('meta', catalog);
  }
  // Merge user lists fresh on every call — they live in localStorage, not the fetch cache.
  return { lists: [...catalog.lists, ...userListsAsMeta()], source: catalog.source };
}

export async function loadList(id: string): Promise<WordEntry[]> {
  const ul = getUserLists().find((u) => u.id === id);
  if (ul) return ul.words; // custom list — read fresh from store, never the fetch cache
  const key = 'list:' + id;
  if (cache.has(key)) return cache.get(key) as WordEntry[];
  const r = await fetch(url(`${id}.json`));
  if (!r.ok) throw new Error(`list ${id} load failed (${r.status})`);
  const list = (await r.json()) as WordEntry[];
  cache.set(key, list);
  return list;
}

let wordIndex: Map<string, WordEntry> | null = null;

// Lowercase word -> canonical built-in entry. Built once over built-in lists only
// (custom lists are non-authoritative). Used by the create-list form to auto-fill meanings.
export async function getWordIndex(): Promise<Map<string, WordEntry>> {
  if (wordIndex) return wordIndex;
  const { lists } = await loadMeta();
  const idx = new Map<string, WordEntry>();
  for (const l of lists) {
    if (l.id.startsWith('user-')) continue; // built-in data only
    const list = await loadList(l.id);
    for (const e of list) {
      const lw = e.word.toLowerCase();
      if (!idx.has(lw)) idx.set(lw, e); // first occurrence wins
    }
  }
  wordIndex = idx;
  return idx;
}

let sentencesCache: Record<string, Example[]> | null = null;

// Sentences are optional: return {} when missing so callers degrade gracefully.
export async function loadSentences(): Promise<Record<string, Example[]>> {
  if (sentencesCache !== null) return sentencesCache;
  try {
    const r = await fetch(url('sentences.json'));
    if (!r.ok) {
      sentencesCache = {};
      return sentencesCache;
    }
    sentencesCache = (await r.json()) as Record<string, Example[]>;
  } catch (e) {
    // Sentences are an optional enhancement: degrade to no-example mode, but log it.
    console.warn('[data] sentences unavailable, degrading to no-example mode', e);
    sentencesCache = {};
  }
  return sentencesCache;
}

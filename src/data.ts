// Lazy-load word lists / meta / sentences, with caching. The cache holds the
// in-flight PROMISE, not the resolved value: a view entered while a boot
// prefetch is still running joins the same request instead of starting a
// duplicate download. Failed requests are dropped from the cache so they retry.
import type { ListMeta, WordEntry, Example } from './types';
import { getUserLists, userListsAsMeta } from './store';

const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function url(file: string): string {
  return `${base}/data/${file}`;
}

const cache = new Map<string, Promise<unknown>>();

// Store the promise, but drop it again if it rejects so a later call retries.
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function loadMeta(): Promise<{ lists: ListMeta[]; source?: string }> {
  // Merge user lists fresh on every call — they live in localStorage, not the fetch cache.
  return cached('meta', async () => {
    const r = await fetch(url('meta.json'));
    if (!r.ok) throw new Error(`meta.json load failed (${r.status})`);
    return (await r.json()) as { lists: ListMeta[]; source?: string };
  }).then((catalog) => ({ lists: [...catalog.lists, ...userListsAsMeta()], source: catalog.source }));
}

export function loadList(id: string): Promise<WordEntry[]> {
  const ul = getUserLists().find((u) => u.id === id);
  if (ul) return Promise.resolve(ul.words); // custom list — read fresh from store, never the fetch cache
  return cached<WordEntry[]>('list:' + id, async () => {
    const r = await fetch(url(`${id}.json`));
    if (!r.ok) throw new Error(`list ${id} load failed (${r.status})`);
    return (await r.json()) as WordEntry[];
  });
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

// Sentences are optional: resolve to {} when missing so callers degrade gracefully.
// Unlike the caches above, a sentences failure stays resolved ({}): retrying a
// 4+ MB optional fetch on every view would be worse than running without examples.
export function loadSentences(): Promise<Record<string, Example[]>> {
  return cached('sentences', async () => {
    try {
      const r = await fetch(url('sentences.json'));
      if (!r.ok) return {};
      return (await r.json()) as Record<string, Example[]>;
    } catch (e) {
      // Sentences are an optional enhancement: degrade to no-example mode, but log it.
      console.warn('[data] sentences unavailable, degrading to no-example mode', e);
      return {};
    }
  });
}

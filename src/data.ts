// Lazy-load word lists / meta / sentences, with caching.
import type { ListMeta, WordEntry, Example } from './types';

const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function url(file: string): string {
  return `${base}/data/${file}`;
}

const cache = new Map<string, unknown>();

export async function loadMeta(): Promise<{ lists: ListMeta[]; source?: string }> {
  if (cache.has('meta')) return cache.get('meta') as { lists: ListMeta[] };
  const r = await fetch(url('meta.json'));
  if (!r.ok) throw new Error(`meta.json load failed (${r.status})`);
  const meta = (await r.json()) as { lists: ListMeta[] };
  cache.set('meta', meta);
  return meta;
}

export async function loadList(id: string): Promise<WordEntry[]> {
  const key = 'list:' + id;
  if (cache.has(key)) return cache.get(key) as WordEntry[];
  const r = await fetch(url(`${id}.json`));
  if (!r.ok) throw new Error(`list ${id} load failed (${r.status})`);
  const list = (await r.json()) as WordEntry[];
  cache.set(key, list);
  return list;
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

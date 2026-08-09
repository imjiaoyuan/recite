// Cross-list word search.
import { h } from '../ui';
import { loadMeta, loadList } from '../data';
import { t, listName } from '../i18n';
import { speak } from '../speech';
import { getMeta } from '../store';
import type { Ctx, ViewResult, WordEntry } from '../types';

interface Indexed {
  word: string;
  wordLc: string;
  transLc: string;
  phonetic: string;
  translation: string;
  listId: string;
}

let index: Indexed[] | null = null;

// Build once and keep: built-in word content is immutable, so the index is stable;
// custom-list mutations call invalidateSearchIndex() to force a rebuild.
// Lowercase forms are precomputed so the per-keystroke scan never recomputes them.
async function getIndex(): Promise<Indexed[]> {
  if (index) return index;
  const meta = await loadMeta();
  const all: Indexed[] = [];
  for (const l of meta.lists) {
    let list: WordEntry[];
    try {
      list = await loadList(l.id);
    } catch (e) {
      console.warn(`[search] skipping list "${l.id}" — load failed`, e);
      continue;
    }
    for (const e of list) {
      all.push({
        word: e.word,
        wordLc: e.word.toLowerCase(),
        transLc: (e.translation || '').toLowerCase(),
        phonetic: e.phonetic || '',
        translation: e.translation || '',
        listId: l.id,
      });
    }
  }
  index = all;
  return all;
}

// Custom lists are mutable — drop the cached index so the next search rebuilds it.
export function invalidateSearchIndex(): void {
  index = null;
}

export default function search(_params: string[], { navigate }: Ctx): ViewResult {
  const voice = getMeta().voice;
  const el = h('div', { class: 'page' });
  el.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
      h('div', { class: 'progress-info' }, t('search.title')),
    ),
  );
  const results = h('div', { class: 'search-results' });
  const input = h('input', {
    class: 'spell-input search-input',
    type: 'text',
    placeholder: t('search.placeholder'),
    autocomplete: 'off',
  }) as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  async function run(q: string): Promise<void> {
    results.innerHTML = '';
    if (!q.trim()) {
      results.append(h('p', { class: 'muted' }, t('search.hint')));
      return;
    }
    const idx = await getIndex();
    const ql = q.toLowerCase();
    const matches: Indexed[] = [];
    for (const e of idx) {
      if (e.wordLc.includes(ql) || e.transLc.includes(ql)) {
        matches.push(e);
        if (matches.length >= 80) break;
      }
    }
    if (!matches.length) {
      results.append(h('p', { class: 'muted' }, t('search.noResults')));
      return;
    }
    results.append(h('p', { class: 'muted search-count' }, t('search.results', { n: matches.length >= 80 ? '80+' : matches.length })));
    for (const e of matches) {
      results.append(
        h('div', { class: 'result-row', onclick: () => speak(e.word, voice) },
          h('div', { class: 'result-main' },
            h('span', { class: 'result-word' }, e.word),
            h('span', { class: 'result-pho' }, e.phonetic || ''),
          ),
          h('div', { class: 'result-trans muted' }, (e.translation || '').slice(0, 70)),
          h('span', { class: 'badge' }, listName(e.listId)),
        ),
      );
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 180);
  });
  el.append(input, results);
  results.append(h('p', { class: 'muted' }, t('search.hint')));
  setTimeout(() => input.focus(), 0);
  return { el };
}

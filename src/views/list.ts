// Per-list word browser: view every word with a status badge, filter by status,
// multi-select, and bulk mark/unmark "known" (known words are excluded from study).
// Custom lists (id starts with "user-") get a delete button in the topbar.
import { h, toast } from '../ui';
import { getState, getMeta, markKnown, unmarkKnown, deleteUserList } from '../store';
import { loadList } from '../data';
import { invalidateSearchIndex } from './search';
import { speak } from '../speech';
import { t, listName } from '../i18n';
import type { Ctx, ViewResult, WordEntry } from '../types';

type Status = 'new' | 'due' | 'learned' | 'known' | 'diff';
type Filter = 'all' | Status;
interface Row {
  e: WordEntry;
  isNew: boolean;
  isDue: boolean;
  isLearned: boolean;
  isKnown: boolean;
  isDiff: boolean;
  badge: Status;
}

const PAGE = 200;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'list.filterAll' },
  { key: 'new', label: 'list.filterNew' },
  { key: 'due', label: 'list.filterDue' },
  { key: 'learned', label: 'list.filterLearned' },
  { key: 'known', label: 'list.filterKnown' },
  { key: 'diff', label: 'list.filterDiff' },
];

function matches(r: Row, f: Filter): boolean {
  switch (f) {
    case 'all': return true;
    case 'new': return r.isNew;
    case 'due': return r.isDue;
    case 'learned': return r.isLearned;
    case 'known': return r.isKnown;
    case 'diff': return r.isDiff;
  }
}

export default function listView([listId]: string[], { navigate }: Ctx): ViewResult {
  const isCustom = listId.startsWith('user-');
  const el = h('div', { class: 'page' });
  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
    h('div', { class: 'progress-info' }, listName(listId)),
    ...(isCustom
      ? [h('button', { class: 'btn ghost icon-only', title: t('list.delete'), onclick: onDelete }, h('i', { class: 'fa-solid fa-trash-can' }))]
      : []),
  );
  const toolbar = h('div', { class: 'list-toolbar' });
  const listEl = h('div', { class: 'word-list' });
  el.append(topbar, toolbar, listEl);

  let list: WordEntry[] = [];
  let rows: Row[] = [];
  let filtered: Row[] = [];
  let counts: Record<Filter, number> = { all: 0, new: 0, due: 0, learned: 0, known: 0, diff: 0 };
  let filter: Filter = 'all';
  let shown = PAGE;
  let selInfo: HTMLElement | null = null;
  const selected = new Set<string>(); // exact word strings, matching SRS keys

  function compute(): void {
    const state = getState();
    const now = Date.now();
    rows = list.map((e) => {
      const st = state[`${listId}:${e.word}`];
      const isKnown = !!st?.known;
      const isNew = !st;
      const isDiff = !!st?.diff && !isKnown;
      const isDue = !!st && !isKnown && st.due <= now;
      const isLearned = !!st && !isKnown && !isDiff && st.due > now;
      const badge: Status = isKnown ? 'known' : isDiff ? 'diff' : isDue ? 'due' : isLearned ? 'learned' : 'new';
      return { e, isNew, isDue, isLearned, isKnown, isDiff, badge };
    });
    const c: Record<Filter, number> = { all: rows.length, new: 0, due: 0, learned: 0, known: 0, diff: 0 };
    for (const r of rows) {
      if (r.isNew) c.new++;
      if (r.isDue) c.due++;
      if (r.isLearned) c.learned++;
      if (r.isKnown) c.known++;
      if (r.isDiff) c.diff++;
    }
    counts = c;
    refilter();
  }

  function refilter(): void {
    filtered = rows.filter((r) => matches(r, filter));
  }

  function setFilter(f: Filter): void {
    filter = f;
    selected.clear();
    shown = PAGE;
    refilter();
    render();
  }

  function updateSelInfo(): void {
    if (selInfo) selInfo.textContent = selected.size ? t('list.selected', { n: selected.size }) : '';
  }

  function toggleSel(word: string): void {
    if (selected.has(word)) selected.delete(word);
    else selected.add(word);
    updateSelInfo();
  }

  function selectAll(): void {
    for (const r of filtered) selected.add(r.e.word);
    renderRows();
    updateSelInfo();
  }

  function applyMark(known: boolean): void {
    if (!selected.size) return;
    const words = [...selected];
    if (known) markKnown(listId, words);
    else unmarkKnown(listId, words);
    selected.clear();
    compute(); // state changed — recompute statuses + counts
    render();
  }

  function onDelete(): void {
    const name = listName(listId);
    if (!confirm(t('list.confirmDelete', { name }))) return;
    deleteUserList(listId);
    invalidateSearchIndex();
    toast(t('list.deleted'));
    navigate('#/');
  }

  function renderToolbar(): void {
    toolbar.innerHTML = '';
    const chips = h('div', { class: 'filter-chips' },
      ...FILTERS.map((f) =>
        h('button', {
          class: 'chip' + (filter === f.key ? ' active' : ''),
          onclick: () => setFilter(f.key),
        }, `${t(f.label)} ${counts[f.key]}`),
      ),
    );
    selInfo = h('div', { class: 'list-sel muted' }, '');
    const actions = h('div', { class: 'list-actions' },
      h('button', { class: 'btn', onclick: selectAll }, h('i', { class: 'fa-solid fa-list-check' }), t('list.selectAll')),
      selected.size ? h('button', { class: 'btn', onclick: () => { selected.clear(); render(); } }, h('i', { class: 'fa-solid fa-xmark' }), t('list.clearSel')) : null,
      h('button', { class: 'btn', onclick: () => applyMark(true) }, h('i', { class: 'fa-solid fa-check' }), t('list.markKnown')),
      h('button', { class: 'btn', onclick: () => applyMark(false) }, h('i', { class: 'fa-solid fa-rotate-left' }), t('list.unmarkKnown')),
    );
    updateSelInfo();
    toolbar.append(chips, actions, selInfo);
  }

  function renderRows(): void {
    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.append(h('p', { class: 'muted' }, t('list.empty')));
      return;
    }
    const voice = getMeta().voice;
    const slice = filtered.slice(0, shown);
    for (const r of slice) {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = selected.has(r.e.word);
      cb.addEventListener('change', () => toggleSel(r.e.word));
      listEl.append(
        h('label', { class: 'word-row' + (r.isKnown ? ' known' : '') },
          cb,
          h('div', { class: 'word-main' },
            h('span', { class: 'word-text', onclick: () => speak(r.e.word, voice) }, r.e.word),
            r.e.phonetic ? h('span', { class: 'word-pho muted' }, r.e.phonetic) : null,
          ),
          h('span', { class: 'word-trans muted' }, (r.e.translation || '').slice(0, 40)),
          h('span', { class: 'status-badge ' + r.badge }, t('st.' + r.badge)),
        ),
      );
    }
    if (shown < filtered.length) {
      listEl.append(h('button', { class: 'btn ghost list-more', onclick: () => { shown += PAGE; renderRows(); } }, t('list.loadMore')));
    }
  }

  function render(): void {
    renderToolbar();
    renderRows();
  }

  (async () => {
    list = await loadList(listId);
    if (!list.length) { render(); return; }
    compute();
    render();
  })().catch((err: Error) => {
    listEl.innerHTML = '';
    listEl.append(h('div', { class: 'done' }, h('div', { class: 'done-title' }, t('loadFail')), h('div', { class: 'muted' }, err.message)));
  });

  return { el };
}

import { h } from '../ui';
import { icon } from '../icons';
import { getDifficult, statsByList } from '../store';
import { loadMeta } from '../data';
import { newToday } from '../session';
import { setOnPulled } from '../sync';
import { t, listName, listDesc } from '../i18n';
import { loadingEl } from './common';
import type { Ctx, ViewResult } from '../types';

function iconBtn(name: string, title: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'btn ghost icon-only', title, onclick }, icon(name));
}

export default function home(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page' });
  const diffCount = getDifficult().length;

  // Boot auto-sync may pull in progress from another device after the grid has
  // already rendered from local state — redraw in place so the counts/due
  // badges are fresh without the user reloading. drawGrid() is defined below;
  // registration is torn down in cleanup.
  let drawGrid: () => void = () => {};
  setOnPulled(() => drawGrid());

  el.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'brand' },
        h('h1', {}, 'recite'),
        h('span', { class: 'tag' }, t('app.subtitle')),
      ),
      h('div', { class: 'head-actions' },
        iconBtn('plus', t('home.newList'), () => navigate('#/list/new')),
        iconBtn('magnifying-glass', t('home.search'), () => navigate('#/search')),
        iconBtn('bolt', t('home.difficult') + (diffCount ? ` (${diffCount})` : ''), () => navigate('#/drill')),
        iconBtn('chart-simple', t('home.stats'), () => navigate('#/stats')),
        iconBtn('gear', t('home.settings'), () => navigate('#/settings')),
      ),
    ),
  );

  const loading = loadingEl();
  el.append(loading);

  async function load(): Promise<void> {
    const m = await loadMeta();
    // Replace everything below the header (loading placeholder or a previous grid).
    for (const c of [...el.children].slice(1)) c.remove();
    const grid = h('div', { class: 'grid' });

    const byList = statsByList();
    for (const list of m.lists) {
      const total = list.count;
      const s = byList[list.id] || { started: 0, due: 0 };
      const next = newToday(list.id, total - s.started);
      const pct = total ? (s.started / total) * 100 : 0;

      grid.append(
        h('div', { class: 'list-card' },
          h('div', { class: 'list-head' },
            h('div', { class: 'list-name' }, listName(list.id)),
            h('div', { class: 'list-desc' }, listDesc(list.id)),
          ),
          h('div', { class: 'list-stats' },
            h('span', { class: 'badge' }, t('home.words', { n: total })),
            h('span', { class: s.started ? 'badge learned' : 'badge' }, t('home.learned', { n: s.started })),
            h('span', { class: s.due ? 'badge due' : 'badge' }, t('home.due', { n: s.due })),
            h('span', { class: 'badge new' }, t('home.new', { n: next })),
          ),
          h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: `width:${pct}%` })),
          h('div', { class: 'list-actions' },
            h('button', { class: 'btn primary icon-only', title: t('home.study'), onclick: () => navigate(`#/study/${list.id}`) }, icon('book-open')),
            h('button', { class: 'btn icon-only', title: t('home.spell'), onclick: () => navigate(`#/spell/${list.id}`) }, icon('keyboard')),
            h('button', { class: 'btn icon-only', title: t('home.dictation'), onclick: () => navigate(`#/dictation/${list.id}`) }, icon('headphones')),
            h('button', { class: 'btn icon-only', title: t('home.browse'), onclick: () => navigate(`#/list/${list.id}`) }, icon('list')),
          ),
        ),
      );
    }
    el.append(grid);
  }

  drawGrid = load; // refresh path re-runs the whole load (cached meta → instant)
  load().catch((err: Error) => {
    loading.textContent = t('home.loadFail', { msg: err.message });
  });

  return {
    el,
    cleanup() {
      setOnPulled(null);
    },
  };
}

import { h } from '../ui';
import { getState, getMeta, getDifficult } from '../store';
import { loadMeta } from '../data';
import { t, listName, listDesc } from '../i18n';
import type { Ctx, ViewResult } from '../types';

function listStats(listId: string, total: number): { started: number; due: number } {
  const state = getState();
  const prefix = listId + ':';
  let started = 0;
  let due = 0;
  const now = Date.now();
  for (const k in state) {
    if (k.startsWith(prefix) && state[k]) {
      started++;
      if (state[k].due <= now) due++;
    }
  }
  return { started, due };
}

function iconBtn(icon: string, title: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'btn ghost icon-only', title, onclick }, h('i', { class: `fa-solid ${icon}` }));
}

export default function home(_params: string[], { navigate }: Ctx): ViewResult {
  const meta = getMeta();
  const el = h('div', { class: 'page' });
  const diffCount = getDifficult().length;

  el.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'brand' },
        h('h1', {}, 'recite'),
        h('span', { class: 'tag' }, t('app.subtitle')),
      ),
      h('div', { class: 'head-actions' },
        iconBtn('fa-magnifying-glass', t('home.search'), () => navigate('#/search')),
        iconBtn('fa-bolt', t('home.difficult') + (diffCount ? ` (${diffCount})` : ''), () => navigate('#/drill')),
        iconBtn('fa-chart-simple', t('home.stats'), () => navigate('#/stats')),
        iconBtn('fa-gear', t('home.settings'), () => navigate('#/settings')),
      ),
    ),
  );

  const loading = h('p', { class: 'muted' }, t('home.loading'));
  el.append(loading);

  (async () => {
    const m = await loadMeta();
    el.removeChild(loading);
    const grid = h('div', { class: 'grid' });

    for (const list of m.lists) {
      const total = list.count;
      const s = listStats(list.id, total);
      const next = Math.min(meta.dailyLimit || 50, Math.max(0, total - s.started));
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
            h('button', { class: 'btn primary icon-only', title: t('home.study'), onclick: () => navigate(`#/study/${list.id}`) }, h('i', { class: 'fa-solid fa-book-open' })),
            h('button', { class: 'btn icon-only', title: t('home.spell'), onclick: () => navigate(`#/spell/${list.id}`) }, h('i', { class: 'fa-solid fa-keyboard' })),
            h('button', { class: 'btn icon-only', title: t('home.dictation'), onclick: () => navigate(`#/dictation/${list.id}`) }, h('i', { class: 'fa-solid fa-headphones' })),
          ),
        ),
      );
    }
    el.append(grid);
  })().catch((err: Error) => {
    loading.textContent = t('home.loadFail', { msg: err.message });
  });

  return { el };
}

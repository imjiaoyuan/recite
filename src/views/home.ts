import { h } from '../ui';
import { icon } from '../icons';
import { getDifficult, statsByList, getMeta } from '../store';
import { loadMeta } from '../data';
import { newToday } from '../session';
import { setOnPulled, setOnStatus, syncConfigured } from '../sync';
import { t } from '../i18n';
import { listName, listDesc } from '../i18n';
import { loadingEl } from './common';
import type { Ctx, ViewResult } from '../types';

function iconBtn(name: string, title: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'btn ghost icon-only', title, onclick }, icon(name));
}

export default function home(_params: string[], { navigate }: Ctx): ViewResult {
  const el = h('div', { class: 'page' });
  const diffCount = getDifficult().length;

  // Sync status pill in the header. Sync is automatic (boot, session end, a
  // 5-min timer, tab-reveal, reconnect) and silent by design — this pill is
  // the visible receipt: syncing → synced (with time) / offline-failed, and a
  // tap opens settings. Hidden entirely when sync isn't configured.
  const syncPill = h('button', { class: 'sync-pill', onclick: () => navigate('#/settings') });
  function drawSync(): void {
    const st = getMeta().syncStatus || { s: 'idle' as const, at: 0, phase: undefined }; // old installs predate the field
    syncPill.innerHTML = '';
    if (!syncConfigured()) {
      syncPill.style.display = 'none';
      return;
    }
    syncPill.style.display = '';
    const label = st.s === 'idle' ? 'sync.idle'
      : st.s === 'syncing' ? (st.phase === 'pull' ? 'sync.pull' : st.phase === 'merge' ? 'sync.merge' : st.phase === 'push' ? 'sync.push' : 'sync.doing')
      : st.s === 'ok' ? (st.at ? 'sync.doneAt' : 'sync.done')
      : 'sync.failShort';
    syncPill.className = `sync-pill ${st.s}`;
    syncPill.append(
      st.s === 'syncing' ? h('span', { class: 'pill-spinner' }) : icon(st.s === 'fail' ? 'cloud-arrow-down' : 'check'),
      h('span', {}, st.s === 'ok' && st.at ? t(label, { time: fmtClock(st.at) }) : t(label)),
    );
  }
  function fmtClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  drawSync();
  // report() persists the new status into meta before notifying — just redraw.
  // The phase arg narrates pull/merge/push so the pill animates through the
  // round instead of hanging on one label while JSON work blocks the thread.
  setOnStatus(() => drawSync());

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
        syncPill,
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
      const s = byList[list.id] || { started: 0, known: 0, due: 0 };
      // 已认识 words count as covered: the 新词 badge is what a session could
      // still introduce, and buildSession never serves a known word.
      const next = newToday(list.id, Math.max(0, total - s.started));
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
      setOnStatus(null);
    },
  };
}

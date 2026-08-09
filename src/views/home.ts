import { h, toast } from '../ui';
import { getState, getMeta, setMeta, exportData, importData, getDifficult, clearAll } from '../store';
import { loadMeta } from '../data';
import { t, listName, listDesc, setLang } from '../i18n';
import { setTheme } from '../theme';
import { dropdown } from '../dropdown';
import { cacheAllData, canInstall, promptInstall } from '../pwa';
import { enableKokoro, onKokoroStatus } from '../speech';
import type { Ctx, ViewResult } from '../types';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;

  function doExport(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
    a.download = `recite-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast(t('data.exported'));
  }
  function onImport(): void {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        importData(String(r.result));
        toast(t('data.imported'));
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        toast(t('data.importFail'));
      }
    };
    r.readAsText(f);
  }
  fileInput.addEventListener('change', onImport);

  async function doOffline(btn: HTMLElement): Promise<void> {
    const label = btn.querySelector('.btn-label');
    btn.setAttribute('disabled', '');
    if (label) label.textContent = t('pwa.installing');
    try {
      const bytes = await cacheAllData();
      toast(t('pwa.offlineDone', { mb: (bytes / 1048576).toFixed(1) }));
    } catch (e) {
      toast(t('data.importFail'));
    } finally {
      btn.removeAttribute('disabled');
      if (label) label.textContent = t('pwa.offline');
    }
  }
  function doClear(): void {
    if (!confirm(t('data.clearConfirm'))) return;
    clearAll();
    toast(t('data.cleared'));
    setTimeout(() => location.reload(), 700);
  }
  async function doInstall(): Promise<void> {
    const ok = await promptInstall();
    if (!ok && !canInstall()) toast(t('pwa.installHint'));
  }

  const panel = h('div', { class: 'settings-panel' });
  function toggleSettings(): void {
    panel.classList.toggle('open');
  }

  // Offline TTS (kokoro) status line — shown only while/after the user opts in.
  const ttsStatus = h('div', { class: 'tts-status', style: 'display:none' });
  onKokoroStatus((s) => {
    ttsStatus.style.display = '';
    ttsStatus.className = 'tts-status ' + s.status;
    ttsStatus.textContent =
      s.status === 'loading' ? t('tts.downloading') :
      s.status === 'ready' ? t('tts.ready') :
      t('tts.failed');
  });

  panel.append(
    dropdown({ label: t('set.voice'), current: meta.voice, onChange: (v) => setMeta({ voice: v }),
      options: [['en-US', t('opt.us')], ['en-GB', t('opt.gb')]] }),
    dropdown({ label: t('set.daily'), current: meta.dailyLimit, onChange: (v) => setMeta({ dailyLimit: Number(v) }),
      options: [[20, '20'], [30, '30'], [50, '50'], [100, '100']] }),
    dropdown({ label: t('set.countdown'), current: meta.spellCountdown, onChange: (v) => setMeta({ spellCountdown: Number(v) }),
      options: [[0, t('opt.off')], [5, '5s'], [8, '8s'], [10, '10s'], [15, '15s'], [20, '20s']] }),
    dropdown({ label: t('set.theme'), current: meta.theme, onChange: (v) => setTheme(v),
      options: [['auto', t('opt.auto')], ['light', t('opt.light')], ['dark', t('opt.dark')]] }),
    dropdown({ label: t('set.language'), current: meta.lang, onChange: (v) => setLang(v),
      options: [['auto', t('opt.langAuto')], ['zh', '中文'], ['en', 'English']] }),
    dropdown({ label: t('set.ttsEngine'), current: meta.ttsEngine,
      onChange: (v) => {
        setMeta({ ttsEngine: v as 'system' | 'kokoro' });
        if (v === 'kokoro') enableKokoro();
      },
      options: [['system', t('opt.ttsSystem')], ['kokoro', t('opt.ttsKokoro')]] }),
    ttsStatus,
    h('div', { class: 'data-row' },
      h('button', { class: 'btn', onclick: doExport }, h('i', { class: 'fa-solid fa-download' }), t('data.export')),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, h('i', { class: 'fa-solid fa-upload' }), t('data.import')),
    ),
    h('div', { class: 'data-row' },
      h('button', { class: 'btn', onclick: (e: Event) => doOffline(e.currentTarget as HTMLElement) },
        h('i', { class: 'fa-solid fa-cloud-arrow-down' }), h('span', { class: 'btn-label' }, t('pwa.offline'))),
      h('button', { class: 'btn', onclick: doInstall }, h('i', { class: 'fa-solid fa-circle-down' }), t('pwa.install')),
    ),
    h('div', { class: 'data-row' },
      h('button', { class: 'btn danger', onclick: doClear }, h('i', { class: 'fa-solid fa-trash-can' }), t('data.clear')),
    ),
  );

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
        iconBtn('fa-gear', t('home.settings'), toggleSettings),
      ),
    ),
    panel,
    fileInput,
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
      const pct = total ? Math.round((s.started / total) * 100) : 0;

      grid.append(
        h('div', { class: 'list-card' },
          h('div', { class: 'list-head' },
            h('div', { class: 'list-name' }, listName(list.id)),
            h('div', { class: 'list-desc' }, listDesc(list.id)),
          ),
          h('div', { class: 'list-stats' },
            h('span', { class: 'badge' }, t('home.words', { n: total })),
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

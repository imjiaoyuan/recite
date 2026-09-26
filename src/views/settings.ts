// Settings page: voice, daily limit, spell timer, theme, language,
// plus data backup, offline download, and reset.
import { h, toast } from '../ui';
import { icon } from '../icons';
import { getMeta, setMeta, exportData, importData, clearAll, todayStr } from '../store';
import { t, setLang, browserLangCode, browserLangUnsupported } from '../i18n';
import { setTheme } from '../theme';
import { dropdown } from '../dropdown';
import { cacheAllData, canInstall, promptInstall } from '../pwa';
import { runSync, syncConfigured, sameOriginStore, validSyncKey } from '../sync';
declare const APP_VERSION: string; // injected at build time (vite.config.ts define)
import { topbar } from './common';
import type { Ctx, ViewResult } from '../types';

export default function settings(_params: string[], { navigate }: Ctx): ViewResult {
  const meta = getMeta();
  const el = h('div', { class: 'page' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;

  // Surfaced under the language picker: "why is this app in the wrong language?"
  // is otherwise only answerable from the devtools console.
  function langHint(): string {
    if (meta.lang === 'zh' || meta.lang === 'en') return t('set.langManual');
    const vars = { code: browserLangCode(), name: t('set.langName') };
    return browserLangUnsupported() ? t('set.langHintUnsupported', vars) : t('set.langHint', vars);
  }

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
        console.warn('[settings] import failed', e);
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
      console.warn('[settings] offline prefetch failed', e);
      toast(t('pwa.offlineFail'));
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

  // ---- Cloud sync block ----

  const syncSection = h('div', { class: 'sync-box' });

  function fmtSyncTime(ms: number): string {
    if (!ms) return t('sync.never');
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }

  function renderSync(): void {
    const m = getMeta();
    syncSection.innerHTML = '';
    const badKey = m.syncKey.length > 0 && !validSyncKey(m.syncKey);
    const urlInput = h('input', {
      class: 'sync-input', type: 'text', placeholder: t('sync.urlPh'), value: m.syncUrl,
      oninput: (e: Event) => setMeta({ syncUrl: (e.target as HTMLInputElement).value.trim() }),
    }) as HTMLInputElement;
    const keyInput = h('input', {
      class: 'sync-input', type: 'text', placeholder: t('sync.keyPh'), value: m.syncKey,
      oninput: (e: Event) => setMeta({ syncKey: (e.target as HTMLInputElement).value.trim() }),
    }) as HTMLInputElement;
    const tokenInput = h('input', {
      class: 'sync-input', type: 'text', placeholder: t('sync.tokenPh'), value: m.syncToken,
      oninput: (e: Event) => setMeta({ syncToken: (e.target as HTMLInputElement).value.trim() }),
    }) as HTMLInputElement;

    async function doSync(btn: HTMLElement): Promise<void> {
      const label = btn.querySelector('.btn-label');
      btn.setAttribute('disabled', '');
      if (label) label.textContent = t('sync.syncing');
      const r = await runSync();
      btn.removeAttribute('disabled');
      if (label) label.textContent = t('sync.now');
      if (r.ok && r.pulled > 0) {
        // Fresh data landed from another device — offer an instant reload so it
        // actually shows up (stale views won't re-render on their own).
        toast(t('sync.pulled', { n: r.pulled }), { label: t('pwa.reload'), onClick: () => location.reload() });
      } else {
        toast(r.ok ? t('sync.ok') : t('sync.fail', { msg: r.error || '' }));
      }
      renderSync(); // refresh last-sync time
    }

    const hosted = sameOriginStore(); // served BY a sync worker: no URLs, ever
    const parts: (HTMLElement | string)[] = [
      h('div', { class: 'sync-title' }, icon('cloud-arrow-down'), t('sync.title')),
      h('div', { class: 'dd-hint' }, t(hosted ? 'sync.descHosted' : 'sync.desc')),
    ];
    if (hosted) {
      parts.push(h('div', { class: 'dd-hint sync-sameorigin' }, t('sync.sameOrigin')));
    } else {
      parts.push(
        h('label', { class: 'sync-label' }, t('sync.url')),
        urlInput,
      );
    }
    parts.push(
      h('label', { class: 'sync-label' }, t('sync.key')),
      keyInput,
    );
    if (badKey) parts.push(h('div', { class: 'dd-hint sync-warn' }, t('sync.keyBad')));
    if (!hosted) parts.push(
      h('label', { class: 'sync-label' }, t('sync.token')),
      tokenInput,
    );
    parts.push(
      h('div', { class: 'data-row' },
        h('button', { class: 'btn', disabled: !syncConfigured(), onclick: (e: Event) => doSync(e.currentTarget as HTMLElement) },
          icon('rotate-left'), h('span', { class: 'btn-label' }, t('sync.now'))),
      ),
      h('div', { class: 'dd-hint' }, t('sync.last', { time: fmtSyncTime(m.syncLast) })),
      h('details', { class: 'sync-help' },
        h('summary', {}, t('sync.deploy')),
        h('div', { class: 'dd-hint' }, t('sync.deployHint')),
        h('div', { class: 'dd-hint' }, t('sync.webdavHint')),
      ),
    );
    syncSection.append(...parts);
  }
  renderSync();

  el.append(
    topbar(navigate, t('settings.title')),
    h('div', { class: 'settings' },
      dropdown({ label: t('set.voice'), current: meta.voice, onChange: (v) => setMeta({ voice: v }),
        options: [['en-US', t('opt.us')], ['en-GB', t('opt.gb')]] }),
      dropdown({ label: t('set.daily'), current: meta.dailyLimit, onChange: (v) => setMeta({ dailyLimit: Number(v) }),
        options: [[20, '20'], [30, '30'], [50, '50'], [100, '100'], [150, '150'], [200, '200']] }),
      dropdown({ label: t('set.retention'), current: meta.retention, onChange: (v) => setMeta({ retention: Number(v) }),
        options: [[0.8, t('opt.retLoose')], [0.9, t('opt.retStd')], [0.95, t('opt.retStrict')]] }),
      dropdown({ label: t('set.countdown'), current: meta.spellCountdown, onChange: (v) => setMeta({ spellCountdown: Number(v) }),
        options: [[0, t('opt.off')], [5, '5s'], [8, '8s'], [10, '10s'], [15, '15s'], [20, '20s']] }),
      dropdown({ label: t('set.theme'), current: meta.theme, onChange: (v) => setTheme(v),
        options: [['auto', t('opt.auto')], ['light', t('opt.light')], ['dark', t('opt.dark')]] }),
      dropdown({ label: t('set.language'), current: meta.lang, onChange: (v) => setLang(v),
        options: [['auto', t('opt.langAuto')], ['zh', '中文'], ['en', 'English']] }),
      h('div', { class: 'dd-hint' }, langHint()),
      syncSection,
      h('div', { class: 'data-row' },
        h('button', { class: 'btn', onclick: doExport }, icon('download'), t('data.export')),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, icon('upload'), t('data.import')),
      ),
      h('div', { class: 'data-row' },
        h('button', { class: 'btn', onclick: (e: Event) => doOffline(e.currentTarget as HTMLElement) },
          icon('cloud-arrow-down'), h('span', { class: 'btn-label' }, t('pwa.offline'))),
        h('button', { class: 'btn', onclick: doInstall }, icon('circle-down'), t('pwa.install')),
      ),
      h('div', { class: 'data-row' },
        h('button', { class: 'btn danger', onclick: doClear }, icon('trash-can'), t('data.clear')),
      ),
      h('div', { class: 'dd-hint settings-ver' }, `recite v${APP_VERSION}`),
    ),
    fileInput,
  );

  return { el };
}

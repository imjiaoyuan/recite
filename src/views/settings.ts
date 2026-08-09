// Settings page: voice, daily limit, spell timer, theme, language, TTS engine,
// plus data backup, offline download, and reset.
import { h, toast } from '../ui';
import { getMeta, setMeta, exportData, importData, clearAll } from '../store';
import { t, setLang } from '../i18n';
import { setTheme } from '../theme';
import { dropdown } from '../dropdown';
import { cacheAllData, canInstall, promptInstall } from '../pwa';
import { enableKokoro, onKokoroStatus } from '../speech';
import type { Ctx, ViewResult } from '../types';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function settings(_params: string[], { navigate }: Ctx): ViewResult {
  const meta = getMeta();
  const el = h('div', { class: 'page' });
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

  el.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'btn ghost', onclick: () => navigate('#/') }, h('i', { class: 'fa-solid fa-arrow-left' }), t('common.back')),
      h('div', { class: 'progress-info' }, t('settings.title')),
    ),
    h('div', { class: 'settings' },
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
    ),
    fileInput,
  );

  // Detach the kokoro status callback so it can't touch this DOM after navigating away.
  return { el, cleanup: () => onKokoroStatus(null) };
}

import './style';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import { loadVoices, warmup, onKokoroStatus } from './speech';
import { initTheme } from './theme';
import { initI18n, t } from './i18n';
import { onQuotaExceeded, getMeta } from './store';
import { toast } from './ui';
import { loadMeta, loadList, loadSentences } from './data';
import home from './views/home';
import study from './views/study';
import spell from './views/spell';
import dictation from './views/dictation';
import search from './views/search';
import drill from './views/drill';
import stats from './views/stats';
import settings from './views/settings';
import createList from './views/list-create';
import listView from './views/list';
import type { Ctx, ViewResult } from './types';

interface Route {
  re: RegExp;
  view: (params: string[], ctx: Ctx) => ViewResult;
}

// Hash-based router.
const routes: Route[] = [
  { re: /^#\/?$/, view: home },
  { re: /^#\/study\/([\w-]+)$/, view: study },
  { re: /^#\/spell\/([\w-]+)$/, view: spell },
  { re: /^#\/dictation\/([\w-]+)$/, view: dictation },
  { re: /^#\/drill\/?$/, view: drill },
  { re: /^#\/search\/?$/, view: search },
  { re: /^#\/stats\/?$/, view: stats },
  { re: /^#\/settings\/?$/, view: settings },
  { re: /^#\/list\/new$/, view: createList },
  { re: /^#\/list\/([\w-]+)$/, view: listView },
];

let current: ViewResult | null = null;

export function navigate(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render(): void {
  const hash = location.hash || '#/';
  const route = routes.find((r) => r.re.test(hash));
  const app = document.getElementById('app');
  if (!app) return;
  if (current && current.cleanup) current.cleanup();
  app.innerHTML = '';

  if (!route) {
    location.hash = '#/';
    return;
  }
  const params = hash.match(route.re)!.slice(1);
  current = route.view(params, { navigate });
  if (current.el) app.appendChild(current.el);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

function hideSplash(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('hide');
  setTimeout(() => boot.remove(), 400);
}

window.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  onQuotaExceeded(() => toast(t('store.quotaFull')));
  initTheme();
  // Surface the offline-TTS model download (auto-triggered on first speak in
  // browsers without system TTS) so the ~80–100 MB fetch doesn't look frozen.
  // 'ready' is only toasted on the transition — enableKokoro()'s fast path
  // re-reports it on every call, and a toast per pronunciation would be spam.
  let lastKokoro: string | null = null;
  onKokoroStatus((s) => {
    if (s.status === 'loading') toast(t('tts.downloading'));
    else if (s.status === 'ready' && lastKokoro !== 'ready') toast(t('tts.ready'));
    else if (s.status === 'error') toast(t('tts.failed'));
    lastKokoro = s.status;
  });
  loadVoices();
  warmup();
  try {
    await loadMeta(); // preload the list catalog so the home grid renders in one pass
  } catch (e) {
    // Non-fatal: the home view renders its own load-failure message.
    console.warn('[main] meta preload failed — home will show its own error', e);
  }
  hideSplash();
  if (!location.hash) location.hash = '#/';
  render();
  // Warm the heavyweight data in the background so entering a list isn't blank
  // while it loads: every mode needs sentences.json (4+ MB), and the last-studied
  // list is where the user almost always resumes. Returning users only (a
  // selectedList exists) — a first-time visitor may just browse, and shouldn't
  // have 4+ MB pulled on a metered connection before they choose to study.
  const sel = getMeta().selectedList;
  if (sel) {
    loadSentences();
    loadList(sel).catch((e) => console.warn('[main] list prefetch failed', e));
  }
});

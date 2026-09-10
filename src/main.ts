import './style';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import { loadVoices, warmup } from './speech';
import { initTheme } from './theme';
import { initI18n, t, browserLangUnsupported, browserLangCode } from './i18n';
import { onQuotaExceeded, getMeta, setMeta } from './store';
import { toast } from './ui';
import { loadMeta, loadList, loadSentences } from './data';
import { purgeLegacyCaches } from './pwa';
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

// The service worker updates itself in the background (autoUpdate + skipWaiting),
// so after a deploy the open tab keeps running the OLD bundle until it is
// reloaded. Without this the user just sees the previous version and concludes
// nothing shipped. `controller` was already set on every visit after the first,
// which is what makes the first-install handover distinguishable.
function watchForUpdates(): void {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install — nothing stale to replace
    toast(t('pwa.newVersion'), { label: t('pwa.reload'), onClick: () => location.reload() });
  });
}

// The browser offers neither zh nor en, so the app shows English. Say why, once
// per browser language (a new code re-asks; dismissing is remembered).
function notifyUnsupportedLang(): void {
  const stored = getMeta().lang;
  if (stored === 'zh' || stored === 'en') return; // explicit pick — not our business
  if (!browserLangUnsupported()) return;
  const code = browserLangCode();
  if (getMeta().langNotice === code) return;
  setMeta({ langNotice: code });
  toast(t('lang.unsupported', { code }), { label: t('settings.title'), onClick: () => navigate('#/settings') });
}

window.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  watchForUpdates();
  onQuotaExceeded(() => toast(t('store.quotaFull')));
  initTheme();
  loadVoices();
  warmup();
  purgeLegacyCaches(); // free the multi-MB kokoro leftovers from older installs
  try {
    await loadMeta(); // preload the list catalog so the home grid renders in one pass
  } catch (e) {
    // Non-fatal: the home view renders its own load-failure message.
    console.warn('[main] meta preload failed — home will show its own error', e);
  }
  hideSplash();
  if (!location.hash) location.hash = '#/';
  render();
  notifyUnsupportedLang();
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

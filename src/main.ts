import './style';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import { loadVoices, warmup } from './speech';
import { initTheme } from './theme';
import { initI18n } from './i18n';
import { loadMeta } from './data';
import home from './views/home';
import study from './views/study';
import spell from './views/spell';
import dictation from './views/dictation';
import search from './views/search';
import drill from './views/drill';
import stats from './views/stats';
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
  initTheme();
  loadVoices();
  warmup();
  try {
    await loadMeta(); // preload the list catalog so the home grid renders in one pass
  } catch (e) {
    /* home view surfaces its own load error */
  }
  hideSplash();
  if (!location.hash) location.hash = '#/';
  render();
});

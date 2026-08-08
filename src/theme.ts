// Light / dark / auto theme. Toggles `.dark` on <html>.
import { getMeta, setMeta } from './store';

const MQ = '(prefers-color-scheme: dark)';

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(MQ).matches;
}

function applyTheme(mode: string): void {
  const dark = mode === 'dark' || (mode === 'auto' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function initTheme(): void {
  applyTheme(getMeta().theme || 'auto');
  if (typeof matchMedia !== 'undefined') {
    const mql = matchMedia(MQ);
    mql.addEventListener('change', () => {
      if ((getMeta().theme || 'auto') === 'auto') applyTheme('auto');
    });
  }
}

export function setTheme(mode: string): void {
  setMeta({ theme: mode });
  applyTheme(mode);
}

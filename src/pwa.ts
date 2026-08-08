// PWA helpers: install prompt capture + explicit offline data caching.
import type { ListMeta } from './types';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BIPEvent | null = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferred = e as BIPEvent;
});

export function canInstall(): boolean {
  return !!deferred;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  return choice.outcome === 'accepted';
}

// Fetch every data file so the service worker caches them for offline use.
export async function cacheAllData(): Promise<number> {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const meta = ((await (await fetch(`${base}/data/meta.json`)).json()) as { lists: ListMeta[] });
  const files = ['sentences.json', ...meta.lists.map((l) => l.file)];
  let bytes = 0;
  for (const f of files) {
    const r = await fetch(`${base}/data/${f}`);
    bytes += Number(r.headers.get('content-length') || 0);
    await r.text();
  }
  return bytes;
}

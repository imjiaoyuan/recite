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
  const metaRes = await fetch(`${base}/data/meta.json`);
  if (!metaRes.ok) throw new Error(`meta.json load failed (${metaRes.status})`);
  const meta = (await metaRes.json()) as { lists: ListMeta[] };
  const files = ['sentences.json', ...meta.lists.map((l) => l.file)];
  // Fetch in parallel (the browser pools ~6 per host); consume each body so the
  // service-worker runtime cache stores it.
  const fetched = await Promise.all(
    files.map((f) =>
      fetch(`${base}/data/${f}`).then((r) => ({ len: Number(r.headers.get('content-length') || 0), body: r.text() })),
    ),
  );
  await Promise.all(fetched.map((x) => x.body));
  return fetched.reduce((sum, x) => sum + x.len, 0);
}

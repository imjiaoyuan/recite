# recite

> Let's memorize some words.

## Changelog

### v0.2.0 (2025-09-25)

- **Multi-device cloud sync** — self-hosted mirror (one-click Cloudflare Worker +
  KV, or WebDAV). A sync code doubles as the credential; merging is client-side
  (per-word last-write-wins, tombstoned list deletions, per-date activity max).
  Auto-syncs at startup and after each session. See “Cloud sync” below.
- **Denser in-session review** — words graded "forgot/hard" now come back up to
  twice in the same session (was once) in study, spell and dictation.
- **No more Font Awesome** — the ~23 icons this app uses are inline SVG now
  (bundle is ~30 KB smaller; also fixes icons rendering blank when the font
  was blocked).
- Settings page shows the app version; upgrading devices get a "new version"
  toast.

### v0.1.0

- Initial release: FSRS scheduling, study / spell / dictation / drill / search,
  9 built-in word lists (ECDICT), Tatoeba example sentences, streak + heatmap,
  bilingual UI, PWA.

## Screenshots

<div align="center">
  <img src="assets/desktop-home.webp" width="380" alt="Desktop: list picker">
  <img src="assets/desktop-study.webp" width="380" alt="Desktop: study">
</div>

<br>

<div align="center">
  <img src="assets/mobile-home.webp" width="200" alt="Mobile: list picker">
  &nbsp;&nbsp;&nbsp;
  <img src="assets/mobile-study.webp" width="200" alt="Mobile: study">
</div>

## Features

- FSRS spaced repetition (MaiMemo's open-source scheduler), daily new-word quota with unmetered reviews, personal progression (continues where you left off)
- Modes: study, spell (with optional countdown), dictation (listen & write), search
- Difficult-words drill (auto-collects words you get wrong)
- Streak counter + 17-week activity heatmap
- Backup import / export (JSON)
- Multi-device cloud sync (optional, self-hosted — see below)
- Offline PWA — installable, pre-caches all data
- English / Chinese UI with system-language auto-detect
- Light / dark / system theme
- Pronunciation via the browser's speech synthesis

## Word lists

Built from [ECDICT](https://github.com/skywind3000/ECDICT), frequency-sorted (most common first).

| List | Words |
|------|------:|
| Junior (中考) | 1,603 |
| Senior (高考) | 3,677 |
| CET-4 | 3,849 |
| CET-6 | 5,407 |
| Grad (考研) | 4,801 |
| TOEFL | 6,974 |
| IELTS | 5,040 |
| GRE | 7,504 |
| Academic AWL (读博) | 570 |

Example sentences from [Tatoeba](https://tatoeba.org) (~92% coverage).

## Usage

```bash
npm install
npm run dev        # dev server
npm run build      # type-check + production build to dist/
npm run preview    # preview the build (PWA works here, not in dev)
```

### Rebuild the data

```bash
# word lists: put ecdict.csv at scripts/sources/  (https://github.com/skywind3000/ECDICT)
npm run build:data

# sentences: put sentences.csv + links.csv at scripts/sources/  (https://downloads.tatoeba.org/exports/)
npm run build:sentences
```

## Cloud sync (optional, self-hosted)

Learning progress stays in your browser's localStorage; the cloud is only a
mirror. Sync runs automatically at startup and after each session, or manually
from Settings → Cloud sync. One sync = 1 read + 1 write, far below Cloudflare's
free tier (100k reads / 1k writes per day).

### One-click deploy (recommended)

Deploy your own copy — app + data store on one origin, free, ~2 minutes:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/imjiaoyuan/recite)

1. Click the button above, log in to Cloudflare (a free account works), and let it
   clone + build + deploy the repo — the Worker entry point lives in
   [`workers/sync/index.ts`](workers/sync/index.ts) (with `wrangler.jsonc` at
   the repo root) and ships the built site as static assets. Cloudflare's
   build system reads the repo-root `package.json`, so its default
   `build` + `deploy` scripts (`npm run build`, `wrangler deploy`) do the
   right thing — no manual configuration needed.
2. The setup page asks you to provision a KV namespace — confirm the default.
3. When deployment finishes, open `https://recite-sync.<your-account>.workers.dev`
   — **that page IS the app**, and its own origin is the data store (a
   `<meta name="recite-sync">` stamp tells the app so; the server-URL field is
   hidden in settings). Bind a custom domain later — it works the same way,
   zero reconfiguration.
4. On every device, open that same URL → Settings → Cloud sync, type a sync
   code of your own choosing (same code everywhere), then Sync now. No URLs to
   paste, ever.

The GitHub Pages copy of the app still works as a client: there you do paste
the sync server URL by hand (the URL field stays). Prefer Git integration over
the button? Import the repo via Cloudflare's dashboard (**Workers & Pages →
Import a repository**) — the same root `wrangler.jsonc` + `package.json`
scripts make the default `npx wrangler deploy` work as-is. WebDAV is the
self-hosted alternative — see below.

The sync code is the credential: it doubles as the KV key. Anyone who knows the
URL **and** the code can read/overwrite that data, so keep the code to yourself.
Sharing one deployment with friends? Set the optional `TOKEN` variable in the
Worker (dashboard → Settings → Variables) and fill the same value into the
access-token field in Settings → Cloud sync.

### WebDAV (advanced)

Self-hosted servers only (e.g. Nextcloud with CORS enabled) — most public WebDAV
drives don't send CORS headers, so the browser can't reach them. Start the URL
with `webdav://` and fill the directory path; the sync code becomes the file
name (`recite-<code>.json`). Credentials go in the URL:
`webdav://user:pass@host/path/`.

### How merging works

Anki-style last-write-wins, per object:

- each word's SRS state merges by the newer `lastReviewed`
- user lists union by id, newer edit (`mtime`) wins; deleted lists stay deleted
  via tombstones (90-day retention)
- today's new-word quota merges per-list max on the same day; activity heatmap
  takes the per-date max
- settings (voice, theme, language…) are per-device and never merged

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted, offline-first English vocabulary trainer (背单词). Static site, no backend, deployed as a PWA to GitHub Pages. Bilingual UI (zh/en). Word data is built offline from ECDICT + Tatoeba and shipped as static JSON.

## Commands

```bash
npm install
npm run dev          # vite dev server (port 5173, auto-open)
npm run build        # tsc --noEmit (type-check) + vite build -> dist/
npm run typecheck    # tsc --noEmit only
npm run preview      # serve the build — PWA/service worker only works here, NOT in dev
```

Data rebuild (only needed when regenerating word lists/sentences; outputs land in `public/data/`):
```bash
npm run build:data        # ECDICT csv -> per-list JSON + meta.json. Needs scripts/sources/ecdict.csv (or ECDICT=...)
npm run build:sentences   # Tatoeba -> sentences.json. Needs scripts/sources/{sentences,links}.csv
```

There is **no test framework** in this project — do not invent test commands.

## Architecture

**No UI framework.** The DOM is built imperatively with a hyperscript helper `h(tag, attrs, ...children)` (`src/ui.ts`). `attrs` special-cases `class`, `html` (innerHTML), `style`, and `on*` event handlers; everything else becomes a `setAttribute`. When adding UI, use `h()` and append to a container element — match the surrounding views.

**Hash-based router** (`src/main.ts`): an array of `{ re, view }` entries maps `location.hash` to a view function. Each **view is a function** `(params, ctx) => ViewResult` where `ViewResult = { el, cleanup? }`. The router calls the previous view's `cleanup()` before swapping, so any event listeners a view attaches to `document`/`window` must be removed in `cleanup()` (see `study.ts` keyboard handling). Navigation is `ctx.navigate('#/route')`.

**State is localStorage-backed**, single source in `src/store.ts`. Three keys:
- `recite:state` — per-word SRS state, keyed **`${listId}:${word}`** (isolated per list)
- `recite:meta` — global settings (selected list, voice, dailyLimit, theme, lang, …)
- `recite:activity` — `{ 'YYYY-MM-DD': count }` for the streak + heatmap

`getState()`/`getWordState()` read fresh from localStorage on every call — there is no in-memory state cache for SRS data, so views re-read rather than hold stale copies.

**SM-2 spaced repetition** (`src/srs.ts`): `schedule(listId, word, q)` takes quality `q` (0–5), advances the interval/ease-factor, and persists. **`q < 3` resets** (reps→0, interval→1 day); `q >= 3` advances. Grade buttons map to q values (study view: 1/3/4/5). `st.diff` flags difficult words (set true on q<3, cleared on q>=4).

**Session building** (`src/session.ts`): SRS-due reviews first, then the next unseen words up to `dailyLimit` ("personal progression" — continues where you left off). Both buckets are shuffled. `dailyLimit` caps **new words only** — every due review is always queued, so a backlog day can exceed the limit.

**Data loading** (`src/data.ts`): word lists / meta / sentences are lazy-`fetch`ed from `public/data/*.json` with an in-memory `Map` cache. URLs are built from `import.meta.env.BASE_URL` (so subpath deploys work — `base: './'` in `vite.config.ts`). **Sentences are optional**: `loadSentences()` returns `{}` on failure and callers degrade gracefully. Never assume sentences exist.

**Data freshness / caching** — two caches sit in front of the JSON, and both bite when you rebuild `public/data/`: (1) the Workbox service worker serves `/data/*.json` `StaleWhileRevalidate` (`vite.config.ts`, cache name `recite-data`), so deployed users see the *previous* version first and the new one only on the next load; (2) `src/data.ts` holds its `Map` cache for the whole page lifetime, so an already-open tab won't pick up changes until reload. The "Download offline" button (`cacheAllData()` in `src/pwa.ts`) is a manual prefetch that warms the `recite-data` SW cache by fetching every data file once. The service worker is only registered in `preview`/production, never in `npm run dev`.

**i18n** (`src/i18n.ts`): homegrown `t(key, vars)` with zh/en dictionaries and `{var}` interpolation. `setLang()` persists and **reloads the page** (no reactive re-render). Word *content* is never translated; localized list names/descriptions come from `listName()`/`listDesc()`. New UI strings must be added to **both** the `zh` and `en` dicts.

## Data pipeline

`public/data/*.json` are committed build artifacts served as static assets. `meta.json` is the source of truth the app reads for the list catalog (`id`, `name`, `desc`, `file`, `count`).

- `scripts/build-wordlists.js`: streams `ecdict.csv`, buckets rows by ECDICT `tag` into lists, **frequency-sorts** (most common first), de-dupes, slimms to `{word, phonetic, pos, translation, definition}`, and writes one JSON per list plus `meta.json`. AWL is special: headwords come from `scripts/data/awl.txt`, backfilled with phonetic/meaning from ECDICT (it has no tag).
- The `LISTS` and `META.lists` arrays in that script **must stay in sync** — they define which lists exist.

### Adding a new word list
1. Add entries to both `LISTS` (with ECDICT tag) and `META.lists` in `scripts/build-wordlists.js`.
2. Add the list id to the `LIST_NAMES` and `LIST_DESC` maps in `src/i18n.ts`.
3. Add a `data/*.json` file (built) and ensure `public/data/meta.json` reflects it.
4. Add a route to the router in `src/main.ts` only if it needs a dedicated screen; the home view auto-renders all lists from `meta.json`.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes `dist/` to GitHub Pages on push to `main`. Because of the subpath deploy, keep `base: './'` (relative asset paths) in `vite.config.ts`.

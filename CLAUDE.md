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

**No UI framework.** The DOM is built imperatively with a hyperscript helper `h(tag, attrs, ...children)` (`src/ui.ts`). `attrs` special-cases `class`, `html` (innerHTML), `style`, and `on*` event handlers; everything else becomes a `setAttribute`. In both `attrs` and `children`, `null`/`undefined`/`false`/`true` are dropped — so conditional rendering (`cond && h('span')`) and boolean-style attributes (`{ disabled: isDone }`, where `false` omits the attr rather than emitting `disabled="false"`) are safe no-ops, never literal strings. When adding UI, use `h()` and append to a container element — match the surrounding views. `shuffle()` (Fisher–Yates) and `toast()` (a transient bottom banner) also live in `ui.ts`. `src/dropdown.ts` exports `dropdown({ label, options, current, onChange })` — a fully-styled custom listbox (closed + open states, outside-click-to-close, ARIA roles) that replaces native `<select>`; the settings page uses it for every option picker, so reach for it rather than `<select>` when you need a styled chooser.

**Hash-based router** (`src/main.ts`): an array of `{ re, view }` entries maps `location.hash` to a view function. Each **view is a function** `(params, ctx) => ViewResult` where `ViewResult = { el, cleanup? }`. The router calls the previous view's `cleanup()` before swapping, so any event listeners a view attaches to `document`/`window` must be removed in `cleanup()` (see `study.ts` keyboard handling). Navigation is `ctx.navigate('#/route')`. `#/list/:id` is the per-list word browser (status badges, filter chips, multi-select, bulk mark/unmark known); `#/list/new` creates a custom list — it must be registered **before** the `:id` route since `new` matches `[\w-]+`. Custom lists are created via `createUserList()` and auto-filled from built-in data via `getWordIndex()` (`data.ts`).

**State is localStorage-backed**, single source in `src/store.ts`. Four keys:
- `recite:state` — per-word SRS state, keyed **`${listId}:${word}`** (isolated per list). `WordState.known` marks a word "already known": `buildSession` skips it, `statsByList` counts it as learned (not due), `getDifficult` excludes it. Set/cleared in bulk via `markKnown()`/`unmarkKnown()`.
- `recite:meta` — global settings (selected list, voice, dailyLimit, spellCountdown, theme, lang, ttsEngine). Defaults live in `defaultMeta` in this file; to **add a setting** also extend the `Meta` interface in `src/types.ts`, wire a control in the settings UI, and add any label strings to both i18n dicts.
- `recite:activity` — `{ 'YYYY-MM-DD': count }` for the streak + heatmap
- `recite:userlists` — user-created custom word lists (`UserList[]`; ids are `user-<base36>`, colon-free so they're safe as `listId`). `loadMeta()`/`loadList()` in `data.ts` merge + serve them transparently, so study/spell/dictation/stats/home work unchanged. `clearAll()` keeps the list definitions (only their SRS state is wiped).

`getState()`/`getWordState()` are backed by an in-memory cache (parsed once per tab), so the hot path (`schedule()` + `bumpActivity()` on every grade) no longer re-parses the whole SRS object each time. The cache is dropped on cross-tab writes (a `storage` listener) and on `importData()`/`clearAll()`. `statsByList()` rolls up per-list started/due counts in one pass (used by home + stats). A write that hits `QuotaExceededError` is logged and surfaced via the `onQuotaExceeded()` hook (wired in `main.ts` to a toast) rather than failing silently. Backup/restore lives here too: `exportData()`/`importData()` serialize all four keys; `clearAll()` wipes SRS state + activity but **keeps** settings (meta). `getDifficult()` scans all of `recite:state` for words flagged `diff` — it's how the cross-list drill view finds its queue.

**SM-2 spaced repetition** (`src/srs.ts`): `schedule(listId, word, q)` takes quality `q` (0–5), advances the interval/ease-factor, and persists. **`q < 3` resets** (reps→0, interval→1 day); `q >= 3` advances. Grade buttons map to q values (study view: 1/3/4/5). `st.diff` flags difficult words (set true on q<3, cleared on q>=4).

**Session building** (`src/session.ts`): SRS-due reviews first, then the next unseen words up to `dailyLimit` ("personal progression" — continues where you left off). Both buckets are shuffled. `dailyLimit` caps **new words only** — every due review is always queued, so a backlog day can exceed the limit.

**Data loading** (`src/data.ts`): word lists / meta / sentences are lazy-`fetch`ed from `public/data/*.json` with an in-memory `Map` cache. URLs are built from `import.meta.env.BASE_URL` (so subpath deploys work — `base: './'` in `vite.config.ts`). **Sentences are optional**: `loadSentences()` returns `{}` on failure and callers degrade gracefully. Never assume sentences exist.

**Data freshness / caching** — two caches sit in front of the JSON, and both bite when you rebuild `public/data/`: (1) the Workbox service worker serves `/data/*.json` `StaleWhileRevalidate` (`vite.config.ts`, cache name `recite-data`), so deployed users see the *previous* version first and the new one only on the next load; (2) `src/data.ts` holds its `Map` cache for the whole page lifetime, so an already-open tab won't pick up changes until reload. The "Download offline" button (`cacheAllData()` in `src/pwa.ts`) is a manual prefetch that warms the `recite-data` SW cache by fetching every data file once. The service worker is only registered in `preview`/production, never in `npm run dev`.

**i18n** (`src/i18n.ts`): homegrown `t(key, vars)` with zh/en dictionaries and `{var}` interpolation. `setLang()` persists and **reloads the page** (no reactive re-render). Theme is the exception: `src/theme.ts` toggles a `.dark` class on `<html>` **live** (no reload) and re-applies automatically when the OS scheme changes while in `auto` mode. Word *content* is never translated; localized list names/descriptions come from `listName()`/`listDesc()`. New UI strings must be added to **both** the `zh` and `en` dicts.

**Views & learning modes** (`src/views/`, one file per route). The **per-list** modes (`study`, `spell`, `dictation` — all take a `listId` param) share the same `buildSession()` + `schedule()` loop and differ only in interaction: `study` is flip-card reveal → grade (q 1/3/4/5); `spell` clozes an example sentence and asks you to type the word; `dictation` plays the word via `speak()` and asks you to type it with the meaning hidden. The **global** views ignore `listId` and read across *all* SRS state: `drill` pulls every `st.diff` word from every list (`getDifficult()`), `search` scans all lists, `stats` drives the streak/heatmap from `recite:activity`. Pronunciation is the single path `speak(text, lang)` in `src/speech.ts`: it uses the Web Speech API when the browser has a usable engine, and otherwise falls back to **kokoro-js** (Kokoro-82M neural TTS, runs locally via WASM) — but only if the user has opted in via the 设置 → 发音引擎 (`ttsEngine`) toggle, since it downloads an ~80–100 MB model from Hugging Face on first use (cached in the browser thereafter). It's still a best-effort no-op when neither is available, so never assume audio plays. `kokoro-js` is aliased to its self-contained `dist/kokoro.web.js` in `vite.config.ts` (the package's npm entry imports Node-only `fs`/`path`) and excluded from dep pre-bundling; it is dynamically `import()`-ed from the fallback path only, so it never lands in the main bundle. The interactive views (`study`, `spell`, `dictation`, `drill`) attach `keydown` listeners on `document` — **always remove them in the returned `cleanup()`** or keys leak into the next view. Bindings differ per view (study: Space = reveal, 1–4 = grade, z = undo). `study` keeps a one-step undo: `grade()` snapshots the pre-grade `WordState` into `undoLast`, so a later `undo()` (button or `z`) restores it via `setWordState()`/`removeWordState()` and also rolls back the `bumpActivity()` and session counters — only the immediately previous card is revertible.

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

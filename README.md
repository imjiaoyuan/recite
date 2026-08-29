# recite

> Let's memorize some words.

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

- FSRS spaced repetition (MaiMemo's open-source scheduler), daily quota covers new + review, personal progression (continues where you left off)
- Modes: study, spell (with optional countdown), dictation (listen & write), search
- Difficult-words drill (auto-collects words you get wrong)
- Streak counter + 17-week activity heatmap
- Backup import / export (JSON)
- Offline PWA — installable, pre-caches all data
- English / Chinese UI with system-language auto-detect
- Light / dark / system theme
- Pronunciation via the browser's speech synthesis

## Word lists

Built from [ECDICT](https://github.com/skywind3000/ECDICT), frequency-sorted (most common first).

| List | Words |
|------|------:|
| 中考 (Junior) | 1,603 |
| 高考 (Senior) | 3,677 |
| CET-4 | 3,849 |
| CET-6 | 5,407 |
| 考研 (Grad) | 4,801 |
| TOEFL | 6,974 |
| IELTS | 5,040 |
| GRE | 7,504 |
| 读博 AWL (Academic) | 570 |

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

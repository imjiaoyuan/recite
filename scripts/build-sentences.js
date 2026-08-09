// Attach 1-2 bilingual example sentences per word from Tatoeba -> public/data/sentences.json.
//
// Usage:
//   1) Download (tab-separated, despite the .csv extension):
//        sentences.tar.bz2 -> sentences.csv
//        links.tar.bz2     -> links.csv
//      from https://downloads.tatoeba.org/exports/  (sentences_CC0 for public-domain)
//   2) Put sentences.csv and links.csv at scripts/sources/
//   3) npm run build:sentences
//
// File format: sentences.csv = id<TAB>lang<TAB>text ; links.csv = sentenceId<TAB>translationId
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const SRC = path.join(__dirname, 'sources');
const SENT = path.join(SRC, 'sentences.csv');
const LINKS = path.join(SRC, 'links.csv');
const OUT = path.join(DATA, 'sentences.json');
const MAX_PER_WORD = 6; // max english candidates indexed per word
const OUT_LIMIT = 3; // examples kept per word in output

const CMN_LANGS = new Set(['cmn', 'cmn-Hans', 'cmn-Hant', 'yue']);

function reader(file) {
  return readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
}

// Collect every word across all lists (lowercased).
function targetWords() {
  const set = new Set();
  for (const f of fs.readdirSync(DATA)) {
    if (f === 'meta.json' || f === 'sentences.json' || !f.endsWith('.json')) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
      for (const e of arr) if (e.word) set.add(e.word.toLowerCase());
    } catch (e) {
      console.warn(`[sentences] skipping unreadable list file "${f}"`, e);
    }
  }
  return set;
}

async function main() {
  if (!fs.existsSync(SENT) || !fs.existsSync(LINKS)) {
    console.warn('[skip] Tatoeba files not found.');
    console.warn('       Download sentences.csv and links.csv (tab-separated) into scripts/sources/ and rerun.');
    console.warn('       See https://downloads.tatoeba.org/exports/');
    return;
  }
  const targets = targetWords();
  console.log(`target words: ${targets.size}`);

  const engText = new Map(); // engId -> text
  const cmnText = new Map(); // cmnId -> text
  const wordIds = new Map(); // word -> [engId]
  const wordCount = new Map(); // word -> indexed count

  // Pass 1: scan sentences.
  for await (const line of await reader(SENT)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [id, lang, text] = parts;
    if (CMN_LANGS.has(lang)) {
      cmnText.set(id, text);
      continue;
    }
    if (lang !== 'eng') continue;
    const toks = new Set((text.toLowerCase().match(/[a-z']+/g)) || []);
    for (const w of toks) {
      if (!targets.has(w)) continue;
      const c = wordCount.get(w) || 0;
      if (c >= MAX_PER_WORD) continue;
      wordCount.set(w, c + 1);
      if (!wordIds.has(w)) wordIds.set(w, []);
      wordIds.get(w).push(id);
      engText.set(id, text);
    }
  }
  console.log(`eng candidates: ${engText.size}, chinese: ${cmnText.size}`);

  // Pass 2: link english sentences to chinese translations.
  const engCmn = new Map(); // engId -> cmnId
  for await (const line of await reader(LINKS)) {
    const [a, b] = line.split('\t');
    if (!a || !b) continue;
    if (engText.has(a) && cmnText.has(b)) engCmn.set(a, b);
    else if (engText.has(b) && cmnText.has(a)) engCmn.set(b, a);
  }

  // Build output: bilingual examples first, then english-only to fill, up to OUT_LIMIT.
  const out = {};
  for (const [word, ids] of wordIds) {
    const bilingual = [];
    const englishOnly = [];
    for (const id of ids) {
      const zhId = engCmn.get(id);
      if (zhId) bilingual.push({ en: engText.get(id), zh: cmnText.get(zhId) });
      else englishOnly.push({ en: engText.get(id), zh: '' });
    }
    const ex = bilingual.concat(englishOnly).slice(0, OUT_LIMIT);
    if (ex.length) out[word] = ex;
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`sentences: ${Object.keys(out).length} / ${targets.size} words`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

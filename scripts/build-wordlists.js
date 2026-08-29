// Build the per-list word JSONs (ECDICT tags) + AWL from ECDICT CSV.
//
// Usage:
//   1) Download ecdict.csv from https://github.com/skywind3000/ECDICT
//   2) Put it at scripts/sources/ecdict.csv, or set ECDICT=path/to/ecdict.csv
//   3) npm run build:data
//
// Without ECDICT the script skips and keeps any existing sample lists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');
const ECDICT = process.env.ECDICT || path.join(__dirname, 'sources', 'ecdict.csv');

// ECDICT tag -> list id. AWL has no tag and is handled separately.
const LISTS = [
  { id: 'zk', tag: 'zk' },
  { id: 'gk', tag: 'gk' },
  { id: 'cet4', tag: 'cet4' },
  { id: 'cet6', tag: 'cet6' },
  { id: 'ky', tag: 'ky' },
  { id: 'toefl', tag: 'toefl' },
  { id: 'ielts', tag: 'ielts' },
  { id: 'gre', tag: 'gre' },
];

const META = {
  lists: [
    { id: 'zk', name: '中考', desc: '初中毕业', file: 'zk.json' },
    { id: 'gk', name: '高考', desc: '高考', file: 'gk.json' },
    { id: 'cet4', name: '四级', desc: 'CET-4', file: 'cet4.json' },
    { id: 'cet6', name: '六级', desc: 'CET-6', file: 'cet6.json' },
    { id: 'ky', name: '考研', desc: '研究生入学考试', file: 'ky.json' },
    { id: 'toefl', name: '托福', desc: 'TOEFL', file: 'toefl.json' },
    { id: 'ielts', name: '雅思', desc: 'IELTS', file: 'ielts.json' },
    { id: 'gre', name: 'GRE', desc: 'GRE', file: 'gre.json' },
    { id: 'awl', name: '读博', desc: '学术英语 AWL', file: 'awl.json' },
  ],
  source: 'ECDICT + AWL',
};

const counts = {};

// Collapse real newlines and literal \n into a single-line separator.
function oneLine(s, sep) {
  return (s || '').replace(/\r?\n/g, sep).replace(/\\n/g, sep).trim();
}

// Keep only the fields the app needs.
function slim(row) {
  return {
    word: (row.word || '').trim(),
    phonetic: (row.phonetic || '').trim(),
    pos: (row.pos || '').trim(),
    translation: oneLine(row.translation, '；'),
    definition: oneLine(row.definition, '; '),
  };
}

function countExisting(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8')).length;
  } catch {
    return 0;
  }
}

function writeMeta() {
  const meta = {
    lists: META.lists.map((l) => ({ ...l, count: counts[l.id] ?? countExisting(l.file) })),
    source: 'ECDICT + AWL',
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('meta.json written');
}

// AWL academic list, phonetic/meaning backfilled from ECDICT.
function buildAwl(byWord) {
  const awlPath = path.join(__dirname, 'data', 'awl.txt');
  if (!fs.existsSync(awlPath)) {
    console.warn('[skip] scripts/data/awl.txt not found');
    return;
  }
  const heads = fs.readFileSync(awlPath, 'utf8')
    .split('\n').map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  const arr = heads.map((w) => {
    const row = byWord.get(w.toLowerCase());
    return row || { word: w, phonetic: '', pos: '', translation: '', definition: '' };
  });
  fs.writeFileSync(path.join(OUT, 'awl.json'), JSON.stringify(arr));
  counts.awl = arr.length;
  console.log(`awl: ${arr.length} words`);
}

async function buildFromEcdict() {
  if (!fs.existsSync(ECDICT)) {
    console.warn(`[skip] ECDICT not found: ${ECDICT}`);
    console.warn('       Place ecdict.csv at scripts/sources/ or set ECDICT=path. Sample lists are kept.');
    return;
  }
  const buckets = Object.fromEntries(LISTS.map((l) => [l.id, []]));
  const byWord = new Map(); // lowercase word -> slimmed row, for AWL backfill

  const parser = fs.createReadStream(ECDICT).pipe(
    parse({ columns: true, trim: true, relax_column_count: true, bom: true }),
  );

  let n = 0;
  for await (const row of parser) {
    n++;
    if (n % 50000 === 0) console.log(`  scanned ${n} rows...`);
    if (!row.word) continue;
    const lw = row.word.toLowerCase();
    if (!byWord.has(lw)) byWord.set(lw, slim(row));
    const tags = (row.tag || '').split(/\s+/);
    const frq = Number(row.frq) || Infinity; // frequency rank: smaller = more common
    for (const l of LISTS) {
      if (tags.includes(l.tag)) buckets[l.id].push({ e: slim(row), f: frq });
    }
  }

  // Sort each list by frequency (most common first), then alphabetically as tie-breaker.
  for (const l of LISTS) {
    const seen = new Set();
    const arr = buckets[l.id]
      .filter((d) => {
        if (!d.e.word || seen.has(d.e.word)) return false;
        seen.add(d.e.word);
        return true;
      })
      .sort((a, b) => (a.f - b.f) || a.e.word.localeCompare(b.e.word))
      .map((d) => d.e);
    fs.writeFileSync(path.join(OUT, `${l.id}.json`), JSON.stringify(arr));
    counts[l.id] = arr.length;
    console.log(`${l.id}: ${arr.length} words`);
  }
  buildAwl(byWord);
}

fs.mkdirSync(OUT, { recursive: true });
buildFromEcdict()
  .then(() => writeMeta())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Split the KET vocabulary into four difficulty bands using the Oxford 3000
 * CEFR levels.
 *
 *   L3A1  A1         629   the step out of the textbook — the single biggest
 *                            cliff in the app used to sit here (L2 ends at 43
 *                            words and the old L3A started at 959)
 *   L3A2  A2         330   the more abstract half of the everyday KET core
 *   L3B   B1 + B2     76   the genuinely hard tail: examination, helicopter,
 *                            photographer, frightened
 *   L3C   not listed  290   absent from the Oxford 3000
 *
 * Why L3C is its own band rather than the tail of L3B: the Oxford 3000 is a
 * *deduplicated* list of 3000 core keywords, so a word's absence means
 * "Oxford did not call it a priority word", not "Oxford rates it B2". Its
 * members are mostly function words (about, able, across), nouns the child
 * already knows (ball, pizza, beach) and plurals (glasses, feelings). Filing
 * those under a challenge label would invent a difficulty the source never
 * claimed.
 *
 * A word can sit at more than one Oxford level — the source has one row per
 * headword-and-POS, so "but" is A1 as a conjunction and B2 as an adverb, and
 * "by" is A1 and B1. Take the LOWEST. Keeping the last one seen would file
 * `but` under B1 and hand a child conjunctions as their hardest words.
 *
 * Idempotent: re-reads whatever l3* word files already exist, so re-running
 * after a hand edit is safe and does not need the undivided l3-words.txt.
 *
 * Run: node scripts/split-l3-bands.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CEFR = path.join(ROOT, 'data', 'oxford-cefr.json');
const WORDS = path.join(ROOT, 'data', 'words.json');
const OUT = ['l3a1-words.txt', 'l3a2-words.txt', 'l3b-words.txt', 'l3c-words.txt'];

/* Read the current KET word lists. Prefer the undivided file if it is still
   around (a fresh checkout of an old branch), otherwise take the union of the
   per-band files — the split is idempotent, so the input is never lost. */
const SOURCES = [
  'l3-words.txt',
  'l3a-words.txt',
  'l3a1-words.txt',
  'l3a2-words.txt',
  'l3b-words.txt',
  'l3c-words.txt',
];
const readList = (p) =>
  fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);

let all = [];
for (const f of SOURCES) {
  const p = path.join(ROOT, 'data', f);
  if (fs.existsSync(p)) all = all.concat(readList(p));
}
all = [...new Set(all)];
if (!all.length) {
  console.error('data/ 下没有找到任何 l3* 词表文件。');
  process.exit(1);
}

const cefr = JSON.parse(fs.readFileSync(CEFR, 'utf8')).levels;
const ORDER = ['A1', 'A2', 'B1', 'B2'];
const levelOf = new Map();
for (const lv of ORDER) {
  for (const w of cefr[lv] || []) if (!levelOf.has(w)) levelOf.set(w, lv);
}

/* Only re-assign words we actually hold data for; anything else keeps its
   current band and shows up as a build error rather than silently vanishing. */
const have = new Set(Object.keys(JSON.parse(fs.readFileSync(WORDS, 'utf8')).words));

const bucket = { l3a1: [], l3a2: [], l3b: [], l3c: [] };
const skipped = [];
for (const w of all) {
  if (!have.has(w)) {
    skipped.push(w);
    continue;
  }
  const lv = levelOf.get(w);
  if (lv === 'A1') bucket.l3a1.push(w);
  else if (lv === 'A2') bucket.l3a2.push(w);
  else if (lv === 'B1' || lv === 'B2') bucket.l3b.push(w);
  else bucket.l3c.push(w);
}

const header = {
  l3a1: '# L3a1 启程：KET 词表里 Oxford 3000 标为 A1 的词',
  l3a2: '# L3a2 拓展：KET 词表里 Oxford 3000 标为 A2 的词',
  l3b: '# L3b 挑战：KET 词表里 Oxford 3000 标为 B1/B2 的词',
  l3c: '# L3c 补充：KET 词表里 Oxford 3000 未收录的词（多为派生形和虚词，非"更难"）',
};
for (const k of ['l3a1', 'l3a2', 'l3b', 'l3c']) {
  bucket[k].sort();
  fs.writeFileSync(
    path.join(ROOT, 'data', `${k}-words.txt`),
    header[k] +
      `\n# 共 ${bucket[k].length} 词。fetch_words.js 读这四个文件，tag 分别是 l3a1/l3a2/l3b/l3c。\n` +
      bucket[k].join('\n') +
      '\n'
  );
}

// Retire the superseded undivided/merged files so fetch_words.js cannot read
// both and double-tag.
for (const f of ['l3-words.txt', 'l3a-words.txt']) {
  const p = path.join(ROOT, 'data', f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const n = (k) => bucket[k].length;
process.stdout.write(
  `KET ${all.length} 词拆分完成\n` +
    `  l3a1 (A1)        ${n('l3a1')}\n` +
    `  l3a2 (A2)        ${n('l3a2')}\n` +
    `  l3b  (B1+B2)     ${n('l3b')}\n` +
    `  l3c  (未收录)     ${n('l3c')}\n` +
    `  合计             ${Object.values(bucket).reduce((a, b) => a + b.length, 0)}\n` +
    (skipped.length ? `  跳过（词库无数据）${skipped.length}: ${skipped.slice(0, 10).join(' ')}\n` : '')
);

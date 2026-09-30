#!/usr/bin/env node
/**
 * Split L3 into three difficulty bands using the Oxford 3000 CEFR levels,
 * and split data/l3-words.txt into three files.
 *
 *   L3a  A1 + A2        959   everyday nouns/verbs, the natural next step
 *                                after the textbook bands
 *   L3b  B1 + B2         76   the harder tail of the KET list
 *   L3c  not in Oxford  290   words Oxford doesn't list as keywords — mostly
 *                                derivable forms (feels, runner) and closed-class
 *                                items. Not "harder than B2", just unplaced.
 *
 * Why L3c is its own band rather than being lumped in with L3b: the Oxford 3000
 * is a *deduplicated* list of 3000 core keywords, so a word's absence means
 * "Oxford didn't consider it a priority keyword", not "Oxford thinks it is
 * B2". `able`, `about` and `above` are all absent for exactly that reason.
 * Treating them as the hardest words would be inventing a difficulty the
 * source never claimed.
 *
 * Run: node scripts/split-l3-bands.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const L3 = path.join(ROOT, 'data', 'l3-words.txt');
const CEFR = path.join(ROOT, 'data', 'oxford-cefr.json');
const WORDS = path.join(ROOT, 'data', 'words.json');

const cefr = JSON.parse(fs.readFileSync(CEFR, 'utf8')).levels;
/* A word can sit at more than one Oxford level — the source has one row per
   headword-and-POS, so "but" is A1 as a conjunction and B2 as an adverb, and
   "by" is A1 and B1. Take the LOWEST. Taking the last one seen would file
   `but` under B2 and hand a child conjunctions as their hardest words. */
const ORDER = ['A1', 'A2', 'B1', 'B2'];
const levelOf = new Map();
for (const lv of ORDER) {
  for (const w of cefr[lv] || []) if (!levelOf.has(w)) levelOf.set(w, lv);
}

const words = fs
  .readFileSync(L3, 'utf8')
  .split('\n')
  .map((l) => l.replace(/#.*$/, '').trim())
  .filter(Boolean);

// Only re-assign words we actually hold data for; anything else keeps its
// current band and shows up as a build error rather than silently vanishing.
const have = new Set(Object.keys(JSON.parse(fs.readFileSync(WORDS, 'utf8')).words));

const bucket = { l3a: [], l3b: [], l3c: [] };
const skipped = [];
for (const w of words) {
  if (!have.has(w)) {
    skipped.push(w);
    continue;
  }
  const lv = levelOf.get(w);
  if (lv === 'A1' || lv === 'A2') bucket.l3a.push(w);
  else if (lv === 'B1' || lv === 'B2') bucket.l3b.push(w);
  else bucket.l3c.push(w);
}

const header = {
  l3a: '# L3a 拓展·基础：KET 词表里 Oxford 3000 标为 A1/A2 的词',
  l3b: '# L3b 拓展·进阶：KET 词表里 Oxford 3000 标为 B1/B2 的词',
  l3c: '# L3c 拓展·补充：KET 词表里 Oxford 3000 未收录的词（多为派生形和虚词，非"更难"）',
};
for (const k of ['l3a', 'l3b', 'l3c']) {
  bucket[k].sort();
  const body =
    header[k] +
    `\n# 共 ${bucket[k].length} 词。fetch_words.js 读这三个文件，tag 分别是 l3a/l3b/l3c。\n` +
    bucket[k].join('\n') +
    '\n';
  fs.writeFileSync(path.join(ROOT, 'data', `${k}-words.txt`), body);
}

// Retire the undivided file so fetch_words.js can't read both and double-tag.
fs.unlinkSync(L3);

process.stdout.write(
  `L3 ${words.length} 词拆分完成\n` +
    `  l3a (A1+A2)      ${bucket.l3a.length}\n` +
    `  l3b (B1+B2)      ${bucket.l3b.length}\n` +
    `  l3c (未收录)      ${bucket.l3c.length}\n` +
    (skipped.length ? `  跳过（词库无数据）${skipped.length}: ${skipped.slice(0, 10).join(' ')}\n` : '')
);

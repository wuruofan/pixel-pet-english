#!/usr/bin/env node
/**
 * Fetch the Oxford 3000 CEFR levels and write data/oxford-cefr.json.
 *
 * Why this exists: the Cambridge A2 Key (KET) vocabulary list is a flat list —
 * Cambridge publishes no internal difficulty split, and YLE Starters /
 * Flyers / Movers are sibling exams, not tiers underneath it. So the 1325 L3
 * words arrive as one undifferentiated block, which is not something a child
 * can be handed all at once.
 *
 * The Oxford 3000 groups the same core vocabulary by CEFR level (A1 / A2 /
 * B1 / B2), which is exactly the axis L3 needs. It is also an independent
 * check on the existing bands: L1 and L2 come from Chinese primary-school
 * textbooks, and if they really are grade 1-2 material then ~97% of them
 * should land in A1. They do.
 *
 * Source file: ox3k.tsv from mbarkhau/oxford5k-data, itself a parse of the
 * official "The Oxford 3000" PDF published by Oxford University Press.
 * (c) Oxford University Press — the data is a fact table of levels, not
 * Oxford's word definitions, and it is not redistributed in the repo's
 * source-of-truth data files beyond this level index.
 *
 * Run: node scripts/fetch-oxford-cefr.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC =
  'https://raw.githubusercontent.com/mbarkhau/oxford5k-data/master/ox3k.tsv';
const OUT = path.join(__dirname, '..', 'data', 'oxford-cefr.json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

(async () => {
  const tsv = await get(SRC);
  const levels = {};
  let bad = 0;
  for (const line of tsv.split(/\r?\n/)) {
    if (!line) continue;
    const p = line.split('\t');
    if (!p[0] || !p[1]) {
      bad++;
      continue;
    }
    const lv = p[0].toUpperCase();
    if (!/^A[12]$|^B[12]$/.test(lv)) {
      bad++;
      continue;
    }
    (levels[lv] = levels[lv] || []).push(p[1].toLowerCase());
  }
  if (bad) process.stderr.write(`  skipped ${bad} unparsable lines\n`);
  for (const k of Object.keys(levels)) levels[k].sort();
  /* A word can appear under more than one level — the PDF has one row per
     headword-and-POS, so "but" (conj) is A1 and "but" (adv) is B2. Keep the
     lists as they are and let the consumer take the lowest; collapsing to a
     single level here would silently promote `but` to B2. */
  const multi = new Set();
  for (const lv of Object.keys(levels)) for (const w of levels[lv]) multi.add(w);
  let dupes = 0;
  for (const w of multi) if (Object.keys(levels).filter((k) => levels[k].includes(w)).length > 1) dupes++;
  if (dupes) process.stderr.write(`  ${dupes} words appear at more than one level (consumer takes the lowest)\n`);
  const total = Object.values(levels).reduce((a, l) => a + l.length, 0);
  if (!total) throw new Error('parsed zero words — the upstream format changed');

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'Oxford 3000 (Oxford University Press), CEFR level per word; parsed from ox3k.tsv',
        levels,
      },
      null,
      1
    )
  );
  process.stdout.write(
    `${total} words: ` +
      Object.keys(levels)
        .sort()
        .map((k) => `${k}=${levels[k].length}`)
        .join(' ') +
      `\n-> ${OUT}\n`
  );
})();

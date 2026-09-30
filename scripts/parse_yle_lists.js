#!/usr/bin/env node
/**
 * Extract the three per-level word lists from the official Cambridge YLE
 * Wordlists PDF ("Pre A1 Starters, A1 Movers and A2 Flyers Wordlists",
 * © Cambridge University Press & Assessment, 44 pages).
 *
 * Why this exists: the KET list cannot be split by level — it is a single
 * alphabetical A2 glossary with no internal grading (only Appendix 1 word sets
 * and Appendix 2 topic lists). That leaves a cliff in the app: L2 ends at 43
 * words and L3A starts at 959. YLE is the official ladder that belongs in
 * between, and unlike KET it really is organised by level — pages 4, 8 and 12
 * open one alphabetic word list per exam.
 *
 * This PDF is not in the repo (Cambridge copyright). Point the script at a
 * local copy:
 *
 *   node scripts/parse_yle_lists.js /path/to/yle.pdf
 *   node scripts/parse_yle_lists.js /path/to/yle.txt   # pre-extracted text
 *
 * Entry format differs from the KET list, which is `headword (pos)`:
 *
 *   at prep of place          <- annotation trails the tag
 *   apartment (UK flat) n      <- annotation leads it
 *   answer n + v               <- compound tag
 *   Ann/ Anna n                <- two spellings, one entry
 *
 * So the tag is found as the FIRST grammatical keyword anywhere in the line,
 * and the headword is the first whitespace token before it. Anchoring on the
 * END of the line instead would drop every `prep of place` entry, which is how
 * you silently lose a third of the prepositions.
 *
 * Output: data/yle-words.json
 *   { source, pageRanges, levels: { starters: {page, words}, movers, flyers } }
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PDF = process.argv[2];
if (!PDF) {
  console.error('usage: node scripts/parse_yle_lists.js <yle.pdf|yle.txt>');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'data', 'yle-words.json');

const PY = `
import sys
try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        sys.exit(3)
r = PdfReader(sys.argv[1])
for i, p in enumerate(r.pages):
    sys.stdout.write("\\n<<<PAGE %d>>>\\n" % (i + 1))
    sys.stdout.write(p.extract_text() or "")
`;

function extractText(file) {
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, 'utf8');
  for (const [bin, args] of [
    ['python3', ['-c', PY, file]],
    ['pdftotext', ['-layout', file, '-']],
    ['mutool', ['draw', '-F', 'txt', '-o', '-', file]],
  ]) {
    try {
      return execFileSync(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
    } catch (e) {
      /* try next */
    }
  }
  throw new Error('no PDF text extractor found: pip install pypdf  (or: brew install poppler)');
}

/* The per-exam word lists. Page numbers are 1-based and come from the PDF's own
   table of contents; the three ranges run up to the first combined list. */
const RANGES = {
  starters: [4, 7],
  movers: [8, 11],
  flyers: [12, 16],
};

const TAGS = 'adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v';
const TAG_RE = new RegExp(`^(?:${TAGS})(?:\\s*\\+\\s*(?:${TAGS}))*$`);
const HAS_TAG = new RegExp(`\\s(?:${TAGS})\\b`);

const text = extractText(PDF);
const pages = new Map();
{
  let cur = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^<<<PAGE (\d+)>>>$/.exec(raw.trim());
    if (m) cur = Number(m[1]);
    else if (cur) {
      if (!pages.has(cur)) pages.set(cur, []);
      pages.get(cur).push(raw);
    }
  }
}

const levels = {};
for (const [level, [from, to]] of Object.entries(RANGES)) {
  const words = [];
  const names = [];
  let inKey = true; // the "Grammatical key" legend runs until the first section letter
  for (let p = from; p <= to; p++) {
    for (const raw of pages.get(p) || []) {
      const line = raw.replace(/\s+$/, '');
      if (!line) continue;
      // Running heads and footers.
      if (/^Pre A1 Starters A–Z|^A1 Movers A–Z|^A2 Flyers A–Z/.test(line)) continue;
      if (/^Grammatical key$/.test(line)) continue;
      if (/^\d{1,3}\s*$/.test(line)) continue; // page number
      // A section letter alone on a line: A, B, C … marks where the key ends.
      if (/^[A-Z]$/.test(line)) { inKey = false; continue; }
      if (inKey) continue;
      if (!HAS_TAG.test(' ' + line)) continue;

      // Headword is the first token before the FIRST grammatical tag; the tag
      // may be followed by an annotation ("at prep of place") so it is not
      // always last.
      const parts = line.trim().split(/\s+/);
      let tagAt = parts.findIndex((t) => TAG_RE.test(t));
      if (tagAt < 1) continue;
      let head = parts.slice(0, tagAt).join(' ');
      // Strip a leading parenthetical gloss: "(UK flat) n" -> "n" alone.
      if (/^\(.*\)$/.test(head)) continue;
      let w = head.split(/\s+/)[0];
      const isName = /^[A-Z]/.test(w);   // PDF capitalises exam characters only
      w = w.toLowerCase();
      w = w.split('/')[0];            // "Ann/ Anna" -> "ann"
      w = w.replace(/[.,;:'’]/g, '');
      if (!/^[a-z][a-z'’-]*$/.test(w)) continue;
      if (w.length < 2) continue;
      if (isName) names.push(w);
      else words.push(w);
    }
  }
  levels[level] = {
    page: from + '-' + to,
    words: [...new Set(words)].sort(),
    names: [...new Set(names)].sort(),
  };
}

const total = Object.values(levels).reduce((a, l) => a + l.words.length, 0);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'Pre A1 Starters, A1 Movers and A2 Flyers Wordlists (© Cambridge)',
      pageRanges: RANGES,
      levels,
    },
    null,
    1
  )
);
for (const [k, l] of Object.entries(levels)) {
  process.stdout.write(
    `  ${k.padEnd(9)} p${l.page.padEnd(6)} ${String(l.words.length).padStart(3)} 词` +
      `  (另有 ${String(l.names.length).padStart(2)} 个人名: ${l.names.slice(0, 8).join(' ')}…)\n`
  );
}
process.stdout.write(`${total} headwords total (含跨级重复)\n-> ${OUT}\n`);

#!/usr/bin/env node
/**
 * Extract the alphabetical word list from the official Cambridge A2 Key (KET)
 * Vocabulary List PDF.
 *
 * Source: "Key and Key for Schools Vocabulary List", © UCLES 2018, 31 pages.
 * The PDF is not in the repo (UCLES copyright, not ours to redistribute) — point
 * this script at a local copy:
 *
 *   node scripts/parse_ket_list.js /path/to/ket.pdf
 *   node scripts/parse_ket_list.js /path/to/ket.txt   # pre-extracted text
 *
 * The list is laid out as `headword   (pos & pos)` lines, one entry per line,
 * with optional indented example sentences underneath. Headwords are therefore
 * the only lines that carry a part-of-speech tag in parentheses, and a headword
 * line never starts with whitespace. That is the whole parse rule.
 *
 * Output: data/ket-words.json  { source, page, words: ["a", "about", ...] }
 */
const fs = require('fs');
const path = require('path');

const PDF = process.argv[2];
if (!PDF) {
  console.error('usage: node scripts/parse_ket_list.js <ket.pdf|ket.txt>');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'data', 'ket-words.json');

/* Text layer of pages 4..~24, extracted once via the Read tool and pasted here
   is fragile. Instead we shell out to whatever is available. */
const { execFileSync } = require('child_process');

function extractText(file) {
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, 'utf8');
  // macOS ships a Quartz-based mdimport/pyobjc path; `textutil` cannot read
  // PDFs. Try the Python route first, then the mutool/poppler CLI.
  const attempts = [
    ['python3', ['-c', PY, file]],
    ['pdftotext', ['-layout', file, '-']],
    ['mutool', ['draw', '-F', 'txt', '-o', '-', file]],
  ];
  for (const [bin, args] of attempts) {
    try {
      return execFileSync(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
    } catch (e) {
      /* try next */
    }
  }
  throw new Error(
    'no PDF text extractor found. Install one: pip install pypdf  (or: brew install poppler)'
  );
}

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

/* A headword line looks like:
     apple   (n)
     centre/center   (n)
     all right/alright   (adj, adv & exclam)
   Everything else (indented example lines, headers, page furniture) does not
   start at column 0 or carries no POS tag.
   Matching is done in two steps rather than one regex: a single pattern whose
   headword class also contains a space backtracks catastrophically against the
   trailing separator, so we find the LAST top-level "  (" and validate the
   tag separately. */
const POS = /^\((det|adj|adv|n|v|av|mv|phr|conj|pron|prep|exclam|num|abbrev|sing|pl|art|letter)\b/;
const SKIP = new Set(['a', 'an']);

const text = extractText(PDF);
const lines = text.split(/\r?\n/);

const found = [];
for (const raw of lines) {
  const line = raw.replace(/\s+$/, '');
  if (!line || /^\s/.test(line)) continue; // indented example / continuation
  if (/^©/.test(line) || /^Page \d+/.test(line) || /^Key and Key/.test(line)) continue;
  if (/^<<<PAGE/.test(line)) continue;
  // The tag is the line's final parenthetical; the headword is everything
  // before it. PDF extraction collapses the layout gap to a single space, so
  // anchor on the END of the line rather than on a fixed-width separator.
  const m = /^(.+?)\s\((det|adj|adv|n|v|av|mv|phr|conj|pron|prep|exclam|num|abbrev|sing|pl|art|letter)\b[^)]*\)\s*$/.exec(line);
  if (!m) continue;
  let hw = m[1].trim().toLowerCase();
  if (!/^[a-z]/.test(hw)) continue; // sentences like "I have about £3. (adv)"
  // slash variants: keep the first (Br Eng) form
  hw = hw.split('/')[0].trim();
  if (!hw || SKIP.has(hw)) continue;
  /* Appendix 2 (topic lists) is laid out in newspaper columns, so PDF
     extraction glues several entries onto one line ("act draw magazine
     practise"). Those lines carry a "(v)" that really belongs to the last
     word. Split them back into individual words; anything that is not a real
     multi-word phrase is then filtered by the word-count test below. */
  const parts = hw.split(/\s+/);
  if (parts.length > 3) {
    // 4+ tokens is never a KET headword — treat as a column-merge and keep tokens
    if (parts.length > 4) {
      for (const p of parts) {
        if (/^[a-z][a-z'’-]*$/.test(p) && !SKIP.has(p)) found.push(p);
      }
      continue;
    }
  }
  if (!/^[a-z][a-z'’-]*(\s+[a-z][a-z'’-]*){0,2}$/.test(hw)) continue;
  found.push(hw);
}

const words = [...new Set(found)].sort();
fs.writeFileSync(OUT, JSON.stringify({ source: 'A2 Key Vocabulary List (UCLES 2018)', words }, null, 1));
process.stdout.write(`${words.length} headwords extracted\n-> ${OUT}\n`);

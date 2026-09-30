#!/usr/bin/env node
/**
 * Fetch per-word pronunciation data for the whole vocabulary.
 *
 * Word lists, and what each one actually is:
 *
 *  - g1a / g2a (46 words) — the source site's official 必背 list, harvested from
 *    the 一上 / 二上 textbook pages. These carry the strongest claim on being
 *    "core": someone published them as the words a child must memorise.
 *
 *  - G1B_WORDS below (57 words) — the source site has NO word list for the new
 *    一下 edition, so this list is curated by hand from the lesson text. Every
 *    entry literally appears in a 一年级下册 lesson, but the selection is ours,
 *    not a publisher's. Note this makes 48 of the 94 L1 words same-origin as
 *    Level 2; the L1/L2 line is "has textbook backing", not "is more frequent".
 *
 *  - data/custom-words.txt (Level 2) — words the lesson text uses ≥4 times that
 *    no 必背 list covers. One word per line, `#` comments.
 *
 * Only words that are NOT already in the output file are fetched, so re-running
 * this after editing the custom list costs one request per new word instead of
 * the whole library. Pass --all to force a full refetch.
 *
 * Output: data/words.json
 *   { "school": { word, explains:[{pos, cn}], uk:{ipa,audio}, us:{ipa,audio},
 *                 pindu:[{sound, audio, word_start, word_end}], examples:[...],
 *                 level: 1|2, books:[...] } }
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'data', 'words.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Curated from 一年级下册 lesson text (source site has no word list for this edition).
const G1B_WORDS = [
  'good', 'fine', 'glad', 'again', 'thank', 'happy', 'school', 'day', 'morning', 'see',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'panda', 'pencil', 'schoolbag', 'leg',
  'apple', 'orange', 'grapes', 'banana', 'pear', 'fruit', 'like', 'mother', 'father', 'sister',
  'red', 'yellow', 'blue', 'green', 'colour', 'rainbow', 'flower', 'ruler',
  'cake', 'bread', 'egg', 'fish', 'noodles', 'rice', 'food', 'hungry',
  'run', 'jump', 'swim', 'dance', 'sing', 'kite', 'help',
];

/* A 30s timeout with no retry is how a 1341-word run turns into an apparent
   hang: one slow response parks the whole queue. 8s is ~40x the observed
   200ms median, so a real timeout means something is actually wrong, and
   retrying it twice gets past the occasional dropped connection. */
const REQ_TIMEOUT = 8000;
const RETRIES = 2;

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, (res) => {
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
    req.setTimeout(REQ_TIMEOUT, () => req.destroy(new Error(`timeout ${REQ_TIMEOUT}ms`)));
  });
}

async function get(url) {
  let last;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      return await getOnce(url);
    } catch (e) {
      last = e;
      if (i < RETRIES) await sleep(600 * (i + 1));
    }
  }
  throw last;
}

function parseNuxt(html) {
  const m = 'window.__NUXT__=';
  const i = html.indexOf(m);
  if (i < 0) throw new Error('no payload');
  const j = html.indexOf('</script>', i);
  // eslint-disable-next-line no-eval
  return eval(html.slice(i + m.length, j).trim().replace(/;$/, ''));
}

const strip = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWord(word) {
  const html = await get(`https://yy.suyang123.com/words/${encodeURIComponent(word)}.html`);
  const d = parseNuxt(html).data[0];
  const detail = (d.word_info && d.word_info.detail) || {};
  const explains = (detail.word_explain || []).map((e) => {
    const t = strip(e.rich_text);
    const m = t.match(/^([a-z]{1,5})\.\s*(.*)$/);
    return m ? { pos: m[1], cn: m[2] } : { pos: '', cn: t };
  });
  const examples = (detail.zt_sentences || detail.en_sentences || [])
    .slice(0, 3)
    .map((s) => ({ en: strip(s.enSentence), cn: strip(s.cnSentence), audio: s.en_audio || null }));

  return {
    word,
    explains,
    uk: detail.uk ? { ipa: detail.uk.ipa, audio: detail.uk.audio } : null,
    us: detail.us ? { ipa: detail.us.ipa, audio: detail.us.audio } : null,
    pindu: (detail.us && detail.us.pindu ? detail.us.pindu : []).map((p) => ({
      sound: p.sound,
      audio: p.audio,
      start: p.word_start,
      end: p.word_end,
      letters: p.slice_word || p.slice_split_word || null,
    })),
    examples,
  };
}

(async () => {
  const books = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'textbooks.json'), 'utf8'));
  const set = new Map(); // word -> Set(unitKey)
  const add = (w, tag) => {
    const k = String(w).toLowerCase().trim();
    if (!k) return;
    if (!set.has(k)) set.set(k, new Set());
    set.get(k).add(tag);
  };
  for (const b of books.books) for (const w of b.words) add(w, b.key);
  for (const w of G1B_WORDS) add(w, 'g1b');

  /* Our own additions, split by difficulty band. Each file is one word per
     line, `#` starts a comment. `books` records the band (g1a/l2/l3a...) rather
     than a textbook, which is fine — books was always only used to answer
     "which group is this word in", and that question is now about difficulty.
       data/l2-words.txt   日常词：课文正文出现 >=4 次、必背表没收的实义词
       data/l3a1-words.txt 启程词：KET 词表 ∩ Oxford 3000 A1
       data/l3a2-words.txt 拓展词：KET 词表 ∩ Oxford 3000 A2
       data/l3b-words.txt  挑战词：KET 词表 ∩ Oxford 3000 B1/B2
       data/l3c-words.txt  补充词：KET 词表 - Oxford 3000（未收录）
     The four l3 files are one KET list split by CEFR level, not four lists —
     scripts/split-l3-bands.js regenerates all of them from data/oxford-cefr.json.
     Driven by a loop so adding a band is a one-line change; a forgotten file
     would otherwise tag nothing and quietly shrink that band. */
  const readList = (p) =>
    fs.existsSync(p)
      ? fs
          .readFileSync(p, 'utf8')
          .split('\n')
          .map((l) => l.replace(/#.*$/, '').trim())
          .filter(Boolean)
      : [];
  for (const tag of ['l2', 'l3a1', 'l3a2', 'l3b', 'l3c']) {
    const p = path.join(__dirname, '..', 'data', `${tag}-words.txt`);
    if (!fs.existsSync(p)) {
      console.error(`缺少词表文件 ${p}，${tag} 层会是空的`);
      process.exit(1);
    }
    for (const w of readList(p)) add(w, tag);
  }

  const force = process.argv.includes('--all');
  let prev = {};
  if (!force && fs.existsSync(OUT)) {
    try {
      prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).words || {};
    } catch (e) {
      /* unreadable cache -> refetch everything */
    }
  }

  const out = {};
  const words = [...set.keys()];
  const todo = force ? words : words.filter((w) => !prev[w]);
  process.stderr.write(
    `Fetching ${todo.length} words (${words.length - todo.length} already cached)...\n`
  );
  let fail = 0;
  /* Checkpoint every 25 words. A 1341-word run takes minutes; if it is
     interrupted (or a word wedges the queue) the work already done survives,
     and the next run resumes instead of starting over. */
  const checkpoint = () => {
    const merged = Object.assign({}, prev, out);
    for (const w of Object.keys(merged)) {
      if (set.has(w)) merged[w].books = [...set.get(w)];
    }
    fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), words: merged }, null, 1));
  };
  for (let i = 0; i < todo.length; i++) {
    const w = todo[i];
    try {
      out[w] = await fetchWord(w);
      out[w].books = [...set.get(w)];
      process.stderr.write(`  [${i + 1}/${todo.length}] ${w} ok\n`);
    } catch (e) {
      fail++;
      process.stderr.write(`  [${i + 1}/${todo.length}] ${w} FAIL ${e.message}\n`);
    }
    if ((i + 1) % 25 === 0) checkpoint();
    await sleep(200);
  }
  // Keep every previously fetched word; only the tag sets are refreshed so a
  // word that gains/losses a book label is corrected without a refetch.
  const merged = Object.assign({}, prev, out);
  for (const w of Object.keys(merged)) {
    if (set.has(w)) merged[w].books = [...set.get(w)];
  }
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), words: merged }, null, 1));
  const all = Object.values(merged);
  const withAudio = all.filter((w) => w.us && w.us.audio).length;
  const withPindu = all.filter((w) => w.pindu && w.pindu.length).length;
  process.stdout.write(
    `${all.length} words total (${fail} failed this run) | ${withAudio} with audio | ${withPindu} with 自然拼读\n-> ${OUT}\n`
  );
})();

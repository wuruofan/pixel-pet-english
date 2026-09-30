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

function get(url) {
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
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
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

  /* Level 2 additions. Kept out of `books` deliberately: the level is the
     learning axis now, not the textbook a word was harvested from. */
  const customPath = path.join(__dirname, '..', 'data', 'custom-words.txt');
  const custom = fs.existsSync(customPath)
    ? fs
        .readFileSync(customPath, 'utf8')
        .split('\n')
        .map((l) => l.replace(/#.*$/, '').trim())
        .filter(Boolean)
    : [];
  for (const w of custom) add(w, 'l2');

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

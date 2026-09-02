#!/usr/bin/env node
/**
 * Fetch per-word pronunciation data for all textbook vocabulary.
 *
 * Word lists:
 *  - g1a / g2a: official 必背单词 harvested from the textbook pages.
 *  - g1b: the source site has NO word list for the new (2025) edition, so the
 *    list below is curated by hand from the lesson text itself. Every entry is
 *    a word that literally appears in a 一年级下册 lesson.
 *
 * Output: data/words.json
 *   { "school": { word, explains:[{pos, cn}], uk:{ipa,audio}, us:{ipa,audio},
 *                 pindu:[{sound, audio, word_start, word_end}], examples:[...] } }
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

  const out = {};
  const words = [...set.keys()];
  process.stderr.write(`Fetching ${words.length} words...\n`);
  let fail = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    try {
      out[w] = await fetchWord(w);
      out[w].books = [...set.get(w)];
      process.stderr.write(`  [${i + 1}/${words.length}] ${w} ok\n`);
    } catch (e) {
      fail++;
      process.stderr.write(`  [${i + 1}/${words.length}] ${w} FAIL ${e.message}\n`);
    }
    await sleep(200);
  }
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), words: out }, null, 1));
  const withAudio = Object.values(out).filter((w) => w.us && w.us.audio).length;
  const withPindu = Object.values(out).filter((w) => w.pindu && w.pindu.length).length;
  process.stdout.write(
    `${Object.keys(out).length} words (${fail} failed) | ${withAudio} with audio | ${withPindu} with 自然拼读\n-> ${OUT}\n`
  );
})();

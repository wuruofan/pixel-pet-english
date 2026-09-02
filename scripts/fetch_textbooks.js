#!/usr/bin/env node
/**
 * Harvest 北京版 (北京出版社) 小学英语 textbook data from suyang123 (英语朗读宝).
 *
 * Source pages are Nuxt SSR pages whose payload lives in `window.__NUXT__`.
 * We eval that payload to get structured data instead of scraping DOM.
 *
 * Output: data/textbooks.json
 *   { books: [ { key, grade, term, publisher, isbn, cover,
 *                units: [ { id, title, lessons: [ { id, title, audio_url,
 *                          sentences: [ {en, zh, start, end} ] } ] } ],
 *                words: [string] } ] }
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'data', 'textbooks.json');

const BOOKS = [
  { key: 'g1a', grade: '一年级', term: '上册', slug: '/xiaoxue/yinianji/bjb_shangce' },
  { key: 'g1b', grade: '一年级', term: '下册', slug: '/xiaoxue/yinianji/bjb_xiace' },
  { key: 'g2a', grade: '二年级', term: '上册', slug: '/xiaoxue/ernianji/bjb_shangce' },
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`timeout ${url}`)));
  });
}

function parseNuxt(html) {
  const marker = 'window.__NUXT__=';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('no __NUXT__ payload');
  const j = html.indexOf('</script>', i);
  let expr = html.slice(i + marker.length, j).trim().replace(/;$/, '');
  // eslint-disable-next-line no-eval
  return eval(expr);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

async function harvestBook(book) {
  const units = [];
  const wordSet = new Set();
  let info = null;
  let isbn = null;

  for (let n = 1; n <= 12; n++) {
    const url = `https://yy.suyang123.com${book.slug}_listen${n}.html`;
    let html;
    try {
      html = await get(url);
    } catch (e) {
      if (n > 1) break; // 404 / no more units
      throw e;
    }
    const d = parseNuxt(html).data[0];
    info = d.info;
    if (!isbn) {
      const m = JSON.stringify(d.sentences || []).match(/\/(\d{10,13})\/T?\d+\.mp3/);
      isbn = m ? m[1] : null;
    }

    const lessons = (d.sentences || []).map((les) => ({
      id: les.lesson_id,
      title: les.title,
      audio: les.audio_url || null,
      sentences: (les.sentences || [])
        .map((s) => ({
          en: stripHtml(s.english),
          zh: stripHtml(s.chinese),
          start: s.audio_start,
          end: s.audio_end,
        }))
        .filter((s) => s.en),
    }));

    const unitMeta = (d.lessons || [])[n - 1];
    units.push({
      id: n,
      title: (unitMeta && unitMeta.title) || (lessons[0] && lessons[0].title) || `Unit ${n}`,
      lessons,
    });

    for (const w of d.base_words || []) wordSet.add(w.word);
    process.stderr.write(`  ${book.key} unit${n}: ${lessons.length} lessons\n`);
    await sleep(250);
  }

  return {
    key: book.key,
    grade: book.grade,
    term: book.term,
    title: `${book.grade}${book.term}`,
    publisher: info && info.publisher,
    version: info && info.version,
    isbn,
    cover: info && info.cover,
    units,
    words: [...wordSet],
  };
}

(async () => {
  const books = [];
  for (const b of BOOKS) {
    process.stderr.write(`Harvesting ${b.key} ...\n`);
    books.push(await harvestBook(b));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), books }, null, 1));
  const stat = books.map(
    (b) =>
      `${b.title}: ${b.units.length} units / ${b.units.reduce((a, u) => a + u.lessons.length, 0)} lessons / ${
        b.units.reduce((a, u) => a + u.lessons.reduce((x, l) => x + l.sentences.length, 0), 0)
      } sentences / ${b.words.length} words`
  );
  process.stdout.write(stat.join('\n') + `\n-> ${OUT}\n`);
})();

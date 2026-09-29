#!/usr/bin/env node
'use strict';
// Probe the rebuilt bundle for phonics data exports.
// Usage: node scripts/probe-phonics.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pixel-pet-english.html'), 'utf8');

function extractGlobal(name) {
  const re = new RegExp('window\\.__' + name + '__\\s*=\\s*', 'g');
  const m = re.exec(HTML);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (HTML[i] === '{') {
    let depth = 0;
    const start = i;
    for (; i < HTML.length; i++) {
      if (HTML[i] === '{') depth++;
      else if (HTML[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return JSON.parse(HTML.slice(start, i));
  }
  return null;
}

const PHONEMES_BY_WORD = extractGlobal('PHONEMES_BY_WORD');
assert.ok(PHONEMES_BY_WORD, 'window.__PHONEMES_BY_WORD__ must be exported by build.js');

const STICKY = new Set(['il', 'eye', 'nd', 'ao', 'dp', 'dn', 'es', 'wo', 'ne', 'pe']);
for (const word of Object.keys(PHONEMES_BY_WORD)) {
  const arr = PHONEMES_BY_WORD[word];
  assert.ok(arr.length >= 2 && arr.length <= 5, word + ' must have 2-5 phonemes, got ' + arr.length);
  for (const p of arr) {
    assert.ok(!STICKY.has(p.letters), word + ' must not contain sticky grapheme ' + p.letters);
    assert.ok(typeof p.audio === 'string', word + '/' + p.letters + ' audio must be a string');
    /* Silent letters (magic-e, doubled consonants) legitimately carry
       empty sound AND empty audio — they are the 'silent' group's data,
       not a defect. Only sound-bearing phonemes must have audio. */
    if (p.sound) {
      assert.ok(p.audio.length > 0, word + '/' + p.letters + ' missing audio for sound ' + p.sound);
    }
  }
}

// Words that should NOT appear (contain at least one sticky grapheme)
const STICKY_WORDS = ['pencil', 'eyes', 'grandma', 'jiaozi', 'grandpa', 'wednesday', 'two', 'nine', 'grapes', 'noodles'];
for (const w of STICKY_WORDS) {
  assert.equal(PHONEMES_BY_WORD[w], undefined, w + ' should be excluded from PHONEMES_BY_WORD');
}

// Words that should appear. All verified to live in words.json and be
// assigned to at least one book (so they're reachable from
// currentBookWords() at runtime). Avoid crayon/papa/mama/crayons/pen
// which GLM review pointed out don't exist in words.json.
const MUST_APPEAR = ['book', 'eraser', 'mother', 'sister', 'face', 'mouth', 'nose', 'eraser', 'ears', 'brother'];
for (const w of MUST_APPEAR) {
  assert.ok(PHONEMES_BY_WORD[w], w + ' should appear in PHONEMES_BY_WORD');
}

console.log('PHONEMES_BY_WORD probe OK: ' + Object.keys(PHONEMES_BY_WORD).length + ' words exported');

/* ------------------------------------------------------------------
 * 字素卡例词高亮必须落在「带这个音的那一段」上。
 *
 * 这条是字素表真正会被孩子看见的东西，也是当初 rabbit 的第一个 b 被标成
 * 哑字母、高亮却指着它的那个 bug 的落点。数据体检（phonics-rules.js）只能
 * 保证 pindu 本身自洽，标到哪一段要看运行时的定位逻辑，所以在这里查。
 *
 * 跑的是 src/app.js 里真正的 phWordHtml，不复刻 —— 复刻的那份迟早会跟实现跑偏。
 * ------------------------------------------------------------------ */
const APPJS = path.join(ROOT, 'src', 'app.js');
const appSrc = fs.readFileSync(APPJS, 'utf8');
const fnSrc = appSrc.match(/function phWordHtml[\s\S]*?\n  \}/);
assert.ok(fnSrc, 'phWordHtml must exist in src/app.js');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phWordHtml = new Function('WORDS', 'esc', fnSrc[0] + '\nreturn phWordHtml;')(
  extractGlobal('WORDS').words, esc);

const PHONICS = extractGlobal('PHONICS');
const ALL = [];
PHONICS.groups.forEach((g) => g.items.forEach((it) => ALL.push(it)));

let marks = 0;
for (const it of ALL) {
  for (const word of it.words || []) {
    const html = phWordHtml(word, it.letters, it.sound);
    const m = html.match(/<b class="ph-hl">(.*?)<\/b>/);
    assert.ok(m, word + ' /' + (it.sound || '静') + '/ 例词没有高亮出来');
    const at = html.indexOf('<b'), seg = m[1].toLowerCase(), sound = it.sound || '';
    /* 高亮位置回代到 pindu：那一段必须同时满足「字母相同」和「音相同」 */
    let off = 0, hit = false;
    for (const p of extractGlobal('WORDS').words[word].pindu) {
      if (off === at && p.letters.toLowerCase() === seg && (p.sound || '') === sound) hit = true;
      off += p.letters.length;
    }
    assert.ok(hit, word + ' /' + sound + '/ 高亮落在第 ' + at + ' 位的「' + m[1] +
      '」，不是带这个音的那一段');
    marks++;
  }
}
console.log('字素例词高亮 probe OK: ' + marks + ' 处都落在 (字母, 音) 对得上的那一段');

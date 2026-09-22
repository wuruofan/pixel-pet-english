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

#!/usr/bin/env node
/**
 * Exercise learningPool() straight out of the built bundle, so the test runs
 * the shipped code rather than a re-implementation of it.
 *
 * The point of these scenarios is the band auto-advance: a child who has seen
 * every L1 word must start meeting L2 words without touching the settings.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pixel-pet-english.html'), 'utf8');
const W = JSON.parse(html.match(/window\.__WORDS__ = (\{.*?\});\n/s)[1]).words;

const BAND_ORDER = ['L1', 'L2', 'L3'];
const BAND = { L1: [], L2: [], L3: [] };
Object.keys(W).forEach((w) => {
  const b = W[w].band || 'L3';
  (BAND[b] = BAND[b] || []).push(w);
});
const bandWords = (lv) => BAND[lv] || [];

/* Lift the real code out of the bundle so the test exercises what ships.
   `learningPool` is not self-contained: it calls bandWords() → wordsInBand()
   → wordBand → BAND_META, and wordsInBand() closes over the module-level
   WORDS. An earlier version of this test passed WORDS in as a parameter, so
   wordsInBand() kept reading the outer (real) library and the auto-advance
   silently never fired — the test passed against a fiction. Lift the whole
   chain and evaluate it in one scope. */
/* `S` and `dueWords` are module-level in the app and learningPool/dueWords
   read them by name, so they have to live in the same scope too. The returned
   setter re-points S at a new scenario. */
const code = [
  html.match(/var BAND_ORDER = \[[^\]]*\];/)[0],
  html.match(/var BAND_META = \{[\s\S]*?\n  \};/)[0],
  html.match(/var wordBand = \{\};[\s\S]*?function wordsInBand\(lv\) \{[\s\S]*?\n  \}/)[0],
  'function bandWords(lv) { return wordsInBand(lv); }',
  'var S = { settings: { band: "L1" }, words: {} };',
  'function dueWords(pool) {',
  '  var now = Date.now();',
  '  return pool.filter(function (w) {',
  '    var st = S.words[w];',
  '    return !st || st.lastSeen === 0 || st.due <= now;',
  '  });',
  '}',
  html.match(/function learningPool\(\) \{[\s\S]*?\n  \}/)[0],
  'return { set: function (s) { S = s; }, run: function () { return learningPool(); } };',
].join('\n');
const pool = new Function('WORDS', code)(W);

function scenario(name, band, learned) {
  const S = { settings: { band }, words: {} };
  learned.forEach((w) => (S.words[w] = { seen: 1, lastSeen: Date.now(), due: Date.now() + 864e5 * 30 }));
  pool.set(S);
  const p = pool.run();
  const l2in = p.pool.filter((w) => BAND.L2.includes(w)).length;
  console.log(
    `【${name}】设置=${band} → 实际=${p.band} | 池 ${p.pool.length} 词(含L2:${l2in}) | 今日 ${p.list.length} 词 | 复习=${p.reviewing}`
  );
  console.log(`   样例: ${p.list.slice(0, 6).join(' ')}`);
  return p;
}

console.log(`词库: L1=${BAND.L1.length} L2=${BAND.L2.length} L3=${BAND.L3.length}\n`);
const fresh = scenario('全新用户', 'L1', []);
if (fresh.pool.length !== BAND.L1.length) throw new Error('新用户不该看到 L2 以上的词');
if (fresh.band !== 'L1') throw new Error('新用户应停在 L1');

scenario('L1 学一半', 'L1', BAND.L1.slice(0, 50));
const done1 = scenario('L1 全部学完', 'L1', BAND.L1);
if (done1.band !== 'L2') throw new Error(`L1 学完应自动升到 L2，实际 ${done1.band}`);
if (!done1.list.some((w) => BAND.L2.includes(w))) throw new Error('L1 学完后应给到 L2 新词');

// With L1 and L2 both learned, the pool must keep climbing — L3 is the whole
// KET list, so there is always more above. This is the case the auto-advance
// exists for: nobody is ever going to open the settings to press "switch".
const done2 = scenario('L1+L2 学完', 'L1', BAND.L1.concat(BAND.L2));
if (done2.band !== 'L3') throw new Error(`L1+L2 学完应自动升到 L3，实际 ${done2.band}`);
if (done2.reviewing) throw new Error('L3 还有新词，不该转入纯复习');
if (!done2.list.some((w) => BAND.L3.includes(w))) throw new Error('升到 L3 后应给到 L3 新词');

// Only when every band is exhausted does it fall back to review.
const done3 = scenario('全部学完', 'L1', BAND.L1.concat(BAND.L2).concat(BAND.L3));
if (!done3.reviewing) throw new Error('三层都学完后应转入复习模式');
if (done3.list.length === 0) throw new Error('复习池不该是空的');

console.log('\n全部通过');

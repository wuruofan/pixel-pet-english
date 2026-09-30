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

// Lift the real function out of the bundle and run it against a fake store.
// The extracted source is `function learningPool() {…}`; rename it to a var and
// call it, rather than trying to restate the signature.
const src = html.match(/function learningPool\(\) \{[\s\S]*?\n  \}/)[0];
const makePool = new Function(
  'WORDS',
  'BAND_ORDER',
  'bandWords',
  'dueWords',
  'S',
  src.replace('function learningPool()', 'var learningPool = function()') + '\nreturn learningPool();'
);

function scenario(name, band, learned) {
  const S = { settings: { band }, words: {} };
  learned.forEach((w) => (S.words[w] = { seen: 1, lastSeen: Date.now(), due: Date.now() + 864e5 * 30 }));
  // dueWords closes over S in the app, so bind it per-scenario here too.
  const due = (pool) => {
    const now = Date.now();
    return pool.filter((w) => {
      const st = S.words[w];
      return !st || st.lastSeen === 0 || st.due <= now;
    });
  };
  const p = makePool(W, BAND_ORDER, bandWords, due, S);
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

// L3 is empty, so there is nothing above to advance to. The pool must fall back
// to review rather than serve an empty queue — and it must NOT keep serving L2
// as "new", because those 43 words are all seen by now.
const done2 = scenario('L1+L2 学完(L3 空)', 'L1', BAND.L1.concat(BAND.L2));
if (!done2.reviewing) throw new Error('没有新词时应转入复习模式');
if (done2.list.some((w) => BAND.L1.includes(w) === false))
  throw new Error('L3 为空时复习池应回落到 L1，不该出现越层词');

console.log('\n全部通过');

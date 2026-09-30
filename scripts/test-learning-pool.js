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

const BAND = {};
const WORD_BAND = {};
Object.keys(W).forEach((w) => {
  const b = W[w].band || 'L3C';
  (BAND[b] = BAND[b] || []).push(w);
  WORD_BAND[w] = b;
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
  'return { set: function (s) { S = s; }, run: function () { return learningPool(); }, order: BAND_ORDER, meta: BAND_META };',
].join('\n');
const pool = new Function('WORDS', code)(W);
/* Read the band list back out of the lifted code instead of repeating it here.
   v6 had this test hardcoding ['L1','L2','L3'] while the app had already grown
   its own copy: the band was renamed in app.js and this file kept testing a
   three-band app that no longer existed. The list under test now has exactly
   one home. */
const BAND_ORDER = pool.order;

function scenario(name, band, learned) {
  const S = { settings: { band }, words: {} };
  learned.forEach((w) => (S.words[w] = { seen: 1, lastSeen: Date.now(), due: Date.now() + 864e5 * 30 }));
  pool.set(S);
  const p = pool.run();
  const per = BAND_ORDER.map((b) => `${b}:${p.pool.filter((w) => BAND[b].includes(w)).length}`).join(' ');
  console.log(
    `【${name}】设置=${band} → 实际=${p.band} | 池 ${p.pool.length} 词 [${per}] | 今日 ${p.list.length} 词 | 复习=${p.reviewing}`
  );
  console.log(`   样例: ${p.list.slice(0, 6).join(' ')}`);
  return p;
}

console.log(`词库分层: ${BAND_ORDER.map((b) => `${b}=${(BAND[b] || []).length}`).join('  ')}`);
console.log(`分档标签: ${BAND_ORDER.map((b) => `${b}(${pool.meta[b].emoji}${pool.meta[b].label})`).join('  ')}\n`);
for (const b of BAND_ORDER) {
  if (!(BAND[b] || []).length) throw new Error(`${b} 层没有词，界面会显示「词库 0 词」`);
}
// Every word must land in exactly one band the pool can reach. A word that
// fell through to the fallback would be invisible in the settings list but
// still quizable, which is worse than either.
const unreachable = Object.keys(W).filter((w) => BAND_ORDER.indexOf(WORD_BAND[w]) < 0);
if (unreachable.length) throw new Error(`${unreachable.length} 词不属于任何一层: ${unreachable.slice(0, 8).join(' ')}`);

const fresh = scenario('全新用户', 'L1', []);
if (fresh.pool.length !== BAND.L1.length) throw new Error('新用户不该看到 L1 以上的词');
if (fresh.band !== 'L1') throw new Error('新用户应停在 L1');

scenario('L1 学一半', 'L1', BAND.L1.slice(0, 50));

/* Walk the whole climb. With a single L3 there was one hop to check; five
   bands means a wrong order (say L3B before L3A) would still "pass" a test that
   only asserts "some new word appears". So assert the exact band at each step —
   that is the only thing that pins the ladder's order. */
let learned = BAND.L1.slice();
for (let i = 1; i < BAND_ORDER.length; i++) {
  const next = BAND_ORDER[i];
  const cur = BAND_ORDER[i - 1];
  const p = scenario(`${BAND_ORDER.slice(0, i).join('+')} 学完`, 'L1', learned);
  if (p.band !== next) throw new Error(`${cur} 学完应自动升到 ${next}，实际 ${p.band}`);
  if (p.reviewing) throw new Error(`${next} 还有新词，不该转入纯复习`);
  if (!p.list.some((w) => BAND[next].includes(w))) throw new Error(`升到 ${next} 后应给到 ${next} 新词`);
  // A band is a boundary on distractors, not just a source of new words.
  const leak = p.pool.filter((w) => BAND_ORDER.indexOf(BAND[w]) > i);
  if (leak.length) throw new Error(`升到 ${next} 时池里混进了更高层的 ${leak.length} 个词: ${leak.slice(0, 5).join(' ')}`);
  learned = learned.concat(BAND[next]);
}

// Only when every band is exhausted does it fall back to review.
const all = scenario('全部学完', 'L1', learned);
if (!all.reviewing) throw new Error(`${BAND_ORDER.length} 层都学完后应转入复习模式`);
if (all.list.length === 0) throw new Error('复习池不该是空的');
if (all.pool.length !== Object.keys(W).length) throw new Error('全学完后词池应覆盖全部词库');

// A save written by v6 holds band "L3", which no longer exists. learningPool()
// would resolve it to indexOf() === -1 and silently collapse the pool to L1 —
// every word already learned would vanish with no error. The load-time guard is
// what prevents that, so assert it is actually in the shipped bundle.
const htmlHasGuard = /m\.settings\.band === 'L3'\) m\.settings\.band = 'L3A'/.test(html)
  && /BAND_ORDER\.indexOf\(m\.settings\.band\) < 0\) m\.settings\.band = 'L1'/.test(html);
if (!htmlHasGuard) throw new Error('bundle 里缺少 L3→L3A 迁移或 band 不变量兜底');
const legacy = scenario('老存档 band=L3（未迁移时）', 'L3', []);
if (legacy.pool.length !== BAND.L1.length) {
  throw new Error(`未迁移的 'L3' 会让词池塌成 ${legacy.pool.length} 词（learningPool 兜底到 L1），迁移必须拦住`);
}
console.log('   → learningPool 对未知 band 回落 L1，load() 的迁移会先把 L3 改写成 L3A');

console.log('\n全部通过');

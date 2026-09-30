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

/* Walk the whole climb. With a single L3 there was one hop to check; six
   bands means a wrong order (say L3A2 before L3A1) would still "pass" a test that
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

// A save written by v6 holds band "L3", one by v7 holds "L3A". Neither exists any
// more. learningPool() resolves them to indexOf() === -1 and silently collapses
// the pool to L1 — every word already learned vanishes with no error.
//
// The guard used to be asserted as a regex over the bundle, which is nearly
// worthless: a commented-out hop or a prose mention in a comment matches just as
// well as live code, so the check stayed green through two renames. Run the real
// load() against a fake localStorage instead and assert where each save lands.
const liftedLoad = new Function(
  'DEFAULT_STATE',
  'localStorage',
  `var KEY = 'pixel-pet-english-v1', OLD_KEY = 'kids-english-v1';
   ${html.match(/var BAND_ORDER = \[[^\]]*\];/)[0]}
   ${html.match(/  function deepMerge\(base, over\) \{[\s\S]*?\n  \}\n/)[0]}
   ${html.match(/  function load\(\) \{[\s\S]*?\n  \}\n/)[0]}
   return load;`
);
const store = {};
const DEFAULT_STATE = { settings: { band: 'L1' }, words: {}, pet: {}, days: {} };
const load = liftedLoad(DEFAULT_STATE, {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
});
const savedBand = (save) => {
  store['pixel-pet-english-v1'] = JSON.stringify(save);
  return load().settings.band;
};
const baseSave = () => JSON.parse(JSON.stringify(DEFAULT_STATE));

// Every hop of the ladder a real save can still be holding, newest first, plus
// the catch-all. A live band must survive untouched — a migration that is too
// eager resets a working child to L1, which is the same bug wearing a mask.
const MIGRATIONS = [
  ['无 band 字段', baseSave(), 'L1'],
  ['v5 老存档 settings.book', { ...baseSave(), settings: { book: 'g2a' } }, 'L1'],
  ['v6 band=L3', { ...baseSave(), settings: { band: 'L3' } }, 'L3A1'],
  ['v7 band=L3A', { ...baseSave(), settings: { band: 'L3A' } }, 'L3A1'],
  ['band=L3A1', { ...baseSave(), settings: { band: 'L3A1' } }, 'L3A1'],
  ['band=L3A2', { ...baseSave(), settings: { band: 'L3A2' } }, 'L3A2'],
  ['band=L3B', { ...baseSave(), settings: { band: 'L3B' } }, 'L3B'],
  ['band=L3C', { ...baseSave(), settings: { band: 'L3C' } }, 'L3C'],
  ['无法识别的值', { ...baseSave(), settings: { band: 'garbage' } }, 'L1'],
];
for (const [label, save, expect] of MIGRATIONS) {
  const got = savedBand(save);
  if (got !== expect) throw new Error(`老存档迁移失败：${label} 落到 ${got}，期望 ${expect}`);
}
// The pool half of the same guarantee: a band that never got migrated collapses
// to L1 rather than erroring, which is why the migration above is the only line
// standing between a v7 child and losing every word they had learned.
for (const dead of ['L3', 'L3A']) {
  const legacy = scenario(`老存档 band=${dead}（未迁移时）`, dead, []);
  if (legacy.pool.length !== BAND.L1.length) {
    throw new Error(`未迁移的 '${dead}' 会让词池塌成 ${legacy.pool.length} 词（learningPool 兜底到 L1），迁移必须拦住`);
  }
}
console.log(`   → load() 实跑 ${MIGRATIONS.length} 份老存档全部落到期望的层；learningPool 对未迁移的 band 回落 L1`);

console.log('\n全部通过');

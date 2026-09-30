#!/usr/bin/env node
'use strict';
/**
 * 自然拼读数据：纠错 + 体检。两件事放一个文件，因为它们是同一条因果链 ——
 * 抓来的 pindu 是「字素 → 音素」的对齐结果，不是教学规则；纠错改它，体检守住它。
 *
 * 为什么要体检：加词库时新词的 pindu 同样是抓来的，脏数据不会自己暴露。
 * 之前双写辅音标反了 4 个词（rabbit/happy/apple/yellow），字素表的例词高亮就一直
 * 指错字母，没有任何地方报错 —— 因为它没有报错的地方。
 *
 * 用法：
 *   node scripts/phonics-rules.js     体检当前 data/（加完词库跑一下）
 *   require(...)                      build.js 用 fixDoubledConsonants 纠错 + audit 把关
 *
 * 体检的边界：只查「能从数据本身证明」的规则。读音本身对不对（比如 sister 的第二个
 * s 其实是 /z/，数据标成了 /s/）没有词典就验不了，不在这里假装能查 —— 那种只能
 * 靠人盯 WARN 和新词抽查。
 */

const fs = require('fs');
const path = require('path');

/* 单个元音字母。放在这里而不是 build.js，是为了让「哪些算双写」和「怎么纠错」
   用同一份定义；build.js 也从这里取。 */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ *
 * 哪些字素能教
 *
 * 抓来的 pindu 已经把「字素 → 音素」对齐好了（拼起来能还原原词），但对齐结果
 * 不是教学规则 —— grandma 里的 nd→/n/、two 里的 wo→/uː/ 只是"哑音字母被粘到了
 * 邻居上"，拿去当规则教孩子是错的。所以这里只保留标准字素，其余丢弃。
 *
 * classify 和分组放在本文件而不是 build.js：构建和体检必须用同一份判定，
 * 否则会出现「体检过了、构建出来的却不是它」这种最坏情况。
 * ------------------------------------------------------------------ */

const RCTRL = new Set(['ar', 'er', 'ir', 'or', 'ur', 'air', 'are', 'ear', 'eer', 'ere', 'ire', 'ore', 'our', 'oor', 'oar', 'ure']);
const VOW_TEAMS = new Set(['ai', 'ay', 'au', 'aw', 'al', 'ea', 'ee', 'ei', 'eu', 'ew', 'ey', 'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'ow', 'oy', 'ua', 'ue', 'ui', 'igh', 'eigh']);
const CONS_TEAMS = new Set(['ch', 'sh', 'th', 'wh', 'ph', 'gh', 'ck', 'ng', 'nk', 'kn', 'wr', 'gn', 'mb', 'qu', 'bl', 'cl', 'fl', 'gl', 'pl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr', 'sc', 'sk', 'sm', 'sn', 'sp', 'st', 'sw', 'tw', 'scr', 'shr', 'spr', 'str', 'thr', 'ing', 'ge']);

const GROUPS = [
  { id: 'cons', label: '辅音字母', tip: '一个字母一个音，最好记' },
  { id: 'vowel', label: '元音字母', tip: '同一个字母可能有好几种读法' },
  { id: 'cteam', label: '辅音组合', tip: '两个字母一起发一个音' },
  { id: 'vteam', label: '元音组合', tip: '两个元音一起，常常读长音' },
  { id: 'rctrl', label: 'r 控元音', tip: '元音后面跟 r，读音会变' },
  { id: 'silent', label: '不发音的字母', tip: '看得见、读不出来的字母' }
];

function classify(letters, sound) {
  if (!sound) return 'silent';            // 不发音的字母（magic-e、双写等）
  const L = letters.toLowerCase();
  if (RCTRL.has(L)) return 'rctrl';
  if (L.length === 1) return VOWELS.has(L) ? 'vowel' : 'cons';
  if (VOW_TEAMS.has(L)) return 'vteam';
  if (CONS_TEAMS.has(L)) return 'cteam';
  // 双写辅音（pp/ss/gg…）只发一个音，是标准拼读规则，保留
  if (L.length === 2 && L[0] === L[1] && !VOWELS.has(L[0])) return 'cteam';
  return null;                             // 其余是不可教学的粘合块，丢弃
}

/** 由词库派生字素表。build.js 直接用它打包，体检也用它，两边保证同一份产物形状。 */
function buildPhonics(words) {
  const byKey = new Map();     // "letters|sound" -> item
  const skipped = [];
  Object.keys(words).forEach((word) => {
    (words[word].pindu || []).forEach((p) => {
      const kind = classify(p.letters, p.sound);
      if (!kind) { skipped.push(word + ':' + p.letters); return; }
      const key = p.letters.toLowerCase() + '|' + p.sound;
      let it = byKey.get(key);
      if (!it) {
        it = { letters: p.letters.toLowerCase(), sound: p.sound, audio: p.audio, kind: kind, n: 0, words: [] };
        byKey.set(key, it);
      }
      it.n++;
      if (it.words.indexOf(word) < 0 && it.words.length < 4) it.words.push(word);
    });
  });
  const groups = GROUPS.map((g) => ({
    id: g.id, label: g.label, tip: g.tip,
    items: [...byKey.values()].filter((i) => i.kind === g.id).sort((a, b) => b.n - a.n || a.letters.localeCompare(b.letters))
  })).filter((g) => g.items.length);
  return { groups: groups, skipped: skipped };
}

/* ------------------------------------------------------------------ *
 * 纠错
 * ------------------------------------------------------------------ */

/**
 * 双写辅音：前一个发音，后一个哑。
 *
 * 抓来的数据在 4 个词上都标成了「前哑后响」（rabbit / happy / apple / yellow），
 * 是反的。双写本身就是「前面那个元音读短音」的信号 —— happy 的 a、apple 的 a、
 * yellow 的 e 全是短音，靠的就是后一个字母不发音把音节关住。
 *
 * 只搬 sound / audio，letters 和 start 原地不动：字母还在原位，改的只是
 * 「哪一个字母负责发这个音」。所以不碰任何音频地址，也不新增/删除字素条目 ——
 * keys 是 letters|sound，本来就没变，变的只是哪个词算进哪一条。
 *
 * 不管的两种情况：
 *   - 双元音（ee / oo）：那是 vowel team，由 classify() 走另一条路。
 *   - 两半都响（daddy 的 dd）或都哑：不是这条规则描述的情况，动了就是瞎猜。
 *
 * 没发生改动时返回原数组本身，调用方可以靠引用比较判断「有没有纠错」。
 */
function fixDoubledConsonants(pd) {
  if (!Array.isArray(pd) || pd.length < 2) return pd;
  let changed = false;
  const out = pd.map((p) => Object.assign({}, p));
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (!a.letters || !b.letters) continue;
    const L = a.letters.toLowerCase();
    if (L !== b.letters.toLowerCase()) continue;   // 不是双写
    if (VOWELS.has(L)) continue;                   // 双元音归 vowel team 管
    if (!!a.sound === !!b.sound) continue;         // 都响或都哑，不动
    if (a.sound) continue;                         // 已经是「前响后哑」，正确
    const ts = a.sound, ta = a.audio;
    a.sound = b.sound; a.audio = b.audio;
    b.sound = ts;      b.audio = ta;
    changed = true;
  }
  return changed ? out : pd;
}

/* ------------------------------------------------------------------ *
 * 体检
 * ------------------------------------------------------------------ */

const err = (code, msg) => ({ level: 'error', code, msg });
const warn = (code, msg) => ({ level: 'warn', code, msg });

/**
 * 源词库体检。跑在纠错之后 —— 它的职责是证明纠错真的生效了，不是重复纠错。
 */
function auditWords(words) {
  const out = [];
  Object.keys(words).forEach((word) => {
    const pd = words[word] && words[word].pindu;
    if (!pd || !pd.length) { out.push(warn('pindu-empty', word + '：没有 pindu，拼读练习和字素表都用不上它')); return; }

    // 1) 逐段拼回来必须等于原词。下游的字素高亮、拆词拼读都建立在这条上。
    const joined = pd.map((p) => (p.letters || '').toLowerCase()).join('');
    if (joined !== word.toLowerCase()) {
      out.push(err('pindu-concat', word + '：字素拼不回原词，得到 ' + joined));
      return;
    }

    // 2) start 必须等于该段的真实字符偏移。字素表高亮全靠这个定位。
    let off = 0;
    for (const p of pd) {
      if (p.start !== off) out.push(err('pindu-offset', word + '：' + p.letters + ' 标 start=' + p.start + '，实际在第 ' + off + ' 位'));
      off += (p.letters || '').length;
    }

    // 3) 有音就必须有音频，否则点它是个死按钮（5 个不发音字素当年就是这么哑的）。
    for (const p of pd) {
      if (p.sound && !p.audio) out.push(err('pindu-audio', word + '：' + p.letters + ' /' + p.sound + '/ 没有音频'));
    }

    // 4) 纠错之后不该再有反的双写辅音。出现就说明 fixDoubledConsonants 没跑到这条词。
    for (let i = 1; i < pd.length; i++) {
      const a = pd[i - 1], b = pd[i];
      if (!a.letters || !b.letters) continue;
      const L = a.letters.toLowerCase();
      if (L !== b.letters.toLowerCase() || VOWELS.has(L)) continue;
      if (!!a.sound === !!b.sound) continue;
      if (!a.sound) out.push(err('doubled-consonant', word + '：双写 ' + L + ' 仍然是前哑后响'));
    }

    // 5) 哑字母过半通常意味着抓错了，值得人看一眼（apple 2/5 是正常的）。
    const silent = pd.filter((p) => !p.sound).length;
    if (pd.length && silent / pd.length >= 0.4) {
      out.push(warn('silent-ratio', word + '：' + silent + '/' + pd.length + ' 个字母不发音，确认一下'));
    }
  });
  return out;
}

/**
 * 派生的字素表体检（build.js 里 buildPhonics 的产物）。
 */
function auditPhonics(phonics) {
  const out = [];
  const seen = new Map();
  phonics.groups.forEach((g) => {
    g.items.forEach((it) => {
      // 1) letters|sound 必须全局唯一：字素表按它索引，同键出现两次会静默覆盖。
      const key = it.letters + '|' + it.sound;
      if (seen.has(key)) out.push(err('dup-key', '字素 ' + key + ' 出现了两次（' + seen.get(key) + ' 和 ' + g.id + '）'));
      else seen.set(key, g.id);

      // 2) 每个字素都要有例词，否则卡片中间那块是空的。
      if (!it.words || !it.words.length) out.push(err('item-words', '字素 ' + key + ' 没有例词'));

      // 3) 有音的字素必须有音频，否则点色块没反应。
      if (it.sound && !it.audio) out.push(err('item-audio', '字素 ' + key + ' 有音但没有音频'));
    });
  });
  return out;
}

/**
 * 题目体检：字素卡之外，练习题还要求数据满足两个下限。
 *
 * 这两条都是「数据一变就可能塌」的量，所以跟数据一起体检：
 *   - 听音选字母：干扰项靠「字母不同 且 音不同」筛，候选不足 3 个就凑不满选项。
 *     （同字母的字素互为干扰会被 letters 过滤掉，所以判对错只用 data-l 是安全的 ——
 *      前提正是这里候选够、且同字母项确实被排除，这条依赖记在 app.js 的 phDistractors 里。）
 *   - 拆词拼读：池子按「每个字素都查得到」筛，一本书筛完为空，这本书就玩不了。
 */
function auditExercises(phonics, words, bookWords) {
  const out = [];
  const all = [];
  phonics.groups.forEach((g) => g.items.forEach((it) => all.push(it)));

  for (const it of all) {
    const pool = all.filter((x) => x.letters !== it.letters && x.sound !== it.sound);
    if (pool.length < 3) {
      out.push(err('hear-distractor', '字素 ' + it.letters + ' /' + (it.sound || '静') + '/ 的干扰项候选只剩 ' + pool.length + ' 个，听音选字母凑不满 4 个选项'));
    }
  }

  const key = new Set();
  phonics.groups.forEach((g) => g.items.forEach((it) => key.add(it.letters + '|' + it.sound)));
  Object.keys(bookWords).forEach((bk) => {
    let buildable = 0;
    bookWords[bk].forEach((word) => {
      const pd = (words[word] && words[word].pindu) || [];
      if (pd.length < 2 || pd.length > 5) return;
      for (const p of pd) {
        if (!key.has((p.letters || '').toLowerCase() + '|' + p.sound)) return;
      }
      buildable++;
    });
    if (!bookWords[bk].length) return;
    if (!buildable) out.push(err('build-pool', '课本 ' + bk + ' 的 ' + bookWords[bk].length + ' 个词里没有能拆的，拆词拼读会空着'));
  });
  return out;
}

/**
 * Word sets per difficulty band.
 *
 * Bands replaced textbooks as the learning axis (see app.js), so the phonics
 * audit groups by `band` in words.json rather than by book. A word with no
 * explicit band falls into L3 — the same default app.js applies — so the audit
 * and the runtime always see the same membership.
 */
const BAND_ORDER = ['L1', 'L2', 'L3'];

function bookWordSets(words) {
  const out = {};
  BAND_ORDER.forEach((b) => (out[b] = []));
  Object.keys(words).forEach((w) => {
    const band = words[w].band || 'L3';
    if (!out[band]) out[band] = [];
    out[band].push(w);
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */

function report(findings) {
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');
  if (!findings.length) return 'phonics 体检：全过';
  let s = 'phonics 体检：' + errors.length + ' 错 / ' + warns.length + ' 警';
  findings.forEach((f) => s += '\n  ' + (f.level === 'error' ? 'ERROR' : 'WARN ') + ' [' + f.code + '] ' + f.msg);
  return s;
}

function loadData() {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  return { words: read('data/words.json').words, textbooks: read('data/textbooks.json') };
}

/**
 * 纠错 + 体检 = 构建期把关。build.js 和下面的命令行走同一条，
 * 保证「单独跑体检」和「真去构建」看到的永远是同一份结论 ——
 * 否则会出现「体检绿灯、构建出来却不对」这种最坏情况。
 *
 * phonics 传进来是为了审「真正要打包的那份」，而不是另算一份。
 */
function check(words, textbooks, phonics) {
  const fixed = [];
  Object.keys(words).forEach((word) => {
    const before = words[word].pindu || [];
    const after = fixDoubledConsonants(before);
    if (after !== before) { words[word].pindu = after; fixed.push(word); }
  });
  const table = phonics || buildPhonics(words);
  const findings = [].concat(
    auditWords(words),
    auditPhonics(table),
    auditExercises(table, words, bookWordSets(words))
  );
  return { fixed: fixed, findings: findings, phonics: table };
}

/* 直接跑：node scripts/phonics-rules.js —— 和构建一样的纠错 + 体检，有错退出码 1 */
if (require.main === module) {
  const data = loadData();
  const r = check(data.words, data.textbooks);
  console.log('纠错: ' + (r.fixed.length ? r.fixed.join(' ') + ' 的双写辅音（抓反了，已改成前响后哑）' : '无'));
  console.log(report(r.findings));
  process.exit(r.findings.some((f) => f.level === 'error') ? 1 : 0);
}

module.exports = {
  VOWELS,
  classify,
  GROUPS,
  buildPhonics,
  fixDoubledConsonants,
  auditWords,
  auditPhonics,
  auditExercises,
  bookWordSets,
  check,
  report,
  loadData
};

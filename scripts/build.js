#!/usr/bin/env node
/**
 * Bundle everything into ONE self-contained HTML file.
 * No external requests except the audio CDN (real textbook recordings).
 */
const fs = require('fs');
const path = require('path');
const rules = require('./phonics-rules');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'pixel-pet-english.html');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const css = read('src/style.css');
const js = read('src/app.js');
const textbooksRaw = readJson('data/textbooks.json');
const words = readJson('data/words.json');
const visuals = readJson('data/visuals.json');

/* PNG 精灵帧（试点：GPT 生成橘猫全套）。以 dataURL 注入保持单文件架构。
   命名即运行时帧 key：cat-adult.png → 'cat-adult'。 */
const spriteDir = path.join(root, 'assets', 'sprites');
const petImgs = {};
for (const f of fs.readdirSync(spriteDir).filter((f) => f.endsWith('.png')).sort()) {
  petImgs[f.replace(/\.png$/, '')] =
    'data:image/png;base64,' + fs.readFileSync(path.join(spriteDir, f)).toString('base64');
}

/* The textbook data is no longer bundled. Learning is organised by difficulty
   band (words[*].band in words.json); the units/lessons/sentences and the
   per-book word lists in data/textbooks.json stay on disk as the source that
   scripts/fetch_textbooks.js refreshes and that the word-frequency pass reads,
   but nothing at runtime needs them. Dropping __TEXTBOOKS__ from the bundle
   saved ~200 KB. */

/* ------------------------------------------------------------------
 * 自然拼读（phonics）数据层
 *
 * 判定「哪些字素能教」「抓来的数据要先纠什么错」「体检查哪些条」全在
 * phonics-rules.js：构建和 `node scripts/phonics-rules.js` 必须用同一份，
 * 否则会出现「体检绿灯、构建出来却不对」这种最坏情况。
 *
 * check() 原地纠正 words.words[*].pindu，之后本文件后面所有读取
 * （buildPhonics / PHONEMES_BY_WORD）拿到的都是干净数据，一个循环都不用改。
 * ------------------------------------------------------------------ */
const gate = rules.check(words.words, textbooksRaw);
const phonics = gate.phonics;
if (gate.findings.length) console.log(rules.report(gate.findings));
if (gate.findings.some((f) => f.level === 'error')) {
  console.error('构建中止：上面的 ERROR 修好再出包。');
  process.exit(1);
}

/* ------------------------------------------------------------------
 * PHONEMES_BY_WORD — every word whose pindu maps cleanly to teachable
 * graphemes. Words whose pindu contains any sticky grapheme that
 * classify() drops (il/eye/nd/ao/dp/dn/es/wo/ne/pe) are absent here, so
 * the build game's pool filter (2-5 phonemes AND every phoneme here)
 * silently excludes them.
 *
 * IMPORTANT data shape: `phonics` is `{ groups: [{ id, label, tip,
 * items: [...] }, ...], skipped: [...] }` — `phonics.groups.items` does
 * NOT exist. Build a Map keyed by "letters|sound" first, then look up.
 *
 * Each entry is a shallow copy of a PHONICS.groups.items object so
 * runtime never mutates the bundle's groups array.
 *
 * Invariant: PHONICS.groups.items[*].audio is f(sound) and read-only at
 * runtime; the build-time audio is canonical. Verified empirically
 * across all 359 pindu entries.
 * ------------------------------------------------------------------ */
const PHONEME_KEY = new Map();
phonics.groups.forEach(function (g) {
  g.items.forEach(function (it) {
    PHONEME_KEY.set(it.letters + '|' + it.sound, it);
  });
});
// Drop the textbook lesson audio slice timings we don't need? No — keep, they
// drive per-sentence playback. But drop the internal comment key of visuals.
delete visuals._comment;

/* ------------------------------------------------------------------
 * 分层归位 + 自检
 *
 * `band` 由 `books` 推导，不手工维护：g1a/g2a/g1b 三个课本标签 → L1，
 * 加上 fetch_words.js 打的 l2 / l3a1 / l3a2 / l3b / l3c 标签。手工标过一次 band，
 * 忘了同步，结果 137 词全部落进兜底的 L3C，而构建日志全绿、界面也不报错。
 * 单一数据源（books）+ 构建期校验，这条路就不用再走第二遍。
 *
 * 每层都必须有词：某一层为空时，⚙️ 里的分层切换会显示「词库 0 词」，
 * 是一条会误导家长的死行。
 * ------------------------------------------------------------------ */
const BAND_ORDER = ['L1', 'L2', 'L3A1', 'L3A2', 'L3B', 'L3C'];
const BAND_FROM_BOOKS = { g1a: 'L1', g2a: 'L1', g1b: 'L1', l2: 'L2', l3a1: 'L3A1', l3a2: 'L3A2', l3b: 'L3B', l3c: 'L3C' };
const bandCount = Object.fromEntries(BAND_ORDER.map((b) => [b, 0]));
const bandProblems = [];
for (const [w, v] of Object.entries(words.words)) {
  const books = v.books || [];
  // A word can carry several tags (school is in g1a AND g1b). The band is the
  // EASIEST one it belongs to, or "school" would be taught in the wide band.
  const bands = books.map((b) => BAND_FROM_BOOKS[b]).filter(Boolean);
  const order = Object.fromEntries(BAND_ORDER.map((b, i) => [b, i]));
  bands.sort((a, b) => order[a] - order[b]);
  v.band = bands[0] || 'L3C';
  bandCount[v.band]++;
  if (!books.length) {
    v.band = 'L3C';
    bandProblems.push(`${w} 没有任何来源标签（books 为空），已兜底到 L3C`);
  }
  // A tag this build doesn't know would silently land the word in the fallback
  // band. The old builds taught us that lesson: a renamed tag, green log, and
  // the whole layer quietly emptied.
  for (const b of books) {
    if (!BAND_FROM_BOOKS[b]) bandProblems.push(`${w} 带未知来源标签 ${JSON.stringify(b)}，已兜底到 L3C`);
  }
}
for (const b of BAND_ORDER) {
  if (bandCount[b] === 0) bandProblems.push(`${b} 层没有词，分层切换会显示「词库 0 词」`);
}
if (bandProblems.length) {
  console.error('构建中止：' + bandProblems.join('；'));
  process.exit(1);
}

/* Per-word phonics index, used only by the 拆词拼读 exercise. The KET bands are
   skipped for the same reason they are slimmed below: the index is a lookup
   table for words the child is actively practising, not a dictionary. At 1325
   KET words it was 416 KB of the bundle. */
const PHONEMES_BY_WORD = {};
let phonicsIndexed = 0;
for (const word of Object.keys(words.words)) {
  if ((words.words[word].band || '').startsWith('L3')) continue;
  const pd = words.words[word].pindu || [];
  const items = [];
  let bad = false;
  for (const p of pd) {
    const it = PHONEME_KEY.get((p.letters || '').toLowerCase() + '|' + p.sound);
    if (!it) { bad = true; break; }
    items.push({ letters: it.letters, sound: it.sound, audio: it.audio, kind: it.kind });
  }
  if (!bad && items.length >= 2 && items.length <= 5) {
    PHONEMES_BY_WORD[word] = items;
    phonicsIndexed++;
  }
}


/* ------------------------------------------------------------------
 * 注入瘦身
 *
 * 1462 词全量注入 = 1.9 MB，其中 pindu 758 KB + examples 720 KB 占 76%。
 * 这两块只有在「学单词」的词卡和「拼读」页才渲染，闯关出题一个都不用。
 *
 * L1/L2 是孩子当下真在学的（137 词），全量带上，词卡和拼读都完整。
 * L3A1/L3A2/L3B/L3C 是 1325 词的分量储备，绝大多数孩子几个月内碰不到，为它们预载例句
 * 和逐音素音频只是让首屏多等 2 秒。这四层只带出题必需的字段：
 *   explains  中文释义   → en2cn / cn2en
 *   us.audio  美音       → listen2en
 * 其余字段留在 data/words.json 里，需要时再按需补。
 *
 * 瘦身名单由 BAND_ORDER 推导，而不是手写集合：新增一层时忘了往 SLIM_BANDS 里
 * 补一个键，那 1325 个词会带着例句和逐音素音频进包，体积悄悄翻几倍而日志全绿。
 *
 * 顺带把英音去重：源站的英/美录音是同一份文件挂在两个目录下（1462 词
 * 逐个核对，id 100% 一致），所以 KET 层只存一个 audioId，运行时按口音拼 URL。
 * 这不是压缩，是删掉一份重复数据。
 * ------------------------------------------------------------------ */
const AUDIO_BASE = 'https://static.suyang123.com/assets/yyld/word-base/';
const SLIM_BANDS = new Set(BAND_ORDER.filter((b) => b !== 'L1' && b !== 'L2'));
const wordsForBundle = {};
let slimmed = 0;
let ukDeduplicated = 0;
const audioIdOf = (url) => {
  const m = String(url || '').match(/\/(us|uk)\/(\d+)\.mp3$/);
  return m ? m[2] : null;
};
for (const [w, v] of Object.entries(words.words)) {
  if (!SLIM_BANDS.has(v.band)) {
    wordsForBundle[w] = v;
    continue;
  }
  slimmed++;
  const usId = audioIdOf(v.us && v.us.audio);
  const ukId = audioIdOf(v.uk && v.uk.audio);
  if (usId && ukId && usId === ukId) {
    // One id covers both accents — the app rebuilds the URL per accent.
    ukDeduplicated++;
    wordsForBundle[w] = {
      word: v.word,
      explains: v.explains,
      audioId: usId,
      band: v.band,
      books: v.books,
      slim: true,
    };
    continue;
  }
  // Fallback: the ids differ, or one side is missing. Keep the full pair.
  wordsForBundle[w] = {
    word: v.word,
    explains: v.explains,
    us: v.us,
    uk: v.uk,
    band: v.band,
    books: v.books,
    slim: true,
  };
}
const bundleWords = { generatedAt: words.generatedAt, words: wordsForBundle, audioBase: AUDIO_BASE };

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#fff8ef">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>皮克学英语 · Pixel Pet English</title>
<style>
${css}
</style>
</head>
<body>
<div id="app">
  <div class="topbar">
    <div class="brand"><span class="logo" id="brand-logo">🦖</span><span>皮克学英语</span></div>
    <div class="spacer"></div>
    <div class="pill" id="book-pill">📗 一上</div>
    <button class="pill pill-btn" id="btn-stats" title="统计">📊</button>
    <button class="pill pill-btn" id="btn-settings" title="设置">⚙️</button>
  </div>
  <div id="view"></div>
</div>
<nav class="tabbar" id="tabbar"></nav>

<script>
window.__WORDS__ = ${JSON.stringify(bundleWords)};
window.__VISUALS__ = ${JSON.stringify(visuals)};
window.__PHONICS__ = ${JSON.stringify(phonics)};
window.__PHONEMES_BY_WORD__ = ${JSON.stringify(PHONEMES_BY_WORD)};
window.__PET_IMGS__ = ${JSON.stringify(petImgs)};
</script>
<script>
${js}
</script>
</body>
</html>
`;

// app.js must read the same key the data uses.
if (!/WORDS\[w\]\.band/.test(js) && !/v\.band/.test(js)) {
  console.error('构建中止：src/app.js 没有读 words[*].band，与数据字段名不一致。');
  process.exit(1);
}

fs.writeFileSync(outFile, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${path.relative(process.cwd(), outFile)} — ${kb} KB`);
console.log(`  bands: ${BAND_ORDER.map((b) => `${b}=${bandCount[b]}`).join(' ')}`);
console.log(`  words: ${Object.keys(words.words).length} (瘦身后省下 ${slimmed} 词的例句/拼读)`);
console.log(`  纠错: ${gate.fixed.length ? gate.fixed.join(' ') + ' 的双写辅音（抓反了，已改成前响后哑）' : '无'}`);
console.log(`  phonics: ${phonics.groups.map((g) => g.id + ' ' + g.items.length).join(', ')}` +
  ` (共 ${phonics.groups.reduce((a, g) => a + g.items.length, 0)} 条，丢弃粘合块 ${phonics.skipped.length} 处: ${[...new Set(phonics.skipped.map((s) => s.split(':')[1]))].join(' ')})`);

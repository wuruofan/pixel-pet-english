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
const PHONEMES_BY_WORD = {};
for (const word of Object.keys(words.words)) {
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
  }
}

// Drop the textbook lesson audio slice timings we don't need? No — keep, they
// drive per-sentence playback. But drop the internal comment key of visuals.
delete visuals._comment;

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
window.__WORDS__ = ${JSON.stringify(words)};
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

/* ------------------------------------------------------------------
 * 分层自检
 *
 * 分层是运行时唯一的分组依据（app.js 的 wordBand 读 words[*].band）。
 * 出现过一次真实事故：数据里写的是 `band`，运行时读的是 `level`
 * （那个键名被 pet.level 占了），结果 137 词全部落到兜底的 L3，
 * 前两层显示「词库 0 词」，而构建日志一切正常、界面也不报错。
 * 这里把「数据与运行时约定不一致」变成构建失败。
 * ------------------------------------------------------------------ */
const KNOWN_BANDS = new Set(['L1', 'L2', 'L3']);
const bandCount = { L1: 0, L2: 0, L3: 0 };
const badTags = [];
for (const [w, v] of Object.entries(words.words)) {
  const b = v.band;
  if (!KNOWN_BANDS.has(b)) badTags.push(`${w}:${JSON.stringify(b)}`);
  else bandCount[b]++;
}
const bandProblems = [];
if (badTags.length)
  bandProblems.push(`非法/缺失 band 标签 ${badTags.length} 个: ${badTags.slice(0, 5).join(' ')}`);
// A declared band with no words renders as a dead row reading "词库 0 词".
for (const b of ['L1', 'L2']) {
  if (bandCount[b] === 0) bandProblems.push(`${b} 层没有词，分层切换会显示「词库 0 词」`);
}
if (bandProblems.length) {
  console.error('构建中止：' + bandProblems.join('；'));
  process.exit(1);
}
// app.js must read the same key the data uses.
if (!/WORDS\[w\]\.band/.test(js) && !/v\.band/.test(js)) {
  console.error('构建中止：src/app.js 没有读 words[*].band，与数据字段名不一致。');
  process.exit(1);
}

fs.writeFileSync(outFile, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${path.relative(process.cwd(), outFile)} — ${kb} KB`);
console.log(`  bands: L1=${bandCount.L1} L2=${bandCount.L2} L3=${bandCount.L3}`);
console.log(`  words: ${Object.keys(words.words).length}`);
console.log(`  纠错: ${gate.fixed.length ? gate.fixed.join(' ') + ' 的双写辅音（抓反了，已改成前响后哑）' : '无'}`);
console.log(`  phonics: ${phonics.groups.map((g) => g.id + ' ' + g.items.length).join(', ')}` +
  ` (共 ${phonics.groups.reduce((a, g) => a + g.items.length, 0)} 条，丢弃粘合块 ${phonics.skipped.length} 处: ${[...new Set(phonics.skipped.map((s) => s.split(':')[1]))].join(' ')})`);

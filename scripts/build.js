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

/* Sentence UI was removed — only per-book word lists are needed at runtime.
   Stripping units/sentences cuts the bundle a lot (per-sentence audio URL
   tables were the bulk of the payload). */
const textbooks = {
  books: textbooksRaw.books.map((b) => ({
    key: b.key, grade: b.grade, term: b.term, title: b.title,
    publisher: b.publisher, version: b.version, words: b.words
  }))
};

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
window.__TEXTBOOKS__ = ${JSON.stringify(textbooks)};
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

fs.writeFileSync(outFile, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${path.relative(process.cwd(), outFile)} — ${kb} KB`);
console.log(`  books: ${textbooks.books.map((b) => b.key).join(', ')}`);
console.log(`  words: ${Object.keys(words.words).length}`);
console.log(`  纠错: ${gate.fixed.length ? gate.fixed.join(' ') + ' 的双写辅音（抓反了，已改成前响后哑）' : '无'}`);
console.log(`  phonics: ${phonics.groups.map((g) => g.id + ' ' + g.items.length).join(', ')}` +
  ` (共 ${phonics.groups.reduce((a, g) => a + g.items.length, 0)} 条，丢弃粘合块 ${phonics.skipped.length} 处: ${[...new Set(phonics.skipped.map((s) => s.split(':')[1]))].join(' ')})`);

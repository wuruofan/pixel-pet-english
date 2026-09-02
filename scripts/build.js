#!/usr/bin/env node
/**
 * Bundle everything into ONE self-contained HTML file.
 * No external requests except the audio CDN (real textbook recordings).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'kids-english.html');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const css = read('src/style.css');
const js = read('src/app.js');
const textbooksRaw = readJson('data/textbooks.json');
const words = readJson('data/words.json');
const visuals = readJson('data/visuals.json');

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
 * 来源：每个词的 pindu 已经是「字素 → 音素」对齐（拼接后能 100% 还原原词），
 * 但它是对齐结果，不是教学规则 —— 像 grandma 里的 nd→/n/、two 里的 wo→/uː/
 * 只是"哑音字母被粘到了邻居上"，拿去当规则教孩子是错的。
 * 所以这里只保留标准字素（grapheme），其余丢弃。
 * ------------------------------------------------------------------ */
const RCTRL = new Set(['ar', 'er', 'ir', 'or', 'ur', 'air', 'are', 'ear', 'eer', 'ere', 'ire', 'ore', 'our', 'oor', 'oar', 'ure']);
const VOW_TEAMS = new Set(['ai', 'ay', 'au', 'aw', 'al', 'ea', 'ee', 'ei', 'eu', 'ew', 'ey', 'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'ow', 'oy', 'ua', 'ue', 'ui', 'igh', 'eigh']);
const CONS_TEAMS = new Set(['ch', 'sh', 'th', 'wh', 'ph', 'gh', 'ck', 'ng', 'nk', 'kn', 'wr', 'gn', 'mb', 'qu', 'bl', 'cl', 'fl', 'gl', 'pl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr', 'sc', 'sk', 'sm', 'sn', 'sp', 'st', 'sw', 'tw', 'scr', 'shr', 'spr', 'str', 'thr', 'ing', 'ge']);
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

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

const GROUPS = [
  { id: 'cons', label: '辅音字母', tip: '一个字母一个音，最好记' },
  { id: 'vowel', label: '元音字母', tip: '同一个字母可能有好几种读法' },
  { id: 'cteam', label: '辅音组合', tip: '两个字母一起发一个音' },
  { id: 'vteam', label: '元音组合', tip: '两个元音一起，常常读长音' },
  { id: 'rctrl', label: 'r 控元音', tip: '元音后面跟 r，读音会变' },
  { id: 'silent', label: '不发音的字母', tip: '看得见、读不出来的字母' }
];

function buildPhonics() {
  const byKey = new Map();     // "letters|sound" -> item
  const skipped = [];
  Object.keys(words.words).forEach((word) => {
    (words.words[word].pindu || []).forEach((p) => {
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

const phonics = buildPhonics();

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
<title>小火龙学英语 · 北京版小学英语</title>
<style>
${css}
</style>
</head>
<body>
<div id="app">
  <div class="topbar">
    <div class="brand"><span class="logo">🐲</span><span>小火龙学英语</span></div>
    <div class="spacer"></div>
    <div class="pill" id="book-pill">📗 一上</div>
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
console.log(`  phonics: ${phonics.groups.map((g) => g.id + ' ' + g.items.length).join(', ')}` +
  ` (共 ${phonics.groups.reduce((a, g) => a + g.items.length, 0)} 条，丢弃粘合块 ${phonics.skipped.length} 处: ${[...new Set(phonics.skipped.map((s) => s.split(':')[1]))].join(' ')})`);

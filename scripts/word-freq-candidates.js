#!/usr/bin/env node
/**
 * Rank the words of a textbook by how often they appear in its lesson text,
 * and print the ones the library does not already have.
 *
 * Why this exists: some textbooks have no word list at all. suyang123 ships a
 * per-unit word page for 人教版 PEP and for 北京版 一上/二上, but 北京版 一下 and
 * 二下 have none — the pages come back with zero words. The L2 band was built
 * from exactly this statistic (>=4 occurrences in the lesson text), and it is
 * the only defensible substitute when a 必背表 does not exist. Running it on a
 * new book answers "what would its word list be" instead of guessing.
 *
 * This prints candidates. It does NOT decide what goes in a band: a frequency
 * count surfaces `season` and `birthday` alongside `shall` and `Mr`, and only a
 * person can tell the content word from the function word. Feed the output
 * through a band by hand, the same way data/l2-words.txt was built.
 *
 * Usage:
 *   node scripts/word-freq-candidates.js ernianji/bjb_xiace
 *   node scripts/word-freq-candidates.js ernianji/bjb_xiace --min 3
 *   node scripts/word-freq-candidates.js ernianji/bjb_xiace --out data/g2b-candidates.txt
 *
 * The slug is the path used by suyang123, minus the domain and .html — the same
 * strings fetch_textbooks.js keeps in its BOOKS list.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORDS = path.join(ROOT, 'data', 'words.json');
const BASE = 'https://yy.suyang123.com/xiaoxue/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) {
  console.error('用法: node scripts/word-freq-candidates.js <grade/版本_册> [--min N] [--out 文件]');
  console.error('例:   node scripts/word-freq-candidates.js ernianji/bjb_xiace');
  process.exit(1);
}
const num = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const MIN = num('--min', 2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

const stripHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

/* The payload assigns to `window.__NUXT__`, and eval in Node has no window —
   so create one first or every reference inside the IIFE throws. The page
   returns a different body to different clients; the payload is the part that
   has been stable. */
function parseNuxt(html) {
  const i = html.indexOf('window.__NUXT__=');
  if (i < 0) throw new Error('页面里没有 __NUXT__ 载荷');
  const s = html.indexOf('(function', i);
  const e = html.indexOf('</script>', i);
  globalThis.window = {};
  // eslint-disable-next-line no-eval
  eval('window.__NUXT__=' + html.slice(s, e).trim());
  return globalThis.window.__NUXT__;
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/* Count lowercased alphabetic tokens. Keeping the apostrophe inside `don't`
   matters: splitting it produces `don` and `t`, and `don` then looks like a
   real vocabulary candidate. */
function tokenize(en) {
  return (en.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []);
}

(async () => {
  const known = new Set(Object.keys(JSON.parse(fs.readFileSync(WORDS, 'utf8')).words));
  const freq = new Map();   // word -> count
  const zh = new Map();     // word -> first Chinese gloss seen
  const contexts = new Map(); // word -> one English line, for eyeballing
  let units = 0;
  let lines = 0;

  for (let n = 1; n <= 12; n++) {
    const url = `${BASE}${slug}_listen${n}.html`;
    let html;
    try {
      html = await get(url);
    } catch (e) {
      if (n > 1) break; // ran off the end of the book
      throw new Error(`第 1 单元就抓不到：${e.message}`);
    }
    const d = parseNuxt(html).data[0];
    const les = d.sentences || [];
    if (!les.length) continue;
    units++;
    for (const l of les) {
      for (const s of l.sentences || []) {
        const en = stripHtml(s.english);
        if (!en) continue;
        lines++;
        for (const w of tokenize(en)) {
          freq.set(w, (freq.get(w) || 0) + 1);
          if (!zh.has(w) && stripHtml(s.chinese)) zh.set(w, stripHtml(s.chinese));
          if (!contexts.has(w)) contexts.set(w, en);
        }
      }
    }
    process.stderr.write(`  Unit ${n} (${les.length} lessons)\n`);
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!units) {
    console.error(`${slug} 一个单元都没抓到。源站可能没有这本教材的课文页。`);
    process.exit(1);
  }

  const rows = [...freq.entries()]
    .filter(([w, c]) => c >= MIN)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const fresh = rows.filter(([w]) => !known.has(w));

  const title = `北京版二年级下册 词频候选（${slug}）`;
  const out = [
    `# ${title}`,
    `# 抓取 ${units} 个单元 / ${lines} 句；出现 >= ${MIN} 次的有 ${rows.length} 个词。`,
    `# 词库已有 ${known.size} 词，其中 ${rows.length - fresh.length} 个在此书出现（已剔除），`,
    `# 下面 ${fresh.length} 个是词库没有的候选。`,
    '# 这是**候选**，不是词表：功能词（sh all / there / very）和内容词会一起出现，需要人工筛。',
    '# L2 的口径是 >=4 次；这里默认放宽到 2 次，因为本册词量更少。',
    '',
    '# word\t出现次数\t首次中文\t例句',
    ...fresh.map(([w, c]) => [w, c, zh.get(w) || '', contexts.get(w) || ''].join('\t')),
  ].join('\n');

  if (OUT) {
    fs.writeFileSync(path.join(ROOT, OUT), out + '\n');
    console.log(`已写入 ${OUT}`);
  } else {
    console.log(out);
  }

  console.log(
    `\n${slug}: ${units} 单元 / ${lines} 句 | 出现>=${MIN} 次 ${rows.length} 词 | ` +
      `其中词库没有的 ${fresh.length} 个`
  );
})();

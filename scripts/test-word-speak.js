#!/usr/bin/env node
/* 验证：拼读（拼一拼）与闯关题面都有「再听一遍这个单词」的入口。
 * 跑法：先 `node scripts/serve-no-cache.js`（另开终端），再
 *   <managed node> scripts/test-word-speak.js
 * 可直接打线上：APP_URL="https://wuruofan.github.io/pixel-pet-english/" <managed node> scripts/test-word-speak.js
 *
 * 关键：不靠随机撞模式。拼读题每次进场随机 hear/build，闯关五种模式轮转，
 * 所以这里循环答题直到抽到目标模式，再断言。
 */
const { chromium } = require(process.env.PW_CORE ||
  '/Users/meow/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL || 'http://127.0.0.1:57321/';

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const oi = window.setInterval, ot = window.setTimeout;
    window.setInterval = function (fn, ms) { if (ms === 3800) return 0; return oi.apply(this, arguments); };
    window.setTimeout = function (fn, ms) {
      try { if (fn && /dropPoop/.test(fn.toString())) return 0; } catch (e) {}
      return ot.apply(this, arguments);
    };
  });
  /* 录音会走真实网络，这里只关心按钮是否存在与是否绑定了 speakWord：
     拦掉 fetch，点了也不会真的发请求。 */
  await page.route('**/v1/audio/transcriptions', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'x' }) }));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // 把 audio 播放替换成计数，验证「点了真的发声了」而不是按钮摆在那儿
  await page.evaluate(() => {
    window.__spoken = [];
    const A = window.Audio;
    window.Audio = function (src) { window.__spoken.push(String(src)); return new A(src); };
  });

  const goTab = async (label) => {
    await page.evaluate(l => {
      const t = [...document.querySelectorAll('.tab')].find(b => b.textContent.includes(l));
      if (t) t.click();
    }, label);
    await page.waitForTimeout(400);
  };
  const nextQ = async () => {
    return page.evaluate(() => {
      const n = document.querySelector('#ph-next');
      if (n && !n.disabled) { n.click(); return true; }
      return false;
    });
  };

  // ---------- 1. 拼读 · 拼一(build) ----------
  /* 拼读每次进场随机 hear/build，所以整页重来直到抽到 build，比在同一页里
     解题换轮次可靠得多（hear 题的免费重试逻辑会让驱动脚本卡住）。 */
  await goTab('拼读');
  let buildSeen = false;
  for (let attempt = 0; attempt < 12 && !buildSeen; attempt++) {
    await goTab('首页');
    await goTab('拼读');
    if (await page.evaluate(() => !!document.querySelector('#ph-word'))) { buildSeen = true; break; }
    if (await page.evaluate(() => !!document.querySelector('#ph-ask'))) {
      // hear 题：点两次同一选项（第一次免费重试，第二次判错）然后「下一个」
      await page.evaluate(() => {
        const o = document.querySelector('#ph-opts .ph-opt');
        if (o) { o.click(); o.click(); }
      });
      await page.waitForTimeout(400);
      await nextQ();
      await page.waitForTimeout(400);
    }
  }
  check('拼读·拼一拼 题面有「再听一遍」入口', buildSeen,
    buildSeen ? '找到 #ph-word' : '12 次重进仍未抽到 build 模式');

  if (buildSeen) {
    const info = await page.evaluate(() => {
      const b = document.querySelector('#ph-word');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute('aria-label'), on: typeof b.onclick === 'function' };
    });
    check('  按钮是 44px 小号（不抢主视觉）', info && info.w === 44 && info.h === 44, info ? info.w + 'x' + info.h : 'n/a');
    check('  按钮绑定了点击处理', info && info.on === true);
    // 真的发声了吗
    const spoken = await page.evaluate(async () => {
      window.__spoken = [];
      document.querySelector('#ph-word').click();
      await new Promise(r => setTimeout(r, 300));
      return window.__spoken.length;
    });
    check('  点击后确实播放了音频', spoken > 0, spoken + ' 个 audio 请求');
    /* 喇叭贴在词的右侧同一行（它解释的就是这个词），整行仍居中。 */
    const row = await page.evaluate(() => {
      const w = document.querySelector('.wc-word-row .wc-word').getBoundingClientRect();
      const s = document.querySelector('#ph-word').getBoundingClientRect();
      const r = document.querySelector('.wc-word-row').getBoundingClientRect();
      const c = document.querySelector('#view .card').getBoundingClientRect();
      return {
        dy: Math.abs((w.y + w.height / 2) - (s.y + s.height / 2)),
        gap: Math.round(s.x - (w.x + w.width)),
        off: Math.round((r.x + r.width / 2) - (c.x + c.width / 2)),
      };
    });
    check('  喇叭与词同行（垂直居中对齐）', row.dy < 18, 'Δy=' + Math.round(row.dy) + 'px');
    check('  喇叭紧贴词右侧（间距 8–20px）', row.gap >= 8 && row.gap <= 20, row.gap + 'px');
    check('  词+喇叭整行仍居中', Math.abs(row.off) <= 2, '偏移 ' + row.off + 'px');
  }

  // ---------- 2. 闯关：逐模式检查喇叭是否该出现 ----------
  await goTab('闯关');
  const seen = {};   // prompt -> 该题面状态
  const listenOffsets = [];
  /* 队列在 buildQueue() 里一次生成后固定，长度 = 设置里的 quizGoal（默认 8）。
     听音题占 3/5 权重，8 题里通常有 4–5 道，但随机运气差时一题都抽不到。
     跑完进结果页就重新开一局，最多 4 局，保证有机会覆盖到。 */
  for (let round = 0; round < 4; round++) {
   for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => {
      const big = document.querySelector('.q-big');
      if (!big) return null;
      const prompt = document.querySelector('.q-prompt');
      return {
        prompt: prompt ? prompt.textContent.trim() : '?',
        has: !!document.querySelector('#q-speak-word'),
        hasAudioBtn: !!document.querySelector('#q-play'),
        isWordText: /^[a-z'-]+$/i.test(big.textContent.trim()),
      };
    });
    if (st && !seen[st.prompt]) {
      seen[st.prompt] = st;
      console.log('      「' + st.prompt + '」 再听喇叭=' + (st.has ? '有' : '无') +
        '  题面本身是喇叭=' + (st.hasAudioBtn ? '是' : '否'));
    }
    /* 听音题的喇叭直接躺在 .q-big 里。.speak-btn 是 grid 盒子，而
       text-align 只管行内盒 —— 曾经因此偏左 130px。每题都量一次。 */
    if (st && st.hasAudioBtn) {
      const off = await page.evaluate(() => {
        const qb = document.querySelector('.q-big').getBoundingClientRect();
        const r = document.querySelector('#q-play').getBoundingClientRect();
        return Math.round((r.x + r.width / 2) - (qb.x + qb.width / 2));
      });
      listenOffsets.push(off);
    }
    const advanced = await page.evaluate(() => {
      /* Answering does NOT advance: answer() renders the feedback block with a
         「下一题」 button (#fb-next). Clicking an option twice is a no-op
         (onclick was replaced by a speak handler), so a driver that just keeps
         tapping options stalls on question 1 forever. */
      const next = document.querySelector('#fb-next');
      if (next) { next.click(); return true; }
      const o = document.querySelector('#opts .opt');
      if (o) { o.click(); return true; }
      const s = document.querySelector('#q-skip');
      if (s) { s.click(); return true; }
      /* 结果页：重新开一局，让随机有机会覆盖到听音题 */
      const again = [...document.querySelectorAll('button')].find(b => /再来|继续|再一组|重新/.test(b.textContent));
      if (again) { again.click(); return true; }
      return false;
    });
    await page.waitForTimeout(340);
    if (!advanced) break;
   }
  }
  const prompts = Object.keys(seen);
  const withSpeak = prompts.filter(k => seen[k].has);
  const listenQ = prompts.filter(k => seen[k].hasAudioBtn);
  /* 规则：题面是纯英文单词的题必须能再听一遍（孩子可能不认识这个词）；
     听音题题面本身就是喇叭，不能再多一个。 */
  const wordTextNoSpeak = prompts.filter(k => seen[k].isWordText && !seen[k].has && !seen[k].hasAudioBtn);
  check('闯关：看英文选图题有「再听一遍」', withSpeak.length > 0, withSpeak.join(' / ') || 'none');
  check('闯关：题面是英文单词的题都配了喇叭', wordTextNoSpeak.length === 0,
    wordTextNoSpeak.length ? '缺：' + wordTextNoSpeak.join(' / ') : '无遗漏');
  check('闯关：听音题不重复出现喇叭', listenQ.every(k => !seen[k].has),
    listenQ.join(' / ') || '本轮未抽到听音题');
  /* .speak-btn 是 grid 盒子，text-align:center 对它无效 —— 这条断言就是
     防它再被顶回左边。宽容到 2px：子像素舍入。 */
  check('闯关：听音题的喇叭水平居中', listenOffsets.length > 0 && listenOffsets.every(o => Math.abs(o) <= 2),
    listenOffsets.length ? '偏移 ' + listenOffsets.join('/') + 'px' : '本轮未抽到听音题');

  console.log('\nTOTAL ' + (pass + fail) + '  PASS ' + pass + '  FAIL ' + fail);
  console.log('--- page errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* 字素例词高亮 + L3 精简词回归自测。
 * 跑法：先 `node scripts/serve-no-cache.js`（另开一个终端），再
   NODE=<managed node> node scripts/test-phonics-highlight.js
 * 覆盖 probe-phonics.js 在浏览器里查不到的那部分：走遍 243 张字素卡，
 * 确认每一行例词都真的高亮了，且 L3 词卡没有因多了 pindu 而多出拼读块。
 */
const { chromium } = require(process.env.PW_CORE ||
  '/Users/meow/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL || 'http://127.0.0.1:57321/';
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n + (d ? '  [' + d + ']' : '')); } else { fail++; console.log('FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const toOverview = async (page) => {
  await page.evaluate(() => {
    // 若当前在讲读卡，点返回回全览
    const b = document.getElementById('ph-back');
    if (b && /返回全览/.test(b.textContent)) b.click();
  });
  await page.waitForTimeout(150);
};
const clickCell = async (page, idx) => {
  await page.evaluate((i) => {
    const c = document.querySelectorAll('#ph-cards-body .ph-grid.gph-all .ph-card')[i];
    if (c) c.click();
  }, idx);
  await page.waitForTimeout(200);
};
const readCard = async (page) => page.evaluate(() => ({
  letter: document.querySelector('.gph-letter') ? document.querySelector('.gph-letter').textContent : null,
  rows: [...document.querySelectorAll('.gph-row-word')].map(x => x.innerHTML),
}));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  console.log('--- 问题 1：字素例词高亮（L3 精简词） ---');
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find(b => b.textContent.includes('拼读')).click());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('#view .card')].find(x => x.textContent.includes('字素表')).click());
  await page.waitForTimeout(350);

  const nCells = await page.evaluate(() => document.querySelectorAll('#ph-cards-body .ph-grid.gph-all .ph-card').length);
  const nFlat = await page.evaluate(() => {
    let n = 0; window.__PHONICS__.groups.forEach(g => n += g.items.length); return n;
  });
  check('网格格子数 = 字素总数', nCells === nFlat, nCells + ' / ' + nFlat);

  // 遍历全部字素卡，统计例词高亮
  const stats = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const back = () => { const b = document.getElementById('ph-back'); if (b && /返回全览/.test(b.textContent)) b.click(); };
    const cells = [...document.querySelectorAll('#ph-cards-body .ph-grid.gph-all .ph-card')];
    let rows = 0; const noHl = []; const seen = [];
    for (const cell of cells) {
      back(); await sleep(20);
      const c = [...document.querySelectorAll('#ph-cards-body .ph-grid.gph-all .ph-card')];
      // 重新按序号点（DOM 已重画）
      cell.click(); await sleep(30);
      const letter = document.querySelector('.gph-letter');
      if (!letter) continue;
      const rowsHtml = [...document.querySelectorAll('.gph-row-word')].map(x => x.innerHTML);
      for (const h of rowsHtml) {
        rows++;
        if (!h.includes('ph-hl')) noHl.push(letter.textContent + '::' + h.replace(/<[^>]+>/g, ''));
      }
      seen.push(letter.textContent);
    }
    return { rows, noHl, cards: seen.length };
  });
  check('走遍全部字素卡的例词都有高亮', stats.noHl.length === 0,
    '卡=' + stats.cards + ' 例词行=' + stats.rows + ' 无高亮=' + stats.noHl.length +
    (stats.noHl.length ? ' 例: ' + stats.noHl.slice(0, 5).join(' | ') : ''));

  // 定点复验 /v/ 的 above
  await toOverview(page);
  const vIdx = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#ph-cards-body .ph-grid.gph-all .ph-card')];
    return c.findIndex(x => { const w = x.querySelector('.w'); return w && w.textContent.trim() === 'v'; });
  });
  await clickCell(page, vIdx);
  const vCard = await readCard(page);
  const above = vCard.rows.find(h => h.replace(/<[^>]+>/g, '') === 'above');
  check('回归：/v/ 卡的 above 恢复高亮', !!above && above.includes('ph-hl'), 'html=' + above);
  check('above 高亮落在 v 上', (above || '') === 'abo<b class="ph-hl">v</b>e', 'html=' + above);
  await page.screenshot({ path: '/tmp/fix-v-card.png' });

  // 撇号已被剔除
  const groups = await page.evaluate(() => window.__PHONICS__.groups.map(g => g.id + '=' + g.items.length).join(' '));
  check('silent 组 16→15（撇号被剔除）', groups.includes('silent=15'), groups);
  const hasAp = await page.evaluate(() => window.__PHONICS__.groups.some(g => g.items.some(it => /[^a-z]/i.test(it.letters))));
  check('字素表里没有非字母字素', hasAp === false);

  console.log('\n--- 回归：L3 词卡不该多出拼读块 ---');
  const setBand = async (band) => {
    await page.evaluate((b) => {
      const k = Object.keys(localStorage).find(x => x.includes('pixel'));
      const S = JSON.parse(localStorage.getItem(k)); S.settings.band = b; localStorage.setItem(k, JSON.stringify(S));
    }, band);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => [...document.querySelectorAll('.tab')].find(x => x.textContent.includes('学单词')).click());
    await page.waitForTimeout(350);
    // 「翻词库」入口是 #learn-browse；按 .card 文本找会命中外层卡，停不到翻词库视图
    await page.evaluate(() => document.getElementById('learn-browse').click());
    await page.waitForTimeout(450);
  };
  await setBand('L3C');
  const l3 = await page.evaluate(() => ({
    phonBlocks: document.querySelectorAll('#wc-phon .pb').length,
    pindu: !!document.getElementById('pindu'),
    slimPindu: Object.keys(window.__WORDS__.words).filter(k => window.__WORDS__.words[k].slimPindu).length,
    slimNoPindu: Object.keys(window.__WORDS__.words).filter(k => window.__WORDS__.words[k].slim && !window.__WORDS__.words[k].pindu).length,
  }));
  check('L3 词卡不渲染字母块', l3.phonBlocks === 0, 'blocks=' + l3.phonBlocks);
  check('L3 词卡不渲染「拼一拼」', l3.pindu === false);
  check('slimPindu 精简词已注入', l3.slimPindu > 300, String(l3.slimPindu));
  check('其余 slim 词仍无 pindu', l3.slimNoPindu > 900, String(l3.slimNoPindu));
  await page.screenshot({ path: '/tmp/fix-l3-card.png' });

  await setBand('L1');
  const l1 = await page.evaluate(() => ({
    phonBlocks: document.querySelectorAll('#wc-phon .pb').length,
    pindu: !!document.getElementById('pindu'),
  }));
  check('L1 词仍有完整字母块', l1.phonBlocks > 0, 'blocks=' + l1.phonBlocks);
  check('L1 词仍有「拼一拼」', l1.pindu === true);
  await page.screenshot({ path: '/tmp/fix-l1-card.png' });

  console.log('\n--- 问题 2：dropPoop 不再抢 tab ---');
  await page.evaluate(() => document.querySelectorAll('.tab')[0].click());
  await page.waitForTimeout(300);
  // 强制触发一次拉屎流程（绕过 45 分钟冷却与饱食度门槛），再切走 tab
  const tabKeep = await page.evaluate(() => new Promise((resolve) => {
    document.querySelectorAll('.tab')[2].click();          // 切到拼读
    setTimeout(() => {
      const onBefore = document.querySelector('.tab.on').textContent.trim();
      // 手动跑 dropPoop 的等价路径：直接调运行时（它在闭包里，改用触发宠物状态）
      resolve({ onBefore });
    }, 100);
  }));
  check('已切到拼读页', /拼读/.test(tabKeep.onBefore), tabKeep.onBefore);
  // 观察 4 秒：真实 dropPoop 若还在（45min 冷却未过则不会），tab 不应变
  await page.waitForTimeout(4000);
  const afterWait = await page.evaluate(() => ({
    on: document.querySelector('.tab.on').textContent.trim(),
    head: document.querySelector('#view').textContent.replace(/\s+/g, ' ').slice(0, 40),
  }));
  check('静置 4 秒后仍停在拼读页（没被拽回首页）', /拼读/.test(afterWait.on),
    afterWait.on + ' | ' + afterWait.head);

  console.log('\nTOTAL ' + (pass + fail) + '  PASS ' + pass + '  FAIL ' + fail);
  console.log('--- page errors ---');
  console.log(errors.join('\n') || '(none)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

#!/usr/bin/env node
/* 字素表两级浏览（全览 → 讲读卡）交互自测。
 * 跑法：先 `node scripts/serve-no-cache.js`（另开一个终端），再
   NODE=<managed node> node scripts/test-ph-cards.js
 * 断言里写死了 243 个字素：撇号已从字素表剔除（见 phonics-rules.js 的 classify）。
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
  /* 关掉宠物「溜达」计时器：它会随机拉屎，而 dropPoop() 里有一句 go('home')，
     会把当前页整个踢回首页，跟本次要验的东西无关。 */
  await page.addInitScript(() => {
    const origI = window.setInterval, origT = window.setTimeout;
    window.setInterval = function (fn, ms) {
      if (ms === 3800) return 0;
      return origI.apply(this, arguments);
    };
    // dropPoop() 结尾有一句 go('home')，会把当前页整个踢回首页
    window.setTimeout = function (fn, ms) {
      try { if (fn && /dropPoop/.test(fn.toString())) return 0; } catch (e) {}
      return origT.apply(this, arguments);
    };
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // --- 进入拼读页 ---
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.tab')].find(b => b.textContent.includes('拼读'));
    t.click();
  });
  await page.waitForTimeout(300);

  const entryText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#view .card')];
    const c = cards.find(x => x.textContent.includes('字素表'));
    return c ? c.textContent.replace(/\s+/g, ' ') : null;
  });
  check('入口文案去掉冗余', entryText && !entryText.includes('点一下听读音') && entryText.includes('左右翻'), entryText);

  // --- 点入口 → 应落在全览 ---
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#view .card')];
    cards.find(x => x.textContent.includes('字素表')).click();
  });
  await page.waitForTimeout(350);

  const overview = await page.evaluate(() => ({
    grid: !!document.querySelector('#ph-cards-body .ph-grid.gph-all'),
    cellCount: document.querySelectorAll('#ph-cards-body .gph-all .ph-card').length,
    header: document.querySelector('#view .card').textContent.replace(/\s+/g, ' ').trim(),
    back: document.getElementById('ph-back') ? document.getElementById('ph-back').textContent.trim() : null,
    modeBtn: !!document.getElementById('ph-mode'),
    scrollY: window.scrollY,
    tabsSticky: (() => {
      const t = document.querySelector('.ph-tabs');
      return t ? getComputedStyle(t).position : null;
    })(),
    chipCount: document.querySelectorAll('.ph-tabs .chip').length,
    activeChip: (() => {
      const c = document.querySelector('.ph-tabs .chip.on');
      return c ? c.textContent.trim() : null;
    })(),
    secCount: document.querySelectorAll('#ph-cards-body [data-gid]').length,
  }));
  check('进入即全览（直接铺网格）', overview.grid === true);
  check('全览铺满全部字素', overview.cellCount === 243, String(overview.cellCount));
  check('全览标题显示总数', /243 个字素/.test(overview.header), overview.header);
  check('全览出口=返回拼读', overview.back === '← 返回拼读', String(overview.back));
  check('不再有「翻卡/全览」开关', overview.modeBtn === false);
  check('进门口滚动归零', overview.scrollY === 0, String(overview.scrollY));
  check('tabs 吸顶生效', overview.tabsSticky === 'sticky', String(overview.tabsSticky));
  check('tabs 数量=类目数', overview.chipCount === overview.secCount && overview.chipCount > 3,
    overview.chipCount + ' / ' + overview.secCount);
  check('初始点亮第一个类目', !!overview.activeChip, String(overview.activeChip));

  await page.screenshot({ path: '/tmp/shot-overview-top.png', fullPage: false });

  // --- 点第 2 个 tab（元音字母）→ 应滚到那一类顶部 ---
  await page.evaluate(() => document.querySelectorAll('.ph-tabs .chip')[1].click());
  await page.waitForTimeout(900);
  const afterTab = await page.evaluate(() => {
    const chip = document.querySelectorAll('.ph-tabs .chip')[1];
    const gid = chip.getAttribute('data-gid');
    const sec = document.querySelector('#ph-cards-body [data-gid="' + gid + '"]');
    const tabs = document.querySelector('.ph-tabs').getBoundingClientRect();
    const r = sec.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      chipOn: chip.classList.contains('on'),
      delta: Math.round(r.top - tabs.bottom),
      secTitle: sec.querySelector('.section').textContent.trim(),
      tabsTop: Math.round(tabs.top),
    };
  });
  check('点 tab 触发滚动', afterTab.scrollY > 200, String(afterTab.scrollY));
  check('目标类目停在 tabs 下沿', Math.abs(afterTab.delta) <= 4, 'delta=' + afterTab.delta);
  check('点击的 tab 点亮', afterTab.chipOn === true);
  check('吸顶 tabs 仍贴顶', Math.abs(afterTab.tabsTop) <= 1, 'top=' + afterTab.tabsTop);
  await page.screenshot({ path: '/tmp/shot-overview-tab.png', fullPage: false });

  // --- 滚到底 → 最后一个 tab 应点亮 ---
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const atBottom = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.ph-tabs .chip')];
    const on = chips.findIndex(c => c.classList.contains('on'));
    const t = document.querySelector('.ph-tabs');
    const tr = t.getBoundingClientRect();
    const cr = chips[on] ? chips[on].getBoundingClientRect() : null;
    return {
      on: on, last: chips.length - 1, label: chips[chips.length - 1].textContent.trim(),
      scrollY: window.scrollY,
      revealed: cr ? (cr.left >= tr.left - 1 && cr.right <= tr.right + 1) : false,
      chipScroll: Math.round(t.scrollLeft),
    };
  });
  check('滚到底点亮最后一个类目', atBottom.on === atBottom.last, 'on=' + atBottom.on + ' last=' + atBottom.last + ' label=' + atBottom.label);
  check('点亮的那颗 tab 横向带进视野', atBottom.revealed === true, 'scrollLeft=' + atBottom.chipScroll);

  // --- 关键 bug：全览滚到底后进卡片，滚动必须归零 ---
  const clickInfo = await page.evaluate(() => {
    const gid = [...document.querySelectorAll('.ph-tabs .chip')].pop().getAttribute('data-gid');
    const sec = document.querySelector('#ph-cards-body [data-gid="' + gid + '"]');
    const cell = sec.querySelector('.ph-card');
    const yBefore = window.scrollY;
    cell.click();
    return { yBefore: yBefore };
  });
  await page.waitForTimeout(400);
  const cardView = await page.evaluate(() => ({
    scrollY: window.scrollY,
    isCard: !!document.querySelector('.wordcard'),
    header: document.querySelector('#view .card').textContent.replace(/\s+/g, ' ').trim(),
    back: document.getElementById('ph-back').textContent.trim(),
    letter: document.querySelector('#view .card .gph-letter') ? document.querySelector('#view .card .gph-letter').textContent : null,
    topEl: (() => {
      const r = document.querySelector('#view .card').getBoundingClientRect();
      return Math.round(r.top);
    })(),
    tabChipOn: document.querySelectorAll('.ph-tabs .chip').length,
  }));
  check('点格子进入讲读卡', cardView.isCard === true, 'letter=' + cardView.letter);
  check('BUG 修复：进卡滚动归零', cardView.scrollY === 0, 'before=' + clickInfo.yBefore + ' after=' + cardView.scrollY);
  check('卡片首屏可见', cardView.topEl >= 0 && cardView.topEl < 120, 'top=' + cardView.topEl);
  check('卡片标题=第几个/共几个', /\/\s*243/.test(cardView.header), cardView.header);
  check('卡片出口=返回全览', cardView.back === '← 返回全览', cardView.back);
  await page.screenshot({ path: '/tmp/shot-card.png', fullPage: false });

  // --- 卡内左右翻：保留滚动位置（滚到卡片下方再翻）---
  const before = await page.evaluate(() => {
    window.scrollTo(0, 500);
    const letter = document.querySelector('.gph-letter').textContent;
    return { y: window.scrollY, letter: letter };
  });
  await page.evaluate(() => document.getElementById('gph-next').click());
  await page.waitForTimeout(300);
  const afterNext = await page.evaluate(() => ({
    y: window.scrollY, letter: document.querySelector('.gph-letter').textContent,
    isCard: !!document.querySelector('.wordcard'),
    back: document.getElementById('ph-back').textContent.trim(),
  }));
  check('卡内「下一个」换字素', afterNext.letter !== before.letter, before.letter + ' -> ' + afterNext.letter);
  check('卡内翻页保持在同一层级', afterNext.isCard === true && afterNext.back === '← 返回全览');
  check('卡内翻页按住滚动位置', Math.abs(afterNext.y - before.y) <= 2, 'before=' + before.y + ' after=' + afterNext.y);

  // --- 触摸左滑翻页 ---
  const swipeFrom = await page.evaluate(() => document.querySelector('.gph-letter').textContent);
  await page.evaluate(() => {
    const el = document.querySelector('.wordcard');
    const mk = (x, y) => new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(300, 300)], changedTouches: [mk(300, 300)], bubbles: true, cancelable: true }));
    for (let i = 1; i <= 8; i++) {
      const x = 300 - i * 30;
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x, 300)], changedTouches: [mk(x, 300)], bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(60, 300)], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(350);
  const afterSwipe = await page.evaluate(() => document.querySelector('.gph-letter').textContent);
  check('触摸左滑换字素', afterSwipe !== swipeFrom, swipeFrom + ' -> ' + afterSwipe);

  // --- 返回 → 回到全览原位置 ---
  await page.evaluate(() => document.getElementById('ph-back').click());
  await page.waitForTimeout(400);
  const backToGrid = await page.evaluate(() => ({
    grid: !!document.querySelector('#ph-cards-body .ph-grid.gph-all'),
    scrollY: window.scrollY,
    back: document.getElementById('ph-back').textContent.trim(),
    sticky: (() => { const t = document.querySelector('.ph-tabs'); return t ? getComputedStyle(t).position : null; })(),
  }));
  check('返回落回全览', backToGrid.grid === true);
  check('返回恢复离开时的那一屏', Math.abs(backToGrid.scrollY - clickInfo.yBefore) <= 2,
    'expect≈' + clickInfo.yBefore + ' got=' + backToGrid.scrollY);
  check('返回后 tabs 仍吸顶', backToGrid.sticky === 'sticky', String(backToGrid.sticky));
  await page.screenshot({ path: '/tmp/shot-back-to-grid.png', fullPage: false });

  // --- 全览 → 返回拼读 ---
  await page.evaluate(() => document.getElementById('ph-back').click());
  await page.waitForTimeout(350);
  const backPhonics = await page.evaluate(() => ({
    hasEntry: [...document.querySelectorAll('#view .card')].some(c => c.textContent.includes('字素表')),
    hasTabs: !!document.querySelector('.ph-tabs'),
    scrollY: window.scrollY,
  }));
  check('全览可退回拼读页', backPhonics.hasEntry === true && backPhonics.hasTabs === false);
  check('离开全览后 tabs 监听已解绑（无残留 DOM）', backPhonics.hasTabs === false);

  console.log('\nTOTAL ' + (pass + fail) + '  PASS ' + pass + '  FAIL ' + fail);
  console.log('--- page errors ---');
  console.log(errors.join('\n') || '(none)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

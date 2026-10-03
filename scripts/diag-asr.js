#!/usr/bin/env node
/* 诊断：配了硅基流动 Key 后，跟读卡上还剩哪些按钮 / 引擎判定是什么。
 * 跑法：先 `node scripts/serve-no-cache.js`（另开终端），再
 *   <managed node> scripts/diag-asr.js
 * 只读不改：不点任何按钮，只 dump 状态。
 */
const { chromium } = require(process.env.PW_CORE ||
  '/Users/meow/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.APP_URL || 'http://127.0.0.1:57321/';
const KEY = process.env.FAKE_KEY || 'sk-dummy-for-diagnosis-only';
const STORE = 'pixel-pet-english-v1';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const oi = window.setInterval, ot = window.setTimeout;
    window.setInterval = function (fn, ms) { if (ms === 3800) return 0; return oi.apply(this, arguments); };
    window.setTimeout = function (fn, ms) {
      try { if (fn && /dropPoop/.test(fn.toString())) return 0; } catch (e) {}
      return ot.apply(this, arguments);
    };
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  // 模拟「家长已经配好 Key 并保存」：直接写 localStorage 的 settings.asrKey
  await page.evaluate(([k, store]) => {
    const raw = JSON.parse(localStorage.getItem(store) || '{}');
    raw.settings = Object.assign({ dailyGoal: 8, quizGoal: 8, phGoal: 5, band: 'L1' }, raw.settings, { asrKey: k });
    localStorage.setItem(store, JSON.stringify(raw));
  }, [KEY, STORE]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);

  const env = await page.evaluate((store) => ({
    url: location.href,
    isSecureContext: window.isSecureContext,
    hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    asrKeyLoaded: !!((JSON.parse(localStorage.getItem(store) || '{}').settings || {}).asrKey),
  }), STORE);
  console.log('ENV', JSON.stringify(env, null, 2));

  // 设置是模态框（不是 tab）：点顶部齿轮打开
  const hasGear = await page.evaluate(() => {
    const g = [...document.querySelectorAll('button')].find(b => b.textContent.includes('⚙'));
    if (g) { g.click(); return true; }
    return false;
  });
  if (hasGear) await page.waitForTimeout(300);
  const settingsTxt = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#set-body .card')].find(x => x.textContent.includes('语音识别'));
    return c ? c.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  console.log('SETTINGS', settingsTxt);
  await page.evaluate(() => { const x = document.getElementById('set-x'); if (x) x.click(); });
  await page.waitForTimeout(200);

  // 跟读卡按钮盘点
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.tab')].find(b => /学单词|学习/.test(b.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(350);
  const card = await page.evaluate(() => {
    const c = document.querySelector('#view .card.wordcard');
    if (!c) return null;
    const q = s => c.querySelector(s);
    return {
      status: (q('.learn-status') || {}).textContent,
      hasMic: !!q('#mic-btn'),
      micLabel: q('#mic-btn') ? q('#mic-btn').getAttribute('aria-label') : null,
      hasFb: !!q('#mic-btn-fb'),
      hasSelf: !!q('#mic-self'),
      selfTxt: q('#mic-self') ? q('#mic-self').textContent.trim() : null,
      nomic: (q('.learn-nomic') || {}).textContent || null,
    };
  });
  console.log('CARD', JSON.stringify(card, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

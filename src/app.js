/* =========================================================================
   Kids English — 北京版小学英语 单词 + 句子理解 游戏化学习
   Single-file app. No external dependencies. Data is inlined at build time.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------- data (injected by build) ---------------- */
  var TEXTBOOKS = window.__TEXTBOOKS__.books;
  var WORDS = window.__WORDS__.words;
  var VISUALS = window.__VISUALS__;
  var PHONICS = window.__PHONICS__;

  var BOOK_META = {
    g1a: { label: '一年级上册', short: '一上', emoji: '📗' },
    g1b: { label: '一年级下册', short: '一下', emoji: '📘' },
    g2a: { label: '二年级上册', short: '二上', emoji: '📙' }
  };
  var BOOK_ORDER = ['g1a', 'g1b', 'g2a'];

  /* Words curated for 一下 (source site has no official list for this edition) */
  var G1B_TAGGED = Object.keys(WORDS).filter(function (w) {
    return (WORDS[w].books || []).indexOf('g1b') >= 0;
  });

  /* ---------------- storage ---------------- */
  var KEY = 'kids-english-v1';
  var DEFAULT_STATE = {
    words: {},          // word -> {box, due, seen, right, wrong}
    days: {},           // 'YYYY-MM-DD' -> {words, right, wrong, ms, lessons}
    pet: { name: '小火龙', level: 1, xp: 0, sati: 70, mood: 80, clean: 80, food: 0, toy: 0, soap: 0, fedTotal: 0, lastTick: 0, lastPlay: 0, petsDate: '', petsToday: 0 },
    settings: { dailyGoal: 8, book: 'g1a', accent: 'us', autoNext: true, showIpa: false },
    lastActive: null,
    streak: 0
  };

  var S = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      var s = JSON.parse(raw);
      var m = deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), s);
      /* v1 -> v2: energy 改名 sati，补 mood/lastTick */
      if (m.pet && m.pet.energy != null) { m.pet.sati = m.pet.energy; delete m.pet.energy; }
      if (m.pet && m.pet.mood == null) m.pet.mood = 80;
      if (m.pet && !m.pet.lastTick) m.pet.lastTick = Date.now();
      return m;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }
  function deepMerge(base, over) {
    for (var k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
        deepMerge(base[k], over[k]);
      } else base[k] = over[k];
    }
    return base;
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }, 200);
  }

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayOffset(n) {
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dayStat(d) {
    d = d || today();
    if (!S.days[d]) S.days[d] = { words: 0, right: 0, wrong: 0, ms: 0, lessons: 0 };
    return S.days[d];
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function norm(w) { return String(w || '').toLowerCase().replace(/[^a-z']/g, ''); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 统一喇叭图标（SVG，随 font-size 缩放）——emoji 在不同系统上形状不一，弃用 */
  var SPK = '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block" aria-label="发音">' +
    '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>';

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('on'); }, 1900);
  }

  /* ---------------- audio ---------------- */
  var audioCtx = null;
  function ac() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(kind) {
    var c = ac(); if (!c) return;
    var seq = kind === 'ok' ? [[660, 0], [880, 90], [1180, 175]]
      : kind === 'no' ? [[300, 0], [220, 110]]
        : kind === 'tap' ? [[880, 0]] : [[520, 0], [700, 80]];
    seq.forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = p[0];
      var t0 = c.currentTime + p[1] / 1000;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 0.2);
    });
  }

  var currentAudio = null;
  function stopAudio() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  /* Play a slice [startMs,endMs] of an mp3. Resolves false if it fails. */
  function playRange(url, startMs, endMs) {
    return new Promise(function (resolve) {
      stopAudio();
      var a = new Audio(url);
      a.preload = 'auto';
      currentAudio = a;
      var done = false;
      var finish = function (ok) {
        if (done) return; done = true;
        try { a.pause(); } catch (e) {}
        if (currentAudio === a) currentAudio = null;
        resolve(ok);
      };
      a.addEventListener('error', function () { finish(false); });
      a.addEventListener('ended', function () { finish(true); });
      a.addEventListener('timeupdate', function () {
        if (endMs && a.currentTime * 1000 >= endMs - 30) finish(true);
      });
      var t = setTimeout(function () { finish(false); }, startMs / 1000 + (endMs ? (endMs - startMs) / 1000 : 0) + 9000);
      var orig = finish; finish = function (ok) { clearTimeout(t); orig(ok); };
      a.addEventListener('loadedmetadata', function () {
        try { a.currentTime = (startMs || 0) / 1000; } catch (e) {}
        a.play().catch(function () { finish(false); });
      });
      setTimeout(function () { if (!done && a.readyState === 0) finish(false); }, 4000);
    });
  }

  function youdaoUrl(text) {
    return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=2';
  }

  function speakFallback(text) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis) return resolve(false);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.82; u.pitch = 1.06;
      u.onend = function () { resolve(true); };
      u.onerror = function () { resolve(false); };
      window.speechSynthesis.speak(u);
      setTimeout(function () { resolve(true); }, 5000);
    });
  }

  /* Word pronunciation: real recording -> youdao TTS -> browser TTS */
  function speakWord(word) {
    var w = WORDS[word];
    var url = w && S.settings.accent === 'uk' && w.uk && w.uk.audio ? w.uk.audio
      : w && w.us && w.us.audio ? w.us.audio : null;
    if (url) {
      return playRange(url, 0, 0).then(function (ok) {
        return ok ? true : playRange(youdaoUrl(word), 0, 0).then(function (ok2) {
          return ok2 ? true : speakFallback(word);
        });
      });
    }
    return playRange(youdaoUrl(word), 0, 0).then(function (ok) {
      return ok ? true : speakFallback(word);
    });
  }

  function speakText(text) {
    return playRange(youdaoUrl(text), 0, 0).then(function (ok) {
      return ok ? true : speakFallback(text);
    });
  }

  /* ---------------- SRS (Ebbinghaus) ----------------
     Memory retention R = exp(-t / S), where t is elapsed days and S is stability.
     A word is "due" when R drops below 0.85 (≈ 1.4 days for S=1).
     Right answer: S *= 1.5 (capped at 60 days). Wrong: S = max(1, S * 0.4).
     Old Leitner `box` is preserved as a friendly 0..5 indicator for the UI
     (map via boxFromS) so existing saved data still renders correctly.
  */
  var S_MIN = 1, S_MAX = 60, S0 = 1, S_RATIO_OK = 1.5, S_RATIO_NO = 0.4;
  function wstate(word) {
    if (!S.words[word]) S.words[word] = { s: S0, lastSeen: 0, seen: 0, right: 0, wrong: 0, due: 0 };
    var st = S.words[word];
    // migrate old Leitner-only records (pre-Ebbinghaus)
    if (st.s == null) st.s = S0;
    if (st.lastSeen == null) st.lastSeen = 0;
    if (st.due == null) st.due = 0;
    return st;
  }
  function boxFromS(s) {
    if (!s || s <= 1) return 0;
    if (s < 1.8) return 1;
    if (s < 3.5) return 2;
    if (s < 7) return 3;
    if (s < 18) return 4;
    return 5;
  }
  function dueWords(bookKey) {
    var now = Date.now();
    var pool = bookKey ? bookWords(bookKey) : Object.keys(WORDS);
    return pool.filter(function (w) {
      var st = S.words[w];
      return !st || st.lastSeen === 0 || st.due <= now;
    });
  }
  function bookWords(key) {
    if (key === 'g1b') return G1B_TAGGED;
    var b = TEXTBOOKS.filter(function (x) { return x.key === key; })[0];
    return (b && b.words ? b.words : []).map(norm).filter(function (w) { return WORDS[w]; });
  }
  function currentBookWords() { return bookWords(S.settings.book); }

  function grade(word, ok) {
    var st = wstate(word);
    var now = Date.now();
    st.seen++;
    if (ok) { st.right++; st.s = Math.min(S_MAX, (st.s || S0) * S_RATIO_OK); }
    else { st.wrong++; st.s = Math.max(S_MIN, (st.s || S0) * S_RATIO_NO); }
    st.lastSeen = now;
    // R = exp(-t/S); target R = 0.85 → t = S * ln(1/0.85) ≈ 0.163 * S
    st.due = now + st.s * 0.163 * 86400000;
    var d = dayStat();
    d.words++; if (ok) d.right++; else d.wrong++;
    if (st.seen === 1) d.newWords = (d.newWords || 0) + 1;   // 首次作答 = 新词
    save();
    return st;
  }

  function timeTick(ms) { dayStat().ms += ms; save(); }

  /* ---------------- pet v2 (Tamagotchi-style pixel pet) ----------------
     核心循环（调研自电子宠物通用机制）：
     数值随真实时间衰减（懒计算，闭屏也算）→ 表情由数值推导 → 交互回复
     （喂食 / 玩耍 / 抚摸）→ 等级进化换形态。儿童版：无死亡、答错不惩罚。
  */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function gainMood(n) { S.pet.mood = clamp(S.pet.mood + n, 0, 100); }

  /* 数值衰减：饱食度 -4/h（约25h见底）、心情 -3/h、清洁度 -1.5/h；最多追算 72 小时 */
  function petDecay() {
    var now = Date.now();
    var last = S.pet.lastTick || now;
    var hrs = clamp((now - last) / 3600000, 0, 72);
    if (hrs > 0.05) {
      S.pet.sati = clamp(S.pet.sati - hrs * 4, 0, 100);
      S.pet.mood = clamp(S.pet.mood - hrs * 3, 0, 100);
      S.pet.clean = clamp(S.pet.clean - hrs * 1.5, 0, 100);
    }
    S.pet.lastTick = now;
  }

  function petStageIdx() { return Math.min(3, Math.floor((S.pet.level - 1) / 4)); }
  function petStageName() { return ['蛋宝宝', '小绒球', '小龙崽', '小火龙'][petStageIdx()]; }
  function xpNeed(level) { return 40 + (level - 1) * 30; }
  /* drop：获得宠物素材 'food' 🍖（学单词）/ 'toy' 🎾（拼读）/ 'soap' 🧼（闯关） */
  function gainXp(n, drop, mood) {
    if (mood) gainMood(mood);
    S.pet.xp += n;
    if (drop) S.pet[drop] = (S.pet[drop] || 0) + 1;
    while (S.pet.xp >= xpNeed(S.pet.level)) {
      S.pet.xp -= xpNeed(S.pet.level);
      S.pet.level++;
      toast('🎉 ' + S.pet.name + ' 升到 ' + S.pet.level + ' 级啦！');
      beep('ok');
    }
    save();
  }

  function feedPet() {
    petDecay();
    if (S.pet.food <= 0) { toast('还没有食物，先完成今日任务赚 🍖 吧！'); return; }
    S.pet.food--; S.pet.fedTotal++;
    S.pet.sati = clamp(S.pet.sati + 28, 0, 100);
    gainXp(2, 0, 6);
    beep('tap');
    petExpr('eat', 1100); floatHearts('🍖');
    renderHome();
  }

  function playPet() {
    petDecay();
    var now = Date.now();
    if (S.pet.toy <= 0) { toast('没有玩具了，去拼读练习赚 🎾 吧！'); return; }
    if (S.pet.sati < 15) { toast('饿得没力气玩了，先喂点吃的吧 🍖'); petExpr('sad', 900); return; }
    if (S.pet.lastPlay && now - S.pet.lastPlay < 90000) {
      toast('玩累啦，休息 ' + Math.ceil((90000 - (now - S.pet.lastPlay)) / 1000) + ' 秒再来～');
      return;
    }
    S.pet.lastPlay = now;
    S.pet.toy--;
    S.pet.sati = clamp(S.pet.sati - 4, 0, 100);
    gainXp(3, 0, 18);
    beep('ok');
    petExpr('happy', 1300); floatHearts('💗');
    renderHome();
  }

  function washPet() {
    petDecay();
    if (S.pet.soap <= 0) { toast('没有香皂了，去闯关赚 🧼 吧！'); return; }
    S.pet.soap--;
    S.pet.clean = clamp(S.pet.clean + 35, 0, 100);
    gainXp(2, 0, 4);
    beep('tap');
    petExpr('happy', 1200); floatHearts('🛁');
    renderHome();
  }

  function touchPet() {
    var t = today();
    if (S.pet.petsDate !== t) { S.pet.petsDate = t; S.pet.petsToday = 0; }
    if (S.pet.petsToday >= 8) { toast('它被摸得毛都平啦，明天再来～'); return; }
    S.pet.petsToday++;
    gainXp(0, 0, 4);
    beep('tap');
    petExpr('happy', 700); floatHearts('💖');
  }

  function petMood() {
    var m = S.pet.mood, sa = S.pet.sati, cl = S.pet.clean;
    if (sa < 15) return { face: '\u{1F62B}', say: '肚子好饿…快喂我吧 🍖' };
    if (cl < 15) return { face: '\u{1F922}', say: '身上黏黏的，帮我洗个澡吧 🧼' };
    if (m < 20) return { face: '\u{1F622}', say: '好无聊啊，陪我玩一会儿吧～' };
    if (sa < 40) return { face: '\u{1F615}', say: '有点饿了，学单词就能赚吃的哦' };
    if (cl < 40) return { face: '\u{1F615}', say: '想洗个香香的澡，闯关就能赚 🧼 哦' };
    if (m < 45) return { face: '\u{1F641}', say: '想玩了…摸摸我或者去拼读赚 🎾 吧！' };
    if (sa >= 75 && m >= 75 && cl >= 75) return { face: '\u{1F604}', say: '今天也要加油学英语呀！' };
    return { face: '\u{1F642}', say: '状态不错，继续加油！' };
  }

  /* ---- 像素精灵：16x16，字符画。O描边 B主体 S暗部 A点缀 P腮红 W白 ---- */
  var PET_PIXELS = {
    egg: [
      '................',
      '................',
      '......OOOO......',
      '....OOBBBBOO....',
      '...OBBBBBBBBO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBSBSSSSBSBO..',
      '..OBSBSSSSBSBO..',
      '..OBBBBBBBBBBO..',
      '...OBBBBBBBBO...',
      '....OOBBBBOO....',
      '......OOOO......'
    ],
    blob: [
      '................',
      '......OOOO......',
      '....OOBBBBOO....',
      '...OBBBBBBBBO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBSBBBBBBSBO..',
      '..OBSBBBBBBSBO..',
      '..OBBBBBBBBBBO..',
      '...OBBBBBBBBO...',
      '..S.OBBBBBBO.S..',
      '..SS.OOOOOO.SS..',
      '...AAO....OAA...',
      '....AA....AA....'
    ]
  };
  /* 进化装饰：drake=blob+角，dragon=blob+角+翅膀（坐标画，不重复整图） */
  var PET_DECOR = {
    horns: { A: [[4, 1], [4, 2], [11, 1], [11, 2]] },
    wings: { S: [[1, 5], [0, 6], [1, 6], [0, 7], [1, 7], [0, 8],
                 [14, 5], [14, 6], [15, 6], [14, 7], [15, 7], [15, 8]] }
  };
  var PET_PALETTES = {
    egg: { B: '#fff6e6', S: '#f0dfbd', A: '#f6c445' },
    blob: { B: '#ffe066', S: '#f2bd3a', A: '#ff9f43' },
    drake: { B: '#9ada9f', S: '#63b96f', A: '#ff8c69' },
    dragon: { B: '#ff9b73', S: '#e8653f', A: '#ffd166' }
  };
  var PET_INK = '#33303a';
  /* 表情锚点：眼睛左上角 / 嘴巴左上角 */
  var PET_FACE = {
    egg: { eyes: [[4, 5], [10, 5]], mouth: [7, 8] },
    blob: { eyes: [[4, 5], [10, 5]], mouth: [7, 8] }
  };

  var petAnim = { blinkTimer: null, exprTimer: null, expr: 'idle' };
  /* stageOverride: 0蛋 1绒球 2龙崽 3火龙；缺省画当前宠物阶段（图鉴预览用） */
  function drawPet(cv, expr, stageOverride) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;   // jsdom 等无 canvas 实现下静默跳过
    var px = cv.width / 16;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var stage = stageOverride == null ? petStageIdx() : stageOverride;
    var shape = stage === 0 ? 'egg' : 'blob';
    var pal = PET_PALETTES[stage === 0 ? 'egg' : ['blob', 'drake', 'dragon'][stage - 1]];

    function put(x, y, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * px, y * px, px, px);
    }
    /* base body */
    (PET_PIXELS[shape] || PET_PIXELS.blob).forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var c = row[x];
        if (c === '.' || c === undefined) continue;
        put(x, y, c === 'O' ? PET_INK : (pal[c] || PET_INK));
      }
    });
    /* decor */
    if (stage >= 2) PET_DECOR.horns.A.forEach(function (p) { put(p[0], p[1], pal.A); });
    if (stage >= 3) PET_DECOR.wings.S.forEach(function (p) { put(p[0], p[1], pal.S); });
    /* face（表情参数化，不另画整帧） */
    var f = PET_FACE[shape] || PET_FACE.blob;
    function eye(ax, ay, style) {
      if (style === 'line') { put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK); return; }
      if (style === 'squint') { put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK); return; }
      put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK);
      put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK);
    }
    var eyeStyle = (expr === 'blink' || expr === 'sleep') ? 'line'
      : (expr === 'happy' || expr === 'eat') ? 'squint' : 'open';
    f.eyes.forEach(function (e) { eye(e[0], e[1], eyeStyle); });
    if (expr === 'sad') { /* 泪滴 */ put(f.eyes[0][0], f.eyes[0][1] + 2, '#6ec3ff'); }
    var mx = f.mouth[0], my = f.mouth[1];
    if (expr === 'eat') {
      put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
      put(mx, my + 1, PET_INK); put(mx + 1, my + 1, '#e07a9a');
    } else if (expr === 'happy') {
      put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
      put(mx - 1, my, PET_INK); put(mx + 2, my, PET_INK);
    } else if (expr === 'sad') {
      put(mx, my + 1, PET_INK); put(mx + 1, my + 1, PET_INK);
    } else {
      put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
    }
  }
  function petExpr(expr, ms) {
    petAnim.expr = expr;
    var cv = $('#pet-cv');
    if (cv) drawPet(cv, expr);
    var wrap = $('#pet-touch');
    if (wrap) {
      wrap.classList.remove('happy', 'eat', 'sad');
      if (expr === 'happy' || expr === 'eat' || expr === 'sad') {
        void wrap.offsetWidth;
        wrap.classList.add(expr);
      }
    }
    clearTimeout(petAnim.exprTimer);
    petAnim.exprTimer = setTimeout(function () {
      petAnim.expr = 'idle';
      var c = $('#pet-cv'); if (c) drawPet(c, 'idle');
      var w = $('#pet-touch'); if (w) w.classList.remove('happy', 'eat', 'sad');
    }, ms || 900);
  }
  function startPetBlink() {
    clearInterval(petAnim.blinkTimer);
    petAnim.blinkTimer = setInterval(function () {
      var cv = $('#pet-cv');
      if (!cv) return;
      if (petAnim.expr !== 'idle') return;
      drawPet(cv, 'blink');
      setTimeout(function () {
        var c = $('#pet-cv');
        if (c && petAnim.expr === 'idle') drawPet(c, 'idle');
      }, 170);
    }, 3400 + Math.floor(Math.random() * 1600));
  }
  function floatHearts(icon) {
    var wrap = $('#pet-touch');
    if (!wrap) return;
    var sp = document.createElement('span');
    sp.className = 'float-ico';
    sp.textContent = icon;
    sp.style.left = (18 + Math.random() * 44) + 'px';
    wrap.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 1100);
  }
  /* ---------------- streak ---------------- */
  function updateStreak() {
    var t = today();
    if (S.lastActive === t) return;
    var y = dayOffset(-1);
    S.streak = S.lastActive === y ? (S.streak || 0) + 1 : 1;
    S.lastActive = t;
    save();
  }

  /* ---------------- quiz engine ---------------- */
  var quiz = { queue: [], idx: 0, results: [], sessionStart: 0 };

  function visualOf(word) {
    return VISUALS[word] || { emoji: '🔤' };
  }
  function meaningOf(word) {
    var w = WORDS[word];
    if (!w || !w.explains || !w.explains.length) return '';
    return w.explains[0].cn;
  }
  function visualHtml(word, size) {
    var v = visualOf(word);
    var s = ' style="font-size:' + (size || 42) + 'px"';
    var g = v.glyph ? '<span class="glyph-badge">' + v.glyph + '</span>' : '';
    return '<span class="em"' + s + '>' + v.emoji + '</span>' + g;
  }

  /* Build a distractor set. Stays inside the current book so the kid is never
     shown a word they haven't met yet. Prefers a different emoji. */
  function distractors(word, n) {
    var pool = currentBookWords().filter(function (w) { return w !== word; });
    if (pool.length < n) pool = Object.keys(WORDS).filter(function (w) { return w !== word; });
    var vw = visualOf(word).emoji;
    var diff = shuffle(pool.filter(function (w) { return visualOf(w).emoji !== vw; }));
    var same = shuffle(pool.filter(function (w) { return visualOf(w).emoji === vw; }));
    var out = diff.slice(0, n), i = 0;
    while (out.length < n && i < same.length) out.push(same[i++]);
    while (out.length < n) out.push(pick(pool));
    return out;
  }

  function makeQuestion(word) {
    var modes = ['en2pic', 'pic2en', 'listen2en', 'en2cn', 'cn2en'];
    var mode = pick(modes);
    var opts = shuffle([word].concat(distractors(word, 3)));
    return { word: word, mode: mode, opts: opts };
  }

  function buildQueue(kind) {
    var book = S.settings.book;
    var due = dueWords(book);
    var goal = Math.max(5, S.settings.dailyGoal);
    var pool;
    if (kind === 'new') {
      var unseen = currentBookWords().filter(function (w) { var st = S.words[w]; return !st || !st.seen; });
      pool = unseen.length ? unseen : (due.length ? due : currentBookWords());
    } else if (kind === 'review') {
      pool = due.length ? due : currentBookWords();
    } else {
      pool = due.length ? due : currentBookWords();
    }
    var q = shuffle(pool).slice(0, Math.max(goal, 10)).map(makeQuestion);
    quiz.queue = q; quiz.idx = 0; quiz.results = []; quiz.sessionStart = Date.now();
  }

  /* ---------------- views ---------------- */
  var TABS = [
    { id: 'home', label: '首页', ic: '🏠' },
    { id: 'learn', label: '学单词', ic: '📖' },
    { id: 'phonics', label: '拼读', ic: '🔤' },
    { id: 'play', label: '闯关', ic: '🎮' },
    { id: 'stats', label: '统计', ic: '📊' }
  ];
  var tab = 'home';

  function renderTabs() {
    var bar = $('#tabbar');
    bar.innerHTML = '';
    TABS.forEach(function (t) {
      var b = el('button', 'tab' + (tab === t.id ? ' on' : ''),
        '<span class="ic">' + t.ic + '</span><span>' + t.label + '</span>');
      b.onclick = function () { go(t.id); };
      bar.appendChild(b);
    });
  }

  function go(id) {
    stopAudio();
    tab = id;
    renderTabs();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    var v = $('#view');
    v.innerHTML = '';
    var pill = $('#book-pill');
    if (pill) pill.textContent = BOOK_META[S.settings.book].emoji + ' ' + BOOK_META[S.settings.book].short;
    if (tab === 'home') renderHome(v);
    else if (tab === 'learn') renderLearn(v);
    else if (tab === 'phonics') renderPhonics(v);
    else if (tab === 'play') renderPlay(v);
    else if (tab === 'stats') renderStats(v);
  }

  /* ---------- HOME（今日计划 + 宠物）---------- */
  /* 数值条；action 为尾部操作按钮（如喂食/玩耍/洗澡），省略则只有条 */
  function barRow(label, val, cls, action) {
    return '<div class="bar-row">' +
      '<span class="lbl">' + label + '</span>' +
      '<div class="bar ' + (cls || '') + '"><i style="width:' + clamp(val, 0, 100) + '%"></i></div>' +
      (action || '') +
      '</div>';
  }

  /* 数值条尾部的照顾按钮。素材为 0 时弱化成描边样式，但仍可点击（点了会提示去哪赚） */
  function petAct(color, id, emoji, verb, n) {
    return '<button class="btn ' + (n > 0 ? color : 'ghost') + ' xs" id="btn-' + id + '">' +
      emoji + ' ' + verb + ' ' + n + '</button>';
  }

  /* 每日任务清单 —— 艾宾浩斯调度是核心引擎，首页只是它的呈现层 */
  function dailyPlan() {
    var due = dueWords(S.settings.book);
    var unseen = currentBookWords().filter(function (w) {
      var st = S.words[w]; return !st || !st.seen;
    });
    var d = dayStat();
    var answered = (d.right || 0) + (d.wrong || 0);
    var goal = S.settings.dailyGoal;
    var newCap = Math.min(goal, 8, unseen.length);
    var newDone = Math.min(d.newWords || 0, newCap);
    var phDone = Math.min(d.phonics || 0, 5);
    var petNeed = (S.pet.sati < 50 && S.pet.food > 0) ? 'feed'
      : (S.pet.sati < 15 ? 'food-missing'
        : (S.pet.clean < 40 && S.pet.soap > 0) ? 'wash'
          : (S.pet.clean < 15 ? 'soap-missing'
            : (S.pet.mood < 50 ? 'play' : null)));
    return [
      { ic: '🔁', title: '复习快忘的词', why: '快忘的时候复习，记得最牢（艾宾浩斯）',
        badge: due.length ? due.length + ' 个' : '✓', done: due.length === 0, go: 'review' },
      { ic: '📖', title: '学新词',
        badge: newCap === 0 ? '✓' : newDone + '/' + newCap,
        done: newCap === 0 || newDone >= newCap, go: 'new' },
      { ic: '🔤', title: '拼读练习', badge: phDone + '/5', done: phDone >= 5, go: 'phonics' },
      { ic: '🎮', title: '每日闯关', badge: Math.min(answered, goal) + '/' + goal, done: answered >= goal, go: 'quiz' },
      { ic: '🐾', title: '照顾宠物',
        badge: petNeed === 'feed' ? '饿了 🍖' : petNeed === 'wash' ? '要洗澡 🛁' : petNeed === 'play' ? '想玩了'
          : petNeed === 'food-missing' ? '没食物啦' : petNeed === 'soap-missing' ? '没香皂啦' : '✓',
        done: !petNeed, go: petNeed || 'pet-ok' }
    ];
  }

  function renderHome(v) {
    v = v || $('#view');
    v.innerHTML = '';
    updateStreak();
    petDecay();

    var d = dayStat();
    var total = (d.right || 0) + (d.wrong || 0);
    var acc = total ? Math.round(d.right / total * 100) : 0;
    var mood = petMood();

    /* --- 宠物卡 --- */
    var c1 = el('div', 'card');
    c1.innerHTML =
      '<div class="pet-wrap">' +
      '<div class="pet-stage">' +
        '<div class="pet-xp" title="经验值">' +
          '<span class="lvl-mini">Lv.' + S.pet.level + '</span>' +
          '<span class="bar xp"><i style="width:' + Math.round(S.pet.xp / xpNeed(S.pet.level) * 100) + '%"></i></span>' +
        '</div>' +
        '<div class="pet-canvas-wrap" id="pet-touch" title="点一点它"><canvas id="pet-cv" width="16" height="16"></canvas></div>' +
        '<div class="pet-stage-name">' + petStageName() + '</div>' +
      '</div>' +
      '<div class="pet-meta">' +
      '<div class="pet-name">' + esc(S.pet.name) +
      '<button id="btn-name" class="icon-btn" title="改名">✏️</button>' +
      '<span class="pet-say">' + mood.say + '</span></div>' +
      '<div class="pet-bars">' +
      barRow('🍖 饱食度 ' + Math.round(S.pet.sati) + '%', S.pet.sati, '',
        petAct('green', 'feed', '🍖', '喂食', S.pet.food)) +
      barRow('💗 心情 ' + Math.round(S.pet.mood) + '%', S.pet.mood, 'pink',
        petAct('blue', 'fun', '🎾', '玩耍', S.pet.toy)) +
      barRow('🛁 清洁度 ' + Math.round(S.pet.clean) + '%', S.pet.clean, 'blue',
        petAct('purple', 'wash', '🛁', '洗澡', S.pet.soap)) +
      '<div class="pet-hint">学单词得 🍖 · 拼读得 🎾 · 闯关得 🧼</div>' +
      '</div>' +
      '</div></div>';
    v.appendChild(c1);
    drawPet($('#pet-cv'), 'idle');
    startPetBlink();
    $('#pet-touch').onclick = touchPet;
    $('#btn-feed').onclick = feedPet;
    $('#btn-fun').onclick = playPet;
    $('#btn-wash').onclick = washPet;
    $('#btn-name').onclick = function () {
      var n = prompt('给宠物起个名字', S.pet.name);
      if (n && n.trim()) { S.pet.name = n.trim().slice(0, 10); save(); renderHome(); }
    };

    /* --- 今日任务 --- */
    var plan = dailyPlan();
    var doneN = plan.filter(function (t) { return t.done; }).length;
    var c2 = el('div', 'card');
    c2.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:baseline">' +
      '<h2 class="section" style="margin:0">今天的任务</h2>' +
      '<span class="pill">🔥 连续 <span class="n">' + (S.streak || 0) + '</span> 天 · ' + doneN + '/' + plan.length + '</span></div>' +
      '<div class="plan-list">' +
      plan.map(function (t, i) {
        return '<button class="plan-item' + (t.done ? ' done' : '') + '" data-pi="' + i + '">' +
          '<span class="pi-check">' + (t.done ? '✓' : '') + '</span>' +
          '<span class="pi-ic">' + t.ic + '</span>' +
          '<span class="pi-main"><span class="pi-title">' + t.title + '</span>' +
          (t.why ? '<span class="pi-why">' + t.why + '</span>' : '') + '</span>' +
          '<span class="pi-badge">' + t.badge + '</span></button>';
      }).join('') +
      '</div>' +
      '<div class="row" style="margin-top:12px;gap:9px;align-items:center">' +
      '<button class="btn big" id="btn-start">一键开练 🎮</button>' +
      '<span class="muted">正确率 ' + acc + '% · 今日 ' + Math.round((d.ms || 0) / 60000) + ' 分钟</span></div>';
    v.appendChild(c2);
    $$('#view .plan-item').forEach(function (b) {
      b.onclick = function () {
        var t = plan[+b.dataset.pi];
        if (t.go === 'review') {
          if (!t.done) { buildQueue('review'); go('play'); }
          else toast('今天的复习完成啦，明天再来～');
        } else if (t.go === 'new') {
          learnIdx = 0; go('learn');
        } else if (t.go === 'phonics') {
          go('phonics');
        } else if (t.go === 'quiz') {
          buildQueue('mixed'); go('play');
        } else if (t.go === 'feed') {
          feedPet();
        } else if (t.go === 'wash') {
          washPet();
        } else if (t.go === 'soap-missing') {
          toast('没有香皂了，先去闯关赚 🧼！');
          buildQueue('mixed'); go('play');
        } else if (t.go === 'play') {
          playPet();
        } else if (t.go === 'food-missing') {
          toast('没有食物了，先去闯关赚 🍖！');
          buildQueue('mixed'); go('play');
        }
      };
    });
    $('#btn-start').onclick = function () {
      var first = plan.filter(function (t) { return !t.done; })[0];
      if (!first) { buildQueue('mixed'); go('play'); return; }
      if (first.go === 'new') { learnIdx = 0; go('learn'); }
      else if (first.go === 'phonics') { go('phonics'); }
      else if (first.go === 'review') { buildQueue('review'); go('play'); }
      else { buildQueue('mixed'); go('play'); }
    };
  }

  /* ---------- LEARN ---------- */
  var learnIdx = 0;
  function renderLearn(v) {
    v = v || $('#view');
    v.innerHTML = '';
    var list = currentBookWords();
    if (!list.length) { v.appendChild(empty('这本课本还没有词表')); return; }
    if (learnIdx >= list.length) learnIdx = 0;
    var word = list[learnIdx];

    var pd = WORDS[word].pindu || [];
    var ipa = (WORDS[word].us && WORDS[word].us.ipa) || '';
    var phoneBlock = pd.length
      ? '<div class="phonics-blocks" id="wc-phon">' +
        pd.map(function (p, i) {
          return '<button class="pb pb-' + phonicsTagOf(p.letters || p.sound) + '" data-i="' + i + '">' +
            '<span class="l">' + esc(p.letters || p.sound) + '</span></button>';
        }).join('') +
        '</div>'
      : '';

    var c = el('div', 'card wordcard');
    c.innerHTML =
      '<div class="row" style="justify-content:space-between;margin-bottom:6px">' +
      '<span class="muted">' + BOOK_META[S.settings.book].label + ' · ' + (learnIdx + 1) + '/' + list.length + '</span>' +
      '<span class="pill">' + boxLabel(word) + '</span>' +
      '</div>' +
      '<div class="wc-visual">' + visualHtml(word, 76) + '</div>' +
      '<div class="wc-word">' + word + '</div>' +
      (S.settings.showIpa && ipa ? '<div class="wc-ipa">/' + ipa + '/</div>' : '') +
      phoneBlock +
      '<div class="wc-cn">' + meaningOf(word) + '</div>' +
      '<div class="row" style="justify-content:center;gap:12px;margin-top:14px">' +
      '<button class="speak-btn" id="s1">' + SPK + '</button>' +
      '<button class="speak-btn sm" id="s2" title="慢速">🐢</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:8px">点 🔊 听发音，点 🐢 听慢速' +
      (pd.length ? ' · 点彩色字块听每个音' : '') + '</div>';
    v.appendChild(c);

    $('#s1').onclick = function () { speakWord(word); };
    $('#s2').onclick = function () { slowWord(word); };
    $$('#wc-phon .pb').forEach(function (b) {
      b.onclick = function () { playPhoneme(word, +b.dataset.i, b); };
    });

    if (pd.length) {
      var c2 = el('div', 'card');
      c2.innerHTML = '<h2 class="section">拼一拼 · 连着读</h2>' +
        '<div class="pindu" id="pindu">' +
        pd.map(function (p, i) {
          return '<button data-i="' + i + '"><span class="letters">' + (p.letters || p.sound) + '</span></button>';
        }).join('') +
        '</div>' +
        '<div class="row" style="justify-content:center;margin-top:12px;gap:8px">' +
        '<button class="btn blue sm" id="pd-all">▶ 连读全部</button>' +
        '<button class="btn ghost sm" id="pd-word">🔊 整词</button>' +
        '</div>' +
        '<div class="muted" style="margin-top:8px">每个方块是一个发音，点一下听它怎么读</div>';
      v.appendChild(c2);
      $$('#pindu button').forEach(function (b) {
        b.onclick = function () { playPhoneme(word, +b.dataset.i, b); };
      });
      $('#pd-all').onclick = function () { playPhonemes(word); };
      $('#pd-word').onclick = function () { speakWord(word); };
    }

    var ex = (WORDS[word].examples || []).filter(function (e) { return e.en; });
    /* 按词数升序：短句（更简单）排前面，只展示最简单的两条 */
    ex.sort(function (a, b) { return a.en.split(/\s+/).length - b.en.split(/\s+/).length; });
    ex = ex.slice(0, 2);
    if (ex.length) {
      var c3 = el('div', 'card');
      c3.innerHTML = '<h2 class="section">在句子里认识它</h2>' +
        ex.map(function (e, i) {
          var hl = e.en.replace(new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig'),
            function (m) { return '<span style="color:var(--brand-dk);background:#fff0d6;border-radius:5px;padding:0 3px">' + m + '</span>'; });
          return '<div class="row" style="align-items:flex-start;gap:9px;margin-bottom:9px">' +
            '<button class="speak-btn sm" data-ex="' + i + '">' + SPK + '</button>' +
            '<div><div style="font-weight:800;font-size:16px">' + hl + '</div>' +
            '<div class="muted">' + (e.cn || '') + '</div></div></div>';
        }).join('');
      v.appendChild(c3);
      $$('#view [data-ex]').forEach(function (b) {
        b.onclick = function () { speakText(ex[+b.dataset.ex].en); };
      });
    }

    var c4 = el('div', 'card');
    c4.innerHTML = '<div class="row" style="gap:9px">' +
      '<button class="btn ghost" id="prev" style="flex:1;white-space:nowrap">← 上一个</button>' +
      '<button class="btn green" id="know" style="flex:1.4;white-space:nowrap">我记住了</button>' +
      '<button class="btn ghost" id="next" style="flex:1;white-space:nowrap">下一个 →</button>' +
      '</div>';
    v.appendChild(c4);
    $('#prev').onclick = function () { learnIdx = (learnIdx - 1 + list.length) % list.length; stopAudio(); render(); };
    $('#next').onclick = function () { learnIdx = (learnIdx + 1) % list.length; stopAudio(); render(); };
    $('#know').onclick = function () {
      grade(word, true); gainXp(3, 'food', 2); beep('ok'); toast('👍 记住了！获得 1 个 🍖');
      learnIdx = (learnIdx + 1) % list.length; stopAudio(); render();
    };
  }

  function boxLabel(word) {
    var st = S.words[word];
    if (!st || !st.seen) return '未学';
    return ['待复习', '第1档', '第2档', '第3档', '第4档', '已掌握'][boxFromS(st.s)];
  }

  function slowWord(word) {
    if (!window.speechSynthesis) return speakWord(word);
    stopAudio();
    var u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US'; u.rate = 0.45; u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  }

  function playPhoneme(word, i, btn) {
    var p = WORDS[word].pindu[i];
    if (!p) return;
    if (btn) {
      $$('#pindu button').forEach(function (b) { b.classList.remove('playing'); });
      btn.classList.add('playing');
      setTimeout(function () { btn.classList.remove('playing'); }, 700);
    }
    playRange(p.audio, 0, 0).then(function (ok) {
      if (!ok) speakFallback(p.sound);
    });
  }
  function playPhonemes(word) {
    var pd = WORDS[word].pindu || [];
    var i = 0;
    (function step() {
      if (i >= pd.length) return;
      var btns = $$('#pindu button');
      playPhoneme(word, i, btns[i]);
      i++;
      setTimeout(step, 620);
    })();
  }

  /* ---------- PHONICS 专项 ---------- */
  /* letters -> 短标签，用于字素块的配色 */
  var PHONIC_MAP = {};
  PHONICS.groups.forEach(function (g) {
    g.items.forEach(function (it) { PHONIC_MAP[it.letters] = g.id; });
  });
  var PB_TAG = { cons: 'c', vowel: 'v', cteam: 'ct', vteam: 'vt', rctrl: 'r', silent: 's' };
  function phonicsTagOf(letters) { return PB_TAG[PHONIC_MAP[letters]] || 'c'; }

  /* per-grapheme 练习统计 */
  function pstate(letters) {
    if (!S.phonics) S.phonics = {};
    if (!S.phonics[letters]) S.phonics[letters] = { seen: 0, right: 0, wrong: 0 };
    return S.phonics[letters];
  }
  function pgrade(letters, ok) {
    var st = pstate(letters);
    st.seen++; if (ok) st.right++; else st.wrong++;
    if (ok) { gainXp(1, 'toy'); dayStat().phonics = (dayStat().phonics || 0) + 1; }
    save();
  }

  var phMode = 'cards';       // cards | hear | see | build
  var phQuiz = null;          // {item, options, answered}
  var phBuild = null;         // {word, parts, picked}

  function allPhonemes() {
    var out = [];
    PHONICS.groups.forEach(function (g) { out = out.concat(g.items); });
    return out;
  }
  function phDistractors(item, n) {
    var pool = allPhonemes().filter(function (x) { return x.sound !== item.sound; });
    var sameKind = pool.filter(function (x) { return x.kind === item.kind; });
    var out = shuffle(sameKind).slice(0, n);
    if (out.length < n) out = out.concat(shuffle(pool.filter(function (x) { return out.indexOf(x) < 0; })).slice(0, n - out.length));
    return shuffle(out);
  }
  function phPlay(item, btn) {
    playRange(item.audio);
    if (btn) {
      btn.classList.add('playing');
      setTimeout(function () { btn.classList.remove('playing'); }, 700);
    }
  }
  function phOptionCard(it, extraCls) {
    return '<button class="ph-opt ' + (extraCls || '') + '" data-l="' + esc(it.letters) + '">' +
      '<span class="l pb-tag-' + PB_TAG[phonicsTagOf(it.letters)] + '">' + esc(it.letters) + '</span>' +
      '<span class="sp">' + SPK + '</span></button>';
  }

  function renderPhonics(v) {
    v = v || $('#view');
    v.innerHTML = '';
    if (!PHONICS.groups.length) { v.appendChild(empty('拼读数据还没生成')); return; }

    /* 模式选择 + 子视图容器（子玩法重渲染只刷 ph-body，不刷 segbar） */
    var seg = el('div', 'segbar');
    seg.innerHTML = [
      ['cards', '🗂 字素表'], ['hear', '👂 听音选字母'], ['see', '👀 见字选音'], ['build', '🧩 拆词拼读']
    ].map(function (m) {
      return '<button class="seg' + (phMode === m[0] ? ' on' : '') + '" data-m="' + m[0] + '">' + m[1] + '</button>';
    }).join('');
    v.appendChild(seg);
    $$('.seg', seg).forEach(function (b) {
      b.onclick = function () {
        stopAudio(); phMode = b.dataset.m; phQuiz = null; phBuild = null; renderPhonics(v);
      };
    });
    v.appendChild(el('div', '', '<div id="ph-body"></div>'));

    if (phMode === 'cards') renderPhCards($('#ph-body'));
    else if (phMode === 'hear') renderPhHear($('#ph-body'));
    else if (phMode === 'see') renderPhSee($('#ph-body'));
    else renderPhBuild($('#ph-body'));
  }

  /* 字素表：按组浏览点读 */
  function renderPhCards(v) {
    v.innerHTML = '';
    var intro = el('div', 'card');
    intro.innerHTML = '<div class="muted">这些是课本里 94 个词用到的全部字素。点一下听它怎么读，' +
      '颜色相同的读法相近。全程不用音标，靠耳朵记。</div>';
    v.appendChild(intro);
    PHONICS.groups.forEach(function (g) {
      var c = el('div', 'card');
      var chips = g.items.map(function (it) {
        var st = S.phonics && S.phonics[it.letters];
        var mastered = st && st.right >= 3 && st.right >= st.wrong * 2;
        return '<button class="ph-card' + (mastered ? ' done' : '') + '" data-l="' + esc(it.letters) + '">' +
          '<span class="l pb-tag-' + PB_TAG[g.id] + '">' + esc(it.letters) + '</span>' +
          '<span class="w">' + esc((it.words || [])[0] || '') + '</span></button>';
      }).join('');
      c.innerHTML = '<h2 class="section">' + esc(g.label) + ' <span class="muted">(' + g.items.length + ')</span></h2>' +
        '<div class="ph-grid">' + chips + '</div>' +
        (g.tip ? '<div class="muted" style="margin-top:8px">' + esc(g.tip) + '</div>' : '');
      v.appendChild(c);
      $$('.ph-card', c).forEach(function (b) {
        var it = g.items.filter(function (x) { return x.letters === b.dataset.l; })[0];
        b.onclick = function () { phPlay(it, b); };
      });
    });
  }

  /* 听音选字母：播声音 → 4 个字素里选 */
  function renderPhHear(v) {
    v.innerHTML = '';
    if (!phQuiz || phQuiz.mode !== 'hear') {
      var item = pick(allPhonemes());
      phQuiz = { mode: 'hear', item: item, options: shuffle([item].concat(phDistractors(item, 3))), answered: false };
    }
    var q = phQuiz;
    var c = el('div', 'card');
    c.innerHTML =
      '<h2 class="section">听一听，是哪个字母组合？</h2>' +
      '<button class="speak-btn big" id="ph-ask">' + SPK + '</button>' +
      '<div class="muted center" style="margin:6px 0 14px">点喇叭再听一遍</div>' +
      '<div class="ph-grid" id="ph-opts">' + q.options.map(function (o) { return phOptionCard(o); }).join('') + '</div>' +
      '<div id="ph-fb"></div>';
    v.appendChild(c);
    $('#ph-ask').onclick = function () { phPlay(q.item, $('#ph-ask')); };
    setTimeout(function () { phPlay(q.item, $('#ph-ask')); }, 350);
    $$('#ph-opts .ph-opt').forEach(function (b) {
      b.onclick = function () {
        if (q.answered) return;
        q.answered = true;
        var ok = b.dataset.l === q.item.letters;
        var chosen = q.options.filter(function (x) { return x.letters === b.dataset.l; })[0];
        phPlay(chosen, b);
        pgrade(q.item.letters, ok);
        b.classList.add(ok ? 'right' : 'wrong');
        $$('#ph-opts .ph-opt').forEach(function (x) {
          if (x.dataset.l === q.item.letters) x.classList.add('right');
        });
        var ex = (q.item.words || []).slice(0, 3);
        $('#ph-fb').innerHTML =
          '<div class="feedback ' + (ok ? 'ok' : 'no') + '" style="margin-top:12px">' +
          '<span class="ic">' + (ok ? '🎉' : '💪') + '</span>' +
          '<span>是 <b>' + esc(q.item.letters) + '</b>' + (ex.length ? ' · 如 ' + esc(ex.join(' / ')) : '') + '</span></div>' +
          '<button class="btn green big" id="ph-next" style="margin-top:10px">下一个 →</button>';
        $('#ph-next').onclick = function () { phQuiz = null; renderPhHear($('#ph-body')); };
      };
    });
  }

  /* 见字选音：看字素 → 4 段声音里选对的 */
  function renderPhSee(v) {
    v.innerHTML = '';
    if (!phQuiz || phQuiz.mode !== 'see') {
      var item = pick(allPhonemes());
      phQuiz = { mode: 'see', item: item, options: shuffle([item].concat(phDistractors(item, 3))), answered: false };
    }
    var q = phQuiz;
    var c = el('div', 'card');
    c.innerHTML =
      '<h2 class="section">这个字素读哪个音？</h2>' +
      '<div class="ph-ask-letter pb-tag-' + PB_TAG[phonicsTagOf(q.item.letters)] + '">' + esc(q.item.letters) + '</div>' +
      '<div class="muted center" style="margin:4px 0 14px">点一个喇叭听一听，选对的那个</div>' +
      '<div class="ph-grid" id="ph-opts">' +
      q.options.map(function (o) {
        return '<button class="ph-opt" data-l="' + esc(o.letters) + '"><span class="sp">🔊</span></button>';
      }).join('') + '</div>' +
      '<div id="ph-fb"></div>';
    v.appendChild(c);
    $$('#ph-opts .ph-opt').forEach(function (b) {
      b.onclick = function () {
        if (q.answered) return;
        q.answered = true;
        var ok = b.dataset.l === q.item.letters;
        var chosen = q.options.filter(function (x) { return x.letters === b.dataset.l; })[0];
        phPlay(chosen, b);
        pgrade(q.item.letters, ok);
        b.classList.add(ok ? 'right' : 'wrong');
        $$('#ph-opts .ph-opt').forEach(function (x) {
          if (x.dataset.l === q.item.letters) { x.classList.add('right'); x.innerHTML = '<span class="l pb-tag-' + PB_TAG[phonicsTagOf(x.dataset.l)] + '">' + esc(x.dataset.l) + '</span>'; }
        });
        var ex = (q.item.words || []).slice(0, 3);
        $('#ph-fb').innerHTML =
          '<div class="feedback ' + (ok ? 'ok' : 'no') + '" style="margin-top:12px">' +
          '<span class="ic">' + (ok ? '🎉' : '💪') + '</span>' +
          '<span><b>' + esc(q.item.letters) + '</b> 是第' + (q.options.indexOf(chosen) + 1) + '个音' + (ex.length ? ' · 如 ' + esc(ex.join(' / ')) : '') + '</span></div>' +
          '<button class="btn green big" id="ph-next" style="margin-top:10px">下一个 →</button>';
        $('#ph-next').onclick = function () { phQuiz = null; renderPhSee($('#ph-body')); };
      };
    });
  }

  /* 拆词拼读：把单词按音素顺序点出来 */
  function renderPhBuild(v) {
    v.innerHTML = '';
    var pool = currentBookWords().filter(function (w) {
      var pd = WORDS[w] && WORDS[w].pindu;
      return pd && pd.length >= 2 && pd.length <= 5;
    });
    if (!phBuild) {
      if (!pool.length) { v.appendChild(empty('这本课本暂时没有可拆的词')); return; }
      var w = pick(pool);
      var parts = WORDS[w].pindu.map(function (p, i) {
        return { letters: p.letters || p.sound, sound: p.sound, audio: p.audio, idx: i };
      });
      phBuild = { word: w, parts: parts, picked: [], queue: shuffle(parts.slice()) };
    }
    var b = phBuild;
    var done = b.picked.length === b.parts.length;
    var c = el('div', 'card');
    c.innerHTML =
      '<h2 class="section">把这个词的音按顺序点出来</h2>' +
      '<div class="wc-visual">' + visualHtml(b.word, 64) + '</div>' +
      '<div class="wc-word">' + b.word + '</div>' +
      '<div class="muted center" style="margin:2px 0 12px">从左到右，一个音一个音地点</div>' +
      '<div class="ph-build-slots" id="ph-slots">' +
      b.parts.map(function (p, i) {
        var got = b.picked[i];
        return '<span class="slot' + (got ? ' filled' : '') + '">' +
          (got ? '<span class="l pb-tag-' + PB_TAG[phonicsTagOf(got.letters)] + '">' + esc(got.letters) + '</span>' : (i + 1)) + '</span>';
      }).join('') + '</div>' +
      '<div class="ph-grid" id="ph-pool">' +
      (done ? '' : b.queue.map(function (p) {
        return '<button class="ph-opt" data-idx="' + p.idx + '"><span class="sp">🔊</span></button>';
      }).join('')) + '</div>' +
      '<div id="ph-fb"></div>';
    v.appendChild(c);

    if (!done) {
      $$('#ph-pool .ph-opt').forEach(function (btn) {
        btn.onclick = function () {
          var idx = +btn.dataset.idx;
          var p = b.parts[idx];
          phPlay(p, btn);
          if (p.idx === b.picked.length) {
            b.picked.push(p);
            btn.remove();
            if (b.picked.length === b.parts.length) {
              gainXp(1, 'toy');
              dayStat().phonics = (dayStat().phonics || 0) + 1;
              beep('ok');
              $('#ph-fb').innerHTML =
                '<div class="feedback ok" style="margin-top:12px">' +
                '<span class="ic">🎉</span><span><b>' + esc(b.word) + '</b> 拼出来啦！+1 🎾</span></div>' +
                '<button class="btn green big" id="ph-next" style="margin-top:10px">再拼一个 →</button>';
              $('#ph-next').onclick = function () { phBuild = null; renderPhBuild($('#ph-body')); };
              speakWord(b.word);
            } else {
              renderPhBuild(v);
            }
          } else if (b.picked.length && p.idx !== b.picked.length) {
            beep('no');
          }
        };
      });
    } else {
      $('#ph-fb').innerHTML = '<button class="btn green big" id="ph-next">再拼一个 →</button>';
      $('#ph-next').onclick = function () { phBuild = null; renderPhBuild($('#ph-body')); };
    }
  }

  /* ---------- PLAY ---------- */
  function renderPlay(v) {
    v = v || $('#view');
    v.innerHTML = '';
    if (!quiz.queue.length) buildQueue();
    if (quiz.idx >= quiz.queue.length) return renderPlayResult(v);

    var q = quiz.queue[quiz.idx];
    var word = q.word;
    var c = el('div', 'card');
    var prog = '<div class="q-progress">' + quiz.queue.map(function (_, i) {
      var r = quiz.results[i];
      return '<i class="' + (r == null ? (i === quiz.idx ? 'cur' : '') : r ? 'ok' : 'no') + '"></i>';
    }).join('') + '</div>';

    var prompt = '', big = '';
    if (q.mode === 'en2pic') { prompt = '选出这个单词的意思'; big = word; }
    else if (q.mode === 'pic2en') { prompt = '这张图是哪个单词？'; big = '<div style="font-size:64px;line-height:1">' + visualOf(word).emoji + (VISUALS[word] && VISUALS[word].glyph ? ' <span class="glyph-badge" style="display:inline-grid">' + VISUALS[word].glyph + '</span>' : '') + '</div>'; }
    else if (q.mode === 'listen2en') { prompt = '听一听，是哪个单词？'; big = '<button class="speak-btn" id="q-play">' + SPK + '</button>'; }
    else if (q.mode === 'en2cn') { prompt = '这个单词是什么意思？'; big = word; }
    else { prompt = '哪个单词是「' + meaningOf(word) + '」？'; big = '<div style="font-size:30px">' + meaningOf(word) + '</div>'; }

    c.innerHTML = prog + '<div class="q-prompt">' + prompt + '</div><div class="q-big">' + big + '</div>' +
      '<div class="opts" id="opts">' +
      q.opts.map(function (o, i) {
        var inner;
        // Only show what the question is actually testing. Chinese meanings are
        // revealed in the feedback block AFTER answering — otherwise the kid can
        // match picture/sound to the Chinese label and never touch the spelling,
        // which is exactly the "recognises the whole thing, not the word" trap.
        if (q.mode === 'en2cn') inner = '<span class="tx">' + meaningOf(o) + '</span>';
        else if (q.mode === 'en2pic') inner = visualHtml(o, 42);
        else inner = '<span class="tx">' + o + '</span>';
        return '<button class="opt" data-i="' + i + '">' + inner + '</button>';
      }).join('') +
      '</div><div id="fb"></div>';
    v.appendChild(c);

    if (q.mode === 'listen2en') {
      $('#q-play').onclick = function () { speakWord(word); };
      setTimeout(function () { speakWord(word); }, 320);
    } else if (q.mode === 'pic2en' || q.mode === 'en2pic') {
      // no auto-play; the word/picture is visible
    } else if (q.mode === 'cn2en') {
      setTimeout(function () { speakWord(word); }, 300);
    }

    $$('#opts .opt').forEach(function (b) {
      b.onclick = function () { answer(q, +b.dataset.i, b); };
    });

    var foot = el('div', 'card tight');
    foot.innerHTML = '<div class="row" style="gap:8px">' +
      '<button class="btn ghost sm" id="q-skip">跳过</button>' +
      '<span class="spacer"></span>' +
      '<span class="muted">第 ' + (quiz.idx + 1) + ' / ' + quiz.queue.length + ' 题</span>' +
      '</div>';
    v.appendChild(foot);
    $('#q-skip').onclick = function () { quiz.results[quiz.idx] = null; quiz.idx++; render(); };
  }

  function answer(q, i, btn) {
    var word = q.word;
    var chosen = q.opts[i];
    var ok = chosen === word;
    quiz.results[quiz.idx] = ok;
    $$('#opts .opt').forEach(function (b, bi) {
      if (q.opts[bi] === word) b.classList.add('right');
      else if (bi === i) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    grade(word, ok);
    if (ok) { gainXp(5, 'soap'); beep('ok'); }
    else { beep('no'); /* 答错不扣心情，低龄不惩罚 */ }
    save();

    var fb = $('#fb');
    fb.innerHTML =
      '<div class="feedback ' + (ok ? 'ok' : 'no') + '">' +
      '<span class="ic">' + (ok ? '🎉' : '💪') + '</span>' +
      '<span>' + (ok ? '答对啦！+1 🧼' : '答案是 ' + word) + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="speak-btn sm" id="fb-sp">' + SPK + '</button>' +
      '</div>' +
      // 中文释义在这里才揭晓：图 + 词形 + 词义 三个一起出现，把词义钉回词形上
      '<div class="reveal" id="rv">' + q.opts.map(function (o) {
        return '<div class="rv-row' + (o === word ? ' on' : '') + '" data-w="' + o + '">' +
          '<span class="em">' + visualOf(o).emoji + '</span>' +
          '<span class="w">' + o + '</span>' +
          '<span class="m">' + meaningOf(o) + '</span>' +
          '<span class="spacer"></span><span class="rv-sp">' + SPK + '</span>' +
          '</div>';
      }).join('') + '</div>' +
      '<button class="btn green big" id="fb-next" style="margin-top:12px">' +
      (quiz.idx + 1 >= quiz.queue.length ? '看看成绩 🏁' : '下一题 →') + '</button>';
    $('#fb-sp').onclick = function () { speakWord(word); };
    $$('#rv .rv-row').forEach(function (r) {
      r.onclick = function () { speakWord(r.dataset.w); };
    });
    if (!ok) setTimeout(function () { speakWord(word); }, 260);
    $('#fb-next').onclick = function () {
      timeTick(Date.now() - (quiz._t || Date.now()));
      quiz._t = Date.now();
      quiz.idx++;
      render();
    };
    quiz._t = quiz._t || Date.now();
  }

  function renderPlayResult(v) {
    v = v || $('#view');
    v.innerHTML = '';
    var res = quiz.results;
    var done = res.filter(function (r) { return r != null; });
    var right = done.filter(Boolean).length;
    var total = done.length;
    var acc = total ? Math.round(right / total * 100) : 0;
    timeTick(Date.now() - (quiz.sessionStart || Date.now()));

    var c = el('div', 'card center');
    c.innerHTML =
      '<div style="font-size:60px">' + (acc >= 90 ? '🏆' : acc >= 70 ? '🌟' : acc >= 50 ? '👍' : '💪') + '</div>' +
      '<div style="font-size:34px;font-weight:900;margin-top:4px">' + acc + '%</div>' +
      '<div class="muted">答对 ' + right + ' / ' + total + ' 题</div>' +
      '<div class="row" style="justify-content:center;gap:8px;margin-top:14px">' +
      '<span class="pill">🧼 +' + right + '</span>' +
      '<span class="pill">⭐ 经验 +' + right * 5 + '</span>' +
      '</div>';
    v.appendChild(c);

    var wrongs = quiz.queue.filter(function (q, i) { return res[i] === false; }).map(function (q) { return q.word; });
    if (wrongs.length) {
      var c2 = el('div', 'card');
      c2.innerHTML = '<h2 class="section">再练一遍这些</h2><div class="wtable">' +
        wrongs.map(function (w) { return '<span class="wpill b' + boxFromS(S.words[w].s) + '"><span class="dot"></span>' + w + '</span>'; }).join('') +
        '</div>';
      v.appendChild(c2);
    }

    var c3 = el('div', 'card');
    c3.innerHTML = '<div class="row" style="gap:9px">' +
      '<button class="btn ghost" id="r-home" style="flex:1">🏠 回首页</button>' +
      '<button class="btn" id="r-again" style="flex:1.4">再来一轮 🔁</button>' +
      '</div>';
    v.appendChild(c3);
    $('#r-home').onclick = function () {
      var p = $('.pet-stage .pet'); if (p) { p.classList.add('happy'); setTimeout(function () { p.classList.remove('happy'); }, 600); }
      go('home');
    };
    $('#r-again').onclick = function () { buildQueue(); render(); };
    beep(acc >= 70 ? 'ok' : 'tap');
  }

  /* ---------- STATS ---------- */
  function renderStats(v) {
    v = v || $('#view');
    v.innerHTML = '';
    var d = dayStat();
    var total = (d.right || 0) + (d.wrong || 0);
    var acc = total ? Math.round(d.right / total * 100) : 0;

    var c = el('div', 'card');
    c.innerHTML = '<h2 class="section">今天</h2><div class="stat-grid">' +
      stat(d.right || 0, '答对词数') +
      stat(acc + '%', '正确率') +
      stat(Math.round((d.ms || 0) / 60000) + '′', '学习时长') +
      '</div>';
    v.appendChild(c);

    var c2 = el('div', 'card');
    var days = [];
    for (var i = 27; i >= 0; i--) days.push(dayOffset(-i));
    var maxWords = Math.max(1, Math.max.apply(null, days.map(function (k) { return (S.days[k] && S.days[k].right) || 0; })));
    c2.innerHTML = '<h2 class="section">最近 28 天</h2>' +
      '<div class="heat">' + days.map(function (k) {
        var dd = S.days[k];
        var n = dd ? dd.right : 0;
        var lv = n === 0 ? 0 : n < maxWords * 0.25 ? 1 : n < maxWords * 0.5 ? 2 : n < maxWords * 0.75 ? 3 : 4;
        return '<i class="l' + lv + '" title="' + k + '：' + n + ' 词">' + (+k.slice(8)) + '</i>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px;gap:10px">' +
      '<span class="muted">🔥 连续打卡 <b style="color:var(--brand-dk)">' + (S.streak || 0) + '</b> 天</span>' +
      '<span class="muted">累计答词 <b style="color:var(--brand-dk)">' + Object.keys(S.words).reduce(function (a, k) { return a + S.words[k].right; }, 0) + '</b> 次</span>' +
      '</div>';
    v.appendChild(c2);

    var book = S.settings.book;
    var list = currentBookWords();
    var boxCount = [0, 0, 0, 0, 0, 0];
    list.forEach(function (w) {
      var st = S.words[w];
      boxCount[st ? boxFromS(st.s) : 0]++;
    });
    var mastered = boxCount[4] + boxCount[5];
    var c3 = el('div', 'card');
    c3.innerHTML = '<h2 class="section">' + BOOK_META[book].label + ' · 掌握进度 ' + mastered + '/' + list.length + '</h2>' +
      '<div class="bar"><i style="width:' + (list.length ? Math.round(mastered / list.length * 100) : 0) + '%"></i></div>' +
      '<div class="row wrap" style="gap:7px;margin-top:11px">' +
      boxCount.map(function (n, i) {
        return '<span class="wpill b' + i + '"><span class="dot"></span>' + ['未学', '1档', '2档', '3档', '4档', '掌握'][i] + ' ' + n + '</span>';
      }).join('') + '</div>';
    v.appendChild(c3);

    var c4 = el('div', 'card');
    c4.innerHTML = '<h2 class="section">词表详情（点一下听发音）</h2><div class="wtable" id="wt">' +
      list.map(function (w) {
        var st = S.words[w];
        return '<button class="wpill b' + (st ? boxFromS(st.s) : 0) + '" data-w="' + w + '"><span class="dot"></span>' + w + '</button>';
      }).join('') + '</div>';
    v.appendChild(c4);
    $$('#wt [data-w]').forEach(function (b) {
      b.onclick = function () { speakWord(b.dataset.w); };
    });
  }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }

  function empty(msg) {
    var c = el('div', 'card empty');
    c.innerHTML = '<span class="ic">🌱</span>' + msg;
    return c;
  }

  /* ---------- 设置（家长入口：教材管理 + 词库 + 宠物图鉴 + 家长设置）---------- */
  var settingsBookOpen = null;   // 当前展开词库的教材 key

  function openSettings() {
    closeSettings();
    stopAudio();
    var ov = el('div', 'modal-ov');
    ov.id = 'settings-modal';
    var sheet = el('div', 'modal-sheet');
    sheet.innerHTML =
      '<div class="modal-head"><span style="font-size:20px;font-weight:900">⚙️ 设置</span>' +
      '<button class="modal-x" id="set-x">✕</button></div>' +
      '<div id="set-body"></div>';
    ov.appendChild(sheet);
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSettings(); });
    $('#set-x').onclick = closeSettings;
    renderSettings();
  }

  function closeSettings() {
    var m = $('#settings-modal');
    if (m) m.remove();
  }

  function renderSettings() {
    var v = $('#set-body');
    if (!v) return;
    v.innerHTML = '';

    /* --- 教材与词库 --- */
    var c1 = el('div', 'card');
    c1.innerHTML = '<h2 class="section">教材与词库</h2>' +
      '<div class="muted" style="margin-bottom:10px">切换学习教材，或展开查看每本教材的完整词库</div>' +
      BOOK_ORDER.map(function (k) {
        var m = BOOK_META[k];
        var list = bookWords(k);
        var learned = list.filter(function (w) { return S.words[w] && S.words[w].seen; }).length;
        var cur = S.settings.book === k;
        return '<div class="bk-row' + (cur ? ' on' : '') + '">' +
          '<span class="bk-em">' + m.emoji + '</span>' +
          '<span class="bk-main"><b>' + m.label + '</b>' +
          '<span class="muted">词库 ' + list.length + ' 词 · 已学 ' + learned + '</span></span>' +
          (cur
            ? '<span class="chip on" style="pointer-events:none">使用中</span>'
            : '<button class="chip" data-setbk="' + k + '">切换</button>') +
          '<button class="chip" data-viewbk="' + k + '">' + (settingsBookOpen === k ? '收起 ▴' : '词库 ▾') + '</button>' +
          '</div>' +
          (settingsBookOpen === k
            ? '<div class="wtable" style="margin:2px 0 8px">' +
              (list.length ? list.map(function (w) {
                var st = S.words[w];
                return '<button class="wpill b' + (st ? boxFromS(st.s) : 0) + '" data-bw="' + w + '"><span class="dot"></span>' + w + '</button>';
              }).join('') : '<span class="muted">这本教材还没有词表</span>') + '</div>' +
              (k === 'g1b' ? '<div class="muted" style="margin:2px 0 10px">※ 一下词表为人工整理，欢迎对照课本指正</div>' : '')
            : '');
      }).join('') +
      '<div class="muted">词库里的词点一下可以听发音，颜色代表掌握程度（绿色越深越熟）。</div>';
    v.appendChild(c1);
    $$('#set-body [data-setbk]').forEach(function (b) {
      b.onclick = function () {
        S.settings.book = b.dataset.setbk; save();
        render(); renderSettings();
        toast('已切换到 ' + BOOK_META[b.dataset.setbk].label);
      };
    });
    $$('#set-body [data-viewbk]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.viewbk;
        settingsBookOpen = settingsBookOpen === k ? null : k;
        renderSettings();
      };
    });
    $$('#set-body [data-bw]').forEach(function (b) {
      b.onclick = function () { speakWord(b.dataset.bw); };
    });

    /* --- 宠物图鉴（各阶段预览）--- */
    var stages = [
      { i: 0, name: '蛋宝宝', lv: 'Lv.1 ~ 4' },
      { i: 1, name: '小绒球', lv: 'Lv.5 ~ 8' },
      { i: 2, name: '小龙崽', lv: 'Lv.9 ~ 12' },
      { i: 3, name: '小火龙', lv: 'Lv.13+' }
    ];
    var curStage = petStageIdx();
    var c2 = el('div', 'card');
    c2.innerHTML = '<h2 class="section">宠物图鉴 · 点一点看表情</h2>' +
      '<div class="pet-gallery">' +
      stages.map(function (s) {
        return '<div class="pg-item' + (s.i === curStage ? ' now' : '') + '">' +
          '<div class="pg-cvwrap" data-st="' + s.i + '"><canvas width="16" height="16" data-pgst="' + s.i + '"></canvas></div>' +
          '<b>' + s.name + '</b><span class="muted">' + s.lv + (s.i === curStage ? ' · 现在' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="muted" style="margin-top:10px">学单词得 🍖、拼读得 🎾、闯关得 🧼；照顾它都会涨经验，每 4 级进化一次，进化后长得不一样哦。</div>';
    v.appendChild(c2);
    $$('#set-body [data-pgst]').forEach(function (cv) {
      drawPet(cv, 'idle', +cv.dataset.pgst);
    });
    $$('#set-body .pg-cvwrap').forEach(function (w) {
      var st = +w.dataset.st;
      w.onclick = function () {
        var cv = w.querySelector('canvas');
        drawPet(cv, 'happy', st);
        beep('tap');
        setTimeout(function () { drawPet(cv, 'idle', st); }, 900);
      };
    });

    /* --- 家长设置 --- */
    var c3 = el('div', 'card');
    c3.innerHTML = '<h2 class="section">家长设置</h2>' +
      '<div class="row wrap" style="gap:8px">' +
      '<button class="btn ghost sm" id="set-accent">' + (S.settings.accent === 'uk' ? '🇬🇧 英音' : '🇺🇸 美音') + '</button>' +
      '<button class="btn ghost sm" id="ipa-toggle">' + (S.settings.showIpa ? '🔊 音标：开（点此关闭）' : '🔇 音标：关（一二年级建议）') + '</button>' +
      '</div>' +
      '<div class="row wrap" style="gap:8px;margin-top:9px;align-items:center">' +
      '<span class="muted">每日目标</span>' +
      '<button class="chip' + (S.settings.dailyGoal === 5 ? ' on' : '') + '" data-goal="5">5 词</button>' +
      '<button class="chip' + (S.settings.dailyGoal === 8 ? ' on' : '') + '" data-goal="8">8 词</button>' +
      '<button class="chip' + (S.settings.dailyGoal === 12 ? ' on' : '') + '" data-goal="12">12 词</button>' +
      '</div>' +
      '<div class="row wrap" style="gap:8px;margin-top:9px">' +
      '<button class="btn ghost sm" id="exp">⬇️ 导出进度</button>' +
      '<button class="btn ghost sm" id="imp">⬆️ 导入进度</button>' +
      '<button class="btn ghost sm" id="reset">🗑 清空重来</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:9px">一二年级不学音标，默认用彩色字素块代替；进度只保存在这台设备的浏览器里，换设备请用导出/导入。</div>';
    v.appendChild(c3);
    $('#set-accent').onclick = function () {
      S.settings.accent = S.settings.accent === 'uk' ? 'us' : 'uk'; save(); renderSettings();
      toast('已切换到' + (S.settings.accent === 'uk' ? '英式' : '美式') + '发音');
    };
    $$('#set-body [data-goal]').forEach(function (b) {
      b.onclick = function () { S.settings.dailyGoal = +b.dataset.goal; save(); renderSettings(); };
    });
    $('#ipa-toggle').onclick = function () {
      S.settings.showIpa = !S.settings.showIpa; save(); renderSettings();
      toast(S.settings.showIpa ? '已显示国际音标' : '已隐藏国际音标');
    };
    $('#exp').onclick = function () {
      var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kids-english-progress-' + today() + '.json';
      a.click();
      toast('已导出进度文件');
    };
    $('#imp').onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            S = deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(r.result));
            save(); render(); closeSettings(); toast('导入成功');
          } catch (e) { toast('文件读不了 😢'); }
        };
        r.readAsText(f);
      };
      inp.click();
    };
    $('#reset').onclick = function () {
      if (!confirm('确定清空所有学习进度？此操作不可恢复。')) return;
      localStorage.removeItem(KEY);
      S = JSON.parse(JSON.stringify(DEFAULT_STATE));
      save(); render(); closeSettings(); toast('已清空');
    };
  }

  /* ---------------- boot ---------------- */
  function boot() {
    document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
    renderTabs();
    var sb = $('#btn-settings');
    if (sb) sb.onclick = openSettings;
    updateStreak();

    // pet stats decay since last visit (real-time, capped at 72h)
    petDecay();
    save();
    setInterval(function () { petDecay(); save(); }, 60000);

    render();

    // unlock audio on first touch
    var unlock = function () { ac(); };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });

    // session timer
    var t0 = Date.now();
    setInterval(function () {
      var now = Date.now();
      timeTick(now - t0);
      t0 = now;
    }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

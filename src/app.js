/* =========================================================================
   Pixel Pet English — 皮克学英语 单词 + 句子理解 游戏化学习
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
  var KEY = 'pixel-pet-english-v1';
  var OLD_KEY = 'kids-english-v1';  // 重命名迁移：旧 key 数据一次性读出并搬过来后删除
  var DEFAULT_STATE = {
    words: {},          // word -> {box, due, seen, right, wrong}
    days: {},           // 'YYYY-MM-DD' -> {words, right, wrong, ms, lessons}
    pet: { name: '小火龙', species: 'dragon', level: 1, xp: 0, sati: 70, mood: 80, clean: 80, food: 0, toy: 0, soap: 0, fedTotal: 0, lastTick: 0, lastPlay: 0, petsDate: '', petsToday: 0, poop: { t: 0, n: 0 } },
    settings: { dailyGoal: 8, book: 'g1a', accent: 'us', autoNext: true, showIpa: false, asrKey: '', asrModel: 'XingChenAGI/XingChenASR-V3.2-Ultra' },
    hints: { swipe: 0 },   // 用过一次就记一笔：卡片可滑动这件事，提示两次就够了
    lastActive: null,
    streak: 0
  };

  var S = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      /* 一次性迁移：从旧 KEY (kids-english-v1) 读出后写到新 KEY 并删旧 key */
      if (!raw) {
        var oldRaw = localStorage.getItem(OLD_KEY);
        if (oldRaw) {
          localStorage.setItem(KEY, oldRaw);
          localStorage.removeItem(OLD_KEY);
          raw = oldRaw;
        }
      }
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      var s = JSON.parse(raw);
      var m = deepMerge(JSON.parse(JSON.stringify(DEFAULT_STATE)), s);
      /* v1 -> v2: energy 改名 sati，补 mood/lastTick */
      if (m.pet && m.pet.energy != null) { m.pet.sati = m.pet.energy; delete m.pet.energy; }
      if (m.pet && m.pet.mood == null) m.pet.mood = 80;
      if (m.pet && !m.pet.lastTick) m.pet.lastTick = Date.now();
      if (m.pet && !m.pet.poop) m.pet.poop = { t: 0, n: 0 };
      /* v3: 小熊猫改名小狐狸 */
      if (m.pet && m.pet.species === 'panda') m.pet.species = 'fox';
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
  /* 录音中的「停止」图标：实心方块，比 emoji ⏹ 在各系统上更稳 */
  var MIC_STOP = '<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block" aria-label="停止">' +
    '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';

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
      var poopN = (S.pet.poop && S.pet.poop.n) || 0;
      S.pet.clean = clamp(S.pet.clean - hrs * (1.5 + poopN * 1.2), 0, 100);  // 有便便不清会掉得更快
    }
    S.pet.lastTick = now;
  }

  function petStageIdx() { return Math.min(3, Math.floor((S.pet.level - 1) / 4)); }
  function petStageName() {
    var st = petStageIdx();
    return st === 0 ? '蛋宝宝' : curSpecies().stages[st - 1];
  }
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
    playAction('eat', 'eat', 1500); addFoodBowl(); spawnFx('meat', 1);
    renderHome();
  }

  function playPet() {
    petDecay();
    var now = Date.now();
    if (S.pet.toy <= 0) { toast('没有玩具了，去拼读练习赚 🎾 吧！'); return; }
    if (S.pet.sati < 15) { toast('饿得没力气玩了，先喂点吃的吧 🍖'); playAction('sad', 'sad', 900); return; }
    if (S.pet.lastPlay && now - S.pet.lastPlay < 90000) {
      toast('玩累啦，休息 ' + Math.ceil((90000 - (now - S.pet.lastPlay)) / 1000) + ' 秒再来～');
      return;
    }
    S.pet.lastPlay = now;
    S.pet.toy--;
    S.pet.sati = clamp(S.pet.sati - 4, 0, 100);
    gainXp(3, 0, 18);
    beep('ok');
    playFunRandom();
    renderHome();
  }

  function washPet() {
    petDecay();
    if (S.pet.soap <= 0) { toast('没有香皂了，去闯关赚 🧼 吧！'); return; }
    S.pet.soap--;
    S.pet.clean = clamp(S.pet.clean + 35, 0, 100);
    gainXp(2, 0, 4);
    beep('tap');
    playAction('wash', 'wash', 1600); spawnFx('bubble', 5);
    renderHome();
  }

  function touchPet() {
    var t = today();
    if (S.pet.petsDate !== t) { S.pet.petsDate = t; S.pet.petsToday = 0; }
    if (S.pet.petsToday >= 8) { toast('它被摸得毛都平啦，明天再来～'); return; }
    S.pet.petsToday++;
    gainXp(0, 0, 4);
    beep('tap');
    playAction('happy', 'happy', 700); spawnFx('heart', 1);
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

  /* ---- 像素精灵：16x16 字符画。O描边 B主体 S暗部 A点缀 W白 P粉（脸由表情系统叠加，图内不画眼嘴）
         阶段 0=蛋（共通+物种色斑点）；1=奶宝宝（头+身子+短腿，共通+物种耳饰）；2/3=各物种独立剪影 ---- */
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
    /* 奶宝宝：大头(12宽)明显宽于小身子(8宽)，脖子收窄、圆肚微鼓——经典 chibi 头身比（物种耳饰由 always 叠加） */
    baby: [
      '................',
      '....OOOOOOOO....',
      '...OBBBBBBBBO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '...OBBBBBBBBO...',
      '....OBBBBBBO....',
      '....OBBBBBBO....',
      '...OBAAAAAABO...',
      '....OBBBBBBO....',
      '...OBBO..OBBO...',
      '...OOO....OOO...',
      '................'
    ],
    /* 小龙崽：圆头+白口鼻+翼芽+尾尖（无角，避免牛感） */
    'dragon-2': [
      '................',
      '.....OOOOOO.....',
      '....OBBBBBBO....',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBWWWWWWWWBO..',
      '...OBWWWWWWBO...',
      '..OBBBBBBBBBBO..',
      'SSOBAAAAAAAABOSS',
      'SSOBAAAAAAAABOSS',
      '.SOBAAAAAAAABOS.',
      '..OBBBBBBBBBBO..',
      '...OBBBBBBBBOSS.',
      '...OBBO..OBBO...',
      '...OOO....OOO...'
    ],
    /* 小火龙：后掠角+白口鼻+大翼+尾刺，身形壮 */
    'dragon-3': [
      '.OA..........AO.',
      '..OAO......OAO..',
      '..OOBBBBBBBBBOO.',
      '.OBBBBBBBBBBBBO.',
      'OBBBBBBBBBBBBBBO',
      'OBBBBBBBBBBBBBBO',
      'OBBWWWWWWWWWBBBO',
      '.OBWWWWWWWWWBBO.',
      '.OBBAAAAAAAABBO.',
      'SSOBAAAAAAAABOSS',
      'SSOBAAAAAAAABOSS',
      '.SOBAAAAAAAABOS.',
      '..OBBBBBBBBBOSS.',
      '...OBBBBBBBBOSS.',
      '...OBBO..OBBO...',
      '...OOO....OOO...'
    ],
    /* 猫崽：尖耳+胡须点+环纹尾，坐姿 */
    'cat-2': [
      '..O..........O..',
      '.OBO........OBO.',
      '.OBBOOOOOOOOBBO.',
      '.OBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '..OABBBBBBBBAO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '...OBBBBBBBBO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBOSS',
      '...OBBBBBBBBOSS.',
      '...OAAO..OAAO...',
      '....OOO..OOO....'
    ],
    /* 大猫：满宽脸+腮须+胸斑+环纹尾，体格最大 */
    'cat-3': [
      '..O..........O..',
      '.OBO........OBO.',
      '.OBBOOOOOOOOBBO.',
      'OBBBBBBBBBBBBBBO',
      'OBBBBBBBBBBBBBBO',
      'OBBBBBBBBBBBBBBO',
      'OAABBBBBBBBBBAAO',
      '.OBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '..OBBAAAAAABBO..',
      '..OBBAAAAAABBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBOSS',
      '..OBBBBBBBBBBOBB',
      '..OSBBBBBBBSBOSS',
      '...OAAO.OAAO....'
    ],
    /* 狗崽：垂耳+口鼻+上翘尾 */
    'dog-2': [
      '....OOOOOOOO....',
      '..OOBBBBBBBBOO..',
      '.SSOBBBBBBBBBOSS',
      'SSOBBBBBBBBBBOSS',
      'SSOBBBBBBBBBBOSS',
      'SSOBBBBBBBBBBOSS',
      '.SOBBAAAAAABBO.S',
      '..OBBAAAAAABBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBOSS',
      '..OBBBBBBBBBBOSS',
      '...OBBBBBBBBO.S.',
      '...OBBBBBBBBO...',
      '....OOOOOOOO....',
      '...OAAO..OAAO...',
      '....OOO..OOO....'
    ],
    /* 大狗：长垂耳+大口鼻+壮硕身形 */
    'dog-3': [
      '.....OOOOOO.....',
      '...OOBBBBBBOO...',
      '.SSOBBBBBBBBBOSS',
      'SSOBBBBBBBBBBOSS',
      'SSOBBBBBBBBBBOSS',
      'SSOBBAAAAAABBOSS',
      '.SOBBAAAAAABBO.S',
      '..OBBAAAAAABBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBOSS',
      '..OBBBBBBBBBBOSS',
      '...OBBBBBBBBO...',
      '....OOOOOOOO....',
      '...OAAO..OAAO...',
      '....OOO..OOO....'
    ],
    /* 小狐狸：尖耳（深色耳尖）+白口鼻+白胸+粗尾 */
    'fox-2': [
      '....S......S....',
      '...OSSO..OSSO...',
      '..OBBBBBBBBBBO..',
      '.OBBBBBBBBBBBBO.',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBWWWWWWWWBO..',
      '..OBWWWWWWWWBO..',
      '..OBBBBBBBBBBO..',
      '..OBBWWWWWWBBO..',
      '..OBBWWWWWWBBOSS',
      '..OBBWWWWWWBBOSS',
      '..OBBBBBBBBBBOSS',
      '...OBBBBBBBOSSS.',
      '...OBBO..OBBO...',
      '...OOO....OOO...'
    ],
    /* 大尾巴狐：满宽脸+尖耳+白口鼻+白胸+缠身环纹粗尾 */
    'fox-3': [
      '...S........S...',
      '..OSSO....OSSO..',
      '.OBBBBBBBBBBBBO.',
      'OBBBBBBBBBBBBBBO',
      'OSSSBBBBBBBBSSSO',
      'OSSSBBBBBBBBSSSO',
      'OBWWWWWWWWWWWWBO',
      'OBWWWWWWWWWWWWBO',
      '.OBBAAAAAAAABBO.',
      '.OBBAAAAAAAABBO.',
      '..OBBAAAAAABBO..',
      '..OBBBBBBBBBBOSS',
      '..OBBBBBBBBBOSSS',
      '..OBBBBBBBBBOBBS',
      '...OBBBBBBBOSSS.',
      '...OAAO.OAAO....'
    ],
    /* ---- 侧面剪影（朝右，向左走时由 face-left 整体翻转）：脸右尾左，
          图内自带单点侧眼，走路时不再叠正面表情。仅 1 阶以上有 ---- */
    'baby-side': [
      '................',
      '.....OOOOOO.....',
      '...OOBBBBBBOO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBOOBBO..',
      '..OBBBBBBOOBBO..',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '.OBBAAAAAAAABO..',
      '.OBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'dragon-2-side': [
      '................',
      '.....OOOOOO.....',
      '...OOBBBBBBOO...',
      '..OBBBBBBBBBBO..',
      '.SOBBBBBBBBBBO..',
      '.SOBBBBBBOOBBO..',
      '.SOBBBBBBOOBBO..',
      '..OBBBBBBWWWBO..',
      '..OBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      'SOBBAAAAAAAABO..',
      'SOBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'dragon-3-side': [
      '................',
      '.....OOOOOO.....',
      'S..OOBBBBBBOO...',
      'SS.OBBBBBBBBBBO.',
      'SSOBBBBBBBBBBO..',
      'SSOBBBBBBOOBBO..',
      'SSOBBBBBBOOBBO..',
      '.SOBBBBBBWWWBO..',
      'SSOBBBBBBBBBBBO.',
      'SSOBBBBBBBBBBBO.',
      '.OBBAAAAAAAABBO.',
      '.OBBAAAAAAAABBO.',
      '.OBBBBBBBBBBBBO.',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'cat-2-side': [
      '................',
      '......O...O.....',
      '.....OBO.OBO....',
      '....OBBBOBBBO...',
      '....OBBBBBBBBO..',
      'S.OBBBBBBOOBBO..',
      'SSOBBBBBBOOBBO..',
      'SSOBBBBBBBBBBO..',
      '.SOBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '.OBBAAAAAAAABO..',
      '.OBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'cat-3-side': [
      '................',
      '.....O....O.....',
      '....OBO..OBO....',
      '...OBBBOOBBO....',
      'SS.OBBBBBBBBBBO.',
      'SSOBBBBBBBBOBBO.',
      'SSOBBBBBBBBOBBO.',
      '.SOBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '.OBBAAAAAAAAABO.',
      '.OBBAAAAAAAAABO.',
      '..OBBBBBBBBBBO..',
      '..OBBO....OBBO..',
      '..OBBO....OBBO..',
      '..OOO......OOO..'
    ],
    'dog-2-side': [
      '................',
      '.....OOOOOO.....',
      '...OOBBBBBSSO...',
      '..OBBBBBBBSSBO..',
      '..OBBBBBBBSSBO..',
      'SSOBBBBBBOOSSO..',
      'SSOBBBBBBOOSSO..',
      'SSOBBBBBBBBSSO..',
      '.SOBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '.OBBAAAAAAAABO..',
      '.OBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'dog-3-side': [
      '................',
      '.....OOOOOO.....',
      '...OOBBBBBSSO...',
      '..OBBBBBBBSSBO..',
      '.OBBBBBBBBSSBO..',
      'SSOBBBBBBBOSSO..',
      'SSOBBBBBBBOSSO..',
      '.SOBBBBBBBBSSO..',
      '.SOBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBBO.',
      '.OBBAAAAAAAABO..',
      '.OBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'fox-2-side': [
      '................',
      '......O...O.....',
      '.....OSS.OSS....',
      '....OBBBOBBSO...',
      '....OBBBBBBBBO..',
      'SSOBBBBBBOOBBO..',
      'WSOBBBBBBOOBBO..',
      'SSOBBBBBBWWWBO..',
      '.SSOBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '.OBBAAAAAAAABO..',
      '.OBBAAAAAAAABO..',
      '.OBBBBBBBBBBBO..',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ],
    'fox-3-side': [
      '................',
      '.....O....O.....',
      '....OSS..OSS....',
      '...OBBBSOBBSO...',
      '..OBBBBBBBBBBO..',
      'SSOBBBBBBOOBBO..',
      'WSOBBBBBBOOBBO..',
      'SSOBBBBBBWWWBO..',
      '.SSOBBBBBBBBBBO.',
      'SSOBBBBBBBBBBBO.',
      '.OBBAAAAAAAABBO.',
      '.OBBAAAAAAAABBO.',
      '.OBBBBBBBBBBBBO.',
      '..OBBO...OBBO...',
      '..OBBO...OBBO...',
      '..OOO.....OOO...'
    ]
  };
  var PET_PALETTES = {
    egg: { B: '#fff6e6', S: '#f0dfbd', A: '#f6c445' },
    baby: { B: '#ffe066', S: '#f2bd3a', A: '#ff9f43' },
    drake: { B: '#9ada9f', S: '#63b96f', A: '#ff8c69' },
    dragon: { B: '#ff9b73', S: '#e8653f', A: '#ffd166' },
    'cat-cream': { B: '#fdf3e3', S: '#e9d5b5', A: '#ffb3c1' },
    'cat-orange': { B: '#ffb066', S: '#e08a3e', A: '#fff1d6' },
    'cat-gray': { B: '#bfc9d4', S: '#93a1b0', A: '#ffd9e2' },
    'dog-cream': { B: '#f2ddb0', S: '#d9bc82', A: '#b0793f' },
    'dog-brown': { B: '#c9955e', S: '#a8743e', A: '#8a5a2b' },
    'dog-gold': { B: '#ecc06c', S: '#cc9c46', A: '#d96a6a' },
    'fox-rust': { B: '#d97e4c', S: '#b25a30', A: '#fdf0e0' },
    'fox-deep': { B: '#c66a3c', S: '#9c4e28', A: '#ffe9d6' },
    'fox-bright': { B: '#e88f5c', S: '#c26a3c', A: '#fff6ea' }
  };
  var PET_INK = '#33303a';
  var PET_WHITE = '#fffdf7', PET_PINK = '#e07a9a', PET_TEAR = '#6ec3ff';
  /* 表情锚点：每张画各自的眼睛左上角×2 / 嘴巴左上角（脸由 drawFace 叠加） */
  var PET_FACE = {
    egg: { eyes: [[4, 5], [10, 5]], mouth: [7, 8] },
    baby: { eyes: [[4, 4], [10, 4]], mouth: [7, 6] },
    'dragon-2': { eyes: [[4, 3], [10, 3]], mouth: [7, 6] },
    'dragon-3': { eyes: [[3, 4], [11, 4]], mouth: [7, 6] },
    'cat-2': { eyes: [[4, 4], [10, 4]], mouth: [7, 6] },
    'cat-3': { eyes: [[4, 4], [10, 4]], mouth: [7, 6] },
    'dog-2': { eyes: [[3, 4], [11, 4]], mouth: [7, 7] },
    'dog-3': { eyes: [[3, 4], [11, 4]], mouth: [7, 7] },
    'fox-2': { eyes: [[4, 4], [10, 4]], mouth: [7, 7] },
    'fox-3': { eyes: [[4, 4], [10, 4]], mouth: [7, 7] }
  };
  /* 表情几何：eye 形状 + 附加特征。各表情眼睛的形状/位置/大小都不同，差距拉满 */
  var PET_FACES = {
    idle:    { eye: 'open' },
    blink:   { eye: 'line' },
    sleep:   { eye: 'sleep', mouth: 'o' },
    droopy:  { eye: 'lid', mouth: 'frown' },
    happy:   { eye: 'arc', mouth: 'smile', blush: true },
    excited: { eye: 'big', mouth: 'open' },
    sad:     { eye: 'sad', mouth: 'frown', tear: true },
    eat:     { eye: 'squeeze', mouth: 'chew' },
    wash:    { eye: 'squeeze', mouth: 'flat', blush: true },
    grunt:   { eye: 'squeeze', mouth: 'grunt' }
  };
  /* 物种：阶段 0 蛋、1 奶宝宝（共通身体+always 物种耳饰/尾巴）；2/3 各自独立剪影 art[k]。
     always 只在第 1 阶叠加（2/3 剪影已含特征）。 */
  var PET_SPECIES = {
    dragon: { label: '小龙', emoji: '🐉', stages: ['小绒球', '小龙崽', '小火龙'],
      pals: ['baby', 'drake', 'dragon'], art: ['dragon-2', 'dragon-3'],
      always: { A: [[5, 0], [10, 0]],                     /* 角尖 */
                S: [[3, 9], [12, 9]],                     /* 翼芽（贴住收窄后的脖颈） */
                B: [[13, 11], [14, 12], [13, 12]] } },    /* 尾巴（贴住圆肚右缘） */
    cat: { label: '小猫', emoji: '🐱', stages: ['小奶猫', '猫崽', '大猫'],
      pals: ['cat-cream', 'cat-orange', 'cat-gray'], art: ['cat-2', 'cat-3'],
      always: { B: [[3, 0], [4, 1], [12, 0], [11, 1],     /* 尖耳 */
                    [13, 11], [14, 10], [15, 10], [15, 11], [15, 12], [14, 12]],
                A: [[3, 1], [12, 1]] } },                 /* 耳内粉 */
    dog: { label: '小狗', emoji: '🐶', stages: ['小奶狗', '狗崽', '大狗'],
      pals: ['dog-cream', 'dog-brown', 'dog-gold'], art: ['dog-2', 'dog-3'],
      always: { S: [[2, 3], [2, 4], [2, 5], [3, 4], [13, 3], [13, 4], [13, 5], [12, 4]] } },
    fox: { label: '小狐狸', emoji: '🦊', stages: ['小奶狐', '小狐狸', '大尾巴狐'],
      pals: ['fox-rust', 'fox-deep', 'fox-bright'], art: ['fox-2', 'fox-3'],
      always: { B: [[3, 0], [4, 1], [12, 0], [11, 1],
                    [13, 11], [14, 10], [15, 10], [15, 11], [15, 12], [14, 12]],
                A: [[3, 1], [12, 1], [14, 11]] } }        /* 耳内+白尾尖 */
  };
  function petSpeciesKey() { return (S.pet && S.pet.species) || 'dragon'; }
  function curSpecies() { return PET_SPECIES[petSpeciesKey()] || PET_SPECIES.dragon; }

  /* PNG 精灵帧（试点：GPT 生成的橘猫全套，scripts/process-pet-frames.py 加工）。
     贴图自带表情脸 → 不叠字符画表情层；走路用 7 帧侧影循环（原图朝右，
     与游戏朝向约定一致，向左走由 face-left 整体翻转）；蛋无 PNG 帧保留字符画。 */
  var PET_IMGS = window.__PET_IMGS__ || {};
  var PET_IMG_EL = {};
  Object.keys(PET_IMGS).forEach(function (k) {
    var im = new Image();
    im.onload = function () { PET_IMG_EL[k] = im; petDraw(); };   // 加载完刷新首页宠物
    im.src = PET_IMGS[k];
  });
  /* 每物种帧映射：stage=成长阶段主帧，expr=表情/动作→状态帧，walk=走路循环帧前缀 */
  var PET_FRAMES = {
    cat: { stage: { 1: 'cat-baby', 2: 'cat-kid', 3: 'cat-adult' },
           expr: { eat: 'cat-eat', sleep: 'cat-sleep', happy: 'cat-happy', excited: 'cat-big', big: 'cat-big' },
           walk: 'cat-walk-' }
  };

  var petAnim = { blinkTimer: null, dreamTimer: null, actionTimer: null, baseExpr: 'idle', actionExpr: null };
  /* stageOverride: 0蛋 1宝宝 2/3 物种剪影；缺省画当前宠物阶段（图鉴/试验台预览用）
     walking: 走路中 → 换用 *-side 侧面剪影（朝右画，向左走由 face-left 翻转），不叠正面表情 */
  function drawPet(cv, expr, stageOverride, walking) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;   // jsdom 等无 canvas 实现下静默跳过
    var px = cv.width / 16;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var stage = stageOverride == null ? petStageIdx() : stageOverride;
    var sp = curSpecies();
    var key = stage === 0 ? 'egg' : (stage === 1 ? 'baby' : (sp.art[stage - 2] || 'baby'));
    /* PNG 帧分支（试点物种）：统一 48×48 画布，底边对齐保持站地面一致 */
    var fr = PET_FRAMES[petSpeciesKey()];
    if (fr && stage >= 1) {
      var fk = null;
      if (walking && fr.walk && !petAnim.actionExpr) fk = fr.walk + (petWalk.frameIdx || 0);
      else fk = fr.expr[expr] || fr.stage[stage];
      var el = fk ? PET_IMG_EL[fk] : null;
      if (el) {
        if (cv.width !== 48) { cv.width = 48; cv.height = 48; }   // 设宽即清屏
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(el, Math.round((48 - el.width) / 2), 48 - el.height);
        return;
      }
    }
    var useSide = false;
    if (walking && stage >= 1) {
      var sk = key + '-side';
      if (PET_PIXELS[sk]) { key = sk; useSide = true; }
    }
    var art = PET_PIXELS[key] || PET_PIXELS.baby;
    var pal = stage === 0 ? PET_PALETTES.egg : PET_PALETTES[sp.pals[stage - 1]];

    function put(x, y, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * px, y * px, px, px);
    }
    function col(c) {
      if (c === 'O') return PET_INK;
      if (c === 'W') return PET_WHITE;
      if (c === 'P') return PET_PINK;
      return pal[c] || PET_INK;
    }
    /* base body */
    art.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var c = row[x];
        if (c === '.' || c === undefined) continue;
        put(x, y, col(c));
      }
    });
    /* 阶段 1 奶宝宝：叠物种耳/尾饰（阶段 2/3 剪影已含特征，不再叠加；侧影图自带特征） */
    if (stage === 1 && sp.always && !useSide) Object.keys(sp.always).forEach(function (k) {
      sp.always[k].forEach(function (p) { put(p[0], p[1], pal[k] || PET_INK); });
    });
    /* 蛋：叠物种斑点（用阶段 2 进化体主体色，蛋色暗示长大后的模样） */
    if (stage === 0) {
      var spot = (PET_PALETTES[sp.pals[1]] || PET_PALETTES.egg).B;
      [[4, 9], [11, 9], [6, 10], [9, 11], [5, 12]].forEach(function (p) { put(p[0], p[1], spot); });
    }
    /* face：每表情独立几何（眼睛形状/位置/大小 + 眉毛/腮红/泪滴/嘴型都不同）；侧影自带单眼不叠 */
    if (useSide) return;
    var f = PET_FACE[key] || PET_FACE.baby;
    var fc = PET_FACES[expr] || PET_FACES.idle;
    f.eyes.forEach(function (e, i) {
      var ax = e[0], ay = e[1];
      switch (fc.eye) {
        case 'line':                                   // 眨眼：下移一线
          put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK); break;
        case 'sleep':                                  // 睡着：上移闭眼线（与眨眼错位）
          put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK); break;
        case 'arc':                                    // 开心 ^：拱起三像素
          put(ax, ay, PET_INK); put(ax - 1, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK); break;
        case 'lid':                                    // 没劲：整眼下移 + 浅色眼皮压顶
          put(ax, ay + 1, pal.S); put(ax + 1, ay + 1, pal.S);
          put(ax, ay + 2, PET_INK); put(ax + 1, ay + 2, PET_INK); break;
        case 'big':                                    // 兴奋：3x2 大眼 + 白高光
          put(ax - 1, ay, PET_INK); put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK);
          put(ax - 1, ay + 1, PET_INK); put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK);
          put(ax + 1, ay, PET_WHITE); break;
        case 'sad':                                    // 难过：垂眼 + 内高八字眉
          put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK);
          put(i === 0 ? ax + 1 : ax, ay - 1, PET_INK); break;
        case 'squeeze':                                // 吃饭/搓澡/用力：眯起
          put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK); break;
        default:                                       // open：普通圆眼
          put(ax, ay, PET_INK); put(ax + 1, ay, PET_INK);
          put(ax, ay + 1, PET_INK); put(ax + 1, ay + 1, PET_INK);
      }
    });
    if (fc.blush) {   // 腮红：两眼外下侧
      put(f.eyes[0][0] - 1, f.eyes[0][1] + 2, PET_PINK);
      put(f.eyes[1][0] + 2, f.eyes[1][1] + 2, PET_PINK);
    }
    if (fc.tear) {    // 泪滴：左眼下两像素
      put(f.eyes[0][0], f.eyes[0][1] + 2, PET_TEAR);
      put(f.eyes[0][0], f.eyes[0][1] + 3, PET_TEAR);
    }
    /* 开心到眯眼：^ 眼的内眼角顺弧垂到嘴角（只补桥接点，不再与眼翅平行描线） */
    if (fc.eye === 'arc' && fc.mouth === 'smile') {
      function smileLine(sx, sy, tx, ty) {   // 短距直线插值描点
        var n = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
        for (var i = 1; i <= n; i++) {
          var t = i / n;
          put(Math.round(sx + (tx - sx) * t), Math.round(sy + (ty - sy) * t), PET_INK);
        }
      }
      smileLine(f.eyes[0][0] + 1, f.eyes[0][1] + 1, f.mouth[0] - 1, f.mouth[1]);
      smileLine(f.eyes[1][0] - 1, f.eyes[1][1] + 1, f.mouth[0] + 2, f.mouth[1]);
    }
    var mx = f.mouth[0], my = f.mouth[1];
    switch (fc.mouth) {
      case 'smile':    // 开心：宽笑弧
        put(mx - 1, my, PET_INK); put(mx + 2, my, PET_INK);
        put(mx, my + 1, PET_INK); put(mx + 1, my + 1, PET_INK); break;
      case 'open':     // 兴奋：咧嘴笑 + 舌头
        put(mx - 1, my, PET_INK); put(mx, my, PET_INK); put(mx + 1, my, PET_INK); put(mx + 2, my, PET_INK);
        put(mx, my + 1, PET_PINK); put(mx + 1, my + 1, PET_PINK); break;
      case 'frown':    // 难过：倒弧
        put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
        put(mx - 1, my + 1, PET_INK); put(mx + 2, my + 1, PET_INK); break;
      case 'o':        // 睡着：小圆嘴
        put(mx, my + 1, PET_PINK); put(mx + 1, my + 1, PET_PINK); break;
      case 'chew':     // 吃饭：嚼动嘴
        put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
        put(mx, my + 1, PET_INK); put(mx + 1, my + 1, PET_PINK); break;
      case 'grunt':    // 用力：大张口
        put(mx - 1, my + 1, PET_INK); put(mx, my + 1, PET_INK); put(mx + 1, my + 1, PET_INK); put(mx + 2, my + 1, PET_INK);
        put(mx, my + 2, PET_PINK); put(mx + 1, my + 2, PET_PINK); break;
      default:         // idle/flat：平线
        put(mx, my, PET_INK); put(mx + 1, my, PET_INK);
    }
  }
  /* 双层动画调度：常驻基调（数值驱动）+ 即时表演（交互触发）。两层共用 drawPet。
     applyPetLayer 每次只保留一个动作类，类互斥，避免 CSS animation 叠加冲突。 */
  var PET_CLASSES = ['eat', 'happy', 'sad', 'wash', 'dance', 'prop', 'poop',
    'base-drowsy', 'base-hyper', 'base-low'];
  function petDraw() {
    var c = $('#pet-cv');
    if (!c) return;
    var t = $('#pet-touch');
    var walking = !!(t && t.classList.contains('walking'));
    drawPet(c, petAnim.actionExpr || petAnim.baseExpr, null, walking);
  }
  function applyPetLayer(cls, expr, transient) {
    var w = $('#pet-touch');
    if (w) PET_CLASSES.forEach(function (k) { w.classList.remove(k); });
    if (cls && w) w.classList.add(cls);
    if (w) w.classList.remove('walking');   // 表演优先，停止步态（位移过渡自然走完）
    petAnim.actionExpr = transient ? expr : null;
    if (!transient) petAnim.baseExpr = expr;
    petDraw();
  }
  /* 常驻基调：按 sati/mood/clean 推导待机外观与动作循环 */
  function petMoodState() {
    var sa = S.pet.sati, cl = S.pet.clean, m = S.pet.mood;
    if (m < 45) return 'drowsy';                        // 无聊 → 打瞌睡
    if (sa < 40 || cl < 40) return 'low';               // 饿/脏 → 没精打采
    if (sa >= 75 && cl >= 75 && m >= 75) return 'hyper';// 三值都高 → 亢奋走动
    return 'content';
  }
  var PET_BASE = {
    drowsy: { cls: 'base-drowsy', expr: 'sleep' },
    low:    { cls: 'base-low',    expr: 'droopy' },
    hyper:  { cls: 'base-hyper',  expr: 'excited' },
    content:{ cls: null,          expr: 'idle' }
  };
  function setFromMood() {
    var b = PET_BASE[petMoodState()];
    applyPetLayer(b.cls, b.expr, false);
  }
  /* 即时表演：播完自动回落到当前常驻基调 */
  function playAction(cls, expr, ms) {
    applyPetLayer(cls, expr, true);
    clearTimeout(petAnim.actionTimer);
    petAnim.actionTimer = setTimeout(setFromMood, ms || 1200);
  }
  /* ---- 像素风特效精灵：与宠物同一套字符画（. 透明），canvas 原生尺寸绘制、CSS 放大 ---- */
  var FX_SPRITES = {
    poop: { pal: { B: '#8a562b', D: '#6e4321' }, rows: [
      '...BB...',
      '..BBBB..',
      '..BDDB..',
      '.BBBBBB.',
      '.BDBDDB.',
      'BBBBBBBB',
      'BBDBDDBB',
      'BBBBBBBB'
    ] },
    meat: { pal: { M: '#ef8a76', W: '#fff6ea' }, rows: [
      '..MMMM..',
      '.MMMMMM.',
      '.MMMMMM.',
      '..MMMM..',
      '....WW..',
      '....WW..'
    ] },
    bowl: { pal: { W: '#fffdf6', B: '#4a7fc1', b: '#35619c' }, rows: [
      '..WWWWWW..',
      '.WWWWWWWW.',
      'WWWWWWWWWW',
      '.BBBBBBBB.',
      '.BBbBBbBB.',
      '..BBBBBB..',
      '...BBBB...'
    ] },
    bubble: { pal: { B: '#8fd3ff', W: '#eaf8ff' }, rows: [
      '.BBB.',
      'BW..B',
      'B...B',
      'B...B',
      '.BBB.'
    ] },
    heart: { pal: { R: '#ff7ba9', W: '#ffd3e2' }, rows: [
      '.RR.RR.',
      'RRWRRRR',
      'RRRRRRR',
      '.RRRRR.',
      '..RRR..',
      '...R...'
    ] },
    zzz: { pal: { Z: '#9fb7ff', S: '#c3d3ff' }, rows: [
      'ZZZZ....',
      '...Z....',
      '..Z.....',
      'ZZZZ.SSS',
      '.......S',
      '.....SSS'
    ] },
    note: { pal: { N: '#8a6bff' }, rows: [
      '...NN.',
      '...N.N',
      '...N..',
      '...N..',
      '..NN..',
      '..NN..'
    ] },
    teddy: { pal: { B: '#b98a5a', E: '#33303a', W: '#e8cba8' }, rows: [
      '.B...B.',
      'BBB.BBB',
      '.BBBBB.',
      '.BEBEB.',
      '.BWWWB.',
      '..BBB..'
    ] },
    balloon: { pal: { R: '#ff5c5c', W: '#ffb3b3', T: '#8a6d4a' }, rows: [
      '..RRR..',
      '.RWRRR.',
      '.RRRRR.',
      '.RRRRR.',
      '..RRR..',
      '...T...',
      '...T...'
    ] },
    drum: { pal: { A: '#f6c445', R: '#e2574c', D: '#7a3b35' }, rows: [
      '.AAAAA.',
      'RRRRRRR',
      'RDRDRDR',
      'RRRRRRR',
      '.AAAAA.'
    ] },
    yarn: { pal: { P: '#7ec4e8', d: '#4a90b8' }, rows: [
      '..PPP..',
      '.PdPPP.',
      'PPPdPPP',
      '.PPdPP.',
      '..PPP..',
      '...d...'
    ] },
    horn: { pal: { G: '#f2b13c' }, rows: [
      '..G....',
      '..GG...',
      'GGGGGGG',
      '..GG...',
      '..G....'
    ] },
    kite: { pal: { K: '#4aa8ff', W: '#ffe066', T: '#c98a3d' }, rows: [
      '...K...',
      '..KWK..',
      '.KKKKK.',
      '..KKK..',
      '...K...',
      '...T...',
      '....T..'
    ] }
  };
  /* 画一个精灵到独立 canvas（原生像素尺寸），CSS 尺寸 = scale 倍 + pixelated 保持硬边 */
  function fxSpriteCanvas(name, scale) {
    var spr = FX_SPRITES[name]; if (!spr) return null;
    var cv = document.createElement('canvas');
    cv.width = spr.rows[0].length; cv.height = spr.rows.length;
    var ctx = cv.getContext('2d'); if (!ctx) return null;   // 无 canvas 实现下静默跳过
    for (var y = 0; y < spr.rows.length; y++) {
      for (var x = 0; x < spr.rows[y].length; x++) {
        var c = spr.rows[y][x];
        if (c === '.' || c === undefined) continue;
        ctx.fillStyle = spr.pal[c] || PET_INK;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    cv.style.width = (cv.width * scale) + 'px';
    cv.style.height = (cv.height * scale) + 'px';
    return cv;
  }
  /* 通用浮动特效：间隔上浮多个像素精灵（音符/泡泡/爱心/道具…）。
     wrapSel 缺省挂在首页宠物上；试验台传 '#tb-cvwrap' 就地播放 */
  function spawnFx(name, times, wrapSel) {
    var wrap = $(wrapSel || '#pet-touch'); if (!wrap) return;
    for (var i = 0; i < times; i++) (function (nm) {
      setTimeout(function () {
        var cv = fxSpriteCanvas(nm, 3);
        if (!cv) return;
        cv.className = 'fx';
        cv.style.left = (14 + Math.random() * 60) + 'px';
        wrap.appendChild(cv);
        setTimeout(function () { cv.remove(); }, 1250);
      }, i * 130);
    })(name);
  }
  /* 喂食：像素饭盆从天而降，宠物低头进食（配合 eat 表情 + chomp 吞咽） */
  function addFoodBowl(wrapSel) {
    var wrap = $(wrapSel || '#pet-touch'); if (!wrap) return;
    var cv = fxSpriteCanvas('bowl', 3);
    if (!cv) return;
    cv.className = 'fx food-drop';
    cv.style.left = '36%';
    wrap.appendChild(cv);
    setTimeout(function () { cv.remove(); }, 1650);
  }
  /* ---- 行走系统：定位层 #pet-pos 由 JS 驱动在舞台内散步，朝向自动翻转；
          走着走着随机停下掏道具/开心跳，拉屎也先走到角落再蹲下 ---- */
  var petWalk = { x: 90, y: 54, moving: false, timer: null };
  function petWalkTo(x, y, dur, cb) {
    var pos = $('#pet-pos');
    if (!pos) { if (cb) cb(); return; }
    var goLeft = x < petWalk.x;
    petWalk.x = x; petWalk.y = y;
    petWalk.moving = true;
    pos.classList.toggle('face-left', goLeft);
    pos.style.transition = 'left ' + dur + 'ms ease-in-out, top ' + dur + 'ms ease-in-out';
    pos.style.left = x + 'px'; pos.style.top = y + 'px';
    var t = $('#pet-touch');
    if (t) t.classList.add('walking');
    petWalk.frameIdx = 0;
    clearInterval(petWalk.frameTimer);
    petWalk.frameTimer = setInterval(function () {       // 7 帧走路循环（PNG 物种；字符画物种重复绘制同图无副作用）
      petWalk.frameIdx = ((petWalk.frameIdx || 0) + 1) % 7;
      petDraw();
    }, 110);
    petDraw();                                           // 立刻换走路帧
    setTimeout(function () {
      clearInterval(petWalk.frameTimer);
      petWalk.moving = false;
      var w2 = $('#pet-touch');
      if (w2) { w2.classList.remove('walking'); petDraw(); }   // 回正面
      if (cb) cb();
    }, dur + 40);
  }
  /* 走到位后的随机小事件：掏道具（含饭盆） / 开心跳 */
  function petWalkArrive() {
    var r = Math.random();
    if (r < 0.24) { playAction('prop', 'happy', 1200); spawnFx(pick(['teddy', 'balloon', 'drum', 'yarn', 'horn', 'kite', 'bowl']), 1); }
    else if (r < 0.36) { playAction('happy', 'happy', 900); spawnFx('heart', 1); }
  }
  function petRoamTick() {
    if (petWalk.moving || petAnim.actionExpr || document.hidden) return;
    var m = petMoodState();
    if (m !== 'content' && m !== 'hyper') return;   // 睡着/没劲不溜达
    if (Math.random() < 0.45) return;               // 有时就想站着发呆
    var x = 12 + Math.round(Math.random() * 156);   // 舞台活动范围
    var y = 32 + Math.round(Math.random() * 56);
    petWalkTo(x, y, 900 + Math.round(Math.random() * 900), petWalkArrive);
  }
  function startPetRoam() {
    clearInterval(petWalk.timer);
    petWalk.timer = setInterval(petRoamTick, 3800);
  }
  /* 打瞌睡常驻态下周期性飘出 💤 梦境泡 */
  function startPetDream() {
    clearInterval(petAnim.dreamTimer);
    petAnim.dreamTimer = setInterval(function () {
      if (petAnim.baseExpr !== 'sleep' || petAnim.actionExpr) return;
      spawnFx('zzz', 1);
    }, 4200);
  }
  /* ---- 玩耍随机分支：偶尔跳舞 / 掏出奇怪道具 ---- */
  function playFunRandom() {
    var r = Math.random();
    if (r < 0.3) { playAction('dance', 'excited', 1500); spawnFx('note', 3); }
    else if (r < 0.5) { playAction('prop', 'happy', 1200); spawnFx(pick(['teddy', 'balloon', 'drum', 'yarn', 'horn', 'kite']), 1); }
    else { playAction('happy', 'happy', 1300); spawnFx('heart', 1); }
  }
  /* ---- 拉屎（完整数值版）：饱了才拉、先蹲下预告；滞留便会使清洁掉得更快 ---- */
  function petPoopRoll() {
    if (!S.pet.poop) S.pet.poop = { t: 0, n: 0 };
    if (S.pet.poop.n >= 3) return;
    if (S.pet.sati < 50) return;
    var now = Date.now();
    if (now - (S.pet.poop.t || 0) < 45 * 60000) return;
    if (Math.random() > 0.55) return;
    S.pet.poop.t = now;
    /* 先溜达到舞台一角，再蹲下用力 */
    petWalkTo(30 + Math.round(Math.random() * 110), 88, 1600, function () {
      playAction('poop', 'grunt', 1200);            // 预告：蹲 + 用力表情
      setTimeout(function () { dropPoop(); }, 1100);
    });
  }
  function dropPoop() {
    S.pet.poop.n = Math.min(3, (S.pet.poop.n || 0) + 1);
    toast(S.pet.name + ' 悄悄拉了粑粑，点它或洗澡清理吧');
    renderHome();
    save();
  }
  function renderPoops() {
    if (!S.pet.poop) S.pet.poop = { t: 0, n: 0 };
    var stage = $('.pet-stage'); if (!stage) return;
    $$('.pet-poop', stage).forEach(function (n) { n.remove(); });
    for (var i = 0; i < S.pet.poop.n; i++) {
      var p = document.createElement('button');
      p.className = 'pet-poop';
      var cv = fxSpriteCanvas('poop', 3);
      if (cv) p.appendChild(cv);
      p.style.right = (16 + i * 34) + 'px';
      p.onclick = cleanPoop;
      stage.appendChild(p);
    }
  }
  function cleanPoop() {
    var n = S.pet.poop.n || 0;
    if (!n) return;
    S.pet.poop.n = 0; S.pet.poop.t = Date.now();
    S.pet.clean = clamp(S.pet.clean + 4 * n, 0, 100);
    gainMood(3 * n);
    beep('ok');
    toast('帮你清理干净啦，' + S.pet.name + ' 舒坦多了！');
    renderHome();
    save();
  }
  function startPetBlink() {
    clearInterval(petAnim.blinkTimer);
    petAnim.blinkTimer = setInterval(function () {
      var cv = $('#pet-cv');
      if (!cv) return;
      if (petAnim.actionExpr) return;               // 即时表演中不插
      if (petAnim.baseExpr !== 'idle' && petAnim.baseExpr !== 'excited') return; // 常驻闭眼/低落不插
      var tw = $('#pet-touch');
      if (tw && tw.classList.contains('walking')) return;   // 走路侧影不叠眨眼
      var cur = petAnim.baseExpr;
      drawPet(cv, 'blink');
      setTimeout(function () {
        var c = $('#pet-cv');
        if (c && !petAnim.actionExpr && petAnim.baseExpr === cur) drawPet(c, cur);
      }, 170);
    }, 3400 + Math.floor(Math.random() * 1600));
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
    /* 摇晃提示按「进入学单词 tab」计次，不按卡片重绘计次（跟读一次就会重绘） */
    if (id === 'learn' && tab !== 'learn') armSwipeHint();
    /* 离开学单词 tab：停掉可能还在录的识别器（含下载中/录音中），防切走后串台 */
    if (tab === 'learn' && id !== 'learn') abandonLearnMic();
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
        '<div id="pet-pos" style="left:' + petWalk.x + 'px;top:' + petWalk.y + 'px">' +
        '<div class="pet-canvas-wrap" id="pet-touch" title="点一点它"><canvas id="pet-cv" width="16" height="16"></canvas></div>' +
        '</div>' +
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
    setFromMood();
    startPetBlink();
    startPetDream();
    startPetRoam();
    renderPoops();
    $('#pet-touch').onclick = touchPet;
    petPoopRoll();
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
          enterTodayMode();
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
      if (first.go === 'new') { enterTodayMode(); }
      else if (first.go === 'phonics') { go('phonics'); }
      else if (first.go === 'review') { buildQueue('review'); go('play'); }
      else { buildQueue('mixed'); go('play'); }
    };
  }

  /* ---------- LEARN ---------- */
  var learnIdx = 0;            // 全部词库模式下的当前游标
  var learnMode = 'today';      // 'today' = 今日关卡（默认），'browse' = 全部词库
  var learnQueue = [];          // 今日关卡的词序列（用户级关卡进度，不入 storage）
  var learnPos = 0;             // 今日关卡当前第几个词
  var learnHits = {};           // { 队列下标: 已命中次数 }，左右滑回看时保留进度
  var learnPassed = {};         // { 队列下标: true }，已通过并计过分的词
  var learnBusy = false;        // 录音进行中，避免重复触发
  var learnFinalWords = [];     // 最近一次识别结果（累积命中判定）
  var learnTimer = null;        // 8s 兜底超时的句柄，必须可清除
  var learnHitScored = false;   // 本次录音是否已判定命中（避免 onend 重复弹提示）
  var learnSession = 0;         // 每次 start 自增；过期的 onend 直接作废，避免翻词后串台
  var learnEnded = true;        // 本次录音是否已真正结束（onend 触发）；用于兜底检测「卡死」
  var learnStartTs = 0;         // 本次录音开始时间（诊断：区分「几乎没录上」vs「听了没声音」）
  var learnEngine = 'sf';       // 当前一轮录音走的引擎：仅硅基流动云端 ASR（'sf'）
  var learnEnterDir = 0;        // 新卡入场方向：1=从右（左滑后）、-1=从左（右滑后）
  var HITS_GOAL = 2;            // 跟读几次算通过
  var SWIPE_HINT_MAX = 2;       // 「卡片能滑」这件事最多提示两次
  var learnHintPending = false; // 本次进入 tab 是否还没用过摇晃提示
  function renderLearn(v) {
    v = v || $('#view');
    v.innerHTML = '';
    if (learnMode === 'today') return renderLearnToday(v);
    return renderLearnBrowse(v);
  }
  /* ---------- 滑动提示：头两次进页面晃一下 ---------- */
  /* 孩子不知道卡片能左右滑。进入 tab 时预置一次提示，卡片真正渲染出来才播放并计数；
     一旦他自己滑成功过，就直接记满，后面不再打扰。 */
  function armSwipeHint() {
    learnHintPending = swipeHintLeft() > 0;
  }
  function swipeHintLeft() {
    var n = (S.hints && S.hints.swipe) || 0;
    return Math.max(0, SWIPE_HINT_MAX - n);
  }
  function markSwipeLearned() {
    if (!S.hints) S.hints = { swipe: 0 };
    if (S.hints.swipe >= SWIPE_HINT_MAX) return;
    S.hints.swipe = SWIPE_HINT_MAX;
    save();
  }
  function playSwipeHint(card) {
    if (!learnHintPending) return;
    if (learnQueue.length < 2) return;   // 只有一个词没什么可滑的，这次额度先留着
    learnHintPending = false;
    if (!S.hints) S.hints = { swipe: 0 };
    S.hints.swipe++; save();
    /* 等入场动画（.26s）走完再晃，两个 transform 动画会互相覆盖 */
    setTimeout(function () {
      if (!card.isConnected) return;
      card.classList.add('swipe-hint');
      setTimeout(function () { card.classList.remove('swipe-hint'); }, 1400);
    }, 320);
  }
  function stopSwipeHint(card) { card.classList.remove('swipe-hint'); }
  function stopSwipeHintIfAny() {
    var c = document.querySelector('.learn-swipe.swipe-hint');
    if (c) c.classList.remove('swipe-hint');
  }

  /* 今日关卡模式：一张主卡走完「看词 → 听 → 跟读 → 过关 → 滑走」。
     听（🔊🐢）和说（🎤）是同一条动作链，所以并排放在一行，不做分区拼接。
     卡片未过关前锁定：滑动跟手但会被弹回并 toast，防止点两下就翻过去。
     翻词不用底部按钮，改成配图两侧的尖括号（纯 CSS/SVG，不依赖素材）。 */
  function renderLearnToday(v) {
    if (!learnQueue.length) { learnQueue = buildTodayQueue(); learnPos = 0; }
    if (!learnQueue.length) { v.appendChild(empty('这本课本还没有词表')); appendBrowseEntry(v); return; }
    if (learnPos >= learnQueue.length) { renderLearnDone(v); appendBrowseEntry(v); return; }

    var word = learnQueue[learnPos];
    /* 能「听」就亮 🎤：浏览器自带识别优先，其次用户配置的硅基流动云端识别 */
    var supported = micEngine() !== 'off';
    var hits = hitsFor(learnPos);
    var passed = !!learnPassed[learnPos];

    var card = el('div', 'card wordcard learn-swipe' + (passed ? ' passed' : ''));
    card.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span class="muted">今日新词 · 第 ' + (learnPos + 1) + ' / ' + learnQueue.length + ' 个</span>' +
        '<span class="hits-row">' + hitsHtml(hits) + '</span>' +
      '</div>' +
      learnWordCardHtml(word, wcNavHtml()) +
      '<div class="learn-status' + (passed ? ' ok' : '') + '" id="learn-status">' +
        esc(learnStatusText(word, hits, passed, supported)) +
      '</div>' +
      '<div class="learn-action">' +
        '<button class="speak-btn" id="s1" aria-label="听发音">' + SPK + '</button>' +
        learnMicBtnHtml(supported) +
        '<button class="speak-btn" id="s2" aria-label="慢速发音">🐢</button>' +
      '</div>' +
      (supported ? '' :
        '<div class="learn-nomic"><span>' + learnNomicText() + '</span>' +
        '<button class="nomic-re" id="mic-recheck" aria-label="配好 Key 后点这里重新检测">🔄</button></div>') +
      (passed || !supported ? '' :
        '<button class="btn ghost xs" id="mic-self" style="margin-top:10px">我读过了（自评）</button>') +
      '<div class="learn-tip">' + esc(swipeTipText(passed)) + '</div>';
    v.appendChild(card);
    if (learnEnterDir) card.classList.add(learnEnterDir > 0 ? 'card-in-r' : 'card-in-l');
    learnEnterDir = 0;

    bindWordCardPlayback(card, word);
    bindLearnSpeak(card);
    bindLearnSwipe(card);
    $('#nav-prev').onclick = function () { tryGo('prev'); };
    $('#nav-next').onclick = function () { tryGo('next'); };
    /* 配置 Key 后点 🔄 即时重检引擎并重建卡片，无需整页刷新 */
    var rc = $('#mic-recheck');
    if (rc) rc.onclick = function () { render(); };

    playSwipeHint(card);
    appendBrowseEntry(v);
  }

  function hitsFor(pos) { return learnHits[pos] || 0; }

  /* 翻词箭头：配图左右各一个尖括号，纯 SVG 现画，不依赖任何图片素材。
     左=上一个、右=下一个，和「左滑下一个 / 右滑上一个」的滑动方向一致。 */
  var NAV_PATH = { prev: 'M15 5 L8 12 L15 19', next: 'M9 5 L16 12 L9 19' };
  function wcNavHtml() {
    return ['prev', 'next'].map(function (dir) {
      var last = dir === 'next' && learnPos >= learnQueue.length - 1;
      var label = dir === 'prev' ? '上一个词' : (last ? '完成，看结果' : '下一个词');
      return '<button class="wc-nav ' + dir + (swipeBlockReason(dir) ? ' off' : '') + '"' +
        ' id="nav-' + dir + '" title="' + label + '" aria-label="' + label + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + NAV_PATH[dir] + '"/></svg>' +
        '</button>';
    }).join('');
  }

  /* 底部一行小字：只说明「怎么翻页」，不重复状态行已经说过的话 */
  function swipeTipText(passed) {
    if (!passed) return '读满 ' + HITS_GOAL + ' 次才能翻页 · 也可以点箭头';
    return '← 左右滑一滑翻词 · 点箭头也行 →';
  }

  /* 跟读按钮：支持识别时是「点一下录 / 再点一下停」的开关；不支持时降级为自评 ✅ */
  function learnMicBtnHtml(supported) {
    if (!supported) return '<button class="mic-btn self" id="mic-btn-fb" aria-label="我读过了">✅</button>';
    return '<button class="mic-btn' + (learnBusy ? ' rec' : '') + '" id="mic-btn" aria-label="跟读">' +
      (learnBusy ? MIC_STOP : '🎤') + '</button>';
  }

  /* 状态行：随进度/录音状态变化，替代原来那两行静态说明 */
  function learnStatusText(word, hits, passed, supported) {
    if (passed) return learnPos >= learnQueue.length - 1 ? '✅ 通过！翻过去看今天的结果 🎉' : '✅ 通过！可以翻下一个词啦';
    if (learnBusy) return '正在听…说完再点 ⏹ 停';
    if (!supported) return '读出 “' + word + '” 后点 ✅';
    return hits > 0 ? '很棒！再读 1 次就过关' : '读出 “' + word + '” 吧';
  }

  function bindLearnSpeak(scope) {
    var mic = scope.querySelector('#mic-btn');
    if (mic) mic.onclick = toggleLearnMic;
    var fb = scope.querySelector('#mic-btn-fb');
    if (fb) fb.onclick = onLearnHit;
    var self = scope.querySelector('#mic-self');
    if (self) self.onclick = function () { if (learnBusy) abandonLearnMic(); onLearnHit(); };
  }

  /* ---------- 滑动：跟手位移 + 倾斜，未过关时锁住 ---------- */
  /* 返回 null 表示这个方向可以划走；返回字符串即被拦住的原因（同时用于 toast）。
     规则只有一条：当前词没过关就别想翻页——去下一个和回上一个都不行。 */
  function swipeBlockReason(dir) {
    if (!learnPassed[learnPos]) return '先读出这个词 ' + HITS_GOAL + ' 次才能过关哦 🎤';
    if (dir === 'prev' && learnPos <= 0) return '已经是第一个词啦';
    return null;
  }

  /* 按钮 / 键盘走的都是同一条判定，保证桌面端和触屏行为一致 */
  function tryGo(dir) {
    var reason = swipeBlockReason(dir);
    if (reason) { toast(reason); return; }
    markSwipeLearned();          /* 自己翻过一次就不用再教了 */
    learnHintPending = false;
    stopSwipeHintIfAny();
    learnEnterDir = dir === 'next' ? 1 : -1;
    if (dir === 'next') learnGoNext(); else learnGoPrev();
  }

  var SWIPE_MIN = 54;   // 判定为「划走」的最小位移
  var SWIPE_SOFT = 110; // 超过后进入阻尼，避免卡片被拖出屏幕
  function bindLearnSwipe(node) {
    var x0 = null, y0 = null, t0 = 0, onBtn = false, dragging = false, dx = 0, dirNow = 0;
    var suppressClick = false;

    /* 箭头在卡片左右两侧，正是最自然的下手位置，所以允许从箭头上起手滑；
       滑完手指抬起时浏览器还会补一个 click，这里拦掉，否则会翻两页。 */
    node.addEventListener('click', function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation(); e.preventDefault();
    }, true);

    node.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
      /* 只有翻词箭头例外：其余按钮上起手不算滑动，避免误触 */
      onBtn = !!(e.target.closest && e.target.closest('button') && !e.target.closest('.wc-nav'));
      dragging = false; dx = 0;
      stopSwipeHint(node);      /* 一动手就停掉摇晃，别和手指抢 transform */
    }, { passive: true });

    node.addEventListener('touchmove', function (e) {
      if (x0 == null || onBtn) return;
      var tx = e.touches[0].clientX - x0, ty = e.touches[0].clientY - y0;
      if (!dragging) {
        if (Math.abs(tx) < 9 && Math.abs(ty) < 9) return;
        /* 竖向为主 → 交还给页面滚动，不抢 */
        if (Math.abs(tx) <= Math.abs(ty)) { x0 = null; return; }
        dragging = true;
        /* 入场动画带 fill:both，会压过后面的 transform，必须先摘掉 */
        node.classList.remove('card-in-r', 'card-in-l');
        node.classList.add('dragging');
      }
      dx = tx;
      dirNow = dx < 0 ? 1 : -1;
      var locked = !!swipeBlockReason(dirNow > 0 ? 'next' : 'prev');
      var off = swipeOffset(dx, locked);
      node.style.transform = 'translateX(' + off.toFixed(1) + 'px) rotate(' + (off * 0.035).toFixed(2) + 'deg)';
      node.style.opacity = locked ? '1' : Math.max(0.5, 1 - Math.abs(off) / 420).toFixed(2);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function end(e) {
      if (x0 == null) return;
      var wasDragging = dragging, dir = dirNow > 0 ? 'next' : 'prev';
      /* 用松手这一刻的位置重算位移：最后一次 touchmove 可能早于手指停下的位置 */
      var touch = e && e.changedTouches && e.changedTouches[0];
      if (touch && wasDragging) dx = touch.clientX - x0;
      var dist = Math.abs(dx);
      x0 = null; dragging = false; dx = 0;
      node.classList.remove('dragging');
      if (!wasDragging) return;
      suppressClick = true;       /* 滑过就别再当成「点箭头」了 */
      setTimeout(function () { suppressClick = false; }, 400);
      var reason = swipeBlockReason(dir);
      if (reason) { snapBack(node); toast(reason); return; }
      if (dist < SWIPE_MIN || Date.now() - t0 > 900) { snapBack(node); return; }
      flyOut(node, dir, function () { tryGo(dir); });
    }
    node.addEventListener('touchend', end, { passive: true });
    node.addEventListener('touchcancel', function () { if (x0 == null) return; x0 = null; dragging = false; node.classList.remove('dragging'); snapBack(node); }, { passive: true });
  }

  /* 锁住时位移只有一点点，孩子能感到「推不动」而不是「没反应」 */
  function swipeOffset(dx, locked) {
    var a = Math.abs(dx) * (locked ? 0.18 : 0.92);
    if (!locked && a > SWIPE_SOFT) a = SWIPE_SOFT + (a - SWIPE_SOFT) * 0.3;
    return dx < 0 ? -a : a;
  }
  function snapBack(node) {
    node.style.transition = 'transform .26s cubic-bezier(.3,1.5,.5,1), opacity .2s';
    node.style.transform = ''; node.style.opacity = '';
    setTimeout(function () { node.style.transition = ''; }, 280);
  }
  function flyOut(node, dir, done) {
    var w = node.offsetWidth || 320;
    var to = (dir === 'next' ? -1 : 1) * (w + 60);
    node.style.transition = 'transform .19s ease-out, opacity .19s ease-out';
    node.style.transform = 'translateX(' + to + 'px) rotate(' + (dir === 'next' ? -10 : 10) + 'deg)';
    node.style.opacity = '0';
    setTimeout(done, 170);
  }

  function hitsHtml(n) {
    var s = '';
    for (var i = 0; i < HITS_GOAL; i++) s += '<span class="hit' + (i < n ? ' on' : '') + '"></span>';
    return s;
  }

  /* 词卡的视觉 HTML（图 / 词形 / 音标 / 字素块 / 中文）。
     刻意不含说明文字：图标自己会说话，小朋友点两下就懂了。
     nav 为可选的左右翻词箭头，塞进配图那一层的两侧。 */
  function learnWordCardHtml(word, nav) {
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
    return '<div class="wc-stage">' + (nav || '') +
        '<div class="wc-visual">' + visualHtml(word, 76) + '</div>' +
      '</div>' +
      '<div class="wc-word">' + word + '</div>' +
      (S.settings.showIpa && ipa ? '<div class="wc-ipa">/' + ipa + '/</div>' : '') +
      phoneBlock +
      '<div class="wc-cn">' + meaningOf(word) + '</div>';
  }

  function bindWordCardPlayback(scope, word) {
    var s1 = scope.querySelector('#s1');
    var s2 = scope.querySelector('#s2');
    if (s1) s1.onclick = function () { speakWord(word); };
    if (s2) s2.onclick = function () { slowWord(word); };
    scope.querySelectorAll('#wc-phon .pb').forEach(function (b) {
      b.onclick = function () { playPhoneme(word, +b.dataset.i, b); };
    });
  }

  /* 全部词库模式：保留原来的"我记住了 / 上一个 / 下一个"自由翻词体验 */
  function renderLearnBrowse(v) {
    var list = currentBookWords();
    if (!list.length) { v.appendChild(empty('这本课本还没有词表')); return; }
    if (learnIdx >= list.length) learnIdx = 0;
    var word = list[learnIdx];
    var pd = WORDS[word].pindu || [];

    /* 顶部：第 N 个词 / 总数 + "回到今日关卡"入口 */
    var header = el('div', 'card');
    header.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span class="muted">📚 翻词库 · ' + (learnIdx + 1) + '/' + list.length + '</span>' +
        '<button class="pill pill-btn" id="learn-today">← 回今日关卡</button>' +
      '</div>';
    v.appendChild(header);
    $('#learn-today').onclick = enterTodayMode;

    /* 词卡（复用 today 的视觉；这里只听不跟读，所以只有 🔊 🐢 两个按钮） */
    var c = el('div', 'card wordcard');
    c.innerHTML = learnWordCardHtml(word) +
      '<div class="learn-action">' +
        '<button class="speak-btn" id="s1" aria-label="听发音">' + SPK + '</button>' +
        '<button class="speak-btn" id="s2" aria-label="慢速发音">🐢</button>' +
      '</div>';
    v.appendChild(c);
    bindWordCardPlayback(c, word);

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
    $('#know').onclick = finishBrowseWord;
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

  /* ---------- speech recognition (跟读) ----------
     不支持 webkitSpeechRecognition 的浏览器（iOS Safari 等）走自评勾选降级。
     命中判定：去掉标点和空白，转小写，判断是否包含目标词或与目标词相等。
     复数 / 所有格允许尾字母 s 容忍（kids → kid 命中）。 */
  function learnRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  /* 当前可用的「听」引擎：'sf' = 硅基流动云端 ASR（配了 Key 就走它，
     任何浏览器行为一致、不挑内核）；没配 Key 则回落到 'off'（UI 把 🎤 降级为
     ✅ 自评并提示去 ⚙️ 配 Key），不再走浏览器本地下载语音包的老路。 */
  function micEngine() {
    if (S.settings.asrKey && window.isSecureContext) return 'sf';
    return 'off';
  }
  
  /* 「不能自动听读」不弹笼统提示：直接告诉家长卡在哪一层、出路是什么。
     判断顺序：非安全上下文（file:// 或局域网 IP 拿不到麦克风）→ 没配 Key
     （Firefox/Safari 无浏览器自带识别，配了硅基 Key 任何浏览器都能跟读）。 */
  function learnNomicText() {
    if (!window.isSecureContext) {
      return '⚠️ 页面不是安全环境，麦克风被浏览器禁了：请用 http://127.0.0.1 或 https 打开本页，再进 ⚙️ 配 Key';
    }
    if (!S.settings.asrKey) {
      return '⚠️ 还没配置硅基流动 API Key：去 ⚙️ 设置粘贴 sk-… 并点保存，就能跟读（不挑浏览器）';
    }
    if (!learnRecognitionSupported()) {
      return '⚠️ 这台浏览器没带语音识别：去 ⚙️ 设置粘贴硅基 API Key（sk-…）并点保存，就能跟读了';
    }
    return '⚠️ 浏览器识别暂不可用：去 ⚙️ 设置配个硅基 API Key（sk-…）就能跟读，不挑浏览器';
  }
  function normalizeSpoken(s) {
    return (s || '').toLowerCase().replace(/[^a-z']/g, '');
  }
  function spokenMatches(spoken, target) {
    var a = normalizeSpoken(spoken), b = normalizeSpoken(target);
    if (!a || !b) return false;
    if (a === b || a.indexOf(b) >= 0) return true;
    /* 容忍末尾 s：kids <-> kid 都算 */
    if (a + 's' === b || a === b + 's') return true;
    return false;
  }

  /* 🎤 是开关：点一下开始录，再点一下停。录音中按钮变 ⏹ 并脉冲。
     判定「真的在录」用 learnBusy && !learnEnded：避免上一轮 onend 没来、
     learnBusy 卡在 true 时，再点只会去 stop 一个已死的识别器而再也起不来。 */
  function toggleLearnMic() {
    if (learnBusy && !learnEnded) sfStop(true);   // 跟读只走硅基云端，停就是停云端录音
    else startLearnMic();
  }
  function startLearnMic() {
    /* 若上一轮 onend 没来、learnBusy 卡在 true，先彻底清掉那个死会话，
       否则新建的识别器会和它抢麦克风、start 直接失败。 */
    if (learnBusy) abandonLearnMic();
    if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
    learnHitScored = false; learnEnded = false; learnStartTs = 0;
    learnSession++;                 // 新的一轮，作废上一轮可能迟到的 onend
    var mySession = learnSession;
    stopAudio();
    syncMicVisual();
    /* 走到这里必然已配硅基 Key（没配时按钮降级为 ✅，不会触发 🎤）。
       直接走云端 ASR：不探测、不装包、不碰浏览器自带识别，行为在所有浏览器一致。 */
    learnEngine = 'sf';
    sfStart(mySession);
  }

  /* 停录音（按引擎分发）：浏览器识别直接停；硅基模式停录音并上传评分 */
  function stopCurrentMic() {
    sfStop(true);   // 跟读只走硅基流动云端 ASR
  }

  /* ============ 硅基流动云端 ASR（浏览器识别走不通时的备胎） ============
     交互与浏览器识别一致：点 🎤 开始录 → 点 ⏹ 停并上传转写（8 秒没停自动停）。
     转写文本回来后走同一套 spokenMatches 判定 + onLearnHit，孩子无感切换。 */
  var sfStream = null, sfSrc = null, sfCtx = null, sfSp = null, sfRate = 16000, sfChunks = [];

  function sfTearDown() {
    if (sfSp) { try { sfSp.onaudioprocess = null; sfSp.disconnect(); } catch (e1) {} sfSp = null; }
    if (sfSrc) { try { sfSrc.disconnect(); } catch (e2) {} sfSrc = null; }
    if (sfStream) { try { sfStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e3) {} sfStream = null; }
    if (sfCtx) { try { sfCtx.close(); } catch (e4) {} sfCtx = null; }
  }
  /* 丢弃本次录音（abandon 用：翻页/切走时无谓上传） */
  function sfAbort() {
    sfChunks = [];
    sfTearDown();
    learnBusy = false; learnEnded = true;
  }

  function sfStart(mySession) {
    sfAbort();
    if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
    learnHitScored = false; learnEnded = false; learnStartTs = Date.now();
    learnBusy = true;
    syncMicVisual();   // 按钮先亮起来，等麦克风授权
    try {
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      }).then(function (stream) {
        if (mySession !== learnSession) {   // 等授权期间被翻页 / 切走
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e0) {}
          return;
        }
        sfStream = stream;
        sfCtx = new (window.AudioContext || window.webkitAudioContext)();
        sfRate = sfCtx.sampleRate || 16000;
        sfSrc = sfCtx.createMediaStreamSource(stream);
        sfChunks = [];
        sfSp = sfCtx.createScriptProcessor(4096, 1, 1);
        sfSp.onaudioprocess = function (e) {
          var d = e.inputBuffer.getChannelData(0);
          sfChunks.push(new Float32Array(d));   // 拷贝，避免复用
        };
        sfSrc.connect(sfSp); sfSp.connect(sfCtx.destination);   // 不写 output → 静音，不外放
        /* 8 秒没停就自动停并上传（与浏览器识别一致的兜底时长） */
        learnTimer = setTimeout(function () { if (learnEngine === 'sf') sfStop(false); }, 8000);
      }, function (err) {
        if (mySession !== learnSession) return;
        learnBusy = false; learnEnded = true; syncMicVisual();
        toast(err && err.name === 'NotAllowedError'
          ? '麦克风被挡住了：请在浏览器地址栏允许使用 🎤'
          : '拿不到麦克风：要用 http://127.0.0.1 或 https 打开页面哦');
      });
    } catch (e) {
      learnBusy = false; learnEnded = true; syncMicVisual();
      toast('拿不到麦克风：要用 http://127.0.0.1 或 https 打开页面哦');
    }
  }

  /* 停录并上传评分。byUser=false = 8 秒自动到点。 */
  function sfStop(byUser) {
    if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
    if (!sfStream || !sfCtx) return;      // 已收尾（比如命中后自动来停）
    var durMs = Date.now() - learnStartTs;
    sfTearDown();
    learnBusy = false;
    learnEnded = false;                   // 进入「识别中」，还没结束
    if (!sfChunks.length || durMs < 500) {
      sfChunks = [];
      learnEnded = true;
      syncMicVisual();
      toast('录音太短没听清，再点 🎤 试一次');
      return;
    }
    var mySession = learnSession;
    sfSyncUi('⏳', '正在识别…');
    var fd = new FormData();
    fd.append('file', new Blob([sfEncodeWav()], { type: 'audio/wav' }), 'speech.wav');
    fd.append('model', S.settings.asrModel || 'XingChenAGI/XingChenASR-V3.2-Ultra');
    sfChunks = [];
    fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + S.settings.asrKey },
      body: fd
    }).then(function (resp) {
      if (mySession !== learnSession) return;    // 期间已开新的一轮
      return resp.json().catch(function () { return {}; }).then(function (j) {
        if (resp.ok && j && j.text) { sfFinish(mySession, j.text); return; }
        sfFinish(mySession, null);
        toast(sfErrMsg(resp.status, j && j.message));
      });
    }).catch(function () {
      if (mySession !== learnSession) return;
      sfFinish(mySession, null);
      toast('网络不通，连不上识别服务 😢');
    });
  }

  /* 转写结果收尾：文本回来 → 复位 UI → 用和浏览器识别相同的判定逻辑 */
  function sfFinish(mySession, text) {
    if (mySession !== learnSession) return;
    learnEnded = true;
    syncMicVisual();
    var heard = normalizeSpoken(text);
    var target = learnQueue[learnPos] || '';
    if (heard && spokenMatches(text, target)) { onLearnHit(); return; }
    if (heard) toast('听到“' + heard + '”，再试试读 “' + target + '” 🎤');
    else toast('没听到声音…大声读 “' + target + '” 试试');
  }

  function sfErrMsg(code, m) {
    if (code === 401 || code === 403) return 'API Key 不对，去 ⚙️ 设置里检查 🎤';
    if (code === 429) return '识别服务限流了，等几秒再试';
    if (code === 503 || code === 504) return '识别服务正忙，稍后再试';
    if (code === 400) return '音频没录上，再试一次';
    return m ? '识别失败：' + m : '识别失败（' + code + '），稍后再试';
  }

  /* 识别中：按钮换 ⏳、状态行换文案（局部，不重建 DOM） */
  function sfSyncUi(icon, statusText) {
    var btn = $('#mic-btn');
    if (btn) { btn.classList.remove('rec'); btn.innerHTML = icon; }
    var st = $('#learn-status');
    if (st) st.textContent = statusText;
  }

  /* 采集的 Float32 帧拼成 16bit PCM WAV（单声道），供上传 */
  function sfEncodeWav() {
    var n = 0, i;
    for (i = 0; i < sfChunks.length; i++) n += sfChunks[i].length;
    var merged = new Float32Array(n);
    var off = 0;
    for (i = 0; i < sfChunks.length; i++) { merged.set(sfChunks[i], off); off += sfChunks[i].length; }
    var rate = sfRate || 16000;
    var dataLen = merged.length * 2;
    var buf = new ArrayBuffer(44 + dataLen);
    var dv = new DataView(buf);
    function wstr(o, s) { for (var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
    wstr(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wstr(36, 'data'); dv.setUint32(40, dataLen, true);
    for (i = 0; i < merged.length; i++) {
      var s = Math.max(-1, Math.min(1, merged[i]));
      dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buf;
  }

  /* 翻页 / 切模式时调用：停掉录音并作废这一轮的回调（浏览器 onend 或硅基上传），
     否则旧识别器停下后的 onend / 迟到的转写会在翻到新词后串台弹出「没听清」。 */
  function abandonLearnMic() {
    learnSession++;
    if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
    sfAbort();                 // 跟读只走硅基云端：翻页 / 切走直接作废上传，不残留识别器
    learnBusy = false;
    learnHitScored = false; learnEnded = true; learnStartTs = 0;
    syncMicVisual();
  }
  /* 只改按钮和状态行，不动整张卡：避免录音中重建 DOM 打断脉冲动画 */
  function syncMicVisual() {
    var btn = $('#mic-btn');
    if (btn) {
      btn.classList.toggle('rec', learnBusy);
      btn.innerHTML = learnBusy ? MIC_STOP : '🎤';
    }
    var st = $('#learn-status');
    if (st) {
      var w = learnQueue[learnPos];
      st.classList.toggle('ok', !!learnPassed[learnPos]);
      st.textContent = learnStatusText(w, hitsFor(learnPos), !!learnPassed[learnPos], micEngine() !== 'off');
    }
  }

  function onLearnHit() {
    /* 已过的词再读：停掉录音、给个方向提示，不再重复计分 */
    if (learnPassed[learnPos]) {
      learnHitScored = true;
      stopCurrentMic(); beep('ok'); toast('已经过关啦，左滑去下一个词 👉');
      return;
    }
    if (learnHitScored) return;     // 同一次录音里结果可能多次命中，只计一次
    learnHitScored = true;
    var h = Math.min(HITS_GOAL, hitsFor(learnPos) + 1);
    learnHits[learnPos] = h;
    stopCurrentMic();
    beep('ok');
    if (h >= HITS_GOAL) markLearnPassed();
    else toast('👏 读得不错！再读 1 次就过关');
    render();
  }

  /* 通过：只在这一刻计分一次。learnPassed 保证滑回来重读不会重复加分。 */
  function markLearnPassed() {
    if (learnPassed[learnPos]) return;
    var word = learnQueue[learnPos];
    if (!word) return;
    learnPassed[learnPos] = true;
    grade(word, true);                  /* 记入 SRS + newWords */
    gainXp(3, 'food', 2);
    toast('🎤 ' + word + ' 通过！+1 🍖 · 左滑下一个');
  }

  /* 左右滑 / 按钮：纯导航，不记通过。滑过末尾即进入结果卡。 */
  function learnGoNext() {
    learnPos = learnPos >= learnQueue.length - 1 ? learnQueue.length : learnPos + 1;
    abandonLearnMic(); render();
  }
  function learnGoPrev() {
    if (learnPos <= 0) return;
    learnPos--; abandonLearnMic(); render();
  }
  /* 桌面端没有触摸：方向键同样映射为「左=下一个 / 右=上一个」，判定与触屏共用 */
  document.addEventListener('keydown', function (e) {
    if (tab !== 'learn' || learnMode !== 'today') return;
    if (e.key === 'ArrowLeft') tryGo('next');
    else if (e.key === 'ArrowRight') tryGo('prev');
  });

  /* 全部词库模式下的"我记住了"按钮同样走 grade，但不走跟读 */
  function finishBrowseWord() {
    var list = currentBookWords();
    var word = list[learnIdx];
    grade(word, true);
    gainXp(3, 'food', 2);
    beep('ok');
    toast('👍 记住了！获得 1 个 🍖');
    learnIdx = (learnIdx + 1) % list.length;
    stopAudio(); render();
  }

  /* 今日关卡结果卡：按实际通过数统计（滑动可以跳过，故不能用队列长度） */
  function renderLearnDone(v) {
    var total = learnQueue.length;
    var passed = Object.keys(learnPassed).length;
    var all = passed >= total;
    var c = el('div', 'card');
    c.style.textAlign = 'center';
    c.innerHTML =
      '<div style="font-size:56px;line-height:1;margin:8px 0 6px">' + (all ? '🎉' : '💪') + '</div>' +
      '<h2 class="section" style="font-size:20px;color:var(--brand-dk)">' +
        (all ? '今日新词全部通关！' : '今日跟读 ' + passed + ' / ' + total + ' 个') + '</h2>' +
      '<div class="muted" style="margin:6px 0 14px">获得 <b>+' + (passed * 3) + ' XP</b> · 宠物 +' +
        passed + ' 🍖' + (all ? '' : ' · 还有 ' + (total - passed) + ' 个没跟读') + '</div>' +
      '<div class="row" style="gap:9px;margin-top:14px">' +
        (all ? '' : '<button class="btn" id="to-resume" style="flex:1">← 回去补完</button>') +
        '<button class="btn green" id="to-home" style="flex:1">回首页 🏠</button>' +
      '</div>';
    v.appendChild(c);
    var resume = $('#to-resume');
    if (resume) resume.onclick = function () {
      for (var i = 0; i < learnQueue.length; i++) {
        if (!learnPassed[i]) { learnPos = i; render(); return; }
      }
    };
    $('#to-home').onclick = function () { go('home'); };
  }

  /* 次卡：翻词库入口。今日跟读是默认主线，浏览词库降级为下方一张入口卡。 */
  function appendBrowseEntry(v) {
    var b = el('div', 'card');
    b.innerHTML =
      '<button id="learn-browse" class="browse-entry">' +
        '<span>📚 翻词库</span>' +
        '<span class="muted" style="font-size:12px">全部 ' + currentBookWords().length + ' 词 ›</span>' +
      '</button>';
    v.appendChild(b);
    $('#learn-browse').onclick = enterBrowseMode;
  }

  /* 切去翻词库不清空今日进度，回来接着练 */
  function enterBrowseMode() {
    learnMode = 'browse';
    learnIdx = 0;
    abandonLearnMic();
    render();
  }
  function enterTodayMode() {
    learnMode = 'today';
    if (!learnQueue.length) { learnQueue = buildTodayQueue(); learnPos = 0; }
    abandonLearnMic();
    render();
  }
  function buildTodayQueue() {
    /* 取当前课本里未学过的词，随机抽 dailyGoal 个；若全部都学过则退化为
       整本词表随机抽。队列仅在会话内有效（不落 storage），故同一会话内
       稳定；重新进入今日模式会基于剩余未学词重抽一批。 */
    var goal = Math.max(1, S.settings.dailyGoal);
    var book = S.settings.book;
    var unseen = currentBookWords().filter(function (w) { var st = S.words[w]; return !st || !st.seen; });
    var pool = unseen.length ? unseen : currentBookWords();
    return shuffle(pool).slice(0, goal);
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
    abandonLearnMic();   // 若学单词正在录音/识别，先停掉并作废回调，防 modal 盖着时旧 onend 串台
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
    if (!m) return;
    m.remove();
    /* 设置里可能改了音标/教材/每日目标/API Key：关闭后重建当前页，
       否则学单词卡片的引擎提示还停留在打开设置前的旧状态，得手动刷新才生效 */
    if ($('#view')) render();
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

    /* --- 宠物图鉴（各阶段预览，名称跟物种走）--- */
    var spCur = curSpecies();
    var stages = [
      { i: 0, name: '蛋宝宝', lv: 'Lv.1 ~ 4' },
      { i: 1, name: spCur.stages[0], lv: 'Lv.5 ~ 8' },
      { i: 2, name: spCur.stages[1], lv: 'Lv.9 ~ 12' },
      { i: 3, name: spCur.stages[2], lv: 'Lv.13+' }
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

    /* --- 宠物物种（换着养，数值与等级保留）--- */
    var cSp = el('div', 'card');
    cSp.innerHTML = '<h2 class="section">宠物物种 · 换着养</h2>' +
      '<div class="muted" style="margin-bottom:10px">换物种保留等级、经验和数值；进化阶段名称跟着新物种走</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      Object.keys(PET_SPECIES).map(function (k) {
        var on = k === petSpeciesKey();
        return '<button class="chip' + (on ? ' on' : '') + '" data-species="' + k + '">' +
          PET_SPECIES[k].emoji + ' ' + PET_SPECIES[k].label + (on ? ' · 现在' : '') + '</button>';
      }).join('') + '</div>';
    v.appendChild(cSp);
    $$('#set-body [data-species]').forEach(function (b) {
      b.onclick = function () {
        S.pet.species = b.dataset.species;
        save();
        renderHome();
        renderSettings();
        toast('换成了' + PET_SPECIES[b.dataset.species].label + '！等级经验都还在');
      };
    });

    /* --- 状态试验台（表情预览 + 像素特效一览 + 实景演示）--- */
    var TB_EXPRS = [
      ['idle', '待机'], ['blink', '眨眼'], ['happy', '开心'], ['sad', '难过'],
      ['sleep', '睡着'], ['droopy', '没劲'], ['excited', '兴奋'],
      ['eat', '吃饭'], ['wash', '搓澡'], ['grunt', '用力']
    ];
    var TB_DEMOS = {
      feed: function () { tbPlay('eat', 'eat', 1500); addFoodBowl('#tb-cvwrap'); spawnFx('meat', 1, '#tb-cvwrap'); },
      wash: function () { tbPlay('wash', 'wash', 1600); spawnFx('bubble', 5, '#tb-cvwrap'); },
      dance: function () { tbPlay('dance', 'excited', 1500); spawnFx('note', 3, '#tb-cvwrap'); },
      prop: function () { tbPlay('prop', 'happy', 1200); spawnFx(pick(['teddy', 'balloon', 'drum', 'yarn', 'horn', 'kite']), 1, '#tb-cvwrap'); },
      sad: function () { tbPlay('sad', 'sad', 900); },
      poop: function () {
        tbPlay('poop', 'grunt', 1200);
        setTimeout(function () { spawnFx('poop', 1, '#tb-cvwrap'); }, 1050);
        S.pet.poop.n = Math.min(3, (S.pet.poop.n || 0) + 1); save();
      }
    };
    /* 试验台就地表演：与首页 playAction 同一套动作类 + 表情，播完回落 idle。
       目标是预览画布自身，不碰首页宠物状态（petAnim / 常驻基调完全独立）。
       tbStage：形态选择（0蛋 1宝宝 2/3 物种成长期），默认跟随当前等级；点形态 chip 切换预览 */
    var tbTimer = null, TB_ACT_CLS = ['eat', 'happy', 'sad', 'wash', 'dance', 'prop', 'poop'];
    var tbExpr = 'idle', tbStage = petStageIdx();
    function tbRedraw() { drawPet($('#tb-cv'), tbExpr, tbStage); }
    function tbPlay(cls, expr, ms) {
      var w = $('#tb-cvwrap'); if (!w) return;
      TB_ACT_CLS.forEach(function (k) { w.classList.remove(k); });
      if (cls) w.classList.add(cls);
      tbExpr = expr; tbRedraw();
      clearTimeout(tbTimer);
      tbTimer = setTimeout(function () {
        var w2 = $('#tb-cvwrap');
        if (w2) TB_ACT_CLS.forEach(function (k) { w2.classList.remove(k); });
        tbExpr = 'idle'; tbRedraw();
      }, ms || 1200);
    }
    var c2b = el('div', 'card');
    var TB_STAGES = [[0, '蛋'], [1, '宝宝'], [2, curSpecies().stages[0]], [3, curSpecies().stages[1]]];
    c2b.innerHTML = '<h2 class="section">状态试验台 · 点了就看</h2>' +
      '<div class="pg-cvwrap pet-canvas-wrap tb-main" id="tb-cvwrap"><canvas id="tb-cv" width="16" height="16"></canvas></div>' +
      '<div class="row wrap" style="gap:6px;margin-top:8px" id="tb-stages">' +
      TB_STAGES.map(function (s) {
        return '<button class="chip" data-tbs="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="muted" style="margin:10px 0 6px">表情（跟着上面选的形态走）</div>' +
      '<div class="row wrap" style="gap:6px" id="tb-exprs">' +
      TB_EXPRS.map(function (e) {
        return '<button class="chip" data-tbe="' + e[0] + '">' + e[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="muted" style="margin:10px 0 6px">像素特效精灵一览（跟首页飘的是同一套）</div>' +
      '<div class="row wrap" style="gap:6px" id="tb-fx"></div>' +
      '<div class="muted" style="margin:10px 0 6px">实景演示（点了就在这里播，不跳回首页）</div>' +
      '<div class="row wrap" style="gap:6px">' +
      '<button class="chip" data-demo="feed">喂食</button>' +
      '<button class="chip" data-demo="wash">洗澡</button>' +
      '<button class="chip" data-demo="dance">跳舞</button>' +
      '<button class="chip" data-demo="prop">掏道具</button>' +
      '<button class="chip" data-demo="sad">难过</button>' +
      '<button class="chip" data-demo="poop">放颗粑粑</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:9px">粑粑演示会顺带在首页放一颗（最多 3 颗，回首页点它清理）。</div>';
    v.appendChild(c2b);
    function tbMarkStage() {
      $$('#tb-stages .chip').forEach(function (b) {
        b.classList.toggle('on', +b.dataset.tbs === tbStage);
      });
    }
    tbMarkStage();
    tbRedraw();
    $$('#set-body [data-tbs]').forEach(function (b) {
      b.onclick = function () { tbStage = +b.dataset.tbs; tbMarkStage(); tbRedraw(); beep('tap'); };
    });
    $$('#set-body [data-tbe]').forEach(function (b) {
      b.onclick = function () { tbExpr = b.dataset.tbe; tbRedraw(); beep('tap'); };
    });
    Object.keys(FX_SPRITES).forEach(function (n) {
      var s = document.createElement('span');
      s.className = 'chip tb-chip';
      s.title = n;
      s.appendChild(fxSpriteCanvas(n, 2));
      $('#tb-fx').appendChild(s);
    });
    $$('#set-body [data-demo]').forEach(function (b) {
      b.onclick = function () { TB_DEMOS[b.dataset.demo](); beep('tap'); };
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

    /* --- 语音识别（跟读判分引擎）--- */
    var eng = micEngine();
    var engTxt = eng === 'sr' ? '浏览器自带识别' : (eng === 'sf' ? '硅基流动云端' : '未启用（只能自评）');
    var c4 = el('div', 'card');
    c4.innerHTML = '<h2 class="section">语音识别 · 跟读判分</h2>' +
      '<div class="muted" style="margin-bottom:10px">当前引擎：<b>' + engTxt + '</b>' +
      (eng === 'sf' ? '（需要联网，不挑浏览器）' : '') +
      (eng === 'sr' ? '（没配 Key，Chrome 本地离线识别）' : '') + '</div>' +
      '<div class="muted" style="margin-bottom:4px">硅基流动 API Key（填了它，Chrome/Edge/Firefox 都能跟读）</div>' +
      '<input type="password" id="asr-key" placeholder="sk-…" autocomplete="off" spellcheck="false" ' +
        'style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box" ' +
        'value="' + esc(S.settings.asrKey) + '">' +
      '<div class="muted" style="margin:8px 0 4px">识别模型（一般不用改）</div>' +
      '<input type="text" id="asr-model" spellcheck="false" ' +
        'style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box" ' +
        'value="' + esc(S.settings.asrModel) + '">' +
      '<div class="row" style="gap:8px;margin-top:10px">' +
        '<button class="btn ghost sm" id="asr-save">保存</button>' +
        '<button class="btn ghost sm" id="asr-clear">清除</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:9px">密钥只存这台设备的浏览器里，Edge / Firefox / Chrome 各存各的，换浏览器要重填一次。' +
      '填了 Key 跟读统一走硅基云端（不挑浏览器）；不填时只有 Chrome 能用本地离线识别。获取 Key：siliconflow.cn → API 密钥（语音模型基本免费）。英文识别不理想可把模型换成 FunAudioLLM/SenseVoiceSmall。</div>';
    v.appendChild(c4);
    $('#asr-save').onclick = function () {
      S.settings.asrKey = ($('#asr-key').value || '').trim();
      var m = ($('#asr-model').value || '').trim();
      if (m) S.settings.asrModel = m;
      save(); renderSettings();
      toast(S.settings.asrKey ? '已保存：识别会走硅基流动云端' : '已清除云端识别配置');
    };
    $('#asr-clear').onclick = function () {
      S.settings.asrKey = ''; save(); renderSettings();
      toast('已清除云端识别配置');
    };
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
      a.download = 'pixel-pet-english-progress-' + today() + '.json';
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

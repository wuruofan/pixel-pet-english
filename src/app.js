/* =========================================================================
   Pixel Pet English — 皮克学英语 单词 + 句子理解 游戏化学习
   Single-file app. No external dependencies. Data is inlined at build time.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------- data (injected by build) ---------------- */
  var WORDS = window.__WORDS__.words;
  var VISUALS = window.__VISUALS__;
  var PHONICS = window.__PHONICS__;
  var PHONEMES_BY_WORD = window.__PHONEMES_BY_WORD__ || {};
  var PET_TEST_KEYS = ['cat', 'dog', 'fox', 'dragon'];
  var petTestParam = new URLSearchParams(window.location.search).get('pet-test');
  var PET_TEST_SPECIES = PET_TEST_KEYS.indexOf(petTestParam) >= 0 ? petTestParam : null;

  /* ---------------- difficulty bands ----------------
     A "band" is a difficulty band, not a textbook. Books were the only thing
     keeping a child's word pool bounded, and a band does that job while adding
     something books never had: an ordering. Topic grouping was considered and
     rejected — a finite topic (colours) is exhausted, and the app runs dry.
     Bands don't: finish L1 and L2 is already open.
       L1   core       94   words a publisher (or, for 一下, a hand) called 必背
       L2   daily      43   lesson-text words used >=4 times that no 必背 list covers
       L3A1 starter   629   KET list, Oxford 3000 A1 — the everyday KET core
       L3A2 wider     330   KET list, Oxford 3000 A2
       L3B  challenge  76   KET list, Oxford 3000 B1+B2 — the genuinely hard tail
       L3C  extra     290   KET list, absent from the Oxford 3000
     The L1/L2 line is "has textbook backing", NOT "is more frequent": 48 of the
     94 L1 words were themselves picked out of 一下 lesson text back when the
     source site had no word list, and 49 of those 57 meet L2's own >=4 cutoff.
     See README「词库怎么组织的」for why they were not re-sorted.

     L3A1/A2/B/C come from one split of the KET list, not four sources, so the
     L3 prefix keeps them reading as one block in the data. L3C being its own
     band rather than a tail of L3B is the honest reading of the source: the
     Oxford 3000 is a *deduplicated* keyword list, so absence means "Oxford
     didn't call it a priority word", not "Oxford rates it B2". Its 290 words are
     mostly function words (about, able, across), nouns a child already knows
     (ball, pizza, beach) and plurals (glasses, feelings). Filing those under a
     🎯 label would invent a difficulty the data never claimed.

     A1 vs A2 is the one split that is not cosmetic. The first three bands held
     137 words and the next held 959, so a finished L2 dropped a child into a
     916-word cliff — the widest jump in the whole ladder, and it happened right
     where a child is most likely to give up. Halving it to 629 is the largest
     single-step reduction available without inventing words: every alternative
     word list we could legally obtain (人教 PEP 二下, YLE 三级, the Chinese
     KET topic list) added 214 words between them, which moves the cliff's end
     by 214 and not its height. README「试过但没采用的词表」has the numbers.

     words.json tags each word with `band` (NOT `level` — that key name is
     already taken by the pet's growth stage). */
  var BAND_ORDER = ['L1', 'L2', 'L3A1', 'L3A2', 'L3B', 'L3C'];
  var BAND_META = {
    L1: { label: '核心词', short: '核心', emoji: '⭐', note: '北京版一上/一下/二上必背表' },
    L2: { label: '日常词', short: '日常', emoji: '🌱', note: '课本正文出现 ≥4 次但必背表没收的词，可在 data/l2-words.txt 增删' },
    L3A1: { label: '启程词', short: '启程', emoji: '⛅', note: '剑桥 KET 官方词表里 Oxford 3000 标为 A1 的 629 词——日常生活最常用的那一半' },
    L3A2: { label: '拓展词', short: '拓展', emoji: '🌳', note: 'KET 词表里 Oxford 3000 标为 A2 的 330 词，比启程词抽象一些' },
    L3B: { label: '挑战词', short: '挑战', emoji: '🎯', note: 'KET 词表里 Oxford 3000 标为 B1/B2 的 76 词，是其中最难的' },
    L3C: { label: '补充词', short: '补充', emoji: '📦', note: 'KET 词表里 Oxford 3000 未收录的 290 词——多是虚词、复数和派生形，不是「更难」，只是 Oxford 没列为优先关键词' }
  };
  var wordBand = {};
  Object.keys(WORDS).forEach(function (w) {
    var b = WORDS[w].band;
    // Untagged words belong to the widest band, and so does any tag this build
    // doesn't know about — a typo in the data must not empty a band.
    wordBand[w] = BAND_META[b] ? b : 'L3C';
  });
  function wordsInBand(lv) {
    return Object.keys(WORDS).filter(function (w) { return wordBand[w] === lv; });
  }
  /* A word with no picture cannot be asked as a picture question — the option
     would render as the 🔤 placeholder and the kid would be guessing between
     identical tiles. Such words are simply excluded from those two modes. */
  function hasVisual(w) { return !!(VISUALS[w] && VISUALS[w].emoji); }

  /* ---------------- storage ---------------- */
  var KEY = 'pixel-pet-english-v1';
  var OLD_KEY = 'kids-english-v1';  // 重命名迁移：旧 key 数据一次性读出并搬过来后删除
  var DEFAULT_STATE = {
    words: {},          // word -> {box, due, seen, right, wrong}
    days: {},           // 'YYYY-MM-DD' -> {words, right, wrong, ms, lessons}
    pet: { name: '小恐龙', species: 'dragon', level: 1, xp: 0, sati: 70, mood: 80, clean: 80, food: 0, toy: 0, soap: 0, fedTotal: 0, lastTick: 0, lastPlay: 0, petsDate: '', petsToday: 0, poop: { t: 0, n: 0 } },
    /* 三个任务量各管各的：dailyGoal=学单词，quizGoal=闯关，phGoal=拼读。
       之前只有 dailyGoal 一个，三个 tab 共用 —— 但它们是三件不同的事：
       跟读是产出（要张嘴、要录音），闯关是辨认（选一选就行），拼读是拆音。
       一次要张嘴 8 次、只认 4 次是合理的，硬绑在一起反而不能调。
       老存档里只有 dailyGoal，另两个走 DEFAULT_STATE 的默认值。 */
    settings: { dailyGoal: 8, quizGoal: 8, phGoal: 5, band: 'L1', accent: 'us', autoNext: true, showIpa: false, asrKey: '', asrModel: 'XingChenAGI/XingChenASR-V3.2-Ultra' },
    hints: { swipe: 0 },   // 用过一次就记一笔：卡片可滑动这件事，提示两次就够了
    lastActive: null,
    streak: 0
  };

  // Preview has its own state and never loads or migrates a player's save.
  var S = PET_TEST_SPECIES ? JSON.parse(JSON.stringify(DEFAULT_STATE)) : load();

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
      /* 默认宠物名 "小火龙" 改为 "小恐龙"，老存档里名字仍是"小火龙"的同步替换 */
      if (m.pet && m.pet.name === '小火龙') m.pet.name = '小恐龙';
      /* v5: 教材分册 → 难度分层。老存档记的是 settings.book（g1a/g1b/g2a），
         新版读 settings.band（L1/L2/L3A1/L3A2/L3B/L3C）。一上/一下/二上 大致对应 L1 起点，
         但 L1 现在同时包含三册原有的 137 词，所以直接落到 L1 而不是逐册还原：
         老进度落在 words 里是按词记的，不依赖册，切层不会丢任何进度。 */
      if (m.settings && m.settings.book != null) { delete m.settings.book; m.settings.band = 'L1'; }
      if (m.settings && !m.settings.band) m.settings.band = 'L1';
      /* v7: KET 层按 Oxford CEFR 拆成 L3A/L3B/L3C。v6 的存档把 1325 个 KET 词
         统称 L3，落到 L3A（959 词，与原 L3 覆盖面最接近），而不是 L3B/L3C——
         孩子原本够得着的那部分就是 A1/A2。 */
      if (m.settings && m.settings.band === 'L3') m.settings.band = 'L3A';
      /* v8: L3A 再按 A1/A2 拆成 L3A1/L3A2，理由是把 43→959 的 916 词断崖劈成两半。
         必须显式迁移，不能指望下面那条不变量兜底：老存档的 'L3A' 会掉进
         BAND_ORDER.indexOf < 0 而被重置成 L1，把选了宽层的孩子打回最保守的一层。
         落到 L3A1（629 词）而不是 L3A2：老存档记 L3A 意味着「已经能学 A1+A2」，
         挪到更窄的 A2 反而收窄了原有覆盖面，方向反了。 */
      if (m.settings && m.settings.band === 'L3A') m.settings.band = 'L3A1';
      /* 不变量兜底，而不是继续往上加 if。learningPool() 拿到一个 BAND_ORDER
         里没有的 band 时 indexOf 返回 -1，词池会静默塌回 L1：孩子已经学完的
         层全部消失，且界面不报错。改名后的老存档正是这个形状。任何遗留值一律
         回落 L1（最保守的一层），宁可少学也不假装。 */
      if (m.settings && BAND_ORDER.indexOf(m.settings.band) < 0) m.settings.band = 'L1';
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
    if (PET_TEST_SPECIES) return;
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

  /* 一个词的「可拼读分段」—— 词卡的字素块 / 拼一拼 / 逐段发音都走这里。
     L3 分量的词在打包时被瘦身掉 pindu（连例句一起，省 1.2 MB），但字素表
     例词高亮要的那部分会以 [letters, sound] 元组留着，并打 slimPindu 标记。
     那份是给「定位」用的，没有逐段音频 —— 直接拿它渲染拼读块会得到一排
     点下去没声的按钮。所以交互侧一律走 fullPindu()，它只认完整形状；
     唯一例外是字素表高亮（phPinduSeg），那里要的正是「能定位就行」。 */
  function fullPindu(word) {
    var rec = WORDS[word];
    if (!rec || rec.slimPindu) return [];
    return rec.pindu || [];
  }

  /* Word pronunciation: real recording -> youdao TTS -> browser TTS */
  /* Audio URL for a word.
     Slimmed words (the L3 reserve) carry a single `audioId` instead of a pair
     of full URLs — the source site's British and American recordings are the
     same file under two paths, verified identical for all 1462 words, so
     storing both was 115 KB of duplicate string. */
  var AUDIO_BASE = (window.__WORDS__.audioBase) || '';
  function audioUrlOf(w, accent) {
    if (!w) return null;
    if (w.us && w.us.audio) {
      if (accent !== 'uk') return w.us.audio;
      return (w.uk && w.uk.audio) || w.us.audio;
    }
    if (w.audioId && AUDIO_BASE) return AUDIO_BASE + accent + '/' + w.audioId + '.mp3';
    return null;
  }
  function speakWord(word) {
    var url = audioUrlOf(WORDS[word], S.settings.accent);
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
  function dueWords(pool) {
    var now = Date.now();
    return pool.filter(function (w) {
      var st = S.words[w];
      return !st || st.lastSeen === 0 || st.due <= now;
    });
  }
  function bandWords(lv) { return wordsInBand(lv); }
  function currentBandWords() { return bandWords(S.settings.band); }

  /* The pool a child works through, in difficulty order.
     This is the single source both the home screen and the quiz read from —
     if they disagreed, the daily card and the actual questions would describe
     different things.

     The pool runs from L1 up to the band the child is on, and it AUTO-ADVANCES:
     if every allowed word has been seen but a higher band still has unseen
     words, the ceiling moves up one band at a time until there is something new
     left. Without this the child would finish L1, find nothing to learn, and
     have to notice a switch in the settings and press it — the app would be
     "done" at 94 words and stay there.

     New words come first, and only from the current band and below, so a
     beginner never meets a word from the wide band. Once the new words run out,
     Ebbinghaus takes over. The final fallback exists because a fully-learned
     band can legitimately have zero due words (the SRS interval stretches to
     60 days) and an empty queue is worse than a random one. */
  function learningPool() {
    var ceiling = BAND_ORDER.indexOf(S.settings.band);
    if (ceiling < 0) ceiling = 0;
    var allowed, unseen;
    for (;;) {
      allowed = [];
      for (var i = 0; i <= ceiling; i++) allowed = allowed.concat(bandWords(BAND_ORDER[i]));
      if (!allowed.length) allowed = Object.keys(WORDS);
      unseen = allowed.filter(function (w) { var st = S.words[w]; return !st || !st.seen; });
      if (unseen.length || ceiling >= BAND_ORDER.length - 1) break;
      /* Is there unseen material ANYWHERE above, not just in the very next
         band? Checking only BAND_ORDER[ceiling + 1] dead-ends: a child who
         learned L2 out of order (or whose L2 was added to the library after
         they finished it) has an empty L2 above a full L3, and the climb
         stops at L1 forever. The wide band is the whole reason the library
         has a ceiling at all — skip to it. */
      var above = false;
      for (var k = ceiling + 1; k < BAND_ORDER.length; k++) {
        if (bandWords(BAND_ORDER[k]).some(function (w) { var st = S.words[w]; return !st || !st.seen; })) {
          above = true;
          break;
        }
      }
      if (!above) break;
      ceiling++;
    }
    /* 学完整个词库的孩子原来会被锁死在设置档自己那一层：全库都没有新词，
       升层循环就地 break，ceiling 停在起点，"复习"队列只剩 L1 的 94 个词。
       这正是分层想消灭的"学完即废"，只是换了个位置发生。
       到了这一步，「层」已经不是边界了——没有新词需要挡住，层与层的差别
       只剩复习轮换的顺序，所以放开成全库。上面那条 unseen 分支保证这里
       只在整库学完时触发：只要还有新词，unseen 非空就直接跳过。 */
    if (!unseen.length) {
      var everything = Object.keys(WORDS);
      if (everything.length > allowed.length) allowed = everything;
    }
    if (unseen.length) return { list: unseen, reviewing: false, pool: allowed, band: BAND_ORDER[ceiling] };
    var due = dueWords(allowed);
    return {
      list: due.length ? due : allowed,
      reviewing: true,
      pool: allowed,
      band: BAND_ORDER[ceiling]
    };
  }

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
    var stageBefore = petStageIdx();
    while (S.pet.xp >= xpNeed(S.pet.level)) {
      S.pet.xp -= xpNeed(S.pet.level);
      S.pet.level++;
      toast('🎉 ' + S.pet.name + ' 升到 ' + S.pet.level + ' 级啦！');
      beep('ok');
    }
    var stageAfter = petStageIdx();
    if (stageAfter !== stageBefore) celebrateEvolution(stageBefore, stageAfter);
    save();
  }
  /* 进化仪式：换形态的那一刻要被孩子看见（星星粒子 + 提示 + 开心跳），
     不能只在后台悄悄换图——成长感知是这个游戏的核心激励。提示立刻弹；
     开心跳延迟到触发进化的那套动作（如吃饭）播完后上演，否则会被
     playAction 的 clearTimeout 掉。 */
  function celebrateEvolution(before, after) {
    var nameOf = function (st) { return st === 0 ? '蛋宝宝' : curSpecies().stages[st - 1]; };
    toast('✨ ' + S.pet.name + ' 从 ' + nameOf(before) + '进化成 ' + nameOf(after) + ' 啦！');
    spawnFx('star', 6);
    setTimeout(function () {
      spawnFx('star', 4);
      playAction('happy', 'happy', 1800);
    }, 1200);
    beep('ok');
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
    dragon: { label: '小龙', emoji: '🦖', stages: ['小绒球', '小龙崽', '小火龙'],
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
    im.onload = function () {
      PET_IMG_EL[k] = im;
      if (PET_TEST_SPECIES) drawPetTest(); else petDraw();
    };
    im.src = PET_IMGS[k];
  });
  /* 每物种帧映射：stage=成长阶段主帧（含 0=蛋），expr=表情/动作→帧数组（多帧循环）或单 key（静态），
     walk=走路循环帧前缀。idle 按阶段分级，每级自带呼吸 A/B，避免 baby 阶段切换到 idle 时
     突然放大成 adult 尺寸。egg 是 PNG 蛋（替代原字符画），idle-0/1 做微 wobble。 */
  var PET_FRAMES = {
    cat: { stage: { 0: 'cat-egg-v2', 1: 'cat-baby-v2', 2: 'cat-kid-v2', 3: 'cat-adult-v2' },
           expr: { idle:    { 0: ['cat-egg-v2-idle-0', 'cat-egg-v2-idle-1'],
                              /* 站姿及全部动作来自选定 mmx 图量化后的 v2 帧（每阶段独立锚点，
                                 见 docs/sprites/HANDOFF-2026-09-16-cat-mmx-base.md）；
                                 蛋壳斑点仍由 EGG_SPOTS 运行时叠加 */
                              1: ['cat-baby-v2-idle-0', 'cat-baby-v2-idle-1'],
                              2: ['cat-kid-v2-idle-0',  'cat-kid-v2-idle-1'],
                              3: ['cat-adult-v2-idle-0','cat-adult-v2-idle-1'] },
                   /* blink/eat/happy 按阶段分级，避免 baby 阶段点眨眼显示大猫 */
                   blink:   { 0: ['cat-egg-v2-blink'],
                              1: ['cat-baby-v2-blink'],
                              2: ['cat-kid-v2-blink'],
                              3: ['cat-adult-v2-blink'] },
                   eat:     { 0: ['cat-egg-v2-eat'],
                              /* 闭嘴 / 张嘴 / 带碎屑咀嚼，五官随整只猫同步起伏 */
                              1: ['cat-baby-v2-eat-0', 'cat-baby-v2-eat-1', 'cat-baby-v2-eat-2'],
                              2: ['cat-kid-v2-eat-0', 'cat-kid-v2-eat-1', 'cat-kid-v2-eat-2'],
                              3: ['cat-adult-v2-eat-0', 'cat-adult-v2-eat-1', 'cat-adult-v2-eat-2'] },
                   sleep:   { 0: ['cat-egg-v2-sleep-0', 'cat-egg-v2-sleep-1'],
                              1: ['cat-baby-v2-sleep-0', 'cat-baby-v2-sleep-1'],
                              2: ['cat-kid-v2-sleep-0', 'cat-kid-v2-sleep-1'],
                              3: ['cat-adult-v2-sleep-0', 'cat-adult-v2-sleep-1'] },
                   happy:   { 0: ['cat-egg-v2-happy'],
                              1: ['cat-baby-v2-happy-0', 'cat-baby-v2-happy-1', 'cat-baby-v2-happy-2'],
                              2: ['cat-kid-v2-happy-0', 'cat-kid-v2-happy-1', 'cat-kid-v2-happy-2'],
                              3: ['cat-adult-v2-happy-0', 'cat-adult-v2-happy-1', 'cat-adult-v2-happy-2'] },
                   /* P1/P2 状态按成长阶段保留原轮廓，只在脸部做差分 */
                   excited: { 0: ['cat-egg-v2-excited-0', 'cat-egg-v2-excited-1', 'cat-egg-v2-excited-2'],
                              1: ['cat-baby-v2-excited-0', 'cat-baby-v2-excited-1', 'cat-baby-v2-excited-2'],
                              2: ['cat-kid-v2-excited-0', 'cat-kid-v2-excited-1', 'cat-kid-v2-excited-2'],
                              3: ['cat-adult-v2-excited-0', 'cat-adult-v2-excited-1', 'cat-adult-v2-excited-2'] },
                   big:     { 0: ['cat-egg-v2-excited-0', 'cat-egg-v2-excited-1', 'cat-egg-v2-excited-2'],
                              1: ['cat-baby-v2-excited-0', 'cat-baby-v2-excited-1', 'cat-baby-v2-excited-2'],
                              2: ['cat-kid-v2-excited-0', 'cat-kid-v2-excited-1', 'cat-kid-v2-excited-2'],
                              3: ['cat-adult-v2-excited-0', 'cat-adult-v2-excited-1', 'cat-adult-v2-excited-2'] },
                   droopy:  { 0: ['cat-egg-v2-droopy'],
                              1: ['cat-baby-v2-droopy'], 2: ['cat-kid-v2-droopy'], 3: ['cat-adult-v2-droopy'] },
                   sad:     { 0: ['cat-egg-v2-sad-0', 'cat-egg-v2-sad-1'],
                              1: ['cat-baby-v2-sad-0', 'cat-baby-v2-sad-1'],
                              2: ['cat-kid-v2-sad-0', 'cat-kid-v2-sad-1'],
                              3: ['cat-adult-v2-sad-0', 'cat-adult-v2-sad-1'] },
                   wash:    { 0: ['cat-egg-v2-wash-0', 'cat-egg-v2-wash-1'],
                              1: ['cat-baby-v2-wash-0', 'cat-baby-v2-wash-1'],
                              2: ['cat-kid-v2-wash-0', 'cat-kid-v2-wash-1'],
                              3: ['cat-adult-v2-wash-0', 'cat-adult-v2-wash-1'] },
                   grunt:   { 0: ['cat-egg-v2-grunt-0', 'cat-egg-v2-grunt-1'],
                              1: ['cat-baby-v2-grunt-0', 'cat-baby-v2-grunt-1'],
                              2: ['cat-kid-v2-grunt-0', 'cat-kid-v2-grunt-1'],
                              3: ['cat-adult-v2-grunt-0', 'cat-adult-v2-grunt-1'] } },
           walk: { 1: 'cat-baby-v2-walk-', 2: 'cat-kid-v2-walk-', 3: 'cat-adult-v2-walk-' } },
    /* 狗（dog）— 与猫共享蛋壳 cat-egg-v2-*（运行时按物种主色染斑点），
       金毛三阶段参考图量化后生成表情与整只蹦跳，每阶段独立五官锚点 */
    dog: { stage: { 0: 'cat-egg-v2', 1: 'dog-baby-v2', 2: 'dog-kid-v2', 3: 'dog-adult-v2' },
           expr: { idle:    { 0: ['cat-egg-v2-idle-0', 'cat-egg-v2-idle-1'],
                              1: ['dog-baby-v2-idle-0', 'dog-baby-v2-idle-1'],
                              2: ['dog-kid-v2-idle-0',  'dog-kid-v2-idle-1'],
                              3: ['dog-adult-v2-idle-0','dog-adult-v2-idle-1'] },
                   blink:   { 0: ['cat-egg-v2-blink'],
                              1: ['dog-baby-v2-blink'],
                              2: ['dog-kid-v2-blink'],
                              3: ['dog-adult-v2-blink'] },
                   eat:     { 0: ['cat-egg-v2-eat'],
                              1: ['dog-baby-v2-eat-0', 'dog-baby-v2-eat-1', 'dog-baby-v2-eat-2'],
                              2: ['dog-kid-v2-eat-0', 'dog-kid-v2-eat-1', 'dog-kid-v2-eat-2'],
                              3: ['dog-adult-v2-eat-0', 'dog-adult-v2-eat-1', 'dog-adult-v2-eat-2'] },
                   sleep:   { 0: ['cat-egg-v2-sleep-0', 'cat-egg-v2-sleep-1'],
                              1: ['dog-baby-v2-sleep-0', 'dog-baby-v2-sleep-1'],
                              2: ['dog-kid-v2-sleep-0', 'dog-kid-v2-sleep-1'],
                              3: ['dog-adult-v2-sleep-0', 'dog-adult-v2-sleep-1'] },
                   happy:   { 0: ['cat-egg-v2-happy'],
                              1: ['dog-baby-v2-happy-0', 'dog-baby-v2-happy-1', 'dog-baby-v2-happy-2'],
                              2: ['dog-kid-v2-happy-0', 'dog-kid-v2-happy-1', 'dog-kid-v2-happy-2'],
                              3: ['dog-adult-v2-happy-0', 'dog-adult-v2-happy-1', 'dog-adult-v2-happy-2'] },
                   excited: { 0: ['cat-egg-v2-excited-0', 'cat-egg-v2-excited-1', 'cat-egg-v2-excited-2'],
                              1: ['dog-baby-v2-excited-0', 'dog-baby-v2-excited-1', 'dog-baby-v2-excited-2'],
                              2: ['dog-kid-v2-excited-0', 'dog-kid-v2-excited-1', 'dog-kid-v2-excited-2'],
                              3: ['dog-adult-v2-excited-0', 'dog-adult-v2-excited-1', 'dog-adult-v2-excited-2'] },
                   big:     { 0: ['cat-egg-v2-excited-0', 'cat-egg-v2-excited-1', 'cat-egg-v2-excited-2'],
                              1: ['dog-baby-v2-excited-0', 'dog-baby-v2-excited-1', 'dog-baby-v2-excited-2'],
                              2: ['dog-kid-v2-excited-0', 'dog-kid-v2-excited-1', 'dog-kid-v2-excited-2'],
                              3: ['dog-adult-v2-excited-0', 'dog-adult-v2-excited-1', 'dog-adult-v2-excited-2'] },
                   droopy:  { 0: ['cat-egg-v2-droopy'],
                              1: ['dog-baby-v2-droopy'], 2: ['dog-kid-v2-droopy'], 3: ['dog-adult-v2-droopy'] },
                   sad:     { 0: ['cat-egg-v2-sad-0', 'cat-egg-v2-sad-1'],
                              1: ['dog-baby-v2-sad-0', 'dog-baby-v2-sad-1'],
                              2: ['dog-kid-v2-sad-0', 'dog-kid-v2-sad-1'],
                              3: ['dog-adult-v2-sad-0', 'dog-adult-v2-sad-1'] },
                   wash:    { 0: ['cat-egg-v2-wash-0', 'cat-egg-v2-wash-1'],
                              1: ['dog-baby-v2-wash-0', 'dog-baby-v2-wash-1'],
                              2: ['dog-kid-v2-wash-0', 'dog-kid-v2-wash-1'],
                              3: ['dog-adult-v2-wash-0', 'dog-adult-v2-wash-1'] },
                   grunt:   { 0: ['cat-egg-v2-grunt-0', 'cat-egg-v2-grunt-1'],
                              1: ['dog-baby-v2-grunt-0', 'dog-baby-v2-grunt-1'],
                              2: ['dog-kid-v2-grunt-0', 'dog-kid-v2-grunt-1'],
                              3: ['dog-adult-v2-grunt-0', 'dog-adult-v2-grunt-1'] } },
           walk: { 1: 'dog-baby-v2-walk-', 2: 'dog-kid-v2-walk-', 3: 'dog-adult-v2-walk-' } },
    fox: { stage: { 0: 'cat-egg-v2', 1: 'fox-kid-v2', 2: 'fox-teen-v2', 3: 'fox-adult-v2' },
           expr: { idle:     { 0: ['cat-egg-v2-idle-0','cat-egg-v2-idle-1'],
                                1: ['fox-kid-v2-idle-0','fox-kid-v2-idle-1'],
                                2: ['fox-teen-v2-idle-0','fox-teen-v2-idle-1'],
                                3: ['fox-adult-v2-idle-0','fox-adult-v2-idle-1'] },
                   blink:    { 0: ['cat-egg-v2-blink'],
                                1: ['fox-kid-v2-blink'], 2: ['fox-teen-v2-blink'], 3: ['fox-adult-v2-blink'] },
                   eat:      { 0: ['cat-egg-v2-eat'],
                                1: ['fox-kid-v2-eat-0','fox-kid-v2-eat-1','fox-kid-v2-eat-2'],
                                2: ['fox-teen-v2-eat-0','fox-teen-v2-eat-1','fox-teen-v2-eat-2'],
                                3: ['fox-adult-v2-eat-0','fox-adult-v2-eat-1','fox-adult-v2-eat-2'] },
                   sleep:    { 0: ['cat-egg-v2-sleep-0','cat-egg-v2-sleep-1'],
                                1: ['fox-kid-v2-sleep-0','fox-kid-v2-sleep-1'],
                                2: ['fox-teen-v2-sleep-0','fox-teen-v2-sleep-1'],
                                3: ['fox-adult-v2-sleep-0','fox-adult-v2-sleep-1'] },
                   happy:    { 0: ['cat-egg-v2-happy'],
                                1: ['fox-kid-v2-happy-0','fox-kid-v2-happy-1','fox-kid-v2-happy-2'],
                                2: ['fox-teen-v2-happy-0','fox-teen-v2-happy-1','fox-teen-v2-happy-2'],
                                3: ['fox-adult-v2-happy-0','fox-adult-v2-happy-1','fox-adult-v2-happy-2'] },
                   excited:  { 0: ['cat-egg-v2-excited-0','cat-egg-v2-excited-1','cat-egg-v2-excited-2'],
                                1: ['fox-kid-v2-excited-0','fox-kid-v2-excited-1','fox-kid-v2-excited-2'],
                                2: ['fox-teen-v2-excited-0','fox-teen-v2-excited-1','fox-teen-v2-excited-2'],
                                3: ['fox-adult-v2-excited-0','fox-adult-v2-excited-1','fox-adult-v2-excited-2'] },
                   big:      { 0: ['cat-egg-v2-excited-0','cat-egg-v2-excited-1','cat-egg-v2-excited-2'],
                                1: ['fox-kid-v2-excited-0','fox-kid-v2-excited-1','fox-kid-v2-excited-2'],
                                2: ['fox-teen-v2-excited-0','fox-teen-v2-excited-1','fox-teen-v2-excited-2'],
                                3: ['fox-adult-v2-excited-0','fox-adult-v2-excited-1','fox-adult-v2-excited-2'] },
                   droopy:   { 0: ['cat-egg-v2-droopy'],
                                1: ['fox-kid-v2-droopy'], 2: ['fox-teen-v2-droopy'], 3: ['fox-adult-v2-droopy'] },
                   sad:      { 0: ['cat-egg-v2-sad-0','cat-egg-v2-sad-1'],
                                1: ['fox-kid-v2-sad-0','fox-kid-v2-sad-1'],
                                2: ['fox-teen-v2-sad-0','fox-teen-v2-sad-1'],
                                3: ['fox-adult-v2-sad-0','fox-adult-v2-sad-1'] },
                   wash:     { 0: ['cat-egg-v2-wash-0','cat-egg-v2-wash-1'],
                                1: ['fox-kid-v2-wash-0','fox-kid-v2-wash-1'],
                                2: ['fox-teen-v2-wash-0','fox-teen-v2-wash-1'],
                                3: ['fox-adult-v2-wash-0','fox-adult-v2-wash-1'] },
                   grunt:    { 0: ['cat-egg-v2-grunt-0','cat-egg-v2-grunt-1'],
                                1: ['fox-kid-v2-grunt-0','fox-kid-v2-grunt-1'],
                                2: ['fox-teen-v2-grunt-0','fox-teen-v2-grunt-1'],
                                3: ['fox-adult-v2-grunt-0','fox-adult-v2-grunt-1'] } },
           walk: { 1: 'fox-kid-v2-walk-', 2: 'fox-teen-v2-walk-', 3: 'fox-adult-v2-walk-' } },
    dragon: { stage: { 0: 'cat-egg-v2', 1: 'dragon-kid-v2', 2: 'dragon-teen-v2', 3: 'dragon-adult-v2' },
           expr: { idle:     { 0: ['cat-egg-v2-idle-0','cat-egg-v2-idle-1'],
                                1: ['dragon-kid-v2-idle-0','dragon-kid-v2-idle-1'],
                                2: ['dragon-teen-v2-idle-0','dragon-teen-v2-idle-1'],
                                3: ['dragon-adult-v2-idle-0','dragon-adult-v2-idle-1'] },
                   blink:    { 0: ['cat-egg-v2-blink'],
                                1: ['dragon-kid-v2-blink'], 2: ['dragon-teen-v2-blink'], 3: ['dragon-adult-v2-blink'] },
                   eat:      { 0: ['cat-egg-v2-eat'],
                                1: ['dragon-kid-v2-eat-0','dragon-kid-v2-eat-1','dragon-kid-v2-eat-2'],
                                2: ['dragon-teen-v2-eat-0','dragon-teen-v2-eat-1','dragon-teen-v2-eat-2'],
                                3: ['dragon-adult-v2-eat-0','dragon-adult-v2-eat-1','dragon-adult-v2-eat-2'] },
                   sleep:    { 0: ['cat-egg-v2-sleep-0','cat-egg-v2-sleep-1'],
                                1: ['dragon-kid-v2-sleep-0','dragon-kid-v2-sleep-1'],
                                2: ['dragon-teen-v2-sleep-0','dragon-teen-v2-sleep-1'],
                                3: ['dragon-adult-v2-sleep-0','dragon-adult-v2-sleep-1'] },
                   happy:    { 0: ['cat-egg-v2-happy'],
                                1: ['dragon-kid-v2-happy-0','dragon-kid-v2-happy-1','dragon-kid-v2-happy-2'],
                                2: ['dragon-teen-v2-happy-0','dragon-teen-v2-happy-1','dragon-teen-v2-happy-2'],
                                3: ['dragon-adult-v2-happy-0','dragon-adult-v2-happy-1','dragon-adult-v2-happy-2'] },
                   excited:  { 0: ['cat-egg-v2-excited-0','cat-egg-v2-excited-1','cat-egg-v2-excited-2'],
                                1: ['dragon-kid-v2-excited-0','dragon-kid-v2-excited-1','dragon-kid-v2-excited-2'],
                                2: ['dragon-teen-v2-excited-0','dragon-teen-v2-excited-1','dragon-teen-v2-excited-2'],
                                3: ['dragon-adult-v2-excited-0','dragon-adult-v2-excited-1','dragon-adult-v2-excited-2'] },
                   big:      { 0: ['cat-egg-v2-excited-0','cat-egg-v2-excited-1','cat-egg-v2-excited-2'],
                                1: ['dragon-kid-v2-excited-0','dragon-kid-v2-excited-1','dragon-kid-v2-excited-2'],
                                2: ['dragon-teen-v2-excited-0','dragon-teen-v2-excited-1','dragon-teen-v2-excited-2'],
                                3: ['dragon-adult-v2-excited-0','dragon-adult-v2-excited-1','dragon-adult-v2-excited-2'] },
                   droopy:   { 0: ['cat-egg-v2-droopy'],
                                1: ['dragon-kid-v2-droopy'], 2: ['dragon-teen-v2-droopy'], 3: ['dragon-adult-v2-droopy'] },
                   sad:      { 0: ['cat-egg-v2-sad-0','cat-egg-v2-sad-1'],
                                1: ['dragon-kid-v2-sad-0','dragon-kid-v2-sad-1'],
                                2: ['dragon-teen-v2-sad-0','dragon-teen-v2-sad-1'],
                                3: ['dragon-adult-v2-sad-0','dragon-adult-v2-sad-1'] },
                   wash:     { 0: ['cat-egg-v2-wash-0','cat-egg-v2-wash-1'],
                                1: ['dragon-kid-v2-wash-0','dragon-kid-v2-wash-1'],
                                2: ['dragon-teen-v2-wash-0','dragon-teen-v2-wash-1'],
                                3: ['dragon-adult-v2-wash-0','dragon-adult-v2-wash-1'] },
                   grunt:    { 0: ['cat-egg-v2-grunt-0','cat-egg-v2-grunt-1'],
                                1: ['dragon-kid-v2-grunt-0','dragon-kid-v2-grunt-1'],
                                2: ['dragon-teen-v2-grunt-0','dragon-teen-v2-grunt-1'],
                                3: ['dragon-adult-v2-grunt-0','dragon-adult-v2-grunt-1'] } },
           walk: { 1: 'dragon-kid-v2-walk-', 2: 'dragon-teen-v2-walk-', 3: 'dragon-adult-v2-walk-' } }
  };
  /* 蛋斑点坐标（相对于 29×44 蛋帧，内容 y=4-39）。斑点不在 PNG 里，drawPet 按当前宠物主色
     运行时叠加，这样一套蛋帧通用、斑点颜色可随宠物类型替换。耀西蛋(Yoshi)风格：
     2大(5x5)+2中(3x3)+2小(1x1)，不对称错落分布，避开脸部(眼/腮红/嘴)。 */
  var EGG_SPOTS = [
    [14,6],
    [6,7],
    [5,8],[6,8],[7,8],
    [4,9],[5,9],[6,9],[7,9],[8,9],
    [5,10],[6,10],[7,10],
    [6,11],
    [22,13],
    [21,14],[22,14],[23,14],
    [20,15],[21,15],[22,15],[23,15],[24,15],
    [21,16],[22,16],[23,16],
    [22,17],
    [4,26],
    [3,27],[4,27],[5,27],
    [4,28],
    [17,33],
    [16,34],[17,34],[18,34],
    [17,35],
    [9,36]
  ];
  /* 各表情/动作的多帧切换间隔（ms）。单帧数组不需要切换。 */
  var PET_EXPR_INTERVAL = {
    idle: 800, blink: 170, eat: 280, sleep: 700,
    happy: 180, excited: 220, droopy: 800, sad: 380, wash: 220, grunt: 240
  };

  var petAnim = { blinkTimer: null, dreamTimer: null, actionTimer: null,
                  exprTimer: null, exprIdx: {},
                  baseExpr: 'idle', actionExpr: null };
  /* stageOverride: 0蛋 1宝宝 2/3 物种剪影；缺省画当前宠物阶段（图鉴/试验台预览用）
     walking: 走路中 → 换用 *-side 侧面剪影（朝右画，向左走由 face-left 翻转），不叠正面表情 */
  function drawPet(cv, expr, stageOverride, walking, preview) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;   // jsdom 等无 canvas 实现下静默跳过
    var px = cv.width / 16;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var stage = stageOverride == null ? petStageIdx() : stageOverride;
    var species = preview && preview.species || petSpeciesKey();
    var sp = PET_SPECIES[species] || curSpecies();
    var frameIdx = preview && preview.frame != null ? preview.frame : (petAnim.exprIdx[expr] || 0);
    var key = stage === 0 ? 'egg' : (stage === 1 ? 'baby' : (sp.art[stage - 2] || 'baby'));
    /* PNG 帧分支（试点物种）：统一 48×48 画布，底边对齐保持站地面一致 */
    var fr = PET_FRAMES[species];
    if (fr && stage >= 0) {
      var fk = null;
      if (walking && stage >= 1 && fr.walk && (preview || !petAnim.actionExpr)) {
        var walkPrefix = typeof fr.walk === 'string' ? fr.walk : fr.walk[stage];
        var walkIdx = preview && preview.frame != null ? preview.frame : (petWalk.frameIdx || 0);
        if (walkPrefix) fk = walkPrefix + (walkIdx % 7);
      }
      else {
        var ev = fr.expr[expr];
        if (Array.isArray(ev)) {
          if (ev.length === 1) fk = ev[0];
          else if (ev.length > 1) fk = ev[frameIdx % ev.length];
        } else if (ev && typeof ev === 'object') {
          // 按阶段分级的 expr（如 idle → {1:[...],2:[...],3:[...]}），避免 baby 切 idle 突然变大成 adult
          var stageArr = ev[stage];
          if (Array.isArray(stageArr)) {
            if (stageArr.length === 1) fk = stageArr[0];
            else if (stageArr.length > 1) fk = stageArr[frameIdx % stageArr.length];
          }
        } else if (typeof ev === 'string') {
          fk = ev;
        }
        if (!fk) fk = fr.stage[stage];
      }
      var el = fk ? PET_IMG_EL[fk] : null;
      if (el) {
        if (cv.width !== 48) { cv.width = 48; cv.height = 48; }   // 设宽即清屏
        ctx.imageSmoothingEnabled = false;
        var eggX = Math.round((48 - el.width) / 2);
        // 小奶猫的右伸尾巴拉宽了素材边界；统一校正主体中心，避免各动作左右跳。
        if (species === 'cat' && stage === 1) eggX += 2;
        var eggY = 48 - el.height;
        ctx.drawImage(el, eggX, eggY);
        /* 蛋阶段：斑点按当前宠物主色运行时叠加（PNG 蛋身无斑点，便于多宠物定制） */
        if (stage === 0) {
          var spotColor = (PET_PALETTES[sp.pals[1]] || PET_PALETTES.egg).B;
          ctx.fillStyle = spotColor;
          for (var si = 0; si < EGG_SPOTS.length; si++) {
            ctx.fillRect(eggX + EGG_SPOTS[si][0], eggY + EGG_SPOTS[si][1], 1, 1);
          }
        }
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
  /* 多帧动画驱动：每 ~180ms 检查当前 expr 并推进其帧下标，重绘画布。
     各 expr 用自己的 PET_EXPR_INTERVAL 节奏——这里用最小间隔做轮询，避免开多定时器。 */
  function startExprAnim() {
    if (petAnim.exprTimer) return;
    petAnim.exprTimer = setInterval(function () {
      var cur = petAnim.actionExpr || petAnim.baseExpr;
      if (!cur) return;
      var fr = PET_FRAMES[petSpeciesKey()];
      if (!fr) return;
      var ev = fr.expr[cur];
      if (ev && typeof ev === 'object') ev = ev[petStageIdx()];
      if (!Array.isArray(ev) || ev.length <= 1) return;
      var interval = PET_EXPR_INTERVAL[cur] || 400;
      // 累加累计时间，到点就翻帧
      petAnim._lastTick = petAnim._lastTick || Date.now();
      var now = Date.now();
      var elapsed = now - petAnim._lastTick;
      if (elapsed < 180) return;   // 轮询节流
      petAnim._lastTick = now;
      // 用 elapsed / interval 估算应该翻几帧（兜底：翻 1 帧）
      var advance = Math.max(1, Math.floor(elapsed / interval));
      petAnim.exprIdx[cur] = ((petAnim.exprIdx[cur] || 0) + advance) % ev.length;
      petDraw();
    }, 180);
  }
  function applyPetLayer(cls, expr, transient) {
    var w = $('#pet-touch');
    if (w) PET_CLASSES.forEach(function (k) { w.classList.remove(k); });
    if (cls && w) w.classList.add(cls);
    if (w) w.classList.remove('walking');   // 表演优先，停止步态（位移过渡自然走完）
    petAnim.actionExpr = transient ? expr : null;
    if (!transient) {
      // 切到新的常驻 expr 时，把它的帧下标归零，让动画从头开始
      if (petAnim.baseExpr !== expr) petAnim.exprIdx[expr] = 0;
      petAnim.baseExpr = expr;
    } else {
      petAnim.exprIdx[expr] = 0;
    }
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
    star: { pal: { G: '#f2b13c', W: '#ffe9a8' }, rows: [
      '...GG...',
      '...GG...',
      '..GGGG..',
      'GGGWWGGG',
      'GGGWWGGG',
      '..GGGG..',
      '...GG...',
      '...GG...'
    ] },
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
    /* 只在首页时才重画。拉屎从触发到落地要 2.7s（走到角落 + 蹲下），这期间
       孩子很可能已经翻到别的页去了 —— 以前这里无条件 go('home')，于是在
       字素表/翻词库里看着一半被强行拽回首页，正在读的内容整个换掉。
       数据本来就存住了（S.pet.poop.n），下次回首页 renderPoops() 自然补上，
       粑粑晚一会儿出现完全没关系，被打断才是真问题。 */
    if (tab === 'home') renderPoops();
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

  /* Build a distractor set.
     Two rules, in priority order:
     1. Never a word the child hasn't met. Options come from the same pool the
        learning card is drawing from, and a word that is only in a level above
        the current one is excluded outright. A distractor you don't know is not
        a distractor, it's noise.
     2. For picture questions the distractors must also HAVE a picture — three
        🔤 tiles beside one 🏫 is not a choice the child can make.
     Prefers a different emoji so the answer isn't guessable from the artwork. */
  function distractors(word, n, needVisual) {
    var pool = learningPool().pool.filter(function (w) { return w !== word; });
    if (needVisual) pool = pool.filter(hasVisual);
    if (pool.length < n) {
      pool = Object.keys(WORDS).filter(function (w) { return w !== word; });
      if (needVisual) pool = pool.filter(hasVisual);
    }
    var vw = visualOf(word).emoji;
    var diff = shuffle(pool.filter(function (w) { return visualOf(w).emoji !== vw; }));
    var same = shuffle(pool.filter(function (w) { return visualOf(w).emoji === vw; }));
    var out = diff.slice(0, n), i = 0;
    while (out.length < n && i < same.length) out.push(same[i++]);
    while (out.length < n) out.push(pick(pool));
    return out;
  }

  function makeQuestion(word) {
    /* A picture question needs a picture on the stem AND on all four options.
       Words with no visual (the weekday glyphs) drop those two modes rather
       than putting a 🔤 placeholder in front of the child. */
    var modes = ['listen2en', 'en2cn', 'cn2en'];
    if (hasVisual(word)) modes = modes.concat(['en2pic', 'pic2en']);
    var mode = pick(modes);
    var needVisual = mode === 'en2pic' || mode === 'pic2en';
    var opts = shuffle([word].concat(distractors(word, 3, needVisual)));
    return { word: word, mode: mode, opts: opts };
  }

  function buildQueue(kind) {
    var lp = learningPool();
    /* 出多少题 = 设置里闯关要几题。以前是 Math.max(goal, 10)：无论设多少
       至少给 10 题，于是「今日闯关 0/5」的达标线和手上 10 道题对不上。
       现在按设置的量给，池子不够就按池子（min），两边说的是同一件事。 */
    var goal = S.settings.quizGoal;
    var pool = lp.list;
    if (kind === 'new') {
      var unseen = lp.pool.filter(function (w) { var st = S.words[w]; return !st || !st.seen; });
      pool = unseen.length ? unseen : lp.list;
    }
    var q = shuffle(pool).slice(0, Math.min(goal, pool.length)).map(makeQuestion);
    quiz.queue = q; quiz.idx = 0; quiz.results = []; quiz.sessionStart = Date.now();
  }

  /* ---------------- views ---------------- */
  var TABS = [
    { id: 'home', label: '首页', ic: '🏠' },
    { id: 'learn', label: '学单词', ic: '📖' },
    { id: 'phonics', label: '拼读', ic: '🔤' },
    { id: 'play', label: '闯关', ic: '🎮' }
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
    /* Leaving the build tab resets the consecutive-letter counter so a
     * child returning after a break doesn't hit the 3-in-a-row cap mid-session. */
    if (tab === 'phonics' && id !== 'phonics' && typeof resetBuildLetterRow === 'function') {
      resetBuildLetterRow();
    }
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
    /* 词库 pill：emoji 独立一段，文字包在 .book-pill-txt 里。
       窄屏（≤420px）CSS 只隐藏文字、保留 emoji —— 六个 emoji 本身就是
       词库标识，完整文字在 ⚙️设置 / 学单词页仍能看到。
       不要退回 textContent：那会抹掉 span，窄屏隐藏就失效了。 */
    if (pill) {
      pill.innerHTML = '<span class="book-pill-ico">' + BAND_META[S.settings.band].emoji
        + '</span><span class="book-pill-txt">' + BAND_META[S.settings.band].short + '</span>';
    }
    if (tab === 'home') renderHome(v);
    else if (tab === 'learn') renderLearn(v);
    else if (tab === 'phonics') renderPhonics(v);
    else if (tab === 'play') renderPlay(v);
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
    var d = dayStat();
    var goal = S.settings.dailyGoal;
    var quizGoal = S.settings.quizGoal;
    var phGoal = S.settings.phGoal;
    /* 第一项跟着 learningPool() 的阶段走：新词没学完是「学单词」，学完了自动
       变成「复习到期词」。cap 取 min(goal, 池子大小) —— 池子就是 buildTodayQueue
       真正会抽的那批，所以首页写的数字和进去之后练到的数量永远一致。
       （原来这里是 Math.min(goal, 8, ...)：那个 8 是魔数硬顶，设置里选了
       「12 词」也还是显示 8，和实际队列对不上，12 档等于半残。）
       复习阶段用 d.reviewOk 而不是 d.newWords：课本学完后没有「首次接触」，
       拿 newWords 去比会永远是 0/8，第一盏灯就再也点不亮了。 */
    var pool = learningPool();
    var cap = Math.min(goal, pool.list.length);
    var doneN = Math.min(pool.reviewing ? (d.reviewOk || 0) : (d.newWords || 0), cap);
    var phDone = Math.min(d.phonics || 0, phGoal);
    return [
      /* dailyPlan 现在和 tabs 一一对应：每个游戏 tab 都对应一项今日任务。
         三项的达标口径统一为「答对数」—— 答错不点灯，和拼读一直以来的
         做法一致。但每项各用各的计数器（newWords / reviewOk、phonics、
         quizOk），不共用 d.right：学单词的跟读通过和闯关答题都写 d.right，
         共用会让「先做完跟读、闯关立刻满格」。 */
      { ic: pool.reviewing ? '🔁' : '📖', title: pool.reviewing ? '复习到期词' : '学单词',
        /* 副标题在窄屏整行隐藏（见 .pi-why 的媒体查询）：标题已经说了
           「学单词 / 复习到期词」，右侧 badge 又是「doneN/cap」，
           这里把动作和数字各说一遍是冗余，宽屏才值得展开成完整句子。 */
        why: pool.reviewing
          ? '新词学完了，今天复习 ' + (cap - doneN) + ' 个到期的词'
          : '今天要学 ' + (cap - doneN) + ' 个新词',
        badge: doneN + '/' + cap,
        done: doneN >= cap, go: 'new' },
      { ic: '🔤', title: '拼读练习', badge: phDone + '/' + phGoal, done: phDone >= phGoal, go: 'phonics' },
      { ic: '🎮', title: '闯关', badge: Math.min(d.quizOk || 0, quizGoal) + '/' + quizGoal, done: (d.quizOk || 0) >= quizGoal, go: 'quiz' }
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
    startExprAnim();
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
      /* 头部三段：标题 + 两组指标。窄屏下指标曾被 flex 压到 23px（需要 148px）
         而中文可任意断行，于是「正确率 0% · 今日 0 分钟」被拆成多行、错成阶梯状。
         修法全在 CSS 的 .task-head / .task-metrics：两层都允许换行，
         宁可整块换行也不许把一句话压碎。

         窄屏只留「正确率」和「连续 N 天」：
         - 今日学习时长挪到统计页（renderStats 里有「学习时长」），首页不重复；
         - 「· doneN/plan.length」和下面任务清单每行的 badge 重复，也删掉。
         两条都在 .task-acc .mins / .task-prog 里，窄屏 display:none。 */
      '<div class="row task-head" style="justify-content:space-between;align-items:baseline;gap:var(--sp-2)">' +
      '<h2 class="section" style="margin:0;font-size:var(--fs-h2);color:var(--ink)">今天的任务</h2>' +
      /* 状态指标（正确率）和打卡的指标（连续天数）性质相同，并排放在标题右侧更紧凑 */
      '<div class="row task-metrics" style="gap:var(--sp-2);align-items:baseline">' +
      '<span class="muted task-acc" style="font-size:var(--fs-label)">正确率 ' + acc + '%' +
      '<span class="mins"> · 今日 ' + Math.round((d.ms || 0) / 60000) + ' 分钟</span></span>' +
      '<span class="pill">🔥 连续 <span class="n">' + (S.streak || 0) + '</span> 天' +
      '<span class="task-prog"> · ' + doneN + '/' + plan.length + '</span></span>' +
      '</div></div>' +
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
      '<div class="row" style="margin-top:var(--sp-3);gap:var(--sp-3);align-items:center">' +
      '<button class="btn big" id="btn-start">🎮 一键开练</button>' +
      '</div>';
    v.appendChild(c2);
    $$('#view .plan-item').forEach(function (b) {
      b.onclick = function () {
        var t = plan[+b.dataset.pi];
        if (t.done) {
          toast('今天的任务完成啦，明天再来～');
          return;
        }
        if (t.go === 'new') enterTodayMode();
        else if (t.go === 'phonics') go('phonics');
        else if (t.go === 'quiz') { buildQueue('mixed'); go('play'); }
      };
    });
    $('#btn-start').onclick = function () {
      var first = plan.filter(function (t) { return !t.done; })[0];
      if (!first) { buildQueue('mixed'); go('play'); return; }
      if (first.go === 'new') enterTodayMode();
      else if (first.go === 'phonics') go('phonics');
      else { buildQueue('mixed'); go('play'); }
    };
  }

  /* ---------- LEARN ---------- */
  var learnIdx = 0;            // 全部词库模式下的当前游标
  var learnMode = 'today';      // 'today' = 今日关卡（默认），'browse' = 全部词库
  var learnQueue = [];          // 今日关卡的词序列（用户级关卡进度，不入 storage）
  var learnPos = 0;             // 今日关卡当前第几个词
  var learnHits = {};           // { 队列下标: 已命中次数 }，回看时保留进度
  var learnPassed = {};         // { 队列下标: true }，已通过并计过分的词
  var learnBusy = false;        // 录音进行中，避免重复触发
  var learnReviewing = false;   // 今日队列是「新词」还是「到期复习」，只影响文案
  var learnFinalWords = [];     // 最近一次识别结果（累积命中判定）
  var learnTimer = null;        // 8s 兜底超时的句柄，必须可清除
  var learnHitScored = false;   // 本次录音是否已判定命中（避免 onend 重复弹提示）
  var learnSession = 0;         // 每次 start 自增；过期的 onend 直接作废，避免翻词后串台
  var learnEnded = true;        // 本次录音是否已真正结束（onend 触发）；用于兜底检测「卡死」
  var learnStuck = 0;           // 当前这个词连续识别失败次数；达阈值才提示「长按自评」
  var learnStartTs = 0;         // 本次录音开始时间（诊断：区分「几乎没录上」vs「听了没声音」）
  var learnEngine = 'sf';       // 当前一轮录音走的引擎：仅硅基流动云端 ASR（'sf'）
  var learnEnterDir = 0;        // 新卡入场方向：1=从右（下一题）、-1=从左
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
  /* 孩子不知道翻词库里的卡片能左右滑。进入 tab 时预置一次提示，卡片真正渲染出来
     才播放并计数；一旦他自己滑成功过，就直接记满，后面不再打扰。 */
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
    if (!learnQueue.length) { v.appendChild(empty('这一层还没有词')); appendBrowseEntry(v); return; }
    if (learnPos >= learnQueue.length) { renderLearnDone(v); appendBrowseEntry(v); return; }

    var word = learnQueue[learnPos];
    /* 能「听」就亮 🎤：浏览器自带识别优先，其次用户配置的硅基流动云端识别 */
    var supported = micEngine() !== 'off';
    var hits = hitsFor(learnPos);
    var passed = !!learnPassed[learnPos];

    var card = el('div', 'card wordcard learn-swipe' + (passed ? ' passed' : ''));
    card.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span class="muted">今日' + (learnReviewing ? '复习' : '新词') + ' · 第 ' + (learnPos + 1) + ' / ' + learnQueue.length + ' 个</span>' +
        '<span class="hits-row">' + hitsHtml(hits) + '</span>' +
      '</div>' +
      learnWordCardHtml(word) +
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
      /* Advancing requires the reading check — the drill is a reading drill,
         and a gate that can be walked past teaches nothing. What changed is HOW
         you advance: one explicit button, matching the phonics and quiz tabs,
         instead of the card's side arrows plus swipe-to-flip.

         There is exactly ONE self-rating control, the ✅ fallback button
         rendered by learnMicBtnHtml when `supported` is false (no key / not a
         secure context). The old extra 「我读过了（自评）」 text button that
         appeared when recognition *did* work was a second way to do the same
         thing, and a confusing one: it sat right under a live microphone, so
         kids tapped it instead of reading. Recognition failing to match is now
         handled by re-trying the mic, not by a button that skips the drill. */
      '<button class="btn green big next-round" id="learn-next"' +
        (passed ? '' : ' disabled title="先跟读出这个词再继续"') +
        ' style="margin-top:var(--sp-4)">' +
        (learnPos >= learnQueue.length - 1 ? '看看今天的结果 🎉' : '下一题 →') + '</button>';
    v.appendChild(card);
    if (learnEnterDir) card.classList.add(learnEnterDir > 0 ? 'card-in-r' : 'card-in-l');
    learnEnterDir = 0;

    bindWordCardPlayback(card, word);
    bindLearnSpeak(card);
    /* 配置 Key 后点 🔄 即时重检引擎并重建卡片，无需整页刷新 */
    var rc = $('#mic-recheck');
    if (rc) rc.onclick = function () { render(); };
    $('#learn-next').onclick = function () { abandonLearnMic(); learnGoNext(); };

    appendBrowseEntry(v);
  }

  function hitsFor(pos) { return learnHits[pos] || 0; }

  /* 翻词箭头：配图左右各一个尖括号，纯 SVG 现画，不依赖任何图片素材。
     左=上一个、右=下一个，和「左滑下一个 / 右滑上一个」的滑动方向一致。
     `lock` 可选，同 bindLearnSwipe：返回字符串则该方向置灰。翻词库是自由
     浏览、循环翻页，不传 lock，两侧永远可点。`noun` 是翻的是词还是字素 ——
     字素表也复用这套箭头，标签得说对，否则读屏会念「上一个词」。 */
  var NAV_PATH = { prev: 'M15 5 L8 12 L15 19', next: 'M9 5 L16 12 L9 19' };
  function navArrowsHtml(prefix, lock, noun) {
    var what = noun || '词';
    return ['prev', 'next'].map(function (dir) {
      var off = lock ? lock(dir) : null;
      var label = (dir === 'prev' ? '上一个' : '下一个') + what;
      return '<button class="wc-nav ' + dir + (off ? ' off' : '') + '"' +
        ' id="' + prefix + '-' + dir + '" title="' + label + '" aria-label="' + label + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + NAV_PATH[dir] + '"/></svg>' +
        '</button>';
    }).join('');
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
    /* 一直识别不出来时，唯一的出路是长按 🎤 自评。这句话只在这时才出现，
       平时不占位，免得孩子看到就想去按它。 */
    if (learnStuck >= STUCK_HINT_AT) return '还是没认出来？长按 🎤 可以自己记一次';
    return hits > 0 ? '很棒！再读 1 次就过关' : '读出 “' + word + '” 吧';
  }

  function bindLearnSpeak(scope) {
    var mic = scope.querySelector('#mic-btn');
    if (mic) mic.onclick = toggleLearnMic;
    /* Long-press the mic = self-rating this word. It replaces the old always-
       visible 「我读过了（自评）」 text button, which sat right under a live
       microphone and got tapped instead of reading.
       The affordance is only DISCOVERABLE once recognition has actually failed
       (learnStuck >= STUCK_HINT_AT → the status line says so), because a kid
       who long-presses by accident must not be able to skip the drill.
       Long-press (not a second button) so the normal card stays two controls:
       read, or move on. */
    if (mic && micEngine() !== 'off') bindLongPress(mic, function () {
      if (learnPassed[learnPos]) return;      // 已过关，长按无意义
      selfRateByLongPress();
    });
    var fb = scope.querySelector('#mic-btn-fb');
    /* Self-rating has no recording behind it: every tap is one independent
     * judgement, so it must NOT go through onLearnHit's `learnHitScored`
     * de-duplication. That flag exists so a single recognition that fires
     * onend twice is counted once — but it is only reset in abandonLearnMic(),
     * which self-rating never reaches. Result: the first tap set the flag, the
     * second tap hit `if (learnHitScored) return`, hits froze at 1 and
     * HITS_GOAL=2 could never be reached — the escape hatch deadlocked the
     * child on a single word. Clear the flag before each self-rating. */
    if (fb) fb.onclick = function () { learnHitScored = false; onLearnHit(); };
  }

  /* 长按识别：500ms 判定，容忍手指轻微抖动。返回解绑函数便于需要时拆。 */
  function bindLongPress(node, fn) {
    var timer = null, fired = false;
    var start = function (e) {
      /* 只响应主键 / 单指；右键、长按菜单不触发 */
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired = false;
      clearTimeout(timer);
      timer = setTimeout(function () { fired = true; fn(); }, 500);
    };
    var end = function () { clearTimeout(timer); timer = null; };
    node.addEventListener('pointerdown', start);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('pointerleave', end);
    /* 长按已触发时，紧随其后的 click 要吃掉，否则会顺带开关一次录音 */
    node.addEventListener('click', function (e) {
      if (!fired) return;
      fired = false;
      e.stopPropagation(); e.preventDefault();
    }, true);
    return function () {
      end();
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      node.removeEventListener('pointerleave', end);
    };
  }

  /* 长按自评：等价于点一次 ✅，走同一套计分与去重规则 */
  function selfRateByLongPress() {
    if (learnBusy) abandonLearnMic();
    learnHitScored = false;
    learnStuck = 0;
    onLearnHit();
    toast('已记一次「我读过了」👍');
  }

  /* ---------- 滑动：跟手位移 + 倾斜 ---------- */
  /* 判定规则由调用方通过 bindLearnSwipe 的 lock 参数传入，翻词库不传即自由滑动。
     「没过关就不许翻页」这条规则已随今日关卡改用「下一题」按钮而移除。 */

  var SWIPE_MIN = 54;   // 判定为「划走」的最小位移
  var SWIPE_SOFT = 110; // 超过后进入阻尼，避免卡片被拖出屏幕
  /* Swipe-to-flip lives on the BROWSE card only. Today's drill advances with a
     button, because gating a button on "have you passed the reading check yet"
     is what used to strand a child on one word. `lock` is optional: return a
     string to refuse that direction (the card still gives resistance so the
     push feels solid rather than dead), or omit it for a free-scrolling card. */
  function bindLearnSwipe(node, go, lock) {
    var locked = function (dir) { return lock ? lock(dir) : null; };
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
      var isLocked = !!locked(dirNow > 0 ? 'next' : 'prev');
      var off = swipeOffset(dx, isLocked);
      node.style.transform = 'translateX(' + off.toFixed(1) + 'px) rotate(' + (off * 0.035).toFixed(2) + 'deg)';
      node.style.opacity = isLocked ? '1' : Math.max(0.5, 1 - Math.abs(off) / 420).toFixed(2);
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
      var reason = locked(dir);
      if (reason) { snapBack(node); toast(reason); return; }
      if (dist < SWIPE_MIN || Date.now() - t0 > 900) { snapBack(node); return; }
      flyOut(node, dir, function () { go(dir); });
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
    var pd = fullPindu(word);
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

  /* 题目里的「再听一遍这个单词」入口。
     学单词页本来就有独立的 🔊/🐢 按钮行，但拼读（拼一拼）和闯关
     （看词选义 / 看图选词 / 中译英）的题面主视觉是纯文本或图片，
     孩子答不上来时最自然的动作是「再听一遍这个词」，却无处可点。
     模式：把喇叭直接挂在词/图下方（inline），不占一整行，也不与选项争夺
     注意力。`id` 传 null 时不渲染——纯听音题（listen2en）题面本身就是喇叭，
     再挂一个会重复。 */
  function wordSpeakHtml(id, label) {
    return '<button class="speak-btn sm q-speak" id="' + id + '" aria-label="再听一遍这个单词">' +
      SPK + '</button>' + (label ? '<div class="muted center" style="margin-top:var(--sp-2)">' + label + '</div>' : '');
  }

  /* 全部词库模式：保留原来的"我记住了 / 上一个 / 下一个"自由翻词体验 */
  function renderLearnBrowse(v) {
    var list = bandWords(S.settings.band);
    if (!list.length) { v.appendChild(empty('这一层还没有词')); return; }
    if (learnIdx >= list.length) learnIdx = 0;
    var word = list[learnIdx];
    var pd = fullPindu(word);

    /* 顶部：第 N 个词 / 总数 + "回到今日关卡"入口 */
    var header = el('div', 'card');
    header.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span class="muted">📚 翻词库 · ' + (learnIdx + 1) + '/' + list.length + '</span>' +
        '<button class="pill pill-btn" id="learn-today">← 回今日关卡</button>' +
      '</div>';
    v.appendChild(header);
    $('#learn-today').onclick = enterTodayMode;

    /* 词卡（复用 today 的视觉；这里只听不跟读，所以只有 🔊 🐢 两个按钮）。
       翻卡交互归这里：左右箭头 + 左右滑动，对应「随便翻翻词库」；今日关卡那边
       改成统一的「下一题」按钮，不再靠滑。词库是循环的，两侧永不禁用。 */
    var browseGo = function (dir) {
      markSwipeLearned();
      learnHintPending = false;
      stopSwipeHintIfAny();
      learnIdx = (learnIdx + (dir === 'next' ? 1 : -1) + list.length) % list.length;
      stopAudio(); render();
    };
    var c = el('div', 'card wordcard learn-swipe');
    c.innerHTML = learnWordCardHtml(word, navArrowsHtml('browse', null)) +
      '<div class="learn-action">' +
        '<button class="speak-btn" id="s1" aria-label="听发音">' + SPK + '</button>' +
        '<button class="speak-btn" id="s2" aria-label="慢速发音">🐢</button>' +
      '</div>';
    v.appendChild(c);
    bindWordCardPlayback(c, word);
    bindLearnSwipe(c, browseGo);
    $('#browse-prev').onclick = function () { browseGo('prev'); };
    $('#browse-next').onclick = function () { browseGo('next'); };
    playSwipeHint(c);

    if (pd.length) {
      var c2 = el('div', 'card');
      c2.innerHTML = '<h2 class="section">拼一拼 · 连着读</h2>' +
        '<div class="pindu" id="pindu">' +
        pd.map(function (p, i) {
          return '<button data-i="' + i + '"><span class="letters">' + (p.letters || p.sound) + '</span></button>';
        }).join('') +
        '</div>' +
        '<div class="row" style="justify-content:center;margin-top:var(--sp-3);gap:var(--sp-2)">' +
        '<button class="btn blue sm" id="pd-all">▶ 连读全部</button>' +
        '<button class="btn ghost sm" id="pd-word">🔊 整词</button>' +
        '</div>' +
        '<div class="muted" style="margin-top:var(--sp-2)">每个方块是一个发音，点一下听它怎么读</div>';
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
            function (m) { return '<span class="ph-hl">' + m + '</span>'; });
          return '<div class="row" style="align-items:flex-start;gap:var(--sp-3);margin-bottom:var(--sp-3)">' +
            '<button class="speak-btn sm" data-ex="' + i + '">' + SPK + '</button>' +
            '<div><div style="font-weight:800;font-size:var(--fs-body)">' + hl + '</div>' +
            '<div class="muted">' + (e.cn || '') + '</div></div></div>';
        }).join('');
      v.appendChild(c3);
      $$('#view [data-ex]').forEach(function (b) {
        b.onclick = function () { speakText(ex[+b.dataset.ex].en); };
      });
    }

    var c4 = el('div', 'card');
    c4.innerHTML = '<div class="row" style="gap:var(--sp-3)">' +
      '<button class="btn green" id="know" style="flex:1;white-space:nowrap">我记住了</button>' +
      '</div>';
    v.appendChild(c4);
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
    /* Not a match. Count it so a word the child simply cannot get past can
       surface the long-press hint instead of trapping them on it forever. */
    markLearnStuck();
    if (heard) toast('听到“' + heard + '”，再试试读 “' + target + '” 🎤');
    else toast('没听到声音…大声读 “' + target + '” 试试');
  }

  /* Consecutive recognition failures on the current word. Reset on a hit, on
     self-rating, and on every page turn (learnGoNext/abandonLearnMic).
     Only at STUCK_HINT_AT does the status line teach the long-press escape —
     before that, a kid who long-presses by accident could skip the drill. */
  var STUCK_HINT_AT = 2;
  function markLearnStuck() {
    if (learnStuck < STUCK_HINT_AT) learnStuck++;
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
      stopCurrentMic(); beep('ok'); toast('已经过关啦，点下面的「下一题」继续 👇');
      return;
    }
    if (learnHitScored) return;     // 同一次录音里结果可能多次命中，只计一次
    learnHitScored = true;
    learnStuck = 0;                 // 命中即清零「卡住」计数
    var h = Math.min(HITS_GOAL, hitsFor(learnPos) + 1);
    learnHits[learnPos] = h;
    stopCurrentMic();
    beep('ok');
    if (h >= HITS_GOAL) markLearnPassed();
    else toast('👏 读得不错！再读 1 次就过关');
    render();
  }

  /* 通过：只在这一刻计分一次。learnPassed 保证滑回来重读不会重复加分。
     跟读是过了 HITS_GOAL 才 grade(true)，所以「答对才算」在这条链上天然成立，
     不需要再按 ok 过滤。 */
  function markLearnPassed() {
    if (learnPassed[learnPos]) return;
    var word = learnQueue[learnPos];
    if (!word) return;
    learnPassed[learnPos] = true;
    grade(word, true);                  /* 记入 SRS + newWords */
    /* 复习进度只写在这里（不写进共享的 grade()），因为闯关也调 grade()，
       答对的复习题不该记到学单词头上。新词进度不另记：grade() 里
       st.seen === 1 那次自增就是「首次接触」，哪个 tab 首次遇到都算。
       两个阶段分开记，是因为 learningPool() 会在新词耗尽的那一刻把任务从
       「学单词」切成「复习到期词」，进度条必须各自从 0 起算，
       否则切换瞬间直接满格。 */
    if (wstate(word).seen > 1) dayStat().reviewOk = (dayStat().reviewOk || 0) + 1;
    gainXp(3, 'food', 2);
    toast('🎤 ' + word + ' 通过！+1 🍖 · 点下面的「下一题」');
  }

  /* 「下一题」：纯导航，不记通过。到末尾即进入结果卡。 */
  function learnGoNext() {
    learnPos = learnPos >= learnQueue.length - 1 ? learnQueue.length : learnPos + 1;
    /* 「卡住」是 per-word 的：翻页必须清零，否则上一个词连着失败会把
       下一个词的提示也一起点亮，孩子一进来就看到「长按自评」。 */
    learnStuck = 0;
    abandonLearnMic(); render();
  }
  function learnGoPrev() {
    if (learnPos <= 0) return;
    learnPos--; learnStuck = 0; abandonLearnMic(); render();
  }
  /* 桌面端没有触摸：方向键映射到翻词库的左右翻词（今日关卡现在是「下一题」按钮，
     不用方向键）。左右与卡片箭头保持一致：← 上一个、→ 下一个。 */
  document.addEventListener('keydown', function (e) {
    if (tab !== 'learn' || learnMode !== 'browse') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); $('#browse-prev') && $('#browse-prev').click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('#browse-next') && $('#browse-next').click(); }
  });

  /* 全部词库模式下的"我记住了"按钮同样走 grade，但不走跟读 */
  function finishBrowseWord() {
    var list = bandWords(S.settings.band);
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
      '<div style="font-size:var(--icon-hero);line-height:1;margin:var(--sp-2) 0 var(--sp-2)">' + (all ? '🎉' : '💪') + '</div>' +
      '<h2 class="section" style="font-size:var(--fs-h2);color:var(--brand-dk)">' +
        (all ? (learnReviewing ? '今日复习全部通关！' : '今日新词全部通关！') : '今日跟读 ' + passed + ' / ' + total + ' 个') + '</h2>' +
      '<div class="muted" style="margin:var(--sp-2) 0 var(--sp-4)">获得 <b>+' + (passed * 3) + ' XP</b> · 宠物 +' +
        passed + ' 🍖' + (all ? '' : ' · 还有 ' + (total - passed) + ' 个没跟读') + '</div>' +
      '<div class="row" style="gap:var(--sp-3);margin-top:var(--sp-4)">' +
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
        '<span class="muted" style="font-size:var(--fs-xs)">全部 ' + bandWords(S.settings.band).length + ' 词 ›</span>' +
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
    /* 切 tab 必须走 go()：render() 只按 tab 分派，不改 tab。
       首页的「一键开练」和「学单词」任务都调这里，直接 render() 会把首页原地重画一遍，
       看起来就是「点了没反应」。已在 learn tab 内时（如「回今日关卡」）go('learn') 同 tab，
       等价于原来的 render()。 */
    go('learn');
  }
  function buildTodayQueue() {
    /* 池子由 learningPool() 定（见那里的理由：学完新词就换成到期复习），
       这里只负责抽 dailyGoal 个。队列仅在会话内有效（不落 storage），
       故同一会话内稳定；重新进入今日模式会基于剩余词重抽一批。
       learnReviewing 跟着队列一起定下来：队列在会话内不变，进度卡和
       结果卡的文案就不该中途改口（新词说成复习会让孩子以为自己学错了）。 */
    var goal = Math.max(1, S.settings.dailyGoal);
    var p = learningPool();
    learnReviewing = p.reviewing;
    return shuffle(p.list).slice(0, goal);
  }

  function playPhoneme(word, i, btn) {
    var p = fullPindu(word)[i];
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
    var pd = fullPindu(word);
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
  /* Used by the build game to label each filled slot and the teaching
   * tag row — module-level so the slot renderer can read it on every render. */
  var KIND_LABEL = { cons: '辅音', vowel: '元音', cteam: '辅音组合', vteam: '元音组合', rctrl: 'r 控元音', silent: '不发音' };

  /* per-grapheme 练习统计 */
  function pstate(letters) {
    if (!S.phonics) S.phonics = {};
    if (!S.phonics[letters]) S.phonics[letters] = { seen: 0, right: 0, wrong: 0 };
    return S.phonics[letters];
  }
  /* Pure per-grapheme stats: no XP, no daily word counter. Shared by
     hear/see (via pgrade) and build (direct call on completion). */
  function phTrack(letters, ok) {
    var st = pstate(letters);
    st.seen++; if (ok) st.right++; else st.wrong++;
    save();
  }
  function pgrade(letters, ok) {
    phTrack(letters, ok);
    if (ok) { gainXp(1, 'toy'); dayStat().phonics = (dayStat().phonics || 0) + 1; }
  }
  /* Single source of truth for "this letter has been seen and practiced enough".
   * `right >= 3 && right >= wrong * 2` is the threshold; used by both the
   * grapheme card's green-check and the build game's unmastered picker. */
  function isPhMastered(letters) {
    var st = S.phonics && S.phonics[letters];
    return !!(st && st.right >= 3 && st.right >= st.wrong * 2);
  }

  var phMode = null;          // 进拼读 tab 时随机选 hear / build；每次"下一个"也随机换
                              // null = 还没选（首次进 tab 时初始化）
  var phQuiz = null;          // {item, options, answered}
  var phBuild = null;         // {word, parts, picked}

  function allPhonemes() {
    var out = [];
    PHONICS.groups.forEach(function (g) { out = out.concat(g.items); });
    return out;
  }
  function phDistractors(item, n) {
    /* Floor: must differ in both letters AND sound. Reason for both:
     * 26 sounds have multiple letter spellings (/s/←[s,ss,c],
     * /k/←[ch,k,c,ck], etc.) — keeping only letters-not-equal lets the
     * child answer /k/ by clicking `c` and be marked wrong even though
     * the sound matches. The single-letter case forces a fall-through
     * to tier 2 (tier 1 collapses to empty), which is expected. */
    var pool = allPhonemes().filter(function (x) {
      return x.letters !== item.letters && x.sound !== item.sound;
    });
    /* Tier 1: same length; within tier, prefer items whose first letter
     * matches the correct item's first letter. */
    var sameLen = pool.filter(function (x) { return x.letters.length === item.letters.length; });
    sameLen.sort(function (a, b) {
      var am = a.letters[0] === item.letters[0] ? 0 : 1;
      var bm = b.letters[0] === item.letters[0] ? 0 : 1;
      return am - bm;
    });
    /* Tier 2: same kind */
    var sameKind = pool.filter(function (x) { return x.kind === item.kind; });
    sameKind.sort(function (a, b) {
      var am = a.letters[0] === item.letters[0] ? 0 : 1;
      var bm = b.letters[0] === item.letters[0] ? 0 : 1;
      return am - bm;
    });
    /* Tier 3: anything (sorted same way, last resort) */
    pool.sort(function (a, b) {
      var am = a.letters[0] === item.letters[0] ? 0 : 1;
      var bm = b.letters[0] === item.letters[0] ? 0 : 1;
      return am - bm;
    });
    var out = [];
    var seen = {};
    function take(tier) {
      for (var i = 0; i < tier.length && out.length < n; i++) {
        var k = tier[i].letters + '|' + tier[i].sound;
        if (!seen[k]) { seen[k] = 1; out.push(tier[i]); }
      }
    }
    take(sameLen);
    take(sameKind);
    take(pool);
    return out.slice(0, n);
  }
  /* 这个字素的例词，当前层里有的排前面。
     it.words 是整库混在一起的，插入顺序不代表相关性 —— 刚学 L1 的孩子先看到
     orange 再看到 jiaozi 没有意义。稳定排序，层内的相对顺序保持原样。
     同样按「层是上限」的口径取到当前层为止，否则选了挑战/补充时 book 是空的，
     排序会静默退化成插入顺序。 */
  function phWordsInBandOrder(item) {
    var upTo = BAND_ORDER.indexOf(S.settings.band);
    if (upTo < 0) upTo = 0;
    var book = [];
    for (var i = 0; i <= upTo; i++) book = book.concat(bandWords(BAND_ORDER[i]));
    var rank = function (w) { var i = book.indexOf(w); return i < 0 ? 1e9 : i; };
    return (item.words || []).filter(function (w) { return WORDS[w]; })
      .sort(function (a, b) { return rank(a) - rank(b); });
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
      '<span class="l pb-tag-' + phonicsTagOf(it.letters) + '">' + esc(it.letters) + '</span>' +
      (it.sound ? '<span class="ph-sound">/' + esc(it.sound) + '/</span>' : '') +
      '<span class="sp">' + SPK + '</span></button>';
  }

  function renderPhonics(v) {
    v = v || $('#view');
    v.innerHTML = '';
    if (!PHONICS.groups.length) { v.appendChild(empty('拼读数据还没生成')); return; }

    /* 顶部：今日总进度条 —— 目标和 dailyPlan() 里拼读那一项读同一个
       S.settings.phGoal，所以两处不可能对不上。进度统一用 d.phonics
       （不分 hear/build，且只在答对时 +1）。 */
    var pd = dayStat();
    var phGoal = S.settings.phGoal;
    var phDone = Math.min(pd.phonics || 0, phGoal);
    var phPct = Math.round(phDone / phGoal * 100);
    var banner = el('div', 'card');
    banner.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:var(--sp-2)">' +
        '<span class="muted" style="font-size:var(--fs-label)">🔤 拼读 · 今日 ' + phDone + ' / ' + phGoal + '</span>' +
        '<span class="muted" style="font-size:var(--fs-xs)">' + phPct + '%</span>' +
      '</div>' +
      '<div class="bar"><i style="width:' + phPct + '%"></i></div>';
    v.appendChild(banner);

    /* 随机选题型 —— 孩子不用点切换器，每次新题自动换。
       renderPhHear/renderPhBuild 各自答对完点"下一个"时会再 randomPick 一次。 */
    if (!phMode) {
      phMode = pick(['hear', 'build']);
    }
    v.appendChild(el('div', '', '<div id="ph-body"></div>'));
    if (phMode === 'hear') renderPhHear($('#ph-body'));
    else renderPhBuild($('#ph-body'));

    /* 底部：字素表浏览入口（不算任务，进度不计数） */
    var cardsLink = el('div', 'card');
    cardsLink.style.cursor = 'pointer';
    cardsLink.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span>🗂 字素表 <span class="muted" style="font-weight:600">· ' + allPhonemes().length + ' 个字素 · 左右翻</span></span>' +
        '<span class="muted" style="font-size:var(--fs-h2)">›</span>' +
      '</div>';
    v.appendChild(cardsLink);
    cardsLink.onclick = function () { phOpenOverview(); };
  }

  /* ---------- 字素表：两级浏览（全览 → 讲读卡） ---------- */
  /* 第一级是全览：全部字素按类目铺成网格（数量随数据变，别在注释里写死），
     顶上的 tabs 直接跳到某一类，
     点哪一格才进那张卡。老师备课时要的是「三秒找到要教的音」，一页页翻太慢。
     第二级是讲读卡：一次一个字素，左右箭头 / 左右滑动换字，返回退回全览。
     phCardsGrid 就是这两级（true = 全览，false = 讲读卡），全览的格子携带
     PH_FLAT 下标，进卡走 phOpenCard —— 不新增第二套翻页逻辑。 */
  var phCardsGrid = true;
  /* 翻卡顺序 = 分组顺序展平。卡面要显示「这是哪一类」，所以这里带上 group 引用；
     同一个字母的第几种读法也靠展平位置现算 —— 数据里没有这个字段，但关掉音标
     之后连着三张 a / a / a 长得一模一样，不给区分孩子只会以为页面卡住了。 */
  var PH_FLAT = [];
  PHONICS.groups.forEach(function (g) {
    g.items.forEach(function (it) { PH_FLAT.push({ it: it, g: g }); });
  });
  var phCardsIdx = 0;

  function phSoundRank(idx) {
    var letters = PH_FLAT[idx].it.letters, of = 0, rank = 1;
    for (var i = 0; i < PH_FLAT.length; i++) {
      if (PH_FLAT[i].it.letters !== letters) continue;
      of++;
      if (i === idx) rank = of;
    }
    return { rank: rank, of: of };
  }

  /* 同一个音有几种写法（/s/ 还写作 c、ss）。返回展平下标，没有就空数组。
     不发音的字素没有音，天然返回空，也就不显示这张卡。 */
  function phSiblings(idx) {
    var it = PH_FLAT[idx].it;
    if (!it.sound) return [];
    var out = [];
    for (var i = 0; i < PH_FLAT.length; i++) {
      if (i !== idx && PH_FLAT[i].it.sound === it.sound) out.push(i);
    }
    return out;
  }

  /* 把词里属于这个字素的那几个字母标出来。
     pindu 是「字素 → 音素」逐段对齐的结果，顺着拼就是原词，所以只能按段累加
     偏移 —— 直接 indexOf 会把 sister 的第一个 s 标出来，可它读的是 /z/。

     光按 letters 找还是不够：同一个字母在一词里出现多次、读音不同时，只认字母
     会标错那一处。rabbit 的第一个 b 发 /b/、第二个 b 才是哑的，「不发音的 b」
     那张卡要标的是第二个。所以先按 (字母, 音) 配对，配不上才退回第一个同字母。
     逐段比对一旦对不上就整个放弃高亮：宁可少标，也不要标错。

     段有两种形状：L1/L2 是 {letters, sound, audio, start, end}，L3 词为了省体积
     由 build 压成 [letters, sound]。这里只读 letters / sound，两种都吃。 */
  function phPinduSeg(p) {
    if (Array.isArray(p)) return { letters: p[0] || '', sound: p[1] || '' };
    return { letters: p.letters || '', sound: p.sound || '' };
  }
  function phWordHtml(word, letters, sound) {
    var pd = (WORDS[word] && WORDS[word].pindu) || [];
    var low = word.toLowerCase(), want = (letters || '').toLowerCase();
    var pos = 0, at = -1, len = 0, fbAt = -1, fbLen = 0;
    for (var i = 0; i < pd.length; i++) {
      var seg = phPinduSeg(pd[i]).letters.toLowerCase();
      if (low.slice(pos, pos + seg.length) !== seg) return esc(word);
      if (seg === want) {
        if (at < 0 && phPinduSeg(pd[i]).sound === (sound || '')) { at = pos; len = seg.length; }
        if (fbAt < 0) { fbAt = pos; fbLen = seg.length; }
      }
      pos += seg.length;
    }
    if (at < 0) { at = fbAt; len = fbLen; }
    if (at < 0) return esc(word);
    return esc(word.slice(0, at)) + '<b class="ph-hl">' + esc(word.slice(at, at + len)) + '</b>' +
      esc(word.slice(at + len));
  }

  /* 单独的字素表浏览入口（不走 segbar / phMode）：两级结构。
     进门先落在全览上「找」，点进某一格才进讲读卡「学」。 */
  function renderPhCardsView(v) {
    v = v || $('#view');
    phUnbindTabs();
    v.innerHTML = '';
    if (!PH_FLAT.length) { v.appendChild(empty('字素数据还没生成')); return; }
    if (phCardsIdx >= PH_FLAT.length) phCardsIdx = 0;
    var cur = PH_FLAT[phCardsIdx];

    /* 顶部：两级各有各的出口 —— 全览回拼读，讲读卡只回全览（要回拼读再点一次，
       不跳级）。左边的计数跟着换语义：全览是「一共有多少」，卡片是「第几个」。 */
    var header = el('div', 'card');
    header.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center">' +
        '<span class="muted">🗂 字素表 · ' +
          (phCardsGrid ? PH_FLAT.length + ' 个字素' : (phCardsIdx + 1) + ' / ' + PH_FLAT.length) + '</span>' +
        '<button class="pill pill-btn" id="ph-back">' + (phCardsGrid ? '← 返回拼读' : '← 返回全览') + '</button>' +
      '</div>';
    v.appendChild(header);
    $('#ph-back').onclick = function () {
      stopAudio();
      if (phCardsGrid) renderPhonics($('#view'));
      else phBackToOverview();
    };

    /* 类目 tabs：全览时点了是把那一类滚到眼前（几百个格子一路滑下去找太慢），
       讲读卡时点了是从那一类的第一张开始读。 */
    var jumps = el('div', 'unit-chips' + (phCardsGrid ? ' ph-tabs' : ''));
    PHONICS.groups.forEach(function (g) {
      var target = 0;
      for (var i = 0; i < PH_FLAT.length; i++) {
        if (PH_FLAT[i].g === g) { target = i; break; }
      }
      var b = el('button', 'chip' + (!phCardsGrid && g === cur.g ? ' on' : ''),
        esc(g.label) + ' ' + g.items.length);
      b.setAttribute('data-gid', g.id);
      b.onclick = function () {
        if (phCardsGrid) phScrollToGroup(g.id);
        else phCardsJump(target);
      };
      jumps.appendChild(b);
    });
    v.appendChild(jumps);

    v.appendChild(el('div', '', '<div id="ph-cards-body"></div>'));
    if (phCardsGrid) { renderPhCardsGrid($('#ph-cards-body')); phBindTabs(); }
    else renderPhCards($('#ph-cards-body'));
  }

  /* ---------- 字素表的三条导航路径 ----------
     每条各有一件必须做对的事，别混用：
     - phOpenOverview：从拼读页进门（入口在最底下）要回到视口顶部，否则刚点开
       就停在网格中段；
     - phOpenCard：全览 → 讲读卡同样要归零 —— 全览滚到底再点格子时，不归零
       卡片一进来就停在自己的半截上（孩子看到的是「例词」而不是那个音）；
     - phBackToOverview：退回全览要回到离开时的那一屏，而不是从顶重找。
     卡与卡之间的左右翻不在此列 —— 那是 phCardsJump，按住位置（见其注释）。 */
  var phOverviewY = 0;

  function phOpenOverview() {
    phCardsGrid = true;
    phOverviewY = 0;
    stopAudio();
    renderPhCardsView($('#view'));
    window.scrollTo(0, 0);
  }

  function phOpenCard(idx) {
    phOverviewY = window.scrollY;
    phCardsGrid = false;
    phCardsIdx = (idx + PH_FLAT.length) % PH_FLAT.length;
    stopAudio();
    renderPhCardsView($('#view'));
    window.scrollTo(0, 0);
  }

  function phBackToOverview() {
    phCardsGrid = true;
    stopAudio();
    renderPhCardsView($('#view'));
    window.scrollTo(0, phOverviewY);
  }

  /* 翻到第 target 个字素。整页重画（和翻词库翻词一个道理），但按住滚动位置：
     孩子多半是滑到一半才翻页的，每翻一下都弹回顶部等于逼他重新找。 */
  function phCardsJump(target) {
    var y = window.scrollY;
    phCardsIdx = (target + PH_FLAT.length) % PH_FLAT.length;
    stopAudio();
    renderPhCardsView($('#view'));
    window.scrollTo(0, y);
  }

  /* ---------- 全览的 tabs：跳过去 + 滚到哪亮哪个 ---------- */
  /* 每一类在网格里的锚点。tabs 的「跳过去」和「滚到哪儿亮哪个」都按它找卡片。 */
  function phSecId(gid) { return 'ph-sec-' + gid; }

  /* 把某一类滚到视口顶部。自己算偏移而不用 scrollIntoView + scroll-margin：
     tabs 吸顶后「顶部」不是 0 而是 tabs 的下沿，这个数只有这里知道，
     写进 CSS 就得两边各维护一份。 */
  function phScrollToGroup(gid) {
    var sec = document.getElementById(phSecId(gid));
    if (!sec) return;
    var tabs = $('.ph-tabs');
    window.scrollTo({
      top: sec.getBoundingClientRect().top + window.scrollY - (tabs ? tabs.offsetHeight : 0),
      behavior: 'smooth'
    });
  }

  /* 窄屏一行放不下 6 个类目，把点亮的那颗横向带进视野 —— 不然读了半天也看不出
     自己在哪一类（高亮跑到屏幕外了）。手算差值而不用 scrollIntoView：后者会连带
     调整祖先滚动，可能把整页的纵向位置一起动了。 */
  function phRevealChip(tabs, chip) {
    if (!chip) return;
    var tr = tabs.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    if (cr.left < tr.left) tabs.scrollLeft -= tr.left - cr.left + 8;
    else if (cr.right > tr.right) tabs.scrollLeft += cr.right - tr.right + 8;
  }

  /* tabs 和阅读位置联动：滚到哪一类，哪个 tab 就点亮。不联动的话吸顶的 tabs
     会一直停在「刚点的那一类」，滑过去之后就和眼前的内容对不上。
     监听器挂在 window 上 —— 「谁在听」不会跟着 DOM 一起被清掉，所以换页时主动
     解绑；万一哪条路径漏了，onScroll 里还会自查 tabs 是否还在文档里。 */
  var phTabsOff = null;
  function phUnbindTabs() {
    if (phTabsOff) { phTabsOff(); phTabsOff = null; }
  }
  function phBindTabs() {
    phUnbindTabs();
    var tabs = $('.ph-tabs');
    if (!tabs) return;
    var chips = $$('[data-gid]', tabs);
    var secs = PHONICS.groups.map(function (g) { return document.getElementById(phSecId(g.id)); })
      .filter(function (s) { return !!s; });
    if (!secs.length) return;
    /* 只在「读到另一类了」时动 DOM：调样式 + 横滚带进视野。每帧都做的话，
       孩子自己横向拨 tabs 看后面几类时会被立刻拨回来。 */
    var lastGid = null;
    var sync = function () {
      /* 吸顶 tabs 的下沿就是「正在读的这一行」：卡片顶越过它的最后一类就是当前类。
         没越过任何一张时（刚进门）保持第一类，不会出现「一个都不亮」。
         两处边界要留住：
         - +4px 容差：tabs 点过去是把卡片顶对齐到下沿，scrollTo 取整后差 0-1px 是常态，
           不加容差就会停在「上一个类目还亮着」；
         - 滚到最底：最后一类短（16 个）时它的顶永远越不过那条线，只能单独认一次
           「已经到底」—— 否则读到最后一类时高亮还停在上一类。 */
      var line = tabs.getBoundingClientRect().bottom + 4;
      var active = secs[0];
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        active = secs[secs.length - 1];
      } else {
        secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) active = s; });
      }
      var gid = active.getAttribute('data-gid');
      if (gid === lastGid) return;
      lastGid = gid;
      var on = null;
      chips.forEach(function (c) {
        var hit = c.getAttribute('data-gid') === gid;
        c.classList.toggle('on', hit);
        if (hit) on = c;
      });
      phRevealChip(tabs, on);
    };
    var queued = false;
    var onScroll = function () {
      if (!tabs.isConnected) { phUnbindTabs(); return; }
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; sync(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    phTabsOff = function () { window.removeEventListener('scroll', onScroll); };
    sync();
  }

  /* 全览网格：全部字素按类目铺开，点哪一格直接进那张讲读卡。
     老师备课时要的是「三秒找到要教的音」，一页页翻做不到。

     两条不能省的约束：
     1) 配色用 PH_FLAT[i].g.id（经 PB_TAG 映射），不能用 phonicsTagOf(it.letters)。
        后者走 PHONIC_MAP[letters] 反查，而同一个字母有多读法时后者会被
        覆盖 —— 实测 139 个字母有多读法（s→/s/ /z/、c→/k/ /s/…），
        用它上色会让同字母的所有格子串成一个颜色。
     2) 纯只读：不调 phTrack / pgrade。「看一眼」不该给首页的 d.phonics 计一次，
        否则老师备课就把孩子今天的拼读进度刷满了。 */
  function renderPhCardsGrid(v) {
    v.innerHTML = '';
    if (!PH_FLAT.length) return;
    /* letters|sound -> PH_FLAT 下标。同一格子可能有多读法，键要带 sound 才唯一。 */
    var idxOf = {};
    PH_FLAT.forEach(function (f, i) { idxOf[f.it.letters + '|' + (f.it.sound || '')] = i; });

    PHONICS.groups.forEach(function (g) {
      var sec = el('div', 'card');
      /* 锚点：tabs 的「跳过去」按 id 找卡片，滚动联动按 data-gid 认是哪一类 */
      sec.id = phSecId(g.id);
      sec.setAttribute('data-gid', g.id);
      sec.innerHTML = '<h2 class="section">' + esc(g.label) + ' · ' + g.items.length + ' 个</h2>';
      var grid = el('div', 'ph-grid gph-all');
      g.items.forEach(function (it) {
        var idx = idxOf[it.letters + '|' + (it.sound || '')];
        var ok = isPhMastered(it.letters);
        var cell = el('button', 'ph-card pb-tag-' + PB_TAG[g.id] + (ok ? ' ok' : ''));
        cell.setAttribute('data-idx', idx);
        cell.setAttribute('aria-label', it.letters + (it.sound ? ' ' + it.sound : ' 不发音')
          + (ok ? '，已掌握' : ''));
        /* 格子里只放字母 + 音标。例词塞进来会把 84px 的格子撑爆，
           而且点格子本来就是为了进详情听整词，例词在详情卡里更完整。 */
        cell.innerHTML =
          '<span class="l">' + esc(it.letters) + '</span>' +
          /* 不发音的没有音标，显示「不发音」而不是留空（空格子看不出是缺数据还是没内容） */
          '<span class="w">' + (it.sound ? esc(it.sound) : '不发音') + '</span>' +
          (ok ? '<span class="gph-ok-mini">✓</span>' : '');
        cell.onclick = function () {
          /* 格子只负责「定位」：跨层级进讲读卡，不是卡内翻页，所以走 phOpenCard
             （会把滚动归零 + 记住全览的位置）。 */
          phOpenCard(idx);
        };
        grid.appendChild(cell);
      });
      sec.appendChild(grid);
      v.appendChild(sec);
    });

    v.appendChild(el('div', 'card',
      '<div class="muted" style="text-align:center">点任意一个，进入它的详细讲读</div>'));
  }

  /* 一张字素卡 = 主卡（字本身）+ 例词 + 同音异形。
     主卡套的是翻词库词卡的骨架，所以左右箭头、左右滑动、点色块出声全都直接复用，
     没有第二套翻页逻辑。 */
  function renderPhCards(v) {
    v.innerHTML = '';
    if (!PH_FLAT.length) return;
    var idx = phCardsIdx, f = PH_FLAT[idx], it = f.it;
    var words = phWordsInBandOrder(it);

    /* 主卡只管「这个音本身」：字、类目、音标、第几种读法、怎么听。
       例词一律交给下面那张卡，避免同一个词在两处各出现一次。 */
    var c = el('div', 'card wordcard learn-swipe pb-tag-' + PB_TAG[f.g.id]);
    /* 不发音的字素没有音频（build 出来就是空串），所以那 5 个字素不给大喇叭 ——
       以前网格里点它是死按钮，按了没反应也不知道为什么。 */
    c.innerHTML = phFocusHtml(f, phSoundRank(idx)) +
      (it.sound ? '<div class="learn-action">' +
        '<button class="speak-btn" id="gph-play" aria-label="听发音">' + SPK + '</button></div>' : '') +
      '<div class="muted gph-hint">' +
        (it.sound ? '点色块或喇叭，听这个音怎么读' : '它不发音，只是拼写里的一块') +
      '</div>';
    v.appendChild(c);
    bindLearnSwipe(c, function (dir) { phCardsJump(idx + (dir === 'next' ? 1 : -1)); });
    $('#gph-prev').onclick = function () { phCardsJump(idx - 1); };
    $('#gph-next').onclick = function () { phCardsJump(idx + 1); };
    var play = $('#gph-play');
    if (play) {
      play.onclick = function () { phPlay(it, play); };
      c.querySelector('.gph-visual').onclick = function () { phPlay(it, play); };
    }

    /* 例词：一张卡列全。词里属于该字素的那几个字母用 .ph-hl 标出来 ——
       这才是「它在哪儿」的答案。 */
    if (words.length) {
      var c2 = el('div', 'card');
      c2.innerHTML = '<h2 class="section">它藏在这些词里</h2>' +
        words.map(function (w) {
          return '<div class="gph-row">' +
            '<span class="gph-emo">' + visualOf(w).emoji + '</span>' +
            '<div class="gph-row-main">' +
              '<div class="gph-row-word">' + phWordHtml(w, it.letters, it.sound) + '</div>' +
              '<div class="muted">' + esc(meaningOf(w)) + '</div>' +
            '</div>' +
            '<button class="speak-btn sm" data-w="' + esc(w) + '" aria-label="听整词">' + SPK + '</button>' +
            '</div>';
        }).join('');
      v.appendChild(c2);
    }

    /* 同音异形：听得一模一样、长得完全不同的写法。点一下直接翻过去，
       翻过去会自动响同一个音 —— 孩子耳朵比眼睛先反应过来。 */
    var sibs = phSiblings(idx);
    if (sibs.length) {
      var c3 = el('div', 'card');
      c3.innerHTML = '<h2 class="section">同一个音，还有这些写法</h2>' +
        '<div class="ph-grid">' + sibs.map(function (i) {
          var s = PH_FLAT[i];
          return '<button class="ph-card" data-sib="' + i + '">' +
            '<span class="l pb-tag-' + PB_TAG[s.g.id] + '">' + esc(s.it.letters) + '</span>' +
            '<span class="w">' + esc((s.it.words || [])[0] || '') + '</span></button>';
        }).join('') + '</div>' +
        '<div class="muted center" style="margin-top:var(--sp-3)">点一下就翻过去听听</div>';
      v.appendChild(c3);
      $$('[data-sib]', c3).forEach(function (b) {
        b.onclick = function () { phCardsJump(+b.dataset.sib); };
      });
    }

    var c4 = el('div', 'card');
    c4.innerHTML = '<div class="row" style="gap:var(--sp-3)">' +
      '<button class="btn green" id="gph-practice" style="flex:1;white-space:nowrap">去练一练 →</button>' +
      '</div>';
    v.appendChild(c4);
    $('#gph-practice').onclick = function () { stopAudio(); renderPhonics($('#view')); };

    $$('[data-w]', v).forEach(function (b) {
      b.onclick = function () { speakWord(b.dataset.w); };
    });

    /* 翻到哪张自己响一下：这是一张点读表，不自动出声就退化成翻词库那种
       得记得点喇叭的看图卡了。playRange 开头就 stopAudio，连着快翻只有最后一张响。 */
    if (it.sound) setTimeout(function () { phPlay(it); }, 280);
  }

  function phFocusHtml(f, rank) {
    var it = f.it;
    return '<div class="gph-stage">' + navArrowsHtml('gph', null, '字素') +
        '<div class="wc-visual gph-visual">' +
          '<span class="gph-letter">' + esc(it.letters) + '</span>' +
          (isPhMastered(it.letters) ? '<span class="gph-ok">✓</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="gph-kind">' + esc(f.g.label) + '</div>' +
      (S.settings.showIpa && it.sound ? '<div class="gph-ipa">/' + esc(it.sound) + '/</div>' : '') +
      /* 同一个字母常有好几种读法，卡片长得几乎一样；这一行是它们唯一的区别，
         所以贴在音标正下方 —— 音标开或关它都在。 */
      (rank.of > 1 ? '<div class="gph-rank">第 ' + rank.rank + ' 种读法（共 ' + rank.of + ' 种）</div>' : '');
  }

  /* 听音选字母：播声音 → 4 个字素里选 */
  function renderPhHear(v) {
    v.innerHTML = '';
    if (!phQuiz || phQuiz.mode !== 'hear') {
      var item = pick(allPhonemes());
      phQuiz = { mode: 'hear', item: item, options: shuffle([item].concat(phDistractors(item, 3))), answered: false, missed: false };
    }
    var q = phQuiz;
    var c = el('div', 'card');
    c.innerHTML =
      '<h2 class="section">听一听，是哪个字母组合？</h2>' +
      '<button class="speak-btn big" id="ph-ask">' + SPK + '</button>' +
      '<div class="muted center" style="padding:var(--sp-3) 0 var(--sp-4)">点喇叭再听一遍</div>' +
      '<div class="ph-pool-row" id="ph-opts">' + q.options.map(function (o) { return phOptionCard(o); }).join('') + '</div>' +
      '<div id="ph-fb"></div>';
    v.appendChild(c);
    $('#ph-ask').onclick = function () { phPlay(q.item, $('#ph-ask')); };
    setTimeout(function () { phPlay(q.item, $('#ph-ask')); }, 350);
    $$('#ph-opts .ph-opt').forEach(function (b) {
      b.onclick = function () {
        if (q.answered) return;
        /* A spent option stays spent: without this, tapping the same wrong
         * card again would burn the one free retry and immediately fail. */
        if (b.classList.contains('wrong')) return;
        var ok = b.dataset.l === q.item.letters;
        var chosen = q.options.filter(function (x) { return x.letters === b.dataset.l; })[0];
        /* Play the correct item's audio. Do NOT also play the child's pick —
         * playRange() starts with stopAudio() so a back-to-back second call
         * would kill the first and the child would hear nothing. */
        phPlay(q.item, b);
        /* First miss is a FREE retry: cross the card, sound the wrong beep, and
         * leave the question open. Nothing is graded and the answer is NOT
         * revealed — a child who taps the wrong card once has usually just not
         * caught the phoneme yet, and punishing that teaches them to freeze
         * rather than listen. Only a SECOND miss counts as a wrong answer. */
        if (!ok && !q.missed) {
          q.missed = true;
          b.classList.add('wrong');
          beep('no');
          $('#ph-fb').innerHTML =
            '<div class="muted center" style="margin-top:var(--sp-3)">再听一次 🔊 这次不算错</div>';
          return;
        }
        q.answered = true;
        pgrade(q.item.letters, ok);
        b.classList.add(ok ? 'right' : 'wrong');
        $$('#ph-opts .ph-opt').forEach(function (x) {
          if (x.dataset.l === q.item.letters) x.classList.add('right');
        });
        var ex = (q.item.words || []).slice(0, 3);
        $('#ph-fb').innerHTML =
          '<div class="feedback ' + (ok ? 'ok' : 'no') + '" style="margin-top:var(--sp-3)">' +
          '<span class="ic">' + (ok ? '🎉' : '💪') + '</span>' +
          '<span>是 <b>' + esc(q.item.letters) + '</b>' + (ex.length ? ' · 如 ' + esc(ex.join(' / ')) : '') + '</span></div>' +
          '<button class="btn green big next-round" id="ph-next">下一个 →</button>';
        $('#ph-next').onclick = function () { phQuiz = null; phMode = pick(['hear', 'build']); renderPhonics($('#view')); };
      };
    });
  }

  /* Counter map used to enforce "no same letter shows up 3 words in a
   * row", preventing fatigue on a single grapheme. Reset explicitly when
   * the user navigates away from the build tab (go() calls
   * resetBuildLetterRow() when leaving phonics). */
  var buildLetterRow = {};
  function resetBuildLetterRow() { buildLetterRow = {}; }

  function pickBuildWord() {
    /* The band is a ceiling, not a filter — a child on 挑战 can still drill
       phonics on words from 核心, and the quiz/word-card pools already work
       that way. Scoping this to the selected band alone left the whole 拼读
       tab empty for 🎯挑战 and 📦补充: only L1/L2 carry a phonics index (the
       KET bands are slimmed out of it to save 416 KB), so those two bands had
       nothing to offer and the tab looked broken. */
    var upTo = BAND_ORDER.indexOf(S.settings.band);
    if (upTo < 0) upTo = 0;
    var pool = [];
    for (var i = 0; i <= upTo; i++) {
      pool = pool.concat(bandWords(BAND_ORDER[i]).filter(function (w) {
        var ph = PHONEMES_BY_WORD[w];
        return ph && ph.length >= 2 && ph.length <= 5;
      }));
    }
    if (!pool.length) return null;
    var unmastered = pool.filter(function (w) {
      return PHONEMES_BY_WORD[w].some(function (p) { return !isPhMastered(p.letters); });
    });
    var fresh = unmastered.filter(function (w) {
      return PHONEMES_BY_WORD[w].some(function (p) { return !(buildLetterRow[p.letters] >= 3); });
    });
    var chosen = (fresh.length ? pick(fresh) : pick(unmastered.length ? unmastered : pool));
    var letters = {};
    PHONEMES_BY_WORD[chosen].forEach(function (p) { letters[p.letters] = 1; });
    Object.keys(buildLetterRow).forEach(function (k) { if (!letters[k]) delete buildLetterRow[k]; });
    PHONEMES_BY_WORD[chosen].forEach(function (p) {
      buildLetterRow[p.letters] = (buildLetterRow[p.letters] || 0) + 1;
    });
    return chosen;
  }

  /* 拆词拼读：把单词按音素顺序点出来 */
  function renderPhBuild(v) {
    v.innerHTML = '';
    if (!phBuild) {
      var w = pickBuildWord();
      if (!w) { v.appendChild(empty('这一层暂时没有可拆的词')); return; }
      /* Build parts in one pass: keep `kind` for the classification label,
       * add `idx` so the slot data-idx attribute matches the parts index.
       * The two cannot be done in separate `.map` calls because the
       * phBuild assignment must hold parts WITH idx before the click
       * handlers read `b.parts[idx]`. */
      var rawPhs = PHONEMES_BY_WORD[w];
      var parts = rawPhs.map(function (p, i) {
        return { letters: p.letters, sound: p.sound, audio: p.audio, kind: p.kind, idx: i };
      });
      /* Only sound-bearing parts are tap targets: a silent letter (face's e,
       * bike's e, happy's first p) has no phoneme to match, so it is neither
       * a button nor a slot — the child builds the SOUNDS of the word. The
       * full parts list is kept for the teaching moment, which tags silent
       * letters as 不发音. */
      var soundParts = parts.filter(function (p) { return p.sound; });
      phBuild = { word: w, parts: parts, soundParts: soundParts, picked: [], queue: shuffle(soundParts.slice()) };
      /* Speak the whole word when a round starts, so the child knows what
       * sounds they are about to build (same pattern as the hear question's
       * auto-play). A fast tap on a speaker stops it via playRange() — harmless.
       * Guard on phBuild: switching mode/tab inside this 350ms window nulls
       * it (phBuild = null in the seg handler), so read the word from the
       * closure's w and only speak if this round is still the live one. */
      setTimeout(function () { if (phBuild && phBuild.word === w) speakWord(w); }, 350);
    }
    var b = phBuild;
    var done = b.picked.length === b.soundParts.length;
    var c = el('div', 'card');
    /* While the child is still building (done=false), the slots row sits in
     * the card between the word and the phoneme-pool, and each slot fills
     * as they tap options. Once the word is complete, the empty/hint slots
     * and the pool disappear; the FINAL slot row (every cell filled with
     * its letter + kind label) is rendered into the green feedback box
     * below, so the answer reads as a single "word built" unit instead of
     * sitting orphaned above the celebration. */
    var slotsHtml = '';
    if (!done) {
      slotsHtml = (function () {
        var seen = {};
        return b.soundParts.map(function (p, i) {
          var got = b.picked.length > i;
          seen[p.letters] = (seen[p.letters] || 0) + 1;
          var idxTag = seen[p.letters] > 1 ? '<sup>(' + seen[p.letters] + ')</sup>' : '';
          return '<span class="slot' + (got ? ' filled' : '') + '">' +
            (got ? '<span class="l pb-tag-' + phonicsTagOf(p.letters) + '">' + esc(p.letters) + idxTag + '</span>' : (i + 1)) + '</span>';
        }).join('');
      })();
    }
    c.innerHTML =
      '<h2 class="section">把这个词的音按顺序点出来</h2>' +
      '<div class="wc-visual">' + visualHtml(b.word, 64) + '</div>' +
      '<div class="wc-word">' + b.word + '</div>' +
      /* The word is the one thing the child cannot ask to hear again here:
         the round auto-plays once, then nothing repeats it. Every option
         speaks its own phoneme, not the word, so "say it again" had no
         affordance. It is a tool for stuck, not a hint — no label, and it
         disappears once the word is built (the completion box speaks it). */
      (done ? '' : '<div class="q-speak-wrap">' + wordSpeakHtml('ph-word') + '</div>') +
      (done ? '' : '<div class="ph-build-slots" id="ph-slots">' + slotsHtml + '</div>') +
      (done ? '' : '<div class="muted center" style="margin:var(--sp-1) 0 var(--sp-3)">点一个听读音，按顺序点对就填进格子</div>') +
      '<div class="ph-pool-row" id="ph-pool">' +
      /* Each option shows its IPA sound (color-coded by kind) plus the speaker.
       * Showing the letters would defeat the training goal: the child would
       * just letter-match the word above instead of identifying the phoneme by
       * sound. the alert above and the answer feedback below still anchor
       * the answer in the word's letters; already-placed phonemes disappear
       * from the pool so the remaining choices shrink as the word is built. */
      (done ? '' : b.queue.filter(function (p) { return b.picked.indexOf(p) === -1; }).map(function (p) {
        return '<button class="ph-opt ipa pb-tag-' + phonicsTagOf(p.letters) + '" data-idx="' + p.idx + '">' +
          '<span class="ph-sound">/' + esc(p.sound) + '/</span>' +
          '<span class="sp">' + SPK + '</span></button>';
      }).join('')) + '</div>' +
      '<div id="ph-fb"></div>';
    v.appendChild(c);

    var pw = $('#ph-word');
    if (pw) pw.onclick = function () { speakWord(b.word); };

    if (!done) {
      $$('#ph-pool .ph-opt').forEach(function (btn) {
        btn.onclick = function () {
          var idx = +btn.dataset.idx;
          var p = b.parts[idx];
          phPlay(p, btn);
          /* Match by SOUND, not by object identity. A word like sister has two
           * `s` parts (both /s/) and the queue is shuffled, so the two `/s/`
           * buttons are visually identical — identity comparison demanded one
           * specific button and punished the child for tapping the other,
           * which teaches nothing (the sounds ARE the same). Comparing `sound`
           * makes either `/s/` button satisfy whichever slot wants /s/ next.
           * We push `want` (the part the slot actually wants) so `picked`
           * stays parallel to `soundParts` and the pool filter keeps removing
           * exactly one button per accepted tap. */
          var want = b.soundParts[b.picked.length];
          if (p.sound === want.sound) {
            b.picked.push(want);
            if (b.picked.length === b.soundParts.length) {
              gainXp(1, 'toy');
              dayStat().phonics = (dayStat().phonics || 0) + 1;
              /* Per-grapheme: call phTrack once per distinct letter to avoid double
               * counting same-letter repeats (e.g. eraser has two `r` shapes). */
              var seenL = {};
              b.parts.forEach(function (p) {
                if (!seenL[p.letters]) { seenL[p.letters] = 1; phTrack(p.letters, true); }
              });
              beep('ok');
              speakWord(b.word);
            }
            /* Re-render the whole card on every correct click: an incomplete
             * round refreshes the slots/pool, and the final click rebuilds the
             * card so every slot shows its letter, the leftover 🔊 buttons and
             * the hint disappear, and the teaching feedback renders cleanly
             * (the else-branch below). */
            renderPhBuild(v);
          } else {
            /* Wrong tap: only the tapped button's sound plays (already started
             * above) plus a wrong-beep — no hint of the correct answer, the
             * child keeps exploring by ear. */
            beep('no');
          }
        };
      });
    } else {
      /* Teaching moment: the answer row (every sound-part in its colored
       * slot, with the kind label — 辅音 / 元音 / 元音组合 / ... — tucked
       * under the letter) sits INSIDE the green feedback box, so the
       * celebration + the built word + the next-step button read as one
       * closed unit. Only the IPA-gated same-letter teaching note stays
       * outside the green box, as a quieter follow-up line — and ONLY
       * when the same letter actually carries different sounds in this
       * word (e.g. c-cat/k vs ice/s-tice). For sister/word both s's are
       * /s/, identical sounds, so no note would teach anything. */
      var repeatNote = '';
      var letterCounts = {}; b.parts.forEach(function (p) { letterCounts[p.letters] = (letterCounts[p.letters] || 0) + 1; });
      var diffRepeated = Object.keys(letterCounts).filter(function (k) {
        if (letterCounts[k] < 2) return false;
        var uniq = {}; b.parts.forEach(function (p) { if (p.letters === k && p.sound) uniq[p.sound] = 1; });
        return Object.keys(uniq).length > 1;
      });
      if (diffRepeated.length) {
        if (S.settings.showIpa) {
          var examples = diffRepeated.map(function (l) {
            var sounds = b.parts.filter(function (p) { return p.letters === l; }).map(function (p) { return p.sound ? '/' + p.sound + '/' : '不发音'; });
            return '<b>' + l + '</b> → ' + sounds.join('、');
          });
          repeatNote = '<div class="muted" style="margin-top:var(--sp-2)">同一个字母在不同位置：' + examples.join('；') + '</div>';
        } else {
          repeatNote = '<div class="muted" style="margin-top:var(--sp-2)">两个 <b>' + diffRepeated[0] + '</b> 的读音不一样（听一听）</div>';
        }
      }
      var answerSlots = (function () {
        var seen = {};
        return b.soundParts.map(function (p) {
          seen[p.letters] = (seen[p.letters] || 0) + 1;
          var idxTag = seen[p.letters] > 1 ? '<sup>(' + seen[p.letters] + ')</sup>' : '';
          var kindLabel = KIND_LABEL[p.kind] ? '<em>' + KIND_LABEL[p.kind] + '</em>' : '';
          return '<span class="ph-tag pb-tag-' + phonicsTagOf(p.letters) + '">' +
            '<span class="ph-l">' + esc(p.letters) + idxTag + '</span>' +
            (p.sound ? '<span class="ph-ipa">/' + esc(p.sound) + '/</span>' : '') +
            kindLabel +
            '</span>';
        }).join('');
      })();
      /* `.feedback` is `display:flex; align-items:center`, and align-items centers
       * the MARGIN box, not the border box — so any vertical margin written on
       * the answer row shifts it off the 「拼出来啦」centerline by
       * (marginTop - marginBottom) / 2, and the same margins silently eat the
       * gap to the next button (they live INSIDE the green box, the button's
       * margin lives outside it, so they never add up). `.in-answer` therefore
       * carries NO margin: horizontal separation comes from `.feedback`'s own
       * `gap`, and the gap below the box is the next button's `--sp-3` alone. */
      $('#ph-fb').innerHTML =
        '<div class="feedback ok">' +
        '<span class="ic">🎉</span><span><b>' + esc(b.word) + '</b> 拼出来啦！+1 🎾</span>' +
        '<div class="ph-build-slots in-answer">' + answerSlots + '</div>' +
        '</div>' +
        repeatNote +
        '<button class="btn green big next-round" id="ph-next">再拼一个 →</button>';
      $('#ph-next').onclick = function () { phBuild = null; phMode = pick(['hear', 'build']); renderPhonics($('#view')); };
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

    /* 今日进度：让孩子知道"今天闯关还差几题达标"，避免底部一题孤零零像出题器。
       口径必须和首页那一项一致 —— 都是「答对 N 题」（d.quizOk 只在答对时 +1）。
       原来这里用 right + wrong，也就是答错也计入，和首页的答对口径互相矛盾：
       同一件事在两个页面上显示两个数，而且这个数是放大的。 */
    var _d = dayStat();
    var _goal = S.settings.quizGoal;
    var _done = Math.min(_d.quizOk || 0, _goal);
    var _dailyPct = Math.round(_done / _goal * 100);
    var _dailyHead = el('div', 'card');
    _dailyHead.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:var(--sp-2)">' +
        '<span class="muted" style="font-size:var(--fs-label)">🎯 今日闯关</span>' +
        '<span class="muted" style="font-size:var(--fs-xs)"><b style="color:var(--brand-dk)">' + _done + '</b> / ' + _goal +
          (_done >= _goal ? ' · 达标 🎉' : '') + ' · ' + _dailyPct + '%</span>' +
      '</div>' +
      '<div class="bar"><i style="width:' + _dailyPct + '%"></i></div>';
    v.appendChild(_dailyHead);

    var c = el('div', 'card');
    var prog = '<div class="q-progress">' + quiz.queue.map(function (_, i) {
      var r = quiz.results[i];
      return '<i class="' + (r == null ? (i === quiz.idx ? 'cur' : '') : r ? 'ok' : 'no') + '"></i>';
    }).join('') + '</div>';

    var prompt = '', big = '', speakId = null;
    /* Which questions get a "hear it again" button. The single test:
       does the question SHOW the English word? If it does, the child may
       simply not know it, and hearing it is support rather than a giveaway.
       - en2pic / en2cn: spelling is on screen, meaning is what they must find.
       - pic2en / cn2en: hearing it would name the picture / BE the answer.
       - listen2en: the question IS the audio; a second speaker is redundant. */
    if (q.mode === 'en2pic') { prompt = '选出这个单词的意思'; big = word; speakId = 'q-speak-word'; }
    else if (q.mode === 'pic2en') { prompt = '这张图是哪个单词？'; big = '<div style="font-size:var(--icon-hero);line-height:1">' + visualOf(word).emoji + (VISUALS[word] && VISUALS[word].glyph ? ' <span class="glyph-badge" style="display:inline-grid">' + VISUALS[word].glyph + '</span>' : '') + '</div>'; }
    else if (q.mode === 'listen2en') { prompt = '听一听，是哪个单词？'; big = '<button class="speak-btn" id="q-play">' + SPK + '</button>'; }
    else if (q.mode === 'en2cn') { prompt = '这个单词是什么意思？'; big = word; speakId = 'q-speak-word'; }
    else { prompt = '哪个单词是「' + meaningOf(word) + '」？'; big = '<div style="font-size:var(--fs-d1)">' + meaningOf(word) + '</div>'; }

    c.innerHTML = prog + '<div class="q-prompt">' + prompt + '</div><div class="q-big">' + big + '</div>' +
      (speakId ? '<div class="q-speak-wrap">' + wordSpeakHtml(speakId) + '</div>' : '') +
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
    var qs = $('#q-speak-word');
    if (qs) qs.onclick = function () { speakWord(word); };

    $$('#opts .opt').forEach(function (b) {
      b.onclick = function () { answer(q, +b.dataset.i, b); };
    });

    var foot = el('div', 'card tight');
    foot.innerHTML = '<div class="row" style="gap:var(--sp-2)">' +
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
      /* An option only ever shows the ONE layer the question is testing (see the
       * note where options are built). Now that the answer is in, the missing
       * layer is folded back into the same button — Chinese under an English
       * word, or the spelling under a Chinese gloss. That used to be a separate
       * 4-row "图 + 词形 + 词义" card below; inlining it keeps the answer and
       * its explanation in one place, so the child never has to look away from
       * the option they just tapped. */
      var missing = q.mode === 'en2cn' ? q.opts[bi] : meaningOf(q.opts[bi]);
      b.insertAdjacentHTML('beforeend', '<span class="sub">' + esc(missing) + '</span>');
      /* Tapping any option now speaks it — the reading that the removed card
       * used to provide by making each of its rows clickable. */
      b.onclick = function () { speakWord(q.opts[bi]); };
    });
    grade(word, ok);
    /* 闯关的达标只认答对（和拼读一致）。计数写在闯关自己的调用点，
       不从 grade() 的 d.right 里取 —— 学单词的跟读通过也走 grade(true)，
       直接用 d.right 会让「先做 8 个跟读、闯关立刻满格」。
       d.right/d.wrong 仍留给首页的正确率显示，那是两个 tab 合起来的口径。 */
    if (ok) { gainXp(5, 'soap'); dayStat().quizOk = (dayStat().quizOk || 0) + 1; beep('ok'); }
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
      '<button class="btn green big next-round" id="fb-next" style="margin-top:var(--sp-3)">' +
      (quiz.idx + 1 >= quiz.queue.length ? '看看成绩 🏁' : '下一题 →') + '</button>';
    $('#fb-sp').onclick = function () { speakWord(word); };
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
      '<div style="font-size:var(--icon-hero)">' + (acc >= 90 ? '🏆' : acc >= 70 ? '🌟' : acc >= 50 ? '👍' : '💪') + '</div>' +
      '<div style="font-size:var(--fs-d1);font-weight:900;margin-top:var(--sp-1)">' + acc + '%</div>' +
      '<div class="muted">答对 ' + right + ' / ' + total + ' 题</div>' +
      '<div class="row" style="justify-content:center;gap:var(--sp-2);margin-top:var(--sp-4)">' +
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
    c3.innerHTML = '<div class="row" style="gap:var(--sp-3)">' +
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
  /* 📊 统计入口挪出 tab 后，从顶栏按钮以 modal 形式呼出（与 ⚙️ 设置对称）：
     用全屏 modal 而不是新 tab，避免和首页"今日任务"语义重叠；统计本身不
     是任务，是数据看板。复用了 settings modal 的样式 token，无新 CSS。 */
  function openStats() {
    if ($('#stats-modal')) return;       // 防重复打开
    abandonLearnMic(); stopAudio();
    var ov = el('div', 'modal-ov');
    ov.id = 'stats-modal';
    var sheet = el('div', 'modal-sheet');
    sheet.innerHTML =
      '<div class="modal-head"><span style="font-size:var(--fs-h2);font-weight:900">📊 我的进度</span>' +
      '<button class="modal-x" id="stats-x">✕</button></div>' +
      '<div id="stats-body"></div>';
    ov.appendChild(sheet);
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeStats(); });
    $('#stats-x').onclick = closeStats;
    renderStats($('#stats-body'));
  }
  function closeStats() {
    var m = $('#stats-modal');
    if (!m) return;
    m.remove();
    /* 关闭后若停在首页，重新刷新（renderStats 直接改的是 modal 里的 DOM，
       与 #view 无关，但保险起见刷一次让首页统计面板也对齐） */
    if (tab === 'home') renderHome();
  }

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
      '<div class="row" style="margin-top:var(--sp-3);gap:var(--sp-3)">' +
      '<span class="muted">🔥 连续打卡 <b style="color:var(--brand-dk)">' + (S.streak || 0) + '</b> 天</span>' +
      '<span class="muted">累计答词 <b style="color:var(--brand-dk)">' + Object.keys(S.words).reduce(function (a, k) { return a + S.words[k].right; }, 0) + '</b> 次</span>' +
      '</div>';
    v.appendChild(c2);

    var lv = S.settings.band;
    var list = bandWords(S.settings.band);
    var boxCount = [0, 0, 0, 0, 0, 0];
    list.forEach(function (w) {
      var st = S.words[w];
      boxCount[st ? boxFromS(st.s) : 0]++;
    });
    var mastered = boxCount[4] + boxCount[5];
    var c3 = el('div', 'card');
    c3.innerHTML = '<h2 class="section">' + BAND_META[lv].label + ' · 掌握进度 ' + mastered + '/' + list.length + '</h2>' +
      '<div class="bar"><i style="width:' + (list.length ? Math.round(mastered / list.length * 100) : 0) + '%"></i></div>' +
      '<div class="row wrap" style="gap:var(--sp-2);margin-top:var(--sp-3)">' +
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
      '<div class="modal-head"><span style="font-size:var(--fs-h2);font-weight:900">⚙️ 设置</span>' +
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

  /* 实验台（状态试验台）定时器：模块级持有，renderSettings 重建时必须
     清理，否则旧定时器会继续在重建后的画布上绘制旧表情。 */
  var tbTimers = { play: null, anim: null };

  function renderSettings() {
    var v = $('#set-body');
    if (!v) return;
    /* 实验台定时器是模块级持有的：renderSettings 每次重建设置面板时，
       必须先清掉旧实验台的"播完回落"和"多帧循环"定时器——否则旧的
       interval 闭包仍会往新画布上画切换前的表情（切换物种/形态后表情
       跳变的根因）。 */
    if (tbTimers.play) { clearTimeout(tbTimers.play); tbTimers.play = null; }
    if (tbTimers.anim) { clearInterval(tbTimers.anim); tbTimers.anim = null; }
    v.innerHTML = '';

    /* --- 难度分层与词库 --- */
    var c1 = el('div', 'card');
    c1.innerHTML = '<h2 class="section">难度分层</h2>' +
      '<div class="muted" style="margin-bottom:var(--sp-3)">按难度而非教材划分。选中的层级决定新词范围，展开可查看该层完整词库</div>' +
      BAND_ORDER.map(function (k) {
        var m = BAND_META[k];
        var list = bandWords(k);
        var learned = list.filter(function (w) { return S.words[w] && S.words[w].seen; }).length;
        var cur = S.settings.band === k;
        return '<div class="bk-row' + (cur ? ' on' : '') + '">' +
          '<span class="bk-em">' + m.emoji + '</span>' +
          '<span class="bk-main"><b>' + m.label + '</b>' +
          '<span class="muted">词库 ' + list.length + ' 词 · 已学 ' + learned + '</span></span>' +
          /* 「使用中」是状态不是按钮，和「切换」互斥，所以用 span + pointer-events:none */
          (cur
            ? '<span class="chip on" style="pointer-events:none">使用中</span>'
            : '<button class="chip" data-setband="' + k + '">切换</button>') +
          '<button class="chip" data-viewband="' + k + '">' + (settingsBookOpen === k ? '收起 ▴' : '词库 ▾') + '</button>' +
          '</div>' +
          (settingsBookOpen === k
            ? '<div class="wtable" style="margin:var(--sp-1) 0 var(--sp-2)">' +
              (list.length ? list.map(function (w) {
                var st = S.words[w];
                return '<button class="wpill b' + (st ? boxFromS(st.s) : 0) + '" data-bw="' + w + '"><span class="dot"></span>' + w + '</button>';
              }).join('') : '<span class="muted">这一层还没有词</span>') + '</div>' +
              (m.note ? '<div class="muted" style="margin:var(--sp-1) 0 var(--sp-3)">※ ' + m.note + '</div>' : '')
            : '');
      }).join('') +
      '<div class="muted">词库里的词点一下可以听发音，颜色代表掌握程度（绿色越深越熟）。</div>';
    v.appendChild(c1);
    $$('#set-body [data-setband]').forEach(function (b) {
      b.onclick = function () {
        S.settings.band = b.dataset.setband; save();
        render(); renderSettings();
        toast('已切换到 ' + BAND_META[b.dataset.setband].label);
      };
    });
    $$('#set-body [data-viewband]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.viewband;
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
      '<div class="muted" style="margin-top:var(--sp-3)">学单词得 🍖、拼读得 🎾、闯关得 🧼；照顾它都会涨经验，每 4 级进化一次，进化后长得不一样哦。</div>';
    v.appendChild(c2);
    $$('#set-body [data-pgst]').forEach(function (cv) {
      petAnim.exprIdx['idle'] = 0;
      drawPet(cv, 'idle', +cv.dataset.pgst);
    });
    $$('#set-body .pg-cvwrap').forEach(function (w) {
      var st = +w.dataset.st;
      w.onclick = function () {
        var cv = w.querySelector('canvas');
        petAnim.exprIdx['happy'] = 0;
        drawPet(cv, 'happy', st);
        beep('tap');
        setTimeout(function () {
          petAnim.exprIdx['idle'] = 0;
          drawPet(cv, 'idle', st);
        }, 900);
      };
    });

    /* --- 宠物物种（换着养，数值与等级保留）--- */
    var cSp = el('div', 'card');
    cSp.innerHTML = '<h2 class="section">宠物物种 · 换着养</h2>' +
      '<div class="muted" style="margin-bottom:var(--sp-3)">换物种保留等级、经验和数值；进化阶段名称跟着新物种走</div>' +
      '<div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">' +
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
        /* 顶栏 logo 跟当前宠物走 —— 跟设置里"换着养"的视觉呼应 */
        var blogo = $('#brand-logo');
        if (blogo) blogo.textContent = PET_SPECIES[b.dataset.species].emoji;
        go('home');
        renderSettings();
        toast('换成了' + PET_SPECIES[b.dataset.species].label + '！等级经验都还在');
      };
    });

    /* --- 状态试验台（表情预览 + 像素特效一览 + 实景演示）--- */
    var TB_EXPRS = [
      ['idle', '待机'], ['blink', '眨眼'], ['happy', '开心'], ['sad', '难过'],
      ['sleep', '睡着'], ['droopy', '没劲'], ['excited', '兴奋'],
      ['eat', '吃饭'], ['wash', '搓澡'], ['grunt', '用力'], ['walk', '走路']
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
    var TB_ACT_CLS = ['eat', 'happy', 'sad', 'wash', 'dance', 'prop', 'poop'];
    var tbExpr = 'idle', tbStage = petStageIdx(), tbWalkIdx = 0;
    function tbRedraw() {
      if (tbExpr === 'walk') {
        petAnim.exprIdx['idle'] = 0;
        drawPet($('#tb-cv'), 'idle', tbStage, true);
      } else {
        petAnim.exprIdx[tbExpr] = 0;
        drawPet($('#tb-cv'), tbExpr, tbStage);
      }
    }
    function tbPlay(cls, expr, ms) {
      var w = $('#tb-cvwrap'); if (!w) return;
      TB_ACT_CLS.forEach(function (k) { w.classList.remove(k); });
      if (cls) w.classList.add(cls);
      tbExpr = expr; tbRedraw();
      tbStartAnim();   // 实景演示也播多帧动画（wash 左右气泡交替 / eat 表情变化等）
      if (tbTimers.play) clearTimeout(tbTimers.play);
      tbTimers.play = setTimeout(function () {
        var w2 = $('#tb-cvwrap');
        if (w2) TB_ACT_CLS.forEach(function (k) { w2.classList.remove(k); });
        tbStopAnim();
        tbExpr = 'idle'; tbRedraw();
      }, ms || 1200);
    }
    var c2b = el('div', 'card');
    var TB_STAGES = [[0, '蛋'], [1, curSpecies().stages[0]], [2, curSpecies().stages[1]], [3, curSpecies().stages[2]]];
    var tbPreviewUrl = new URL(window.location.href);
    tbPreviewUrl.searchParams.set('pet-test', PET_TEST_KEYS.indexOf(petSpeciesKey()) >= 0 ? petSpeciesKey() : 'dragon');
    tbPreviewUrl.hash = '';
    c2b.innerHTML = '<div class="tb-heading"><h2 class="section">状态试验台 · 点了就看</h2>' +
      '<a class="btn ghost sm" href="' + esc(tbPreviewUrl.href) + '">动作预览 →</a></div>' +
      '<div class="pg-cvwrap pet-canvas-wrap tb-main" id="tb-cvwrap"><canvas id="tb-cv" width="16" height="16"></canvas></div>' +
      '<div class="row wrap" style="gap:var(--sp-2);margin-top:var(--sp-2)" id="tb-stages">' +
      TB_STAGES.map(function (s) {
        return '<button class="chip" data-tbs="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="muted" style="margin:var(--sp-3) 0 var(--sp-2)">表情（跟着上面选的形态走）</div>' +
      '<div class="row wrap" style="gap:var(--sp-2)" id="tb-exprs">' +
      TB_EXPRS.map(function (e) {
        return '<button class="chip" data-tbe="' + e[0] + '">' + e[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="muted" style="margin:var(--sp-3) 0 var(--sp-2)">像素特效精灵一览（跟首页飘的是同一套）</div>' +
      '<div class="row wrap" style="gap:var(--sp-2)" id="tb-fx"></div>' +
      '<div class="muted" style="margin:var(--sp-3) 0 var(--sp-2)">实景演示（点了就在这里播，不跳回首页）</div>' +
      '<div class="row wrap" style="gap:var(--sp-2)">' +
      '<button class="chip" data-demo="feed">喂食</button>' +
      '<button class="chip" data-demo="wash">洗澡</button>' +
      '<button class="chip" data-demo="dance">跳舞</button>' +
      '<button class="chip" data-demo="prop">掏道具</button>' +
      '<button class="chip" data-demo="sad">难过</button>' +
      '<button class="chip" data-demo="poop">放颗粑粑</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:var(--sp-3)">粑粑演示会顺带在首页放一颗（最多 3 颗，回首页点它清理）。</div>';
    v.appendChild(c2b);
    function tbMarkStage() {
      $$('#tb-stages .chip').forEach(function (b) {
        b.classList.toggle('on', +b.dataset.tbs === tbStage);
      });
    }
    tbMarkStage();
    tbRedraw();
    /* 试验台本地动画定时器：点 chip → 持续循环该 expr 的多帧。
       单帧 expr（blink / excited / big / droopy / sad）保持静态显示。
       expr 值可能是数组（eat/sleep/happy…）也可能是 {stage:array} 映射（idle 按阶段分级）。 */
    function tbStopAnim() {
      if (tbTimers.anim) { clearInterval(tbTimers.anim); tbTimers.anim = null; }
    }
    function tbResolveFrames() {
      if (tbExpr === 'walk') {
        var fr = PET_FRAMES[petSpeciesKey()];
        var walkPrefix = fr.walk && (typeof fr.walk === 'string' ? fr.walk : fr.walk[tbStage]);
        if (!walkPrefix) return null;
        return [0,1,2,3,4,5,6].map(function(i){ return walkPrefix + i; });
      }
      var exprMap = PET_FRAMES[petSpeciesKey()].expr[tbExpr];
      if (Array.isArray(exprMap)) return exprMap;
      if (exprMap && typeof exprMap === 'object') return exprMap[tbStage] || null;
      return null;
    }
    function tbStartAnim() {
      tbStopAnim();
      var ev = tbResolveFrames();
      if (!Array.isArray(ev) || ev.length <= 1) return;
      var interval = tbExpr === 'walk' ? 180 : (PET_EXPR_INTERVAL[tbExpr] || 400);
      tbTimers.anim = setInterval(function () {
        var ev2 = tbResolveFrames();
        if (!Array.isArray(ev2) || ev2.length <= 1) { tbStopAnim(); return; }
        if (tbExpr === 'walk') {
          tbWalkIdx = (tbWalkIdx + 1) % 7;
          petWalk.frameIdx = tbWalkIdx;
          drawPet($('#tb-cv'), 'idle', tbStage, true);
        } else {
          petAnim.exprIdx[tbExpr] = ((petAnim.exprIdx[tbExpr] || 0) + 1) % ev2.length;
          drawPet($('#tb-cv'), tbExpr, tbStage);
        }
      }, interval);
    }
    function tbSetExpr(expr) {
      tbStopAnim();
      tbExpr = expr;
      if (expr === 'walk') { tbWalkIdx = 0; petWalk.frameIdx = 0; }
      else { petAnim.exprIdx[tbExpr] = 0; }
      tbRedraw();
      tbStartAnim();
    }
    $$('#set-body [data-tbs]').forEach(function (b) {
      b.onclick = function () { tbStage = +b.dataset.tbs; tbMarkStage(); tbRedraw(); beep('tap'); };
    });
    $$('#set-body [data-tbe]').forEach(function (b) {
      b.onclick = function () { tbSetExpr(b.dataset.tbe); beep('tap'); };
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
    /* 三个任务量各一行：[−] 当前值 [+]，中间的数字可以直接点开输入。
       不用 chip 预设 —— 三行 × 5 个控件 = 15 个控件，设一次量要找半天；
       而且「要 12 词」在 chip 版里只能选 12 或者选 5 再心里折算。
       步进器一行 3 个控件，12 就是点 7 次 +，不用预判。 */
    var MIN_N = 1, MAX_N = 50;
    var goalRow = function (label, key, unit) {
      var cur = S.settings[key];
      return '<div class="row wrap" style="gap:var(--sp-3);align-items:center">' +
        '<span class="muted goal-label">' + label + '</span>' +
        '<span class="stepper">' +
          '<button class="step-btn" data-step="' + key + '" data-delta="-1"' +
            (cur <= MIN_N ? ' disabled' : '') + ' aria-label="减少' + label + '">−</button>' +
          '<input class="field-num" type="number" inputmode="numeric" ' +
            'min="' + MIN_N + '" max="' + MAX_N + '" step="1" ' +
            'data-numinput="' + key + '" value="' + cur + '" aria-label="' + label + '数量">' +
          '<button class="step-btn" data-step="' + key + '" data-delta="1"' +
            (cur >= MAX_N ? ' disabled' : '') + ' aria-label="增加' + label + '">+</button>' +
        '</span>' +
        '<span class="muted" style="flex:0 0 auto">' + unit + '</span>' +
        '</div>';
    };
    /* 两行：第一行是学习偏好，第二行是进度数据。分开的理由不是排版好看 ——
       导出/导入/清空动的是存档，跟「英音还是美音」不是一类东西，
       放一行里容易被当成一组同类选项顺手点下去（清空重来不可撤销）。
       按钮只报状态，不报用法：「点此关闭」这种话是控件自己该知道的事，
       真正需要说的（音标建议、进度只在本机）并到标题后面一句。 */
    c3.innerHTML = '<h2 class="section">家长设置 <span class="muted" style="font-weight:600">· 一二年级建议关音标 · 进度只存本机，换设备用导出/导入</span></h2>' +
      '<div class="row wrap" style="gap:var(--sp-2)">' +
      '<button class="btn ghost sm" id="set-accent">' + (S.settings.accent === 'uk' ? '🇬🇧 英音' : '🇺🇸 美音') + '</button>' +
      '<button class="btn ghost sm" id="ipa-toggle">' + (S.settings.showIpa ? '🔊 音标：开' : '🔇 音标：关') + '</button>' +
      '</div>' +
      '<div class="row wrap" style="gap:var(--sp-2);margin-top:var(--sp-2)">' +
      '<button class="btn ghost sm" id="exp">⬇️ 导出进度</button>' +
      '<button class="btn ghost sm" id="imp">⬆️ 导入进度</button>' +
      '<button class="btn ghost sm" id="reset">🗑 清空重来</button>' +
      '</div>' +
      /* 任务量放在最后：它是这张卡里唯一需要解释的控件，
         放最后才不会被上面的按钮和标题说明淹掉。 */
      '<h2 class="section" style="margin-top:var(--sp-4)">每日任务量 <span class="muted" style="font-weight:600">· 每项 ' + MIN_N + '–' + MAX_N + '</span></h2>' +
      goalRow('学单词', 'dailyGoal', '词') +
      goalRow('闯关', 'quizGoal', '题') +
      goalRow('拼读练习', 'phGoal', '题');
    v.appendChild(c3);

    /* --- 语音识别（跟读判分引擎）--- */
    var eng = micEngine();
    var engTxt = eng === 'sr' ? '浏览器自带识别' : (eng === 'sf' ? '硅基流动云端' : '未启用（只能自评）');
    var c4 = el('div', 'card');
    c4.innerHTML = '<h2 class="section">语音识别 · 跟读判分</h2>' +
      '<div class="muted" style="margin-bottom:var(--sp-3)">当前引擎：<b>' + engTxt + '</b>' +
      (eng === 'sf' ? '（需要联网，不挑浏览器）' : '') +
      (eng === 'sr' ? '（没配 Key，Chrome 本地离线识别）' : '') + '</div>' +
      '<div class="muted" style="margin-bottom:var(--sp-1)">硅基流动 API Key（填了它，Chrome/Edge/Firefox 都能跟读）</div>' +
      '<input class="field" type="password" id="asr-key" placeholder="sk-…" autocomplete="off" spellcheck="false" ' +
        'value="' + esc(S.settings.asrKey) + '">' +
      '<div class="muted" style="margin:var(--sp-2) 0 var(--sp-1)">识别模型（一般不用改）</div>' +
      '<input class="field" type="text" id="asr-model" spellcheck="false" ' +
        'value="' + esc(S.settings.asrModel) + '">' +
      '<div class="row" style="gap:var(--sp-2);margin-top:var(--sp-3)">' +
        '<button class="btn ghost sm" id="asr-save">保存</button>' +
        '<button class="btn ghost sm" id="asr-clear">清除</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:var(--sp-3)">密钥只存这台设备的浏览器里，Edge / Firefox / Chrome 各存各的，换浏览器要重填一次。' +
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
    /* 任务量：加减按钮和输入框都走 setNum，两条路写的是同一个 settings key，
       所以不会出现「按钮显示 8、框里却是 20」这种分裂状态。 */
    var setNum = function (key, v) {
      /* 夹取而不是拒绝：家长把框清空或者填 0 的时候，页面不该跳回设置页
         或者变成 NaN。1–50 的上限来自「课本最大 57 词，一天练 50 词没有意义」，
         下限 1 是为了别把进度条变成 0/0。 */
      var n = Math.round(Number(v));
      if (!isFinite(n) || n < MIN_N) n = MIN_N;
      if (n > MAX_N) n = MAX_N;
      if (S.settings[key] === n) { renderSettings(); return; }
      S.settings[key] = n; save(); renderSettings();
    };
    $$('#set-body [data-step]').forEach(function (b) {
      b.onclick = function () { setNum(b.dataset.step, S.settings[b.dataset.step] + Number(b.dataset.delta)); };
    });
    $$('#set-body [data-numinput]').forEach(function (inp) {
      /* change 而不是 input：input 每敲一个键就存一次 + 重画整个设置页，
         打到一半的「1」会被立刻夹成 1，光标也就跳了。 */
      inp.onchange = function () { setNum(inp.dataset.numinput, inp.value); };
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

  /* ---------------- isolated sprite preview ---------------- */
  var petTest = { expr: 'idle', frame: 0, playing: true, timer: null };
  var PET_TEST_ACTIONS = [
    ['idle', '待机'], ['blink', '眨眼'], ['happy', '开心'], ['excited', '兴奋'],
    ['eat', '吃饭'], ['walk', '走路'], ['sleep', '睡觉'], ['droopy', '没劲'],
    ['sad', '难过'], ['wash', '洗澡'], ['grunt', '用力']
  ];

  function petTestFrameCount(stage) {
    var fr = PET_FRAMES[PET_TEST_SPECIES];
    if (!fr) return 1;
    if (petTest.expr === 'walk') return fr.walk && fr.walk[stage] ? 7 : 1;
    var frames = fr.expr[petTest.expr];
    if (frames && !Array.isArray(frames) && typeof frames === 'object') frames = frames[stage];
    return Array.isArray(frames) ? frames.length : 1;
  }

  function drawPetTest() {
    if (!PET_TEST_SPECIES || !petTest) return;
    $$('[data-pet-test-stage]').forEach(function (cv) {
      drawPet(cv, petTest.expr === 'walk' ? 'idle' : petTest.expr, +cv.dataset.petTestStage,
        petTest.expr === 'walk', { species: PET_TEST_SPECIES, frame: petTest.frame });
    });
    var count = petTestFrameCount(1);
    var status = $('#pet-test-status');
    if (status) status.textContent = (petTest.playing ? '播放中' : '已暂停') + ' · 第 ' +
      ((petTest.frame % count) + 1) + ' / ' + count + ' 帧';
    var toggle = $('#pet-test-toggle');
    if (toggle) {
      toggle.textContent = petTest.playing ? '暂停' : '播放';
      toggle.setAttribute('aria-pressed', String(petTest.playing));
    }
  }

  function stopPetTestTimer() {
    if (petTest.timer) { clearInterval(petTest.timer); petTest.timer = null; }
  }

  function startPetTestTimer() {
    stopPetTestTimer();
    if (!petTest.playing || document.hidden) return;
    var count = Math.max(petTestFrameCount(1), petTestFrameCount(2), petTestFrameCount(3));
    if (count <= 1) return;
    var interval = petTest.expr === 'walk' ? 110 : (PET_EXPR_INTERVAL[petTest.expr] || 400);
    petTest.timer = setInterval(function () {
      petTest.frame = (petTest.frame + 1) % count;
      drawPetTest();
    }, interval);
  }

  function stepPetTest(dir) {
    petTest.playing = false;
    stopPetTestTimer();
    var count = Math.max(petTestFrameCount(1), petTestFrameCount(2), petTestFrameCount(3));
    petTest.frame = (petTest.frame + dir + count) % count;
    drawPetTest();
  }

  function bootPetTest() {
    var species = PET_SPECIES[PET_TEST_SPECIES];
    document.body.classList.add('pet-test-mode');
    document.title = species.label + '动作预览 · 皮克学英语';
    var gameUrl = new URL(window.location.href);
    gameUrl.searchParams.delete('pet-test');
    gameUrl.hash = '';
    $('#app').innerHTML =
      '<header class="topbar pet-test-topbar">' +
        '<div class="brand"><span class="logo">' + species.emoji + '</span><span>皮克学英语</span></div>' +
        '<a class="btn ghost sm" href="' + esc(gameUrl.pathname + gameUrl.search) + '">回到游戏</a>' +
      '</header>' +
      '<main id="view" class="pet-test-view">' +
        '<div class="pet-test-heading"><span class="pill">一起长大</span>' +
          '<h1>' + esc(species.label) + '动作预览</h1><p>看看三种成长模样，一起动起来。</p></div>' +
        '<nav class="pet-test-species" aria-label="选择宠物">' +
          PET_TEST_KEYS.map(function (key) {
            var target = new URL(gameUrl.href);
            target.searchParams.set('pet-test', key);
            var active = key === PET_TEST_SPECIES;
            return '<a class="chip' + (active ? ' on' : '') + '" data-pet-test-species="' + key + '"' +
              (active ? ' aria-current="page"' : '') + ' href="' + esc(target.pathname + target.search) + '">' +
              PET_SPECIES[key].emoji + ' ' + esc(PET_SPECIES[key].label) + '</a>';
          }).join('') +
        '</nav>' +
        '<section class="pet-test-grid" aria-label="三个成长阶段">' +
          [1, 2, 3].map(function (stage) {
            var label = species.stages[stage - 1];
            return '<article class="card pet-test-card"><div class="pet-test-scene">' +
              '<canvas width="48" height="48" data-pet-test-stage="' + stage + '" role="img" aria-label="' +
              esc(label) + '">' + esc(label) + '</canvas></div><h2>' + esc(label) + '</h2></article>';
          }).join('') +
        '</section>' +
        '<section class="card pet-test-controls" aria-label="动作和播放">' +
          '<h2 class="section">换个动作</h2><div class="pet-test-actions" role="group" aria-label="选择动作">' +
            PET_TEST_ACTIONS.map(function (action) {
              return '<button class="chip' + (action[0] === petTest.expr ? ' on' : '') + '" data-pet-test-expr="' +
                action[0] + '" aria-pressed="' + (action[0] === petTest.expr) + '">' + action[1] + '</button>';
            }).join('') +
          '</div><div class="pet-test-playback">' +
            '<button class="btn sm" id="pet-test-toggle" aria-label="播放或暂停动画">暂停</button>' +
            '<button class="btn ghost sm" id="pet-test-prev">上一帧</button>' +
            '<button class="btn ghost sm" id="pet-test-next">下一帧</button>' +
            '<span class="muted" id="pet-test-status"></span>' +
          '</div></section>' +
        '<p class="pet-test-note">仅预览，不影响学习进度。</p>' +
      '</main>';
    $$('[data-pet-test-expr]').forEach(function (button) {
      button.onclick = function () {
        petTest.expr = button.dataset.petTestExpr;
        petTest.frame = 0;
        $$('[data-pet-test-expr]').forEach(function (b) {
          var active = b === button;
          b.classList.toggle('on', active);
          b.setAttribute('aria-pressed', String(active));
        });
        drawPetTest();
        startPetTestTimer();
      };
    });
    $('#pet-test-toggle').onclick = function () {
      petTest.playing = !petTest.playing;
      drawPetTest(); startPetTestTimer();
    };
    $('#pet-test-prev').onclick = function () { stepPetTest(-1); };
    $('#pet-test-next').onclick = function () { stepPetTest(1); };
    document.addEventListener('visibilitychange', startPetTestTimer);
    window.addEventListener('pagehide', stopPetTestTimer);
    window.addEventListener('pageshow', startPetTestTimer);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) petTest.playing = false;
    drawPetTest();
    startPetTestTimer();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (PET_TEST_SPECIES) { bootPetTest(); return; }
    document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
    /* 顶栏 logo 用当前宠物 emoji：默认 🐉（dragon），换物种后 logo 跟着变 */
    var blogo = $('#brand-logo');
    if (blogo) blogo.textContent = (PET_SPECIES[petSpeciesKey()] || PET_SPECIES.dragon).emoji;
    renderTabs();
    var sb = $('#btn-settings');
    if (sb) sb.onclick = openSettings;
    var stb = $('#btn-stats');
    if (stb) stb.onclick = openStats;
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

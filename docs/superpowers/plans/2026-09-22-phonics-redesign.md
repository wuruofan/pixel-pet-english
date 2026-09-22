# Phonics Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three concrete bugs in the phonics tab (data path mismatch between PHONICS.groups and WORDS[w].pindu, missing teaching moment after answer feedback, and per-grapheme stats disconnect) and add the four supporting features (auto-play correct answer in hear/see, reference word + fallback in see, weighted unmastered-first word picker in build, letters-not-equal filter on distractors) so the four sub-games share a single data layer and a single teaching-moment protocol.

**Architecture:** A new `PHONEMES_BY_WORD` dictionary joins the existing `PHONICS.groups.items` in the build bundle, so all four sub-games can consume phonemes that already passed the `classify()` filter. The 10 sticky-graph words silently fall out of the build game's pool. Two small helpers land alongside — `phTrack` (pure per-grapheme stats) and `isPhMastered` (single source of truth for the 3-corrects-and-twice-wrongs mastery check) — and replace ad-hoc conditions currently spread across `renderPhCards`, `renderPhBuild`, and `pgrade`. The same `phDistractors` helper is rewritten once with a letters-not-equal floor to close a latent judge-correct bug.

**Tech Stack:** Node.js for `scripts/build.js` and a Node probe script; `pixel-pet-english.html` is the bundle output; in-browser verification via the local Python static server (port 57321) and the FilePanel browser.

**Spec:** `docs/superpowers/specs/2026-09-22-phonics-redesign-design.md`

## Global Constraints

- Single-file output: `pixel-pet-english.html` rebuilt via `node scripts/build.js`.
- No new dependencies; no new CSS variables; no new icons; reuse the 6 PB_TAG colors.
- Stats key `S.phonics` is the only per-grapheme stats storage.
- Index field `dayStat().phonics` increments **once per build-word**, not per phoneme.
- IPA characters only appear in build-game feedback text when `S.settings.showIpa === true` (default false).
- All console output during build/serve must remain error-free.
- One test entry point exists: `scripts/test-pet-preview.js` (vm sandbox over `src/app.js`); reuse its style for `scripts/probe-phonics.js`. There is no `scripts/test-sprite-contract.js` — that path was a hallucination in the earlier draft.
- The local static server is `node scripts/serve-no-cache.js` (port 57321). Open `http://127.0.0.1:57321/pixel-pet-english.html` in the in-app browser for visual checks.

## File Structure

| File | Role |
|---|---|
| `scripts/build.js` | Add `PHONEMES_BY_WORD` construction + `window.__PHONEMES_BY_WORD__` export (~30 lines). |
| `src/app.js` | All four sub-games + helpers (`phTrack`, `isPhMastered`, rewritten `phDistractors`). No file split. |
| `scripts/probe-phonics.js` | New Node probe that reads `pixel-pet-english.html` and asserts the bundle exports (`__PHONEMES_BY_WORD__`, counts, presence of sticky-graph words). |
| `pixel-pet-english.html` | Rebuilt artifact; do not edit by hand. |

---

## Task 1: Export PHONEMES_BY_WORD from build

**Files:**
- Modify: `scripts/build.js`
- Create: `scripts/probe-phonics.js`
- Test: `pixel-pet-english.html` (rebuilt)

**Interfaces:**
- Consumes: existing `PHONICS.groups.items` (a flat array of `{ letters, sound, audio, kind, n, words }`), existing `WORDS` from `data/words.json`.
- Produces: a new global `window.__PHONEMES_BY_WORD__` — an object literal `{ word: [phonemeItem, ...] }` where every `phonemeItem` is a shallow copy (`{...item}`) of a `PHONICS.groups.items` entry whose `letters`/`sound`/`audio` matches the source `pindu` entry. Words whose `pindu` length is 2-5 AND whose `pindu` letters all map to `PHONICS.groups.items` are present; words with any sticky-graph letters (the 10 the existing `classify()` drops) are absent.

- [ ] **Step 1: Write the probe**

Create `scripts/probe-phonics.js`:

```js
#!/usr/bin/env node
'use strict';
// Probe the rebuilt bundle for phonics data exports.
// Usage: node scripts/probe-phonics.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pixel-pet-english.html'), 'utf8');

function extractGlobal(name) {
  const re = new RegExp('window\\.__' + name + '__\\s*=\\s*', 'g');
  const m = re.exec(HTML);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (HTML[i] === '{') {
    let depth = 0;
    const start = i;
    for (; i < HTML.length; i++) {
      if (HTML[i] === '{') depth++;
      else if (HTML[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return JSON.parse(HTML.slice(start, i));
  }
  return null;
}

const PHONEMES_BY_WORD = extractGlobal('PHONEMES_BY_WORD');
assert.ok(PHONEMES_BY_WORD, 'window.__PHONEMES_BY_WORD__ must be exported by build.js');

const STICKY = new Set(['il', 'eye', 'nd', 'ao', 'dp', 'dn', 'es', 'wo', 'ne', 'pe']);
for (const word of Object.keys(PHONEMES_BY_WORD)) {
  const arr = PHONEMES_BY_WORD[word];
  assert.ok(arr.length >= 2 && arr.length <= 5, word + ' must have 2-5 phonemes, got ' + arr.length);
  for (const p of arr) {
    assert.ok(!STICKY.has(p.letters), word + ' must not contain sticky grapheme ' + p.letters);
    assert.ok(typeof p.audio === 'string' && p.audio.length > 0, word + '/' + p.letters + ' missing audio');
  }
}

// Words that should NOT appear (contain at least one sticky grapheme)
const STICKY_WORDS = ['pencil', 'eyes', 'grandma', 'jiaozi', 'grandpa', 'wednesday', 'two', 'nine', 'grapes', 'noodles'];
for (const w of STICKY_WORDS) {
  assert.equal(PHONEMES_BY_WORD[w], undefined, w + ' should be excluded from PHONEMES_BY_WORD');
}

// Words that should appear. All verified to live in words.json and be
// assigned to at least one book (so they're reachable from
// currentBookWords() at runtime). Avoid crayon/papa/mama/crayons/pen
// which GLM review pointed out don't exist in words.json.
const MUST_APPEAR = ['book', 'eraser', 'mother', 'sister', 'face', 'mouth', 'nose', 'eraser', 'ears', 'brother'];
for (const w of MUST_APPEAR) {
  assert.ok(PHONEMES_BY_WORD[w], w + ' should appear in PHONEMES_BY_WORD');
}

console.log('PHONEMES_BY_WORD probe OK: ' + Object.keys(PHONEMES_BY_WORD).length + ' words exported');
```

- [ ] **Step 2: Run probe to verify it fails**

Run: `node scripts/probe-phonics.js`
Expected: `AssertionError: window.__PHONEMES_BY_WORD__ must be exported by build.js`

- [ ] **Step 3: Construct PHONEMES_BY_WORD in build.js**

Edit `scripts/build.js`. After the existing `const phonics = buildPhonics();` line (around line 95), and before the `// Drop the textbook lesson audio...` comment, add:

```js
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
```

Then, in the same file where the existing `window.__PHONICS__` and other globals are serialized (look for the `JSON.stringify` block near the `<script>` template), add an export line:

```js
window.__PHONEMES_BY_WORD__ = ${JSON.stringify(PHONEMES_BY_WORD)};
```

- [ ] **Step 4: Rebuild and re-run probe**

Run: `node scripts/build.js && node scripts/probe-phonics.js`
Expected: `PHONEMES_BY_WORD probe OK: 77 words exported`

If the count differs (must be ≤86, ≥70), inspect `Object.keys(PHONEMES_BY_WORD).sort()` and check which expected words are missing; adjust the sticky-grapheme regex or length bounds in Step 3 only after confirming the data with `node -e "..."` probing `data/words.json` directly.

- [ ] **Step 5: Commit**

```bash
git add scripts/build.js scripts/probe-phonics.js pixel-pet-english.html
git commit -m "feat(phonics): export PHONEMES_BY_WORD with sticky-graph words excluded"
```

---

## Task 2: Split pgrade and extract isPhMastered

**Files:**
- Modify: `src/app.js` (around lines 2660-2680 and 2735-2745)

**Interfaces:**
- Produces: two new top-level functions inside the existing app IIFE:
  - `phTrack(letters, ok)`: increments `S.phonics[letters].right` or `.wrong`. No `gainXp`, no `dayStat().phonics`.
  - `isPhMastered(letters)`: returns `true` iff `S.phonics[letters].right >= 3 && S.phonics[letters].right >= S.phonics[letters].wrong * 2`.
- Modifies: `pgrade(letters, ok)` becomes `phTrack(...) + gainXp(1, 'toy') + dayStat().phonics++`.
- Modifies: `renderPhCards`'s `mastered` predicate calls `isPhMastered(it.letters)` instead of the inline `st && st.right >= 3 && st.right >= st.wrong * 2`.

- [ ] **Step 1: Grep to confirm current state**

Run: `grep -n "right >= 3 && st.right >= st.wrong \* 2" src/app.js`
Expected: a single hit in `renderPhCards` (around line 2740).

Run: `grep -n "function pgrade" src/app.js`
Expected: a single hit.

- [ ] **Step 2: Extract isPhMastered**

Just before the `var phMode = 'build';` declaration, add:

```js
/* Single source of truth for "this letter has been seen and practiced enough".
 * `right >= 3 && right >= wrong * 2` is the threshold; used by both the
 * grapheme card's green-check and the build game's unmastered picker. */
function isPhMastered(letters) {
  var st = S.phonics && S.phonics[letters];
  return !!(st && st.right >= 3 && st.right >= st.wrong * 2);
}
```

Then replace the existing `mastered` line in `renderPhCards` with `var mastered = isPhMastered(it.letters);`.

- [ ] **Step 3: Split pgrade**

Replace the existing `function pgrade(letters, ok)` with:

```js
function phTrack(letters, ok) {
  var st = pstate(letters);
  st.seen++; if (ok) st.right++; else st.wrong++;
  save();
}
function pgrade(letters, ok) {
  phTrack(letters, ok);
  if (ok) { gainXp(1, 'toy'); dayStat().phonics = (dayStat().phonics || 0) + 1; }
}
```

Note: `phTrack` calls `save()` once. The existing `pgrade` already calls `save()` directly (app.js:2669), so the new `pgrade` will end up calling `save()` twice per right-answer — once from `phTrack`, once from the body. The duplication is harmless because `save()` is debounced via `saveTimer` (app.js:81), but if you'd rather be explicit, drop the inner `save()` call from `phTrack` and rely on the original `save()` in the body. Either way, behavior is unchanged.

`renderPhBuild`'s success branch (Task 6) calls `phTrack(p.letters, true)` directly; the build-game branch does not call the outer `pgrade()`, so `gainXp` / `dayStat().phonics++` must run separately there.

- [ ] **Step 4: Build and verify**

Run: `node scripts/build.js`
Then: open `http://127.0.0.1:57321/pixel-pet-english.html` in the in-app browser. Click 拼读 → 字素表. Pick any grapheme you can hear twice with the same answer in 听音选字母 and confirm the green-check still appears after the third right. Then trigger an answer in 听音选字母 and confirm the home screen's 拼读 x/5 counter still increments by exactly 1 per answer.

Console check: `mcp_browser` `kind: console` `levels: error`. Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add src/app.js pixel-pet-english.html
git commit -m "refactor(phonics): split pgrade into phTrack + pgrade, extract isPhMastered"
```

---

## Task 3: Rewrite phDistractors with letters-not-equal floor and 3-tier fallback

**Files:**
- Modify: `src/app.js` (`phDistractors` at ~line 2683)

**Interfaces:**
- Produces: rewritten `phDistractors(item, n)` that returns `n` phonemes where every returned item has `letters !== item.letters` (the floor) and prefers:
  - tier 1 — same-length as `item`, sorted by whether first letter matches `item.letters[0]`
  - tier 2 — same `kind` as `item`
  - tier 3 — anything else (minus the floor)
- Shuffles within each tier; falls through tiers until `n` items collected.

- [ ] **Step 1: Confirm current bug exists**

Run: `grep -A4 "function phDistractors" src/app.js | head -10`
Expected: shows the current pool filter only excludes `x.sound !== item.sound`, NOT `x.letters !== item.letters`.

- [ ] **Step 2: Replace phDistractors body**

In `src/app.js`, replace the body of `function phDistractors(item, n) { ... }` with:

```js
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
```

The sort-based-within-tier bias works because we drain each sorted tier with `take()` in order — never re-shuffle after sort.

- [ ] **Step 3: Build and probe by hand**

Run: `node scripts/build.js`
Then: open `http://127.0.0.1:57321/pixel-pet-english.html`. Click 拼读 → 听音选字母. Run 10 rounds; in each round, examine the four `data-l` attributes (via inspect). For every round, confirm none of the four options share the same `letters` string as the correct one (probe script lives in `scripts/probe-phonics.js` if you want to extend it later).

- [ ] **Step 4: Commit**

```bash
git add src/app.js pixel-pet-english.html
git commit -m "fix(phonics): phDistractors floor on letters-not-equal, 3-tier fallback"
```

---

## Task 4: Auto-play correct answer in renderPhHear

**Files:**
- Modify: `src/app.js` (`renderPhHear`, ~line 2783-2805)

- [ ] **Step 1: Confirm the gap**

Run: `grep -n "phPlay(chosen, b)" src/app.js`
Expected: a single hit inside `renderPhHear` (around line 2790). That's the wrong-answer audio; the right-answer audio is missing for both correct and incorrect outcomes.

- [ ] **Step 2: Replace chosen audio with correct-answer audio**

Find the click handler in `renderPhHear` (after `var ok = b.dataset.l === q.item.letters;`). Replace the existing `phPlay(chosen, b);` with a single call:

```js
/* Play the correct item's audio. Do NOT also play the child's pick —
 * playRange() starts with stopAudio() so a back-to-back second call
 * would kill the first and the child would hear nothing. */
phPlay(q.item, b);
```

The optional second `phPlay(chosen, ...)` (visual feedback on the picked button) is dropped: the button's `playing` class already provides the visual cue, and a second playback would mask the correct answer's audio.

- [ ] **Step 3: Build and verify**

Run: `node scripts/build.js`
Open `127.0.0.1:57321/pixel-pet-english.html` → 拼读 → 听音选字母. Pick any option (right or wrong); confirm the audio that follows is for the right item, not the one you clicked.

- [ ] **Step 4: Commit**

```bash
git add src/app.js pixel-pet-english.html
git commit -m "feat(phonics): auto-play correct answer in hear mode"
```

---

## Task 5: Reference word + auto-play reference word + fallback in renderPhSee

**Files:**
- Modify: `src/app.js` (`renderPhSee`, ~line 2810-2848)

**Interfaces:**
- Produces: an internal helper `phPickReferenceWord(item)` that returns the first `item.words` entry that's in the current book, falling back to `item.words[0]`, falling back to `null`.
- Modifies: `renderPhSee`'s options render to include `<div class="ph-ref">reference</div>` under each button when a reference exists.
- Modifies: `renderPhSee`'s click handler to call `speakWord(reference)` after `phPlay` (in addition to or replacing the existing audio).

- [ ] **Step 1: Add phPickReferenceWord**

Just after `phDistractors`, add:

```js
function phPickReferenceWord(item) {
  var bookWords = currentBookWords();
  for (var i = 0; i < item.words.length; i++) {
    if (bookWords.indexOf(item.words[i]) >= 0) return item.words[i];
  }
  return item.words[0] || null;
}
```

- [ ] **Step 2: Render reference word inside each option button**

`renderPhSee` uses inline button HTML (not `phOptionCard`, which is reserved for `renderPhHear`). Locate the inline `.ph-opt` button template in `renderPhSee` — it's the `q.options.map(function (o) { ... })` block that produces buttons with `<span class="sp">🔊</span>`. Change it to:

```js
q.options.map(function (o) {
  var ref = phPickReferenceWord(o);
  return '<button class="ph-opt" data-l="' + esc(o.letters) + '">' +
    '<span class="sp">🔊</span>' +
    (ref ? '<span class="ph-ref">' + esc(ref) + '</span>' : '') +
    '</button>';
}).join('')
```

Reference word goes **inside** the `<button>` because `.ph-grid` is CSS grid (style.css:656) — appending a sibling `<div>` would create a separate grid cell and break the four-column layout.

Add to `src/style.css`:

```css
.ph-opt .ph-ref { display: block; font-size: 11px; color: var(--ink-soft); margin-top: 2px; font-weight: 600; }
.ph-opt { display: flex; flex-direction: column; align-items: center; gap: 2px; }
```

- [ ] **Step 3: Auto-play reference word after answer**

In `renderPhSee`'s click handler, find `phPlay(chosen, b);` and add immediately after:

```js
var ref = phPickReferenceWord(q.item);
if (ref) setTimeout(function () { speakWord(ref); }, 280);
```

- [ ] **Step 4: Build and verify**

Run: `node scripts/build.js`
Open `127.0.0.1:57321/pixel-pet-english.html` → 拼读 → 见字选音. Each of the four speakers has a reference word printed under it. Picking any option triggers the correct answer's reference word in full pronunciation.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/style.css pixel-pet-english.html
git commit -m "feat(phonics): reference word + auto-play in see mode"
```

---

## Task 6: Rewrite renderPhBuild on PHONEMES_BY_WORD + teaching moment + phTrack + unmastered-first picker

**Files:**
- Modify: `src/app.js` (`renderPhBuild`, ~line 2840-2906)
- Modify: `src/style.css` (one rule for `ph-ref` and possibly a tweak for slot color contrast — see Step 4)

**Interfaces:**
- Produces: a module-level `pickBuildWord()` helper that picks from `currentBookWords()` filtered to `PHONEMES_BY_WORD` with 2-5 phonemes, preferring words whose phonemes include at least one unmastered letter, and respecting a `sameLettersInRow` cap of 3 (track via a module-level counter map).
- Modifies: `renderPhBuild`:
  - pool filter uses `PHONEMES_BY_WORD` instead of `WORDS[w].pindu`
  - on correct completion: call `phTrack` once per unique letter, plus once-per-word `gainXp(1, 'toy')` and `dayStat().phonics++`
  - show `(1)` / `(2)` index on slots whose letters repeat within the same word
  - on wrong click: re-play the next-needed letter's audio as a hint
  - show color tags + classification label under each slot in the feedback block

- [ ] **Step 1: Wire PHONEMES_BY_WORD into app.js**

At the top of `src/app.js`, near where `var PHONICS = window.__PHONICS__;` is declared (around line 12), add:

```js
var PHONEMES_BY_WORD = window.__PHONEMES_BY_WORD__ || {};
```

Without this, every other step in Task 6 hits `ReferenceError: PHONEMES_BY_WORD is not defined` at runtime.

- [ ] **Step 2: Add pickBuildWord (with empty-pool guard) + reset counter**

Just before `function renderPhBuild(v) {`, add:

```js
/* Counter map used to enforce "no same letter shows up 3 words in a
 * row", preventing fatigue on a single grapheme. Reset explicitly:
 *  - when the user navigates away from the build tab (call
 *    resetBuildLetterRow() from `go()` when `id !== 'phonics'`)
 *  - when the day rolls (call resetBuildLetterRow() from
 *    dayStat() — see plan step 6 below) */
var buildLetterRow = {};
function resetBuildLetterRow() { buildLetterRow = {}; }

function pickBuildWord() {
  var pool = currentBookWords().filter(function (w) {
    var ph = PHONEMES_BY_WORD[w];
    return ph && ph.length >= 2 && ph.length <= 5;
  });
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
```

- [ ] **Step 3: Replace pool construction in renderPhBuild**

Locate the existing `var pool = ...` and the `if (!phBuild) { ... }` block. Replace the entire initialization with:

```js
if (!phBuild) {
  var w = pickBuildWord();
  if (!w) { v.appendChild(empty('这本课本暂时没有可拆的词')); return; }
  /* Build parts in one pass: keep `kind` for the classification label,
   * add `idx` so the slot data-idx attribute matches the parts index.
   * The two cannot be done in separate `.map` calls because the
   * phBuild assignment must hold parts WITH idx before the click
   * handlers read `b.parts[idx]`. */
  var rawPhs = PHONEMES_BY_WORD[w];
  var parts = rawPhs.map(function (p, i) {
    return { letters: p.letters, sound: p.sound, audio: p.audio, kind: p.kind, idx: i };
  });
  phBuild = { word: w, parts: parts, picked: [], queue: shuffle(parts.slice()) };
}
```

- [ ] **Step 4: Replace slot rendering for repeat-letter annotation**

Find:
```js
b.parts.map(function (p, i) {
  var got = b.picked[i];
  return '<span class="slot' + (got ? ' filled' : '') + '">' +
    (got ? '<span class="l pb-tag-' + PB_TAG[phonicsTagOf(got.letters)] + '">' + esc(got.letters) + '</span>' : (i + 1)) + '</span>';
}).join('')
```

Replace with:
```js
(function () {
  var seen = {};
  return b.parts.map(function (p, i) {
    var got = b.picked[i];
    seen[p.letters] = (seen[p.letters] || 0) + 1;
    var idxTag = seen[p.letters] > 1 ? '<sup>(' + seen[p.letters] + ')</sup>' : '';
    return '<span class="slot' + (got ? ' filled' : '') + '">' +
      (got ? '<span class="l pb-tag-' + PB_TAG[phonicsTagOf(got.letters)] + '">' + esc(got.letters) + idxTag + '</span>' : (i + 1)) + '</span>';
  }).join('');
})()
```

- [ ] **Step 5: Build feedback block (uses `p.kind`, NOT `phonicsTagOf`)**

In the success branch (after `b.picked.length === b.parts.length`), replace the existing `<div class="feedback ok">` with:

```js
/* KIND_LABEL maps the group id (which is what PHONICS.groups[i].id and
 * `p.kind` carry) to a Chinese label. phonicsTagOf returns the PB_TAG
 * one-letter code ('c'/'v'/'ct'/'vt'/'r'/'s') — do NOT use that here. */
var KIND_LABEL = { cons: '辅音', vowel: '元音', cteam: '辅音组合', vteam: '元音组合', rctrl: 'r 控元音', silent: '不发音' };
var lettersSeen = {};
var colorRows = b.parts.map(function (p) {
  lettersSeen[p.letters] = (lettersSeen[p.letters] || 0) + 1;
  var label = KIND_LABEL[p.kind] || '';
  return '<span class="pb-tag-' + PB_TAG[phonicsTagOf(p.letters)] + ' ph-tag">' + esc(p.letters) +
    (lettersSeen[p.letters] > 1 ? '<sup>(' + lettersSeen[p.letters] + ')</sup>' : '') +
    '<em>' + label + '</em></span>';
}).join(' ');
var repeatNote = '';
var letterCounts = {}; b.parts.forEach(function (p) { letterCounts[p.letters] = (letterCounts[p.letters] || 0) + 1; });
var repeated = Object.keys(letterCounts).filter(function (k) { return letterCounts[k] > 1; });
if (repeated.length) {
  /* spec §4.5.4: gate the IPA-containing text on S.settings.showIpa.
   * When the switch is on, surface the actual sound labels from the
   * parts' sound field; when off, the child just hears that the same
   * letter sounds different. */
  if (S.settings.showIpa) {
    var examples = repeated.map(function (l) {
      var sounds = b.parts.filter(function (p) { return p.letters === l; }).map(function (p) { return p.sound; });
      return '<b>' + l + '</b> → /' + sounds.join('/、/') + '/';
    });
    repeatNote = '<div class="muted" style="margin-top:6px">同一个字母在不同位置：' + examples.join('；') + '</div>';
  } else {
    repeatNote = '<div class="muted" style="margin-top:6px">两个 <b>' + repeated[0] + '</b> 的读音不一样（听一听）</div>';
  }
}
$('#ph-fb').innerHTML =
  '<div class="feedback ok" style="margin-top:12px">' +
  '<span class="ic">🎉</span><span><b>' + esc(b.word) + '</b> 拼出来啦！+1 🎾</span></div>' +
  '<div class="ph-tags" style="margin-top:8px">' + colorRows + '</div>' +
  repeatNote +
  '<button class="btn green big" id="ph-next" style="margin-top:10px">再拼一个 →</button>';
```

Add to `src/style.css`:

```css
.ph-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 8px; margin: 2px; color: #fff; font-weight: 800; }
.ph-tag em { font-size: 11px; opacity: .85; font-style: normal; }
.ph-tags { display: flex; flex-wrap: wrap; gap: 4px; }
```

- [ ] **Step 6: Wire counter reset on tab return**

Open `src/app.js` `function go(id)`. Add at the very top of the function body:

```js
/* Leaving the build tab resets the consecutive-letter counter so a
 * child returning after a break doesn't hit the 3-in-a-row cap mid-session. */
if (tab === 'phonics' && id !== 'phonics' && typeof resetBuildLetterRow === 'function') {
  resetBuildLetterRow();
}
```

(The `typeof` check is defensive — `resetBuildLetterRow` is defined only after Task 6 Step 2 ships; if you somehow land in the build tab before that lands, this is a safe no-op.)

- [ ] **Step 7: Wrong-click hint**

In the wrong-click branch (`else if (b.picked.length && p.idx !== b.picked.length)`), replace `beep('no');` with:

```js
beep('no');
phPlay(b.parts[b.picked.length], null);
```

This re-plays the audio for the letter that should have been picked.

- [ ] **Step 8: Replace stats call (phTrack per unique letter)**

In the success branch, replace:

```js
gainXp(1, 'toy');
dayStat().phonics = (dayStat().phonics || 0) + 1;
```

with:

```js
gainXp(1, 'toy');
dayStat().phonics = (dayStat().phonics || 0) + 1;
/* Per-grapheme: call phTrack once per distinct letter to avoid double
 * counting same-letter repeats (e.g. eraser has two `r` shapes). */
var seenL = {};
b.parts.forEach(function (p) {
  if (!seenL[p.letters]) { seenL[p.letters] = 1; phTrack(p.letters, true); }
});
```

- [ ] **Step 9: Build and verify**

Run: `node scripts/build.js`
Open `127.0.0.1:57321/pixel-pet-english.html` → 拼读 → 拆词拼读. Confirm:
- The 10 sticky-graph words never appear across 30+ rounds.
- `eraser` (g1a, 3 phonemes with two `r`s) is reachable and shows the repeat-letter annotation. Note: per GLM review, only `eraser` (and similar g1a words) are reachable as in-game repeats since `panda` and `seven` belong only to g1b; if you need to test the IPA branch on a same-letter word, set `S.settings.showIpa = true` via the settings sheet before opening the build game.
- The home screen's 拼读 x/5 counter increments by exactly 1 per round, NOT by 5 (i.e. opening devtools and stepping through `eraser` should yield `+1` on the home counter, not `+3`).
- After picking a previously-unmastered grapheme correctly 3 times across build / hear / see games, the 字素表 shows the green-check on it.
- console: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/app.js src/style.css pixel-pet-english.html
git commit -m "feat(phonics): rewrite build game on PHONEMES_BY_WORD with teaching moment"
```

---

## Task 7: End-to-end acceptance pass

**Files:** none changed; this is a verification task.

- [ ] **Step 1: Full rebuild + probe**

Run: `node scripts/build.js && node scripts/probe-phonics.js && node scripts/test-pet-preview.js`
Expected: all three exit 0; the probe prints `PHONEMES_BY_WORD probe OK: 77 words exported`; pet-preview test prints its usual passing summary.

- [ ] **Step 2: Browser console check**

Open `127.0.0.1:57321/pixel-pet-english.html` in the in-app browser.
Use `mcp_browser` `kind: console` `levels: error`. Expected: empty.

- [ ] **Step 3: Manual flow of the 13 acceptance criteria**

Walk through each of the 13 AC items in the spec §5. Record pass/fail in a comment under each. If any fail, do not consider the plan complete; reopen the relevant task.

Specifically:
1. Trigger the build game 20 times; observe no sticky-graph letters in any slot text.
2. Verify the sticky-graph 10 words never show up.
4. Run the see mode; confirm every option has a reference word (or that the absence is rare enough to ignore in this manual pass).
8. In the default textbook (g1a), play the build game until `eraser` appears (3 phonemes, with two `r` shapes). Verify the two `r` slots render with `(1)` / `(2)`. Per GLM review, `panda` and `seven` are NOT in g1a, so they only validate the data layer (`scripts/probe-phonics.js` confirms they're in `PHONEMES_BY_WORD`), not the game flow.
9. Pick any `a|ɪ` question (orange's a, if it appears) and confirm all four distractors have letters that are NOT `a`.
10. Toggle `S.settings.showIpa` via the settings sheet; rebuild by switching to another tab and back; in the build game, the same-letter feedback text switches between "读音不一样（听一听）" (off) and a sound-list like "r → /r/、/ər/" (on).

- [ ] **Step 4: Final commit (if any doc tweaks)**

If you made any comment-only fixes while walking through AC: stage and commit. Otherwise, no commit.

---

## Self-Review (author's checklist)

1. **Spec coverage:** §4.1 (PHONEMES_BY_WORD) → Task 1. §4.1 (phTrack + isPhMastered) → Task 2. §4.1 (浅拷贝注释) → Task 1. §4.4 (参考词 fallback) → Task 5. §4.5 (拆词拼读重做) → Task 6. §4.6 (phDistractors) → Task 3. §4.7 (教学时刻协议) → Tasks 4 + 5 + 6. §5 acceptance → Task 7. AC #10 (showIpa gate) → Task 6 Step 4.

2. **Placeholder scan:** No `TBD`, `TODO`, "implement later", "similar to Task N", or "fill in" in this plan. All code blocks contain concrete code or command lines.

3. **Type consistency:** `phTrack(letters, ok)` (Task 2) and `isPhMastered(letters)` (Task 2) are used as defined in Task 6 (`phTrack(p.letters, true)`, `isPhMastered(p.letters)`) and Task 5 (`isPhMastered` not used in Task 5 but available). `pickBuildWord` (Task 6) uses `PHONEMES_BY_WORD` produced by Task 1 and `isPhMastered` produced by Task 2. The `buildLetterRow` counter (Task 6) is module-level, initialized once at app boot. No cross-task name drift.
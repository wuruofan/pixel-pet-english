#!/usr/bin/env node
'use strict';

// Run the unmodified app in memory. No browser, packages, network, or real saves.
// This covers routing/state/animation contracts; visual QA still uses a browser.
// Usage: node scripts/test-pet-preview.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const KEY = 'pixel-pet-english-v1';
const OLD_KEY = 'kids-english-v1';
const START = new Date(2026, 8, 17, 12).getTime();
const SPECIES = {
  cat: { label: '小猫', emoji: '🐱', stages: ['baby', 'kid', 'adult'], names: ['小奶猫', '猫崽', '大猫'] },
  dog: { label: '小狗', emoji: '🐶', stages: ['baby', 'kid', 'adult'], names: ['小奶狗', '狗崽', '大狗'] },
  fox: { label: '小狐狸', emoji: '🦊', stages: ['kid', 'teen', 'adult'], names: ['小奶狐', '小狐狸', '大尾巴狐'] },
  dragon: { label: '小龙', emoji: '🐉', stages: ['kid', 'teen', 'adult'], names: ['小绒球', '小龙崽', '小火龙'] }
};
const SPRITES = new Map(fs.readdirSync(path.join(ROOT, 'assets/sprites'))
  .filter(file => file.endsWith('.png'))
  .map(file => {
    const png = fs.readFileSync(path.join(ROOT, 'assets/sprites', file));
    return [file.slice(0, -4), { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
  }));

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type) { (listeners.get(type) || []).forEach(fn => fn({ type })); }
  };
}

function harness(search, { legacy = false } = {}) {
  const draws = [], storageCalls = [], images = [];
  const timers = new Map();
  let nextTimer = 0, now = START;
  const save = JSON.stringify({
    pet: { name: '存档里的小狗', species: 'dog', level: 5, xp: 7,
      sati: 70, mood: 72, clean: 80, lastTick: START - 3600000, poop: { t: START, n: 0 } },
    words: { cat: { s: 1.5, seen: 1, right: 1, wrong: 0, lastSeen: START, due: START + 86400000 } },
    days: { '2026-09-17': { words: 1, right: 1, wrong: 0, ms: 1200, lessons: 0 } },
    lastActive: '2026-09-16', streak: 3
  });
  const storage = new Map([[legacy ? OLD_KEY : KEY, save]]);
  const originalStorage = [...storage];

  // A small DOM tree: only the selectors and element APIs used by these flows.
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.style = {};
      this.className = '';
      this._text = '';
      Object.assign(this, eventTarget());
      const change = (name, on) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        if (on) values.add(name); else values.delete(name);
        this.className = [...values].join(' ');
      };
      this.classList = {
        add: name => change(name, true), remove: name => change(name, false),
        contains: name => this.className.split(/\s+/).includes(name),
        toggle: (name, force) => change(name, force == null ? !this.classList.contains(name) : force)
      };
    }
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'class') this.className = value;
      if (name === 'width' || name === 'height') this[name] = Number(value);
      if (name.startsWith('data-')) {
        this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      }
    }
    getAttribute(name) { return this.attrs[name]; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    set innerHTML(html) { this.children = []; this._text = ''; parse(html, this); }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    insertAdjacentHTML(position, html) { assert.equal(position, 'beforeend'); parse(html, this); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      const result = [];
      const matches = (node, part) => {
        if (part.startsWith('#')) return node.attrs.id === part.slice(1);
        if (part.startsWith('.')) return node.classList.contains(part.slice(1));
        if (part.startsWith('[')) return part.slice(1, -1) in node.attrs;
        return node.tagName === part;
      };
      const visit = node => {
        if (matches(node, parts[parts.length - 1])) {
          let ancestor = node.parent, index = parts.length - 2;
          while (ancestor && index >= 0) {
            if (matches(ancestor, parts[index])) index--;
            ancestor = ancestor.parent;
          }
          if (index < 0) result.push(node);
        }
        node.children.forEach(visit);
      };
      this.children.forEach(visit);
      return result;
    }
    getContext(type) {
      assert.equal(this.tagName, 'canvas'); assert.equal(type, '2d');
      return { clearRect() {}, fillRect() {}, drawImage: image => {
        draws.push({ canvas: this, key: image.src.slice('sprite:'.length) });
      } };
    }
  }
  function parse(html, root) {
    const stack = [root];
    const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
    for (const token of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*?)>|([^<]+)/gi)) {
      if (token[3]) { stack[stack.length - 1]._text += token[3]; continue; }
      if (token[0].startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const node = new Element(token[1]);
      for (const attr of token[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
        // Real DOM attributes decode escaped query separators such as &amp;.
        const value = attr[2].replace(/&(amp|quot|lt|gt|#39);/g,
          (_, entity) => ({ amp: '&', quot: '"', lt: '<', gt: '>', '#39': "'" })[entity]);
        node.setAttribute(attr[1], value);
      }
      stack[stack.length - 1].appendChild(node);
      if (!voidTags.has(token[1]) && !token[0].endsWith('/>')) stack.push(node);
    }
  }
  const body = new Element('body');
  body.innerHTML = '<div id="app"><div id="book-pill"></div><button id="btn-settings"></button>' +
    '<div id="view"></div></div><nav id="tabbar"></nav>';
  const document = Object.assign(eventTarget(), {
    readyState: 'loading', hidden: false, body, title: '',
    createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector)
  });
  const window = Object.assign(eventTarget(), {
    location: { search, href: 'http://127.0.0.1:57321/' + search },
    __TEXTBOOKS__: { books: [{ key: 'g1a', words: ['cat'] }] },
    __WORDS__: { words: { cat: { explains: [{ cn: '猫' }] } } },
    __VISUALS__: {}, __PHONICS__: { groups: [] },
    __PET_IMGS__: Object.fromEntries([...SPRITES.keys()].map(key => [key, 'sprite:' + key])),
    matchMedia: () => ({ matches: false }), scrollTo() {}
  });
  function timer(kind, fn, ms) { const id = ++nextTimer; timers.set(id, { kind, fn, ms }); return id; }
  class FakeImage {
    constructor() { images.push(this); }
    set src(value) {
      this._src = value;
      const sprite = SPRITES.get(value.slice('sprite:'.length));
      assert(sprite, 'Renderer must request an existing sprite: ' + value);
      Object.assign(this, sprite);
    }
    get src() { return this._src; }
  }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  vm.runInNewContext(APP, {
    window, document, URL, URLSearchParams, Image: FakeImage, Date: Clock, console,
    localStorage: {
      getItem(key) { storageCalls.push(['get', key]); return storage.get(key) || null; },
      setItem(key, value) { storageCalls.push(['set', key]); storage.set(key, value); },
      removeItem(key) { storageCalls.push(['remove', key]); storage.delete(key); }
    },
    setTimeout: (fn, ms) => timer('timeout', fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timer('interval', fn, ms), clearInterval: id => timers.delete(id)
  }, { filename: 'src/app.js' });
  document.dispatch('DOMContentLoaded');
  images.forEach(image => image.onload());
  return {
    document, window, draws, timers, storage, storageCalls, originalStorage,
    query: selector => document.querySelector(selector),
    all: selector => document.querySelectorAll(selector),
    advance(ms) { now += ms; },
    flushSave() {
      for (const [id, entry] of [...timers]) if (entry.kind === 'timeout' && entry.ms === 200) {
        timers.delete(id); entry.fn();
      }
    }
  };
}

function previewChecks(species, legacy) {
  const spec = SPECIES[species];
  const h = harness('?pet-test=' + species + '&source=preview-test', { legacy });
  const click = selector => { const node = h.query(selector); assert(node); assert.equal(typeof node.onclick, 'function'); node.onclick(); };
  const action = name => h.all('[data-pet-test-expr]').find(node => node.dataset.petTestExpr === name).onclick();
  function expectFrames(suffix) {
    const rendered = h.draws.slice(-3);
    assert.equal(rendered.length, 3);
    assert.deepEqual(rendered.map(draw => draw.canvas.dataset.petTestStage), ['1', '2', '3']);
    assert.deepEqual(rendered.map(draw => draw.key), spec.stages.map(stage => `${species}-${stage}-v2-${suffix}`));
  }
  function onlyAnimation(ms) {
    assert.equal(h.timers.size, 1, 'Preview must not start save/learning/pet timers');
    const entry = [...h.timers.values()][0];
    assert.equal(entry.kind, 'interval'); assert.equal(entry.ms, ms);
    return entry;
  }
  assert.equal(h.storageCalls.length, 0, 'Preview must not even read or migrate a player save');
  assert.equal(h.all('[data-pet-test-stage]').length, 3);
  assert.equal(h.all('[data-pet-test-expr]').length, 11);
  assert.equal(h.document.title, spec.label + '动作预览 · 皮克学英语');
  assert.equal(h.query('h1').textContent, spec.label + '动作预览');
  assert.equal(h.query('.logo').textContent, spec.emoji);
  assert.deepEqual(h.all('.pet-test-card h2').map(node => node.textContent), spec.names);
  assert.deepEqual(h.all('[data-pet-test-stage]').map(node => node.getAttribute('aria-label')), spec.names);
  assert.equal(h.query('#btn-settings'), null);
  assert.equal(h.query('a').getAttribute('href'), '/?source=preview-test');
  const links = h.all('[data-pet-test-species]');
  assert.equal(links.length, 4, 'Every preview must link to all four species');
  assert.deepEqual(links.map(link => link.dataset.petTestSpecies).sort(), Object.keys(SPECIES).sort());
  assert.equal(links.filter(link => link.getAttribute('aria-current') === 'page').length, 1);
  for (const link of links) {
    const target = link.dataset.petTestSpecies;
    const destination = new URL(link.getAttribute('href'), h.window.location.href);
    assert.equal(destination.origin, 'http://127.0.0.1:57321');
    assert.equal(destination.pathname, '/');
    assert.equal(destination.searchParams.get('pet-test'), target);
    assert.equal(destination.searchParams.get('source'), 'preview-test', 'Species navigation must preserve other parameters');
    assert.equal(link.getAttribute('aria-current') === 'page', target === species);
    assert(link.textContent.includes(SPECIES[target].label));
  }
  expectFrames('idle-0'); onlyAnimation(800);
  action('walk'); expectFrames('walk-0'); onlyAnimation(110).fn(); expectFrames('walk-1');
  for (let frame = 2; frame <= 7; frame++) {
    onlyAnimation(110).fn(); expectFrames('walk-' + (frame % 7));
  }
  onlyAnimation(110).fn(); expectFrames('walk-1');
  click('#pet-test-toggle'); assert.equal(h.timers.size, 0);
  click('#pet-test-next'); expectFrames('walk-2'); assert.equal(h.timers.size, 0);
  click('#pet-test-prev'); expectFrames('walk-1');
  action('eat'); expectFrames('eat-0'); assert.equal(h.timers.size, 0, 'Changing action must preserve pause');
  click('#pet-test-prev'); expectFrames('eat-2');
  click('#pet-test-next'); expectFrames('eat-0');
  click('#pet-test-toggle'); onlyAnimation(280).fn(); expectFrames('eat-1');
  action('blink'); expectFrames('blink'); assert.equal(h.timers.size, 0);
  action('droopy'); expectFrames('droopy'); assert.equal(h.timers.size, 0);
  for (const [name, interval, count] of [['idle', 800, 2], ['happy', 180, 3], ['excited', 220, 3], ['sleep', 700, 2], ['sad', 380, 2], ['wash', 220, 2], ['grunt', 240, 2]]) {
    action(name); expectFrames(name + '-0');
    for (let frame = 1; frame <= count; frame++) {
      onlyAnimation(interval).fn(); expectFrames(name + '-' + (frame % count));
    }
  }
  h.document.hidden = true; h.document.dispatch('visibilitychange'); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.document.dispatch('visibilitychange'); onlyAnimation(240);
  h.window.dispatch('pagehide'); assert.equal(h.timers.size, 0);
  h.window.dispatch('pageshow'); onlyAnimation(240);
  h.flushSave();
  assert.equal(h.storageCalls.length, 0);
  assert.deepEqual([...h.storage], h.originalStorage, 'Species, XP, progress, and legacy saves stay untouched');
  console.log('PASS preview (' + species + ', ' + (legacy ? 'legacy save' : 'current save') + '): storage isolation, title/stages/navigation, 11 actions, actual sprite drawing, pause/step/lifecycle');
}

function normalChecks(search, legacy = false) {
  const h = harness(search, { legacy });
  assert(h.storageCalls.some(([op, key]) => op === 'get' && key === KEY));
  assert.equal(h.document.body.classList.contains('pet-test-mode'), false);
  assert.equal(h.all('[data-pet-test-stage]').length, 0);
  assert.equal(h.query('#tabbar').children.length, 5);
  assert.equal(typeof h.query('#btn-settings').onclick, 'function');
  assert.equal(typeof h.query('#btn-start').onclick, 'function');
  assert(h.query('#view').textContent.includes('存档里的小狗'));
  assert(h.draws.some(draw => draw.key === 'dog-baby-v2-idle-0'), 'Normal renderer must use the saved species');
  const interval = ms => [...h.timers.values()].find(entry => entry.kind === 'interval' && entry.ms === ms);
  assert(interval(60000), 'Normal pet decay timer must start');
  assert(interval(30000), 'Normal study timer must start');
  assert(interval(180), 'Normal pet animation timer must start');
  h.advance(30000); interval(30000).fn(); h.flushSave();
  const persisted = JSON.parse(h.storage.get(KEY));
  assert.equal(persisted.pet.species, 'dog'); assert.equal(persisted.pet.xp, 7);
  assert.equal(persisted.streak, 4, 'Normal daily check-in must still run');
  assert.equal(persisted.days['2026-09-17'].ms, 31200, 'Normal study time must still be saved');
  assert.equal(persisted.words.cat.right, 1);
  if (legacy) {
    assert(h.storageCalls.some(([op, key]) => op === 'get' && key === OLD_KEY));
    assert.equal(h.storage.has(OLD_KEY), false, 'Normal legacy migration must still run');
  }
  h.query('#tabbar').children[4].onclick();
  assert(h.query('#view').textContent.includes('最近 28 天'), 'Normal tab navigation must still work');
  console.log('PASS normal (' + (search || '/') + (legacy ? ', legacy save' : '') + '): saved pet, home/tabs, check-in, learning/pet timers, persistence');
}

for (const species of Object.keys(SPECIES)) {
  previewChecks(species, false);
  previewChecks(species, true);
}
normalChecks('');
normalChecks('?pet-test=unknown');
normalChecks('', true);

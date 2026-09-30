#!/usr/bin/env node
/**
 * Apply emoji to the L3 vocabulary.
 *
 * Only concrete, picturable words get one. A word like "quickly" or "because"
 * has no honest picture, and an emoji that merely rhymes with the meaning is
 * worse than none: a picture question is supposed to test the word, not the
 * child's ability to guess what the teacher meant by a jellyfish.
 *
 * Words left without an emoji are excluded from en2pic / pic2en at runtime
 * (see hasVisual() in app.js) and still get en2cn / cn2en / listen2en.
 *
 * Run: node scripts/apply-emoji-l3.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VISUALS = path.join(ROOT, 'data', 'visuals.json');

/* Concrete nouns and a few adjectives/verbs a child can actually picture.
   A word absent from this table is left alone on purpose. */
const EMOJI = {
  // animals
  animal: '🐾', pet: '🐕', dog: '🐶', cat: '🐱', bird: '🐦', fish: '🐟',
  horse: '🐴', rabbit: '🐰', mouse: '🐭', monkey: '🐵', elephant: '🐘',
  tiger: '🐯', lion: '🦁', bear: '🐻', duck: '🦆', pig: '🐷', cow: '🐄',
  sheep: '🐑', snake: '🐍', frog: '🐸', bee: '🐝', butterfly: '🦋',
  spider: '🕷️', wolf: '🐺', fox: '🦊', giraffe: '🦒', zebra: '🦓',
  // food
  food: '🍽️', fruit: '🍎', apple: '🍎', banana: '🍌', orange: '🍊',
  grape: '🍇', pear: '🍐', peach: '🍑', lemon: '🍋', watermelon: '🍉',
  strawberry: '🍓', bread: '🍞', cake: '🍰', egg: '🥚', milk: '🥛',
  rice: '🍚', soup: '🍲', meat: '🍖', coffee: '☕', tea: '🍵',
  sugar: '🍬', ice: '🧊', candy: '🍭', hamburger: '🍔', sandwich: '🥪',
  pizza: '🍕', juice: '🧃', water: '💧', cheese: '🧀', corn: '🌽',
  carrot: '🥕', potato: '🥔', tomato: '🍅', breakfast: '🥞', lunch: '🍱',
  dinner: '🍽️', snack: '🍿', chocolate: '🍫', biscuit: '🍪', wine: '🍷',
  // body
  head: '🧠', face: '😊', eye: '👁️', ear: '👂', nose: '👃', mouth: '👄',
  tooth: '🦷', hair: '💇', hand: '✋', arm: '💪', leg: '🦵', foot: '🦶',
  finger: '👆', heart: '❤️', bone: '🦴', knee: '🦵', back: '🔙',
  // clothes
  clothes: '👕', shirt: '👕', coat: '🧥', dress: '👗', sock: '🧦',
  shoe: '👟', boot: '🥾', hat: '🧢', glove: '🧤', scarf: '🧣',
  belt: '👖', skirt: '👗', glasses: '👓', ring: '💍', umbrella: '☂️',
  // places
  house: '🏠', home: '🏠', room: '🚪', bed: '🛏️', kitchen: '🍳',
  bathroom: '🛁', door: '🚪', window: '🪟', wall: '🧱', garden: '🌷',
  park: '🌳', zoo: '🦁', farm: '🚜', shop: '🏪', market: '🛒',
  school: '🏫', hospital: '🏥', hotel: '🏨', library: '📚', museum: '🏛️',
  restaurant: '🍴', station: '🚉', airport: '✈️', city: '🏙️',
  village: '🏡', street: '🛣️', road: '🛣️', bridge: '🌉',
  playground: '🛝', cinema: '🎬', bank: '🏦', shop2: '🏪',
  // transport
  car: '🚗', bus: '🚌', bike: '🚲', train: '🚆', plane: '✈️',
  boat: '⛵', ship: '🚢', taxi: '🚕', truck: '🚚', subway: '🚇',
  // nature / weather
  sun: '☀️', rain: '🌧️', snow: '❄️', wind: '🌬️', cloud: '☁️',
  star: '⭐', moon: '🌙', tree: '🌳', flower: '🌸', grass: '🌿',
  leaf: '🍃', stone: '🪨', sand: '🏖️', mountain: '⛰️', sea: '🌊',
  beach: '🏖️', forest: '🌲', fire: '🔥', island: '🏝️', field: '🌾',
  // objects
  book: '📖', pen: '🖊️', pencil: '✏️', ruler: '📏', bag: '🎒',
  box: '📦', clock: '🕐', watch: '⌚', phone: '📱', computer: '💻',
  key: '🔑', chair: '🪑', table: '🪑', lamp: '💡', television: '📺',
  radio: '📻', camera: '📷', guitar: '🎸', piano: '🎹', drum: '🥁',
  ball: '⚽', toy: '🧸', balloon: '🎈', kite: '🪁', cup: '☕',
  glass: '🥛', plate: '🍽️', spoon: '🥄', fork: '🍴', knife: '🔪',
  bowl: '🥣', basket: '🧺', card: '🃏', letter: '✉️', paper: '📄',
  map: '🗺️', photo: '📷', painting: '🖼️', mirror: '🪞', towel: '🧻',
  soap: '🧼', comb: '💈', scissors: '✂️', needle: '📌', coin: '🪙',
  money: '💰', ticket: '🎫', medicine: '💊', battery: '🔋', boat2: '⛵',
  phone2: '📱', flag: '🚩', present: '🎁', toy2: '🧸', bottle: '🍶',
  // sports
  football: '⚽', basketball: '🏀', tennis: '🎾', swimming: '🏊',
  running: '🏃', cycling: '🚴', skating: '⛸️', ski: '⛷️',
  // school
  schoolbag: '🎒', eraser: '🧽', crayon: '🖍️', glue: '🧴', paperclip: '📎',
  // a second pass: the KET list has plenty more concrete nouns than round one
  dessert: '🍰', biscuit: '🍪', chocolate: '🍫', pizza: '🍕', salad: '🥗',
  dumpling: '🥟', bacon: '🥓', armchair: '🪑', sofa: '🛋️', shelf: '🗄️',
  doll: '🪆', robot: '🤖', wolf: '🐺', fox: '🦊', deer: '🦌',
  camel: '🐫', donkey: '🫏', goat: '🐐', giraffe: '🦒', zebra: '🦓',
  kangaroo: '🦘', penguin: '🐧', owl: '🦉', crab: '🦀', dolphin: '🐬',
  whale: '🐳', shark: '🦈', octopus: '🐙', turtle: '🐢', planet: '🪐',
  volcano: '🌋', desert: '🏜️', cave: '🕳️', snowman: '⛄', icicle: '🧊',
  puddle: '💧', lighthouse: '🗼', flag: '🚩', postcard: '💌', stamp: '📮',
  envelope: '✉️', calendar: '📆', 'birthday-party': '🎉', present: '🎁',
  party: '🎉', chess: '♟️', swing: '🎠', fairground: '🎡', circus: '🎪',
  ambulance: '🚑', supermarket: '🛒', bakery: '🥖', cafe: '☕', campsite: '⛺',
  toilet: '🚽', balcony: '🪟', valley: '🏞️', island: '🏝️', space: '🌌',
  hairdresser: '💈', toothbrush: '🪥', uniform: '👔', sock: '🧦',
  window: '🪟', garage: '🏠', roof: '🏠', fence: '🪵', gate: '🚪',
  platform: '🛤️', motorway: '🛣️', crossing: '🚸', roundabout: '🌀',
  'bus-stop': '🚏', 'post-office': '📮', greengrocer: '🥬', 'living-room': '🛋️',
  'dining-room': '🍽️', bedroom: '🛏️', kitchen: '🍳', rainbow: '🌈',
  sunshine: '☀️', windmill: '🌬️', fire_engine: '🚒', ladder: '🪜',
  basket: '🧺', bucket: '🪣', blanket: '🛏️', pillow: '🛏️', curtain: '🪟',
  stair: '🪜', roof: '🏠', chimney: '🏠', mushroom: '🍄', leaf: '🍂',
  branch: '🌿', bush: '🌳', forest: '🌲', hill: '⛰️', cliff: '🧱',
  wave: '🌊', shell: '🐚', fossil: '🦴', bone: '🦴', feather: '🪶',
  horse: '🐴', pony: '🐴', bull: '🐂', lamb: '🐑', piglet: '🐷',
  // time
  clock: '🕐', watch: '⌚', diary: '📔', album: '📔', photo: '📷',
  // time / seasons
  monday: '📅', birthday: '🎂', holiday: '🏖️', morning: '🌅', night: '🌙',
  weekend: '📅', summer: '☀️', winter: '⛄', spring: '🌷', autumn: '🍂',
  // a few very common adjectives/verbs a child can picture
  hot: '🔥', cold: '🧊', happy: '😊', sad: '😢', big: '🐘',
  small: '🐜', long: '📏', short: '📐', tall: '🦒', fat: '🐷',
  clean: '🧼', dirty: '🪣', hungry: '🍽️', thirsty: '💧', sleepy: '😴',
  new: '🆕', old: '📜', fast: '⚡', slow: '🐌', loud: '🔊', quiet: '🤫',
  strong: '💪', young: '🧒', funny: '😂', nice: '💖', great: '🌟',
  different: '🔀', same: '🟰', open: '📂', closed: '🔒',
};

const visuals = JSON.parse(fs.readFileSync(VISUALS, 'utf8'));
/* The KET vocabulary is one list split across three CEFR files. Read all three
   rather than the undivided l3-words.txt that v7 retired — reading a deleted
   file would throw, and reading only one of the three would quietly skip two
   thirds of the words this script exists to cover. */
const L3_FILES = ['l3a-words.txt', 'l3b-words.txt', 'l3c-words.txt'].map((f) =>
  path.join(ROOT, 'data', f)
);
const missing = L3_FILES.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error(
    `缺少词表文件：\n  ${missing.join('\n  ')}\n` +
      '用 node scripts/split-l3-bands.js 重新生成，或 git checkout data/l3-words.txt 后重跑。'
  );
  process.exit(1);
}
const l3 = L3_FILES.flatMap((p) =>
  fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
);

let added = 0;
const noEmoji = [];
for (const w of l3) {
  if (visuals[w]) continue; // never overwrite a curated entry
  if (EMOJI[w]) {
    visuals[w] = { emoji: EMOJI[w] };
    added++;
  } else noEmoji.push(w);
}

fs.writeFileSync(VISUALS, JSON.stringify(visuals, null, 1));
process.stdout.write(`L3 ${l3.length} 词：新增 emoji ${added} 个，无图 ${noEmoji.length} 个\n`);
process.stdout.write(`visuals.json 现有 ${Object.keys(visuals).filter((k) => k !== '_comment').length} 条\n`);
if (process.argv.includes('--list-missing')) {
  fs.writeFileSync('/tmp/l3-no-emoji.txt', noEmoji.join('\n'));
  process.stdout.write('无图词表: /tmp/l3-no-emoji.txt\n');
}

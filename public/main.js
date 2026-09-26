// Оболочка игры: меню, раунд на две минуты, управление джойстиком и клавишами, итог.
import { generateCity, TYPES } from './game/city.js';
import { initPhysics, createWorld, stepWorld, drainEvents, disposeWorld, STEP } from './game/world.js';
import { fits, starsFor } from './game/growth.js';
import { createView } from './render/view.js';
import { sfx, unlockAudio, setMuted, isMuted } from './sfx.js';
import { createBot, botInput } from './game/bot.js';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'black-hole-best';
const ROUND = 120;
const STICK_RANGE = 50; // px: отклонение для полной скорости

// Что открывается по мере роста — показываем тост, когда начинает пролезать
const UNLOCKS = [
  ['car', 'Машины!'],
  ['kiosk', 'Киоски!'],
  ['bus', 'Автобусы!'],
  ['house', 'Дома!'],
  ['shop', 'Магазины!'],
  ['apartment', 'Многоэтажки!'],
  ['tower', 'Небоскрёбы!'],
];

const view = createView($('scene'));
// ?bot — автопилот в игре (для проверки); в меню бот всегда катает дыру по городу на фоне
const AUTOPILOT = new URLSearchParams(location.search).has('bot');
const game = { mode: 'loading', world: null, acc: 0, unlocked: new Set(), lastTick: 0, bot: createBot() };
window.blackHole = { game, view }; // для отладки из консоли

// ---------- управление ----------

const input = { x: 0, z: 0 };
const keys = new Set();
let stick = null; // { id, x0, y0, x, y }

const canvas = $('scene');
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (game.mode !== 'play') return;
  stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  const s = $('stick');
  s.style.left = `${e.clientX}px`;
  s.style.top = `${e.clientY}px`;
  s.classList.remove('hidden');
  moveKnob();
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick.x = e.clientX;
  stick.y = e.clientY;
  moveKnob();
});
const release = (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick = null;
  $('stick').classList.add('hidden');
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

function moveKnob() {
  const dx = stick.x - stick.x0;
  const dy = stick.y - stick.y0;
  const d = Math.hypot(dx, dy);
  const k = d > STICK_RANGE ? STICK_RANGE / d : 1;
  $('knob').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' && game.mode !== 'play') start();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function readInput() {
  if (AUTOPILOT) {
    Object.assign(input, botInput(game.bot, game.world));
    return;
  }
  let x = 0;
  let z = 0;
  if (stick) {
    const dx = stick.x - stick.x0;
    const dy = stick.y - stick.y0;
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      const k = Math.min(1, d / STICK_RANGE) / d;
      // камера смотрит вдоль −z: вверх по экрану — от игрока
      x = dx * k;
      z = dy * k;
    }
  }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  input.x = x;
  input.z = z;
}

// ---------- экраны ----------

function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? null;
  } catch {
    return null;
  }
}

function saveBest(score, pct) {
  const best = loadBest();
  if (best && best.score >= score) return false;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ score, pct }));
  } catch {
    // без localStorage рекорд просто не сохранится
  }
  return true;
}

function openMenu() {
  game.mode = 'menu';
  const best = loadBest();
  $('best').textContent = best ? `Рекорд: ${best.score} очков, ${Math.round(best.pct * 100)} % города` : '';
  show('menu', true);
  show('hud', false);
  show('result', false);
}

function newWorld(seed) {
  if (game.world) disposeWorld(game.world);
  game.world = createWorld(generateCity({ seed }), { duration: ROUND });
  game.bot = createBot();
  view.build(game.world);
}

function start() {
  unlockAudio();
  newWorld((Math.random() * 1e9) | 0);
  game.mode = 'play';
  game.acc = 0;
  game.unlocked = new Set(UNLOCKS.filter(([t]) => fits(TYPES[t].size, game.world.hole.r)).map(([t]) => t));
  show('menu', false);
  show('result', false);
  show('hud', true);
  updateHud();
}

function finish() {
  game.mode = 'result';
  stick = null;
  $('stick').classList.add('hidden');
  const w = game.world;
  const pct = w.eatenValue / w.city.totalValue;
  const stars = starsFor(pct);
  const record = saveBest(w.score, pct);
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
  $('result-title').textContent = record ? 'Новый рекорд!' : stars === 3 ? 'Город съеден!' : stars ? 'Неплохой аппетит' : 'Маловато';
  $('result-stats').innerHTML = `
    <li><span>Очки</span><b>${w.score}</b></li>
    <li><span>Съедено города</span><b>${Math.round(pct * 100)} %</b></li>
    <li><span>Предметов</span><b>${w.eatenCount}</b></li>
    <li><span>Диаметр дыры</span><b>${(w.hole.r * 2).toFixed(1)} м</b></li>`;
  show('result', true);
  sfx.end(stars);
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
}

function updateHud() {
  const w = game.world;
  const left = Math.max(0, Math.ceil(ROUND - w.t));
  $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('hurry', left <= 10);
  $('score').textContent = w.score;
  const pct = w.eatenValue / w.city.totalValue;
  $('pct').textContent = `${Math.round(pct * 100)} %`;
  $('progress-fill').style.width = `${Math.min(100, (pct / 0.6) * 100)}%`;
}

$('btn-play').onclick = start;
$('btn-again').onclick = start;
$('btn-sound').onclick = () => {
  setMuted(!isMuted());
  $('btn-sound').textContent = isMuted() ? '🔇' : '🔊';
};
window.addEventListener('resize', view.resize);

// ---------- цикл ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.mode === 'play') {
    readInput();
    game.acc += dt;
    let steps = 0;
    while (game.acc >= STEP && steps < 4) {
      stepWorld(game.world, input);
      game.acc -= STEP;
      steps++;
    }
    if (steps === 4) game.acc = 0;
    handleEvents(drainEvents(game.world));
    const left = ROUND - game.world.t;
    if (left <= 10 && Math.ceil(left) !== game.lastTick) {
      game.lastTick = Math.ceil(left);
      sfx.tick();
    }
    updateHud();
    if (left <= 0) finish();
  } else if (game.mode === 'menu' && game.world) {
    // в меню дыра сама ест город на фоне, неспешно
    const auto = botInput(game.bot, game.world);
    stepWorld(game.world, { x: auto.x * 0.5, z: auto.z * 0.5 });
    drainEvents(game.world);
  }
  if (game.world) view.render(dt, game.mode === 'play' ? game.acc / STEP : 1, now / 1000);
  requestAnimationFrame(frame);
}

function handleEvents(events) {
  const w = game.world;
  for (const e of events) {
    if (e.type !== 'eat') continue;
    const big = Math.max(e.size[0], e.size[1], e.size[2]);
    sfx.gulp(big);
    if (big > 4) view.puff(w.hole.x, w.hole.z, w.hole.r, Math.min(18, Math.round(big)));
    // встряхивают только дома и крупнее, мягко
    if (big > 8) view.shake = Math.max(view.shake, Math.min(0.8, big / 30));
  }
  for (const [type, text] of UNLOCKS) {
    if (!game.unlocked.has(type) && fits(TYPES[type].size, w.hole.r)) {
      game.unlocked.add(type);
      toast(text);
      sfx.unlock();
    }
  }
}

// ---------- старт ----------

view.resize();
try {
  await initPhysics();
  newWorld(7);
  show('loading', false);
  openMenu();
  requestAnimationFrame(frame);
} catch (err) {
  $('loading').querySelector('p').textContent = `Не удалось запустить игру: ${err.message}`;
  throw err;
}

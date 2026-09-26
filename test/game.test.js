import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, TYPES, ROAD } from '../public/game/city.js';
import { radiusFor, fits, R0, MAX_R, starsFor } from '../public/game/growth.js';
import { initPhysics, createWorld, stepWorld, STEP, disposeWorld, objectPose } from '../public/game/world.js';
import { createBot, botInput } from '../public/game/bot.js';

before(() => initPhysics());

test('город детерминирован по сиду', () => {
  const a = generateCity({ seed: 5 });
  const b = generateCity({ seed: 5 });
  const c = generateCity({ seed: 6 });
  assert.deepEqual(a.objects.map((o) => o.pos), b.objects.map((o) => o.pos));
  assert.notDeepEqual(a.objects.map((o) => o.pos), c.objects.map((o) => o.pos));
});

test('в городе есть всё: от людей до небоскрёбов, и всё внутри границ', () => {
  for (const seed of [1, 2, 3, 4]) {
    const city = generateCity({ seed });
    const types = new Set(city.objects.map((o) => o.type));
    for (const t of ['person', 'car', 'tree', 'house', 'apartment']) assert.ok(types.has(t), `seed ${seed}: нет ${t}`);
    for (const o of city.objects) {
      assert.ok(Math.abs(o.pos[0]) <= city.half && Math.abs(o.pos[2]) <= city.half, `${o.type} за границей`);
    }
  }
});

test('здания не стоят на проезжей части', () => {
  const city = generateCity({ seed: 3 });
  const onRoad = (x) => city.roads.some((r) => Math.abs(x - r) < ROAD / 2);
  for (const o of city.objects.filter((x) => ['house', 'shop', 'apartment', 'tower', 'kiosk'].includes(x.type))) {
    const hx = o.size[0] / 2;
    const hz = o.size[2] / 2;
    assert.ok(!onRoad(o.pos[0] - hx) && !onRoad(o.pos[0] + hx), `${o.type} на дороге по x`);
    assert.ok(!onRoad(o.pos[2] - hz) && !onRoad(o.pos[2] + hz), `${o.type} на дороге по z`);
  }
});

test('рост: радиус растёт с площадью и упирается в максимум', () => {
  assert.equal(radiusFor(0), R0);
  assert.ok(radiusFor(100) > radiusFor(10));
  assert.equal(radiusFor(1e9), MAX_R);
});

test('пролезает: сначала мелочь, потом машины, дома, небоскрёбы', () => {
  assert.ok(fits(TYPES.person.size, R0));
  assert.ok(!fits(TYPES.car.size, R0));
  assert.ok(!fits(TYPES.house.size, 2));
  const order = ['person', 'car', 'house', 'apartment', 'tower'];
  const need = order.map((t) => {
    let r = R0;
    while (!fits(TYPES[t].size, r)) r += 0.05;
    return r;
  });
  for (let i = 1; i < need.length; i++) assert.ok(need[i] > need[i - 1], `${order[i]} пролезает раньше ${order[i - 1]}`);
  assert.ok(need.at(-1) < MAX_R, 'небоскрёб достижим');
});

test('звёзды за долю города', () => {
  assert.equal(starsFor(0.1), 0);
  assert.equal(starsFor(0.25), 1);
  assert.equal(starsFor(0.45), 2);
  assert.equal(starsFor(0.7), 3);
});

function worldWith(objects) {
  const city = { half: 60, roads: [], lots: [], objects, totalValue: objects.reduce((s, o) => s + o.value, 0) };
  return createWorld(city);
}
const obj = (id, type, x, z) => ({ id, type, pos: [x, 0, z], rot: 0, size: TYPES[type].size, value: TYPES[type].value, agent: null });

test('урна под дырой проваливается и засчитывается', () => {
  const w = worldWith([obj(0, 'bin', 0, 0)]);
  for (let i = 0; i < 120; i++) stepWorld(w, { x: 0, z: 0 });
  assert.equal(w.objects[0].state, 'eaten');
  assert.equal(w.score, TYPES.bin.value);
  assert.ok(w.hole.target > R0);
  disposeWorld(w);
});

test('дом не пролезает в маленькую дыру и остаётся стоять', () => {
  const w = worldWith([obj(0, 'house', 0, 0)]);
  for (let i = 0; i < 120; i++) stepWorld(w, { x: 0, z: 0 });
  const o = w.objects[0];
  assert.notEqual(o.state, 'eaten');
  assert.ok(objectPose(o).pos.y > 2, 'дом на земле');
  disposeWorld(w);
});

test('рядом с дырой пролезающее затягивает внутрь', () => {
  const w = worldWith([obj(0, 'cone', 1.35, 0)]);
  for (let i = 0; i < 180; i++) stepWorld(w, { x: 0, z: 0 });
  assert.equal(w.objects[0].state, 'eaten');
  disposeWorld(w);
});

test('далёкие предметы не получают тел', () => {
  const w = worldWith([obj(0, 'bin', 30, 30), obj(1, 'bin', -30, 20)]);
  for (let i = 0; i < 30; i++) stepWorld(w, { x: 0, z: 0 });
  assert.equal(w.active.size, 0);
  disposeWorld(w);
});

test('раунд ботом: за две минуты дыра дорастает до домов и съедает заметную часть города', () => {
  const w = createWorld(generateCity({ seed: 1 }));
  const bot = createBot();
  for (let i = 0; i < 120 / STEP; i++) stepWorld(w, botInput(bot, w));
  const pct = w.eatenValue / w.city.totalValue;
  assert.ok(fits(TYPES.apartment.size, w.hole.r), `радиус ${w.hole.r}`);
  assert.ok(pct > 0.2, `съедено ${pct}`);
  disposeWorld(w);
});

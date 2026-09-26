// Процедурный город: сетка кварталов, между ними дороги с тротуарами.
// Кварталы бывают жилые, деловые, торговые, парки и парковки. По дорогам едут машины и автобусы,
// по тротуарам ходят люди, вдоль улиц стоят фонари, урны и гидранты.
// Координаты в метрах, y вверх, pos — центр основания предмета (y = 0 — на земле).
import { mulberry32, range, pick } from './rng.js';

// size — [ширина по x, высота, длина по z] до поворота; value — очки
export const TYPES = {
  person: { size: [0.5, 1.7, 0.5], value: 1 },
  cone: { size: [0.45, 0.7, 0.45], value: 1 },
  hydrant: { size: [0.45, 0.9, 0.45], value: 2 },
  bin: { size: [0.7, 1.1, 0.7], value: 2 },
  bench: { size: [1.8, 0.9, 0.7], value: 3 },
  lamp: { size: [0.3, 5, 0.3], value: 3 },
  tree: { size: [1.4, 5.5, 1.4], value: 5 },
  car: { size: [1.9, 1.5, 4.3], value: 10 },
  kiosk: { size: [3, 3, 3], value: 15 },
  bus: { size: [2.6, 3.2, 10], value: 30 },
  house: { size: [6, 5, 6], value: 40 },
  shop: { size: [9, 6, 8], value: 70 },
  apartment: { size: [11, 16, 11], value: 150 },
  tower: { size: [13, 34, 13], value: 400 },
};

export const BLOCK = 30; // сторона квартала
export const ROAD = 12; // ширина улицы вместе с тротуарами
export const PITCH = BLOCK + ROAD;
const LANE = 2; // полоса от оси дороги
const WALK = 4.8; // тротуар от оси дороги

const CAR_COLORS = ['#d9453b', '#2f6fd6', '#f2c230', '#e8e8e8', '#2b2b2b', '#3aa36b', '#ff8a3d'];
const BUILDING_COLORS = ['#e3dccf', '#d98f7a', '#9fb6c9', '#d9c29a', '#c7b6d8', '#a7c7a2', '#e6b9a1'];
const PEOPLE_COLORS = ['#e25c4f', '#4f7fe2', '#f0c24b', '#57b36b', '#b05ad6', '#f08a3d', '#3fb8c4', '#eeeeee'];

export function generateCity({ seed = 1, blocks = 6 } = {}) {
  const rng = mulberry32(seed);
  const half = (blocks * PITCH) / 2;
  const objects = [];
  const add = (type, x, z, rot = 0, extra = {}) => {
    const t = TYPES[type];
    const size = extra.size ?? t.size;
    objects.push({
      id: objects.length,
      type,
      pos: [x, 0, z],
      rot,
      size,
      value: extra.value ?? t.value,
      color: extra.color ?? null,
      agent: extra.agent ?? null,
    });
  };

  // оси дорог: x = roadX[i], z = roadX[j]
  const roads = [];
  for (let i = 0; i <= blocks; i++) roads.push(-half + i * PITCH);

  // --- кварталы ---
  const lots = [];
  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      const cx = roads[i] + PITCH / 2;
      const cz = roads[j] + PITCH / 2;
      const center = Math.hypot(cx, cz) / half; // 0 в центре, ~1.4 в углу
      const roll = rng();
      let kind;
      if (center < 0.45) kind = roll < 0.7 ? 'downtown' : 'shops';
      else if (center < 0.9) kind = roll < 0.35 ? 'shops' : roll < 0.6 ? 'residential' : roll < 0.8 ? 'park' : 'parking';
      else kind = roll < 0.55 ? 'residential' : roll < 0.8 ? 'park' : 'parking';
      lots.push({ cx, cz, kind });
      fillBlock(kind, cx, cz, rng, add);
    }
  }

  // --- улицы: фонари, урны, гидранты, конусы, люди, машины ---
  const span = [roads[0], roads[blocks]];
  for (const axis of ['x', 'z']) {
    for (const r of roads) {
      // вдоль улицы: координата s идёт по длине, r — положение оси
      const put = (type, s, off, rot, extra) => {
        // с внешней стороны крайних улиц уже не город
        if (Math.abs(r + off) > half) return;
        if (axis === 'x') add(type, s, r + off, rot, extra);
        else add(type, r + off, s, rot, extra);
      };
      for (let s = span[0] + 6; s < span[1] - 6; s += 12) {
        if (nearCrossing(s, roads)) continue;
        for (const side of [-1, 1]) {
          if (rng() < 0.6) put('lamp', s, side * (WALK + 1), 0);
          const prop = rng();
          if (prop < 0.25) put('bin', s + 3, side * (WALK + 1), 0);
          else if (prop < 0.4) put('hydrant', s + 3, side * (WALK + 1), 0);
          else if (prop < 0.5) put('cone', s + 2, side * (LANE + 1.5), 0);
        }
      }
      // люди идут по тротуарам
      for (let s = span[0]; s < span[1]; s += range(rng, 5, 11)) {
        const side = rng() < 0.5 ? -1 : 1;
        const dir = rng() < 0.5 ? -1 : 1;
        put('person', s, side * (WALK + range(rng, -0.6, 0.6)), 0, {
          color: pick(rng, PEOPLE_COLORS),
          agent: { axis, dir, speed: range(rng, 1.1, 1.7), lineOffset: r + side * WALK },
        });
      }
      // машины: правостороннее движение, полоса зависит от направления
      for (let s = span[0] + range(rng, 0, 20); s < span[1]; s += range(rng, 22, 40)) {
        const dir = rng() < 0.5 ? -1 : 1;
        const bus = rng() < 0.12;
        const off = dir * LANE * (axis === 'x' ? 1 : -1);
        const rot = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
        put(bus ? 'bus' : 'car', s, off, rot, {
          color: bus ? '#f2a93b' : pick(rng, CAR_COLORS),
          agent: { axis, dir, speed: bus ? 6 : range(rng, 7, 11), lineOffset: r + off },
        });
      }
    }
  }

  return { seed, blocks, half, roads, lots, objects, totalValue: objects.reduce((s, o) => s + o.value, 0) };
}

function nearCrossing(s, roads) {
  return roads.some((r) => Math.abs(s - r) < ROAD / 2 + 1);
}

function building(type, rng, heightRange) {
  const t = TYPES[type];
  const h = heightRange ? range(rng, ...heightRange) : t.size[1];
  // крупные дома стоят больше, если выше
  return { size: [t.size[0], h, t.size[2]], value: Math.round(t.value * (h / t.size[1])), color: pick(rng, BUILDING_COLORS) };
}

function fillBlock(kind, cx, cz, rng, add) {
  const q = BLOCK / 4; // четверть квартала
  if (kind === 'downtown') {
    if (rng() < 0.5) {
      add('tower', cx, cz, 0, building('tower', rng, [24, 40]));
      for (const [dx, dz] of [[-1, -1], [1, 1]]) add('kiosk', cx + dx * 11, cz + dz * 11, 0, { color: pick(rng, BUILDING_COLORS) });
    } else {
      add('apartment', cx - 7, cz - 7, 0, building('apartment', rng, [12, 22]));
      add('apartment', cx + 7, cz + 7, 0, building('apartment', rng, [12, 22]));
      add('shop', cx + 7.5, cz - 8, 0, building('shop', rng, [5, 7]));
      add('tree', cx - 9, cz + 9);
      add('bench', cx - 5, cz + 10, 0);
    }
  } else if (kind === 'shops') {
    add('shop', cx - 7, cz - 7, 0, building('shop', rng, [5, 8]));
    add('shop', cx + 7, cz - 7, 0, building('shop', rng, [5, 8]));
    add('apartment', cx, cz + 7, 0, building('apartment', rng, [10, 16]));
    add('kiosk', cx - 11, cz + 11, 0, { color: pick(rng, BUILDING_COLORS) });
  } else if (kind === 'residential') {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      add('house', cx + dx * q * 1.4, cz + dz * q * 1.4, Math.floor(rng() * 4) * (Math.PI / 2), building('house', rng, [4, 7]));
      if (rng() < 0.7) add('tree', cx + dx * q * 0.4 + range(rng, -1, 1), cz + dz * q * 0.4 + range(rng, -1, 1));
    }
    if (rng() < 0.5) add('car', cx + range(rng, -3, 3), cz, Math.PI / 2, { color: pick(rng, CAR_COLORS) });
  } else if (kind === 'park') {
    for (let k = 0; k < 14; k++) add('tree', cx + range(rng, -13, 13), cz + range(rng, -13, 13));
    for (let k = 0; k < 5; k++) add('bench', cx + range(rng, -10, 10), cz + range(rng, -10, 10), Math.floor(rng() * 4) * (Math.PI / 2));
    for (let k = 0; k < 4; k++) add('lamp', cx + range(rng, -11, 11), cz + range(rng, -11, 11));
    for (let k = 0; k < 3; k++) add('bin', cx + range(rng, -11, 11), cz + range(rng, -11, 11));
    add('kiosk', cx, cz, 0, { color: pick(rng, BUILDING_COLORS) });
    for (let k = 0; k < 8; k++) add('person', cx + range(rng, -12, 12), cz + range(rng, -12, 12), 0, { color: pick(rng, PEOPLE_COLORS) });
  } else if (kind === 'parking') {
    for (let row = -1; row <= 1; row++) {
      for (let k = -4; k <= 4; k++) {
        if (rng() < 0.7) add('car', cx + k * 3, cz + row * 8, rng() < 0.5 ? 0 : Math.PI, { color: pick(rng, CAR_COLORS) });
      }
    }
    for (let k = 0; k < 6; k++) add('cone', cx + range(rng, -13, 13), cz + range(rng, -13, 13));
  }
}

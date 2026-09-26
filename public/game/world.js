// Мир: дыра, агенты и физика Rapier вокруг дыры. Без three.js, чтобы гонять в тестах под Node.
//
// Тысяча предметов города физикой не считается: у каждого только поза. Тело Rapier получают
// лишь предметы рядом с дырой. Предмет, который пролезает и стоит центром над дырой, перестаёт
// касаться земли (хук filterContactPair) и падает в неё; рядом с дырой пролезающее затягивает внутрь.
// Упавшее ниже дна считается съеденным: дыра растёт. Отъехали — тело убирается, поза остаётся.
import RAPIER from '../vendor/rapier.js';
import { radiusFor, fits, footprint, holeSpeed } from './growth.js';
import { clamp } from './rng.js';

export const STEP = 1 / 60;
const DENSITY = 300; // лёгкие предметы веселее кувыркаются
const ACTIVATE_MARGIN = 2; // м сверх радиусов дыры и предмета, когда предмет получает тело
const DEACTIVATE_MARGIN = 7;
const EAT_DEPTH = 4; // м под землёй, где предмет считается съеденным
const PANIC_DIST = 9; // люди разбегаются, если дыра ближе
const MAX_BODIES = 160;
const FRICTION = 0.7;
const PULL_ZONE = 1.5; // во сколько радиусов дыры тянет
const PULL = 20; // м/с² у самого края зоны притяжения — ноль, у дыры — до этого значения

let ready = null;
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

export function createWorld(city, { duration = 120 } = {}) {
  const world = new RAPIER.World({ x: 0, y: -14, z: 0 });
  world.timestep = STEP;
  const ground = world.createCollider(
    RAPIER.ColliderDesc.cuboid(city.half + 40, 1, city.half + 40)
      .setTranslation(0, -1, 0)
      .setFriction(0.8)
      .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
  );

  const objects = city.objects.map((o) => ({
    ...o,
    pos: [...o.pos],
    quat: yawQuat(o.rot),
    agent: o.agent ? { ...o.agent } : null,
    state: 'idle', // idle | active | eaten
    body: null,
    collider: null,
    falling: false,
    reach: Math.hypot(o.size[0], o.size[2]) / 2,
  }));
  const byCollider = new Map();

  const w = {
    world,
    city,
    ground,
    objects,
    byCollider,
    // px, pz — положение до последнего шага: вид рисует дыру между ними
    hole: { x: 0, z: 0, px: 0, pz: 0, r: radiusFor(0), target: radiusFor(0), eatenArea: 0 },
    score: 0,
    eatenValue: 0,
    eatenCount: 0,
    t: 0,
    duration,
    events: [],
    active: new Set(),
    queue: new RAPIER.EventQueue(true),
  };

  w.hooks = {
    filterContactPair(c1, c2) {
      const other = c1 === ground.handle ? c2 : c2 === ground.handle ? c1 : null;
      if (other === null) return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      const o = byCollider.get(other);
      return o?.falling ? RAPIER.SolverFlags.EMPTY : RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair() {
      return true;
    },
  };
  return w;
}

function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// input: { x, z } — направление движения дыры, длина 0..1
export function stepWorld(w, input) {
  const { hole } = w;
  w.t += STEP;

  // дыра: движение и плавный рост к целевому радиусу
  hole.px = hole.x;
  hole.pz = hole.z;
  const speed = holeSpeed(hole.r);
  const lim = w.city.half - 2;
  hole.x = clamp(hole.x + input.x * speed * STEP, -lim, lim);
  hole.z = clamp(hole.z + input.z * speed * STEP, -lim, lim);
  hole.r += (hole.target - hole.r) * Math.min(1, STEP * 3);

  for (const o of w.objects) {
    if (o.state === 'eaten') continue;
    const dx = o.pos[0] - hole.x;
    const dz = o.pos[2] - hole.z;
    const dist = Math.hypot(dx, dz);
    if (o.state === 'idle') {
      if (o.agent) moveAgent(w, o, dx, dz, dist);
      if (dist < hole.r + o.reach + ACTIVATE_MARGIN && w.active.size < MAX_BODIES) activate(w, o);
    }
  }

  // предметы с телами: провал, затягивание, выход из зоны
  for (const o of w.active) {
    const p = o.body.translation();
    const dx = p.x - hole.x;
    const dz = p.z - hole.z;
    const dist = Math.hypot(dx, dz);
    const fit = fits(o.size, hole.r);
    if (!o.falling && fit && dist < hole.r * 0.9) {
      o.falling = true;
      o.body.wakeUp();
      // заваливается к центру дыры
      const k = o.body.mass() * 0.8;
      o.body.applyTorqueImpulse({ x: -dz * k, y: 0, z: dx * k }, true);
    }
    // у края дыры пролезающее скользит внутрь: трение почти пропадает, тянет к центру
    const pulled = fit && !o.falling && dist < hole.r * PULL_ZONE && p.y > -0.5;
    if (pulled) {
      const pull = (o.body.mass() * PULL * (1 - dist / (hole.r * PULL_ZONE))) / Math.max(dist, 0.1);
      o.body.applyImpulse({ x: -dx * pull * STEP, y: 0, z: -dz * pull * STEP }, true);
    }
    if (pulled !== o.slippery) {
      o.slippery = pulled;
      o.collider.setFriction(pulled ? 0.05 : FRICTION);
    }
  }

  // хуки Rapier JS вызывает только вместе с очередью событий
  w.world.step(w.queue, w.hooks);

  for (const o of [...w.active]) {
    const p = o.body.translation();
    if (p.y < -EAT_DEPTH - o.size[1] / 2) {
      eat(w, o);
      continue;
    }
    // упало, но не до конца, а дыра ушла: вернуть на землю нельзя, пусть доваливается
    if (o.falling && p.y < 0) continue;
    if (o.falling && Math.hypot(p.x - hole.x, p.z - hole.z) > hole.r) o.falling = false;
    const far = Math.hypot(p.x - hole.x, p.z - hole.z) > hole.r + o.reach + DEACTIVATE_MARGIN;
    if (far && (o.body.isSleeping() || speed3(o.body.linvel()) < 0.05)) deactivate(w, o);
  }
}

function moveAgent(w, o, dx, dz, dist) {
  const a = o.agent;
  let speed = a.speed;
  // люди в панике бегут от дыры вдоль своего тротуара
  if (o.type === 'person' && dist < PANIC_DIST + w.hole.r) {
    const along = a.axis === 'x' ? dx : dz;
    a.dir = along >= 0 ? 1 : -1;
    speed = 4.5;
  }
  const i = a.axis === 'x' ? 0 : 2;
  o.pos[i] += a.dir * speed * STEP;
  // за краем города — появиться с другой стороны
  const lim = w.city.half;
  if (o.pos[i] > lim) o.pos[i] -= 2 * lim;
  if (o.pos[i] < -lim) o.pos[i] += 2 * lim;
  if (o.type === 'person') o.quat = yawQuat(a.axis === 'x' ? (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : a.dir > 0 ? 0 : Math.PI);
}

function activate(w, o) {
  const [sx, sy, sz] = o.size;
  const body = w.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(o.pos[0], o.pos[1] + sy / 2, o.pos[2])
      .setRotation(o.quat)
      .setLinearDamping(0.1)
      .setAngularDamping(0.3),
  );
  if (o.agent) {
    const v = o.agent.dir * o.agent.speed;
    body.setLinvel(o.agent.axis === 'x' ? { x: v, y: 0, z: 0 } : { x: 0, y: 0, z: v }, true);
  }
  const collider = w.world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setDensity(DENSITY)
      .setFriction(FRICTION)
      // берётся меньшее трение из пары: так «скользкий» предмет скользит и по земле
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.1),
    body,
  );
  o.body = body;
  o.collider = collider;
  o.state = 'active';
  o.agent = null; // тронутый дырой предмет дальше живёт по физике
  w.byCollider.set(collider.handle, o);
  w.active.add(o);
}

function deactivate(w, o) {
  const p = o.body.translation();
  const q = o.body.rotation();
  o.pos = [p.x, p.y - o.size[1] / 2, p.z];
  o.quat = { x: q.x, y: q.y, z: q.z, w: q.w };
  removeBody(w, o);
  o.state = 'idle';
}

function eat(w, o) {
  removeBody(w, o);
  o.state = 'eaten';
  o.justEaten = true; // виду: спрятать экземпляр
  w.hole.eatenArea += footprint(o.size);
  w.hole.target = radiusFor(w.hole.eatenArea);
  w.score += o.value;
  w.eatenValue += o.value;
  w.eatenCount++;
  w.events.push({ type: 'eat', id: o.id, kind: o.type, value: o.value, size: o.size });
}

function removeBody(w, o) {
  w.byCollider.delete(o.collider.handle);
  w.world.removeRigidBody(o.body);
  o.body = null;
  o.collider = null;
  o.falling = false;
  o.slippery = false;
  w.active.delete(o);
}

function speed3(v) {
  return Math.hypot(v.x, v.y, v.z);
}

// Поза предмета для отрисовки: центр и поворот
export function objectPose(o) {
  if (o.body) return { pos: o.body.translation(), rot: o.body.rotation() };
  return { pos: { x: o.pos[0], y: o.pos[1] + o.size[1] / 2, z: o.pos[2] }, rot: o.quat };
}

export function drainEvents(w) {
  const ev = w.events;
  w.events = [];
  return ev;
}

export function disposeWorld(w) {
  w.world.free();
}

// Бот для тестов и калибровки: едет к самой выгодной из пролезающих целей поблизости.
// Если цель за несколько секунд не съедена (застряла, лежит неудобно), бросает её.
import { fits } from './growth.js';
import { objectPose } from './world.js';

const GIVE_UP = 3;

export function createBot() {
  return { target: null, since: 0, skip: new Set() };
}

export function botInput(bot, w) {
  const { hole } = w;
  if (bot.target && (bot.target.state === 'eaten' || w.t - bot.since > GIVE_UP)) {
    if (bot.target.state !== 'eaten') bot.skip.add(bot.target);
    bot.target = null;
  }
  if (!bot.target) {
    let bestScore = 0;
    for (const o of w.objects) {
      if (o.state === 'eaten' || bot.skip.has(o) || !fits(o.size, hole.r)) continue;
      const p = objectPose(o).pos;
      const s = o.value / (Math.hypot(p.x - hole.x, p.z - hole.z) + 3);
      if (s > bestScore) {
        bestScore = s;
        bot.target = o;
      }
    }
    bot.since = w.t;
    // брошенные цели через время можно пробовать снова: дыра выросла
    if (bot.skip.size > 40) bot.skip.clear();
  }
  if (!bot.target) return { x: 0, z: 0 };
  const p = objectPose(bot.target).pos;
  const dx = p.x - hole.x;
  const dz = p.z - hole.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
}

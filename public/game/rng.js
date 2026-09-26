// Детерминированный генератор случайных чисел: один сид — один и тот же город.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

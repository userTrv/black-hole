// Рост дыры и что в неё пролезает.
// Дыра растёт по площади: каждый съеденный предмет добавляет часть площади своего основания.
export const R0 = 1.1; // начальный радиус: пролезают люди, конусы, урны, фонари
export const GROW = 0.45; // доля площади основания съеденного, которая прибавляется к площади дыры
export const MAX_R = 16;

export function radiusFor(eatenArea) {
  return Math.min(MAX_R, Math.sqrt(R0 * R0 + (GROW * eatenArea) / Math.PI));
}

// Пролезает, если узкая сторона меньше диаметра, а длинная — не слишком длиннее (заваливается боком)
export function fits(size, r) {
  const a = Math.min(size[0], size[2]);
  const b = Math.max(size[0], size[2]);
  return a <= 2 * r * 0.92 && b <= 2 * r * 1.6;
}

export function footprint(size) {
  return size[0] * size[2];
}

// Звёзды за долю съеденного города (по очкам)
export function starsFor(pct) {
  return pct >= 0.6 ? 3 : pct >= 0.4 ? 2 : pct >= 0.2 ? 1 : 0;
}

// Скорость дыры: крупная ползёт чуть быстрее, чтобы успевать к целям
export function holeSpeed(r) {
  return 7 + r * 0.6;
}

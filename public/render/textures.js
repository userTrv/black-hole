// Процедурные текстуры: карта города на земле, фасад с окнами, мягкое пятно для пыли.
import * as THREE from 'three';
import { ROAD, BLOCK } from '../game/city.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Фасад: клетка 3×3 м с окном. Нижняя полоса серая — ею же красится крыша (см. шейдер в view.js)
export function facadeTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b8b4ad';
  g.fillRect(0, 122, 128, 6);
  g.fillStyle = '#51677f';
  g.fillRect(30, 30, 68, 62);
  g.fillStyle = '#8fb0cc';
  g.fillRect(34, 34, 26, 54);
  g.fillStyle = '#e9e5de';
  g.fillRect(62, 30, 4, 62);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PX = 6; // пикселей на метр

// Земля: трава за городом, дороги с разметкой и тротуарами, кварталы по типам
export function groundTexture(city, margin) {
  const size = 2 * (city.half + margin);
  const n = Math.min(2048, Math.ceil(size * PX));
  const k = n / size;
  const [c, g] = canvas(n, n);
  const X = (x) => (x + city.half + margin) * k;
  g.fillStyle = '#7fa35a';
  g.fillRect(0, 0, n, n);
  // пятна травы
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${60 + Math.random() * 40},${110 + Math.random() * 40},50,0.25)`;
    g.fillRect(Math.random() * n, Math.random() * n, 3, 3);
  }

  const lot = { downtown: '#c9c4ba', shops: '#cfc8bb', residential: '#98b770', park: '#79a655', parking: '#8c8f94' };
  for (const b of city.lots) {
    const w = BLOCK * k;
    const x0 = X(b.cx) - w / 2;
    const z0 = X(b.cz) - w / 2;
    g.fillStyle = lot[b.kind];
    g.fillRect(x0, z0, w, w);
    if (b.kind === 'parking') {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = Math.max(1, 0.12 * k);
      for (let row = -1; row <= 1; row++) {
        for (let i = -5; i <= 5; i++) {
          const x = X(b.cx + i * 3 - 1.5);
          const z = X(b.cz + row * 8);
          g.beginPath();
          g.moveTo(x, z - 2.5 * k);
          g.lineTo(x, z + 2.5 * k);
          g.stroke();
        }
      }
    }
    if (b.kind === 'park') {
      g.strokeStyle = '#d8cfb8';
      g.lineWidth = 2.2 * k;
      g.beginPath();
      g.moveTo(x0, z0 + w / 2);
      g.quadraticCurveTo(X(b.cx), z0, x0 + w, z0 + w / 2);
      g.stroke();
    }
  }

  // дороги
  const lo = X(city.roads[0] - ROAD / 2);
  const hi = X(city.roads[city.roads.length - 1] + ROAD / 2);
  for (const r of city.roads) {
    const a = X(r);
    for (const horizontal of [true, false]) {
      const rect = (off, width, color) => {
        g.fillStyle = color;
        if (horizontal) g.fillRect(lo, a + (off - width / 2) * k, hi - lo, width * k);
        else g.fillRect(a + (off - width / 2) * k, lo, width * k, hi - lo);
      };
      rect(0, ROAD, '#b9b3a6'); // тротуары
      rect(0, ROAD - 3.4, '#3d4046'); // проезжая часть
    }
  }
  // разметка: пунктир по оси, но не на перекрёстках
  g.strokeStyle = '#f2f0e6';
  g.lineWidth = Math.max(1, 0.18 * k);
  g.setLineDash([3 * k, 3 * k]);
  const cross = (s) => city.roads.some((r) => Math.abs(s - r) < ROAD / 2);
  for (const r of city.roads) {
    for (let s = city.roads[0]; s < city.roads[city.roads.length - 1]; s += 6) {
      if (cross(s) || cross(s + 6)) continue;
      g.beginPath();
      g.moveTo(X(s), X(r));
      g.lineTo(X(s + 6), X(r));
      g.moveTo(X(r), X(s));
      g.lineTo(X(r), X(s + 6));
      g.stroke();
    }
  }
  g.setLineDash([]);
  // зебры у перекрёстков
  g.fillStyle = 'rgba(245,243,235,0.9)';
  for (const rx of city.roads) {
    for (const rz of city.roads) {
      for (const side of [-1, 1]) {
        for (let i = -3; i <= 3; i++) {
          g.fillRect(X(rx + i * 1.1 - 0.35), X(rz + side * (ROAD / 2 + 1.2) - 1), 0.7 * k, 2 * k);
          g.fillRect(X(rx + side * (ROAD / 2 + 1.2) - 1), X(rz + i * 1.1 - 0.35), 2 * k, 0.7 * k);
        }
      }
    }
  }
  return { texture: tex(c), size };
}

export function softDot() {
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

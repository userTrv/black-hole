// Low-poly модели предметов. Каждый тип — набор частей, каждая часть рисуется своим InstancedMesh.
// Часть с color: null красится цветом экземпляра (машины, одежда, стены домов).
// Здания — единичный куб, растянутый по размеру экземпляра; окна рисует шейдер фасада.
import * as THREE from 'three';

function part(geometry, color, { y = 0, x = 0, z = 0, rx = 0, emissive = null } = {}) {
  geometry.rotateX(rx);
  geometry.translate(x, y, z);
  return { geometry, color, emissive };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

function wheels(w, len, r, y) {
  const g = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const c = cyl(r, r, 0.3, 10);
      c.rotateZ(Math.PI / 2);
      c.translate((sx * w) / 2, y, (sz * len) / 2);
      g.push(c);
    }
  }
  return merge(g);
}

function merge(list) {
  // простое слияние без индексов: геометрии тут маленькие
  const pos = [];
  const nrm = [];
  for (const g of list) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array);
    nrm.push(...n.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

// Модели в координатах предмета: начало — центр коробки предмета (размеры см. TYPES в city.js)
export function buildModels() {
  return {
    person: [
      part(box(0.46, 0.7, 0.3), null, { y: 0.05 }),
      part(new THREE.SphereGeometry(0.19, 7, 5), '#f1c7a1', { y: 0.62 }),
      part(box(0.4, 0.75, 0.28), '#34405a', { y: -0.47 }),
    ],
    cone: [part(new THREE.ConeGeometry(0.22, 0.7, 10), '#ff7a1a'), part(cyl(0.16, 0.18, 0.1), '#ffffff', { y: -0.05 })],
    hydrant: [part(cyl(0.16, 0.2, 0.75), '#d8342c', { y: -0.05 }), part(new THREE.SphereGeometry(0.17, 10, 6), '#d8342c', { y: 0.33 })],
    bin: [part(cyl(0.33, 0.28, 1.1, 12), '#3d6b4f'), part(cyl(0.35, 0.35, 0.08, 12), '#2c4f3a', { y: 0.55 })],
    bench: [
      part(box(1.8, 0.12, 0.6), '#9a6b3f', { y: 0 }),
      part(box(1.8, 0.5, 0.1), '#9a6b3f', { y: 0.25, z: -0.28 }),
      part(merge([box(0.1, 0.45, 0.5).translate(-0.8, -0.23, 0), box(0.1, 0.45, 0.5).translate(0.8, -0.23, 0)]), '#333333'),
    ],
    lamp: [
      part(cyl(0.07, 0.1, 5), '#4a4f57'),
      part(box(0.28, 0.2, 0.5), '#fff2c4', { y: 2.4, z: 0.12, emissive: '#ffe3a1' }),
    ],
    tree: [
      part(cyl(0.18, 0.26, 2.4, 7), '#6b4a2f', { y: -1.55 }),
      part(new THREE.IcosahedronGeometry(1.55, 0), '#4f8a3c', { y: 1.0 }),
      part(new THREE.IcosahedronGeometry(1.0, 0), '#5f9e46', { y: 2.1 }),
    ],
    car: [
      part(box(1.9, 0.7, 4.3), null, { y: -0.2 }),
      part(box(1.66, 0.6, 2.2), '#27313d', { y: 0.45, z: -0.2 }),
      part(wheels(1.9, 2.8, 0.36, -0.4), '#1b1b1b'),
    ],
    bus: [
      part(box(2.6, 2.6, 10), null, { y: 0.1 }),
      part(box(2.64, 0.9, 8.6), '#27313d', { y: 0.55, z: 0.3 }),
      part(wheels(2.6, 7, 0.5, -1.1), '#1b1b1b'),
    ],
    kiosk: [part(box(3, 2.5, 3), null, { y: -0.25 }), part(box(3.4, 0.4, 3.4), '#e8e2d4', { y: 1.2 }), part(box(2.2, 1, 0.1), '#27313d', { y: -0.1, z: 1.51 })],
    // здания: единичный куб с фасадом, крыша — отдельная часть
    house: [part(box(1, 1, 1), null, {}), part(roofPrism(), '#8c3b2f', {})],
    shop: [part(box(1, 1, 1), null, {}), part(box(1.02, 0.08, 1.02), '#5b5f66', { y: 0.53 })],
    apartment: [part(box(1, 1, 1), null, {}), part(box(0.5, 0.06, 0.5), '#6e6a66', { y: 0.53 })],
    tower: [part(box(1, 1, 1), null, {}), part(box(0.6, 0.05, 0.6), '#6e6a66', { y: 0.525 })],
  };
}

export const BUILDINGS = new Set(['house', 'shop', 'apartment', 'tower']);

// Двускатная крыша поверх единичного куба
function roofPrism() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, 0);
  shape.lineTo(0.55, 0);
  shape.lineTo(0, 0.4);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.04, bevelEnabled: false });
  g.translate(0, 0.5, -0.52);
  return g;
}

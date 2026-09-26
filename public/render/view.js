// Сцена three.js: земля-карта города, дыра через трафарет, предметы через InstancedMesh, камера за дырой.
//
// Дыра: сначала невидимый диск пишет 1 в трафарет, земля рисуется только там, где трафарет не 1,
// а стенки ямы — только там, где 1. Всё, что провалилось под землю, видно лишь сквозь дыру.
import * as THREE from 'three';
import { buildModels, BUILDINGS } from './models.js';
import { facadeTexture, groundTexture, softDot } from './textures.js';
import { objectPose } from '../game/world.js';

const MARGIN = 60;
// Просвечивание: всё, что на экране рядом с дырой и ближе к камере, чем она, рисуется сеткой
const seeThrough = {
  uHolePx: { value: new THREE.Vector2(-9999, -9999) },
  uHoleRadiusPx: { value: 0 },
  uHoleDepth: { value: 1 },
};
const PIT_DEPTH = 14;
const SKY = '#a9cdee';

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 140, 380);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);

  scene.add(new THREE.HemisphereLight('#e2efff', '#7a6a4f', 1.4));
  const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.1;
  scene.add(sun, sun.target);

  const view = { renderer, scene, camera, sun, groups: [], instances: new Map(), shake: 0, camR: 1 };

  // --- дыра ---
  const holeGroup = new THREE.Group();
  const mask = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  mask.position.y = 0.02;
  mask.renderOrder = -10;
  const pitGeo = new THREE.CylinderGeometry(1, 0.85, PIT_DEPTH, 64, 24, true);
  // стенки темнеют книзу
  const colors = [];
  const pos = pitGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = ((pos.getY(i) + PIT_DEPTH / 2) / PIT_DEPTH) ** 6; // 1 наверху, быстро гаснет вглубь
    colors.push(0.2 * k, 0.08 * k, 0.45 * k);
  }
  pitGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const pit = new THREE.Mesh(
    pitGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
    }),
  );
  pit.position.y = -PIT_DEPTH / 2;
  pit.renderOrder = -5;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.86, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc }),
  );
  floor.position.y = -PIT_DEPTH;
  floor.renderOrder = -5;
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(1, 1.06, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#7c4dff', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  rim.position.y = 0.03;
  holeGroup.add(mask, pit, floor, rim);
  scene.add(holeGroup);
  view.hole = holeGroup;

  // --- пыль и вспышки при съедании ---
  const dotTex = softDot();
  const dust = [];
  view.puff = (x, z, r, amount, tint = '#d8cdb7') => {
    for (let i = 0; i < amount; i++) {
      let p = dust.find((d) => d.life <= 0);
      if (!p) {
        if (dust.length > 160) return;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
        p = { s, vel: new THREE.Vector3(), life: 0 };
        dust.push(p);
        scene.add(s);
      }
      const a = Math.random() * Math.PI * 2;
      p.s.material.color.set(tint);
      p.s.position.set(x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r);
      p.vel.set(Math.cos(a) * 2, 1 + Math.random() * 2, Math.sin(a) * 2);
      p.maxLife = p.life = 0.9 + Math.random() * 0.8;
      p.size = 1.5 + r * 0.3;
      p.s.visible = true;
    }
  };

  view.resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  view.build = (world) => {
    for (const g of view.groups) {
      scene.remove(g);
      g.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
    }
    view.groups = [];
    view.instances.clear();
    view.world = world;
    const city = world.city;

    const { texture, size } = groundTexture(city, MARGIN);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
      }),
    );
    ground.receiveShadow = true;
    ground.renderOrder = -5;
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: '#7fa35a',
        roughness: 1,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
      }),
    );
    outer.position.y = -0.05;
    outer.renderOrder = -5;
    const groundGroup = new THREE.Group();
    groundGroup.add(ground, outer);
    scene.add(groundGroup);
    view.groups.push(groundGroup);

    // --- предметы ---
    const models = buildModels();
    const facade = facadeTexture();
    const byType = new Map();
    for (const o of world.objects) {
      if (!byType.has(o.type)) byType.set(o.type, []);
      byType.get(o.type).push(o);
    }
    const objGroup = new THREE.Group();
    for (const [type, list] of byType) {
      const meshes = models[type].map((p, pi) => {
        const building = BUILDINGS.has(type) && pi === 0;
        const mat = new THREE.MeshStandardMaterial({
          color: p.color ?? '#ffffff',
          roughness: 0.8,
          flatShading: type === 'tree',
          map: building ? facade : null,
          emissive: p.emissive ?? '#000000',
          emissiveIntensity: p.emissive ? 0.6 : 0,
        });
        if (building) facadeShader(mat);
        else if (BUILDINGS.has(type) || type === 'tree' || type === 'lamp' || type === 'bus') seeThroughShader(mat);
        const mesh = new THREE.InstancedMesh(p.geometry, mat, list.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (p.color === null) {
          const c = new THREE.Color();
          list.forEach((o, i) => mesh.setColorAt(i, c.set(o.color ?? '#cccccc')));
        }
        objGroup.add(mesh);
        return mesh;
      });
      list.forEach((o, i) => view.instances.set(o.id, { meshes, i, building: BUILDINGS.has(type) }));
    }
    scene.add(objGroup);
    view.groups.push(objGroup);
    for (const o of world.objects) writeInstance(view, o);
    for (const m of objGroup.children) m.instanceMatrix.needsUpdate = true;
    view.camR = world.hole.r;
    placeCamera(view, 1);
  };

  view.render = (dt) => {
    const w = view.world;
    // двигаются только агенты и предметы с телами
    const dirty = new Set();
    for (const o of w.objects) {
      if (o.state === 'active' || (o.agent && o.state === 'idle') || o.justEaten) {
        writeInstance(view, o);
        o.justEaten = false;
        for (const m of view.instances.get(o.id).meshes) dirty.add(m);
      }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;

    const { hole } = w;
    holeGroup.position.set(hole.x, 0, hole.z);
    holeGroup.scale.set(hole.r, 1, hole.r);

    for (const p of dust) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / p.maxLife;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size * (0.6 + k));
      p.s.material.opacity = 0.6 * (1 - k);
    }

    view.shake *= Math.exp(-dt * 5);
    placeCamera(view, dt);
    updateSeeThrough(view);
    renderer.render(scene, camera);
  };

  return view;
}

const tmpV = new THREE.Vector3();
function updateSeeThrough(view) {
  const { hole } = view.world;
  const { camera, renderer } = view;
  camera.updateMatrixWorld();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  tmpV.set(hole.x, 0, hole.z).project(camera);
  const cx = (tmpV.x * 0.5 + 0.5) * size.x;
  const cy = (tmpV.y * 0.5 + 0.5) * size.y;
  seeThrough.uHoleDepth.value = tmpV.z * 0.5 + 0.5;
  tmpV.set(hole.x + hole.r, 0, hole.z).project(camera);
  const ex = (tmpV.x * 0.5 + 0.5) * size.x;
  seeThrough.uHolePx.value.set(cx, cy);
  seeThrough.uHoleRadiusPx.value = Math.abs(ex - cx) + 20;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function writeInstance(view, o) {
  const inst = view.instances.get(o.id);
  if (o.state === 'eaten') {
    for (const m of inst.meshes) m.setMatrixAt(inst.i, ZERO);
    return;
  }
  const { pos, rot } = objectPose(o);
  tmpP.set(pos.x, pos.y, pos.z);
  tmpQ.set(rot.x, rot.y, rot.z, rot.w);
  if (inst.building) tmpS.set(o.size[0], o.size[1], o.size[2]);
  else tmpS.set(1, 1, 1);
  tmpM.compose(tmpP, tmpQ, tmpS);
  for (const m of inst.meshes) m.setMatrixAt(inst.i, tmpM);
}

// Камера сверху-сзади, отъезжает по мере роста дыры
function placeCamera(view, dt) {
  const { hole } = view.world;
  view.camR += (hole.r - view.camR) * Math.min(1, dt * 2);
  const r = view.camR;
  const narrow = view.camera.aspect < 1 ? Math.min(1.8, 0.9 / view.camera.aspect) : 1;
  // почти сверху, чтобы дома не заслоняли дыру
  const back = (8 + r * 1.5) * narrow;
  const up = (24 + r * 3.4) * narrow;
  const target = new THREE.Vector3(hole.x, 0, hole.z - r * 0.3);
  const desired = new THREE.Vector3(hole.x, up, hole.z + back);
  view.camera.position.lerp(desired, Math.min(1, dt * 6));
  if (view.shake > 0.01) {
    view.camera.position.x += (Math.random() - 0.5) * view.shake;
    view.camera.position.y += (Math.random() - 0.5) * view.shake;
  }
  view.camera.lookAt(target);
  placeSun(view, hole.x, hole.z, r);
}

// Тени без дрожания: размер теневой камеры меняется ступенями, а её центр в осях света
// привязан к сетке текселей — иначе при движении дыры тени на крышах «плавают»
const SUN_OFFSET = new THREE.Vector3(30, 80, 20);
const sunBasis = new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
const sunBasisInv = sunBasis.clone().invert();
const snapV = new THREE.Vector3();
function placeSun(view, x, z, r) {
  const reach = Math.ceil((40 + r * 5) / 10) * 10;
  const cam = view.sun.shadow.camera;
  if (cam.right !== reach) {
    Object.assign(cam, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 250 });
    cam.updateProjectionMatrix();
  }
  const texel = (2 * reach) / view.sun.shadow.mapSize.x;
  snapV.set(x, 0, z).applyMatrix4(sunBasisInv);
  snapV.x = Math.round(snapV.x / texel) * texel;
  snapV.y = Math.round(snapV.y / texel) * texel;
  snapV.applyMatrix4(sunBasis);
  view.sun.target.position.copy(snapV);
  view.sun.position.copy(snapV).add(SUN_OFFSET);
}

// Сетчатая прозрачность перед дырой (для зданий и деревьев)
function seeThroughShader(mat, extraVertex) {
  // three.js кэширует программы по тексту onBeforeCompile, а он у вариантов одинаковый
  mat.customProgramCacheKey = () => (extraVertex ? 'see-through-facade' : 'see-through');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seeThrough);
    extraVertex?.(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec2 uHolePx;
        uniform float uHoleRadiusPx;
        uniform float uHoleDepth;
        void main() {
          if (gl_FragCoord.z < uHoleDepth - 0.0005) {
            float d = distance(gl_FragCoord.xy, uHolePx);
            float fade = 1.0 - smoothstep(uHoleRadiusPx * 1.2, uHoleRadiusPx * 2.2, d);
            // упорядоченный узор 2×2: при fade = 1 остаётся каждый четвёртый пиксель
            vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
            float rank = (cell.x * 2.0 + cell.y + 0.5) / 4.0;
            if (rank < fade * 0.8) discard;
          }`,
      );
  };
}

// Окна на фасаде: UV растягиваются по размеру экземпляра, клетка 3 м. Крыша берёт серую полосу текстуры.
function facadeShader(mat) {
  seeThroughShader(mat, (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 bs = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        if (abs(normal.y) > 0.5) {
          vMapUv = vec2(0.5, 0.02);
        } else {
          vec2 rep = abs(normal.x) > 0.5 ? vec2(bs.z, bs.y) : vec2(bs.x, bs.y);
          vMapUv = uv * rep / 3.0;
        }
      #endif`,
    );
  });
}

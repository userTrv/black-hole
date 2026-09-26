// Копирует библиотеки из node_modules в public/vendor/: игра работает без сборки,
// а на сервер уезжает только public/. Запуск: npm run vendor (после npm install или обновления версий).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = {
  'node_modules/three/build/three.module.js': 'three.module.js',
  'node_modules/three/build/three.core.js': 'three.core.js',
  'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs': 'rapier.js', // .js: любой сервер отдаст его как JavaScript
};

await mkdir(`${root}public/vendor`, { recursive: true });
for (const [from, to] of Object.entries(files)) {
  await copyFile(`${root}${from}`, `${root}public/vendor/${to}`);
  console.log(`public/vendor/${to}`);
}

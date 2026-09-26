// Сборка для сайта: игра — статика без бандлера, поэтому просто копируем public/ в dist/.
// Сайт (presentation-site) собирает проект командой `pnpm install --frozen-lockfile && pnpm build`
// и выкладывает dist/ в /projects/black-hole/: все пути в игре относительные.
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await rm(`${root}dist`, { recursive: true, force: true });
await cp(`${root}public`, `${root}dist`, { recursive: true });
console.log('dist/ готов');

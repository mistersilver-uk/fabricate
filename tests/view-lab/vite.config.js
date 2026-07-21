// Dedicated Vite config for the Fabricate View Lab (issue 823), decoupled from the
// module build config and the live-smoke Playwright config. Root is the repo root so
// the lab can import real `src/**` Svelte components and serve `styles/`, `assets/`,
// and `tests/fixtures/` over http. Playwright's `webServer` runs this in dev mode.
import { resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: repoRoot,
  plugins: [svelte()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    // Deterministic rendering: no HMR churn during a capture run.
    hmr: false,
    fs: { allow: [repoRoot] },
  },
  // No `styles/fabricate.css` strip here — the lab needs the REAL production CSS.
  optimizeDeps: { entries: ['tests/view-lab/mount.js'] },
});

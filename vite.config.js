import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fabricateDevProxy } from './scripts/vite-foundry-proxy.js';

/** Resolves the global CSS import to an empty module during production builds. */
function stripGlobalCss() {
  const NOOP_ID = '\0global-css-noop';
  return {
    name: 'strip-global-css',
    enforce: 'pre',
    resolveId(source) {
      if (source.includes('styles/fabricate.css')) return NOOP_ID;
    },
    load(id) {
      if (id === NOOP_ID) return '';
    }
  };
}

export default defineConfig(({ command }) => {
  const plugins = [svelte({ compilerOptions: { css: 'injected' } })];
  if (command === 'serve') plugins.push(fabricateDevProxy());
  if (command === 'build') plugins.push(stripGlobalCss());

  if (command === 'serve') {
    return {
      plugins,
      server: {
        port: 5173,
        strictPort: true,
        hmr: { port: 5174 },
        proxy: {
          '/socket.io': { target: 'http://localhost:30000', ws: true }
        }
      }
    };
  }

  return {
    plugins,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      lib: {
        entry: resolve(import.meta.dirname, 'src/main.js'),
        formats: ['es'],
        fileName: 'main'
      },
      rollupOptions: {
        external: [],
        output: {
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    }
  };
});

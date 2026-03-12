import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fabricateDevProxy } from './scripts/vite-foundry-proxy.js';

export default defineConfig(({ command }) => {
  const plugins = [svelte({ compilerOptions: { css: 'injected' } })];
  if (command === 'serve') plugins.push(fabricateDevProxy());

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

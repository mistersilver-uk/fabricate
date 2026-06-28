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
    },
  };
}

export default defineConfig(({ command }) => {
  // Compiler options (css: 'injected') live in svelte.config.js so the plugin
  // finds a config file and stops logging "no Svelte config found" each build.
  const plugins = [svelte()];
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
          '/socket.io': { target: 'http://localhost:30000', ws: true },
        },
      },
    };
  }

  return {
    plugins,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // 'hidden' emits dist/main.js.map for CI/debug archival but omits the
      // //# sourceMappingURL comment from main.js, so the map ships nowhere it
      // is referenced; the release zip also excludes *.map (see scripts/release.js).
      sourcemap: 'hidden',
      // oxc (Vite 8 / Rolldown default) — fast minification, reasonable output size.
      minify: true,
      lib: {
        entry: resolve(import.meta.dirname, 'src/main.js'),
        formats: ['es'],
        fileName: 'main',
      },
      rollupOptions: {
        external: [],
        output: {
          assetFileNames: 'assets/[name].[ext]',
          // Drop developer-only console.log/debug/info calls from production
          // output by marking them pure so dead-code elimination removes them.
          // console.error and console.warn are retained for user-visible messages.
          // (Rolldown's equivalent of esbuild's `pure`; the Vite-default lib
          // minify of `{ compress: true, mangle: true, codegen: false }` is
          // preserved, with manualPureFunctions added.)
          minify: {
            compress: {
              treeshake: {
                manualPureFunctions: ['console.log', 'console.debug', 'console.info'],
              },
            },
            mangle: true,
            codegen: false,
          },
        },
      },
    },
  };
});

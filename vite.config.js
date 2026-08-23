import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { fabricateDevProxy, premiumSourceRoot } from './scripts/vite-foundry-proxy.js';

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

  // Opt-in bundle-size visualizer (issue #146). Off by default so the normal
  // `npm run build` output is byte-for-byte unaffected; enabled only when the
  // `build:analyze` script sets ANALYZE=1. Emits a gitignored dist/stats.html
  // treemap of per-module byte contributions.
  if (command === 'build' && process.env.ANALYZE === '1') {
    plugins.push(
      visualizer({
        filename: 'stats.html',
        title: 'Fabricate bundle analysis',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      })
    );
  }

  if (command === 'serve') {
    return {
      plugins,
      server: {
        port: 5173,
        strictPort: true,
        hmr: { port: 5174 },
        // The premium companion is served from its own checkout (see the dev proxy), so
        // Vite has to be allowed to read outside this repo. Scoped to that one directory
        // rather than opened up, and omitted entirely when premium is not checked out.
        fs: { allow: ['.', ...(premiumSourceRoot() ? [premiumSourceRoot()] : [])] },
        // WATCH ONLY THE SOURCE. Everything below is gitignored, read-only, and enormous, and
        // chokidar costs one inotify handle PER FILE against a budget of 65,536 for the whole
        // user session on a stock Linux box. `.worktrees/` alone holds a full checkout per agent
        // lane — over 130,000 files here — so the dev server cannot start at all while any lane
        // exists: it dies with `ENOSPC ... watch '<some>.hbs'` naming a file in another
        // worktree's system cache, which reads as a Vite bug rather than a watch-budget one.
        // None of these trees is ever edited, so watching them buys nothing at any price.
        watch: {
          ignored: [
            '**/.worktrees/**',
            '**/.foundry-e2e/**',
            '**/.foundry-chrome/**',
            '**/ui-screenshot-artifact/**',
            '**/test-results/**',
            '**/dist/**',
          ],
        },
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
      // 'hidden' emits dist/main.js.map (for CI/debug archival) but suppresses
      // the //# sourceMappingURL comment in main.js. To keep the map out of
      // shipped artifacts, all three zip paths exclude *.map: the GitHub-release
      // zip in scripts/release.js and the S3 cohort zip in scripts/lib/zip.js.
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
          // Keep dynamic import()s as real sibling chunks instead of inlining
          // them back into main.js. Lib builds default this to true, which would
          // fold the deferred GM crafting-system-manager subtree (issue #150)
          // back into the eager entry. A stable chunkFileNames keeps the emitted
          // chunk paths predictable for the build-output gate.
          inlineDynamicImports: false,
          chunkFileNames: 'chunks/[name]-[hash].js',
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

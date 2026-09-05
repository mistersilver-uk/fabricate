import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
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

/**
 * The version THIS BUILD WAS MADE FROM, baked into the bundle as `__FABRICATE_BUILD_VERSION__`
 * (issue 1565).
 *
 * WHY A BUILD-TIME DEFINE AND NOT A RUNTIME READ. Foundry renders a module's `esmodules` entry as
 * a plain `<script type="module" src="modules/fabricate/main.js">` with no cache-busting
 * parameter, so the entry script's URL never changes between versions, while the version a client
 * REPORTS comes from server-injected package data read from `module.json` on disk. That asymmetry
 * is the whole defect: `game.modules` can say 1.9.4 while the JavaScript executing is 1.9.3. Only
 * a value fixed at build time can tell the module which of the two it actually is.
 *
 * THE ENV VAR IS WHAT MAKES IT CORRECT ON A RELEASE. `scripts/release.js` sets
 * `FABRICATE_BUILD_VERSION` from the very same `version` binding it writes into
 * `dist/module.json`, so the baked and shipped versions cannot disagree. Without it a release
 * would bake the TRACKED manifest version — semantic-release builds with `--dist-version <next>`
 * and never writes the tracked `module.json`, which still reads 0.1.0 — and every user would then
 * be warned about a staleness that was really this build lying about itself.
 *
 * @returns {string} The version to bake in.
 */
function resolveBuildVersion() {
  const fromEnv = process.env.FABRICATE_BUILD_VERSION;
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv;
  // A bare `vite build` falls back to the tracked manifest. Serve mode never reaches here: it
  // declares no define at all (see the build return, which explains why).
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, 'module.json'), 'utf8'));
  return typeof manifest.version === 'string' ? manifest.version : '';
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
    // NO `define` HERE. `__FABRICATE_BUILD_VERSION__` is a production-build value only; the build
    // return below owns it and records why serve must never carry it.
    return {
      plugins,
      server: {
        // PIN THE IPv4 ADDRESS. Vite's default host ('localhost') binds whichever single
        // address the OS resolves that name to — on Windows that is `[::1]`, leaving the IPv4
        // `127.0.0.1:5173` unclaimed. `strictPort` then cannot do its job: another process (a
        // stray test that starts its own dev server on import, say) takes the half Vite never
        // asked for, no conflict is ever detected, and the browser — which resolves
        // `localhost` to IPv4 first — is served that other app instead of the Foundry proxy
        // below. The dev server looks broken while it is in fact healthy one stack over.
        // Binding IPv4 explicitly claims the address browsers actually reach for, and makes a
        // squatted port fail loudly at startup. Same choice, same reason, as
        // `tests/view-lab/vite.config.js`.
        host: '127.0.0.1',
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
    // BUILD ONLY, AND NOT AN OVERSIGHT. `define` SUBSTITUTES AN EXPRESSION, so the value has to be
    // JSON.stringify'd: a bare 1.9.5 would be spliced in as arithmetic and a bare 0.1.0 is a syntax
    // error outright.
    //
    // WHY THE `serve` RETURN ABOVE DECLARES NONE. `tests/helpers/extension-composition-harness.js`
    // starts Vite with `createServer({ root: repoRoot, ... })` and NO `configFile`, so default
    // config discovery loads THIS file and every mounted Svelte suite inherits whatever `serve`
    // defines. Those suites install the View Lab Foundry shim, which reports `0.0.0-viewlab` as the
    // installed version of any module, and they dispatch `ready` — so a baked version present in
    // serve mode differs from the installed one and `src/main.js`'s stale-entry check fires a
    // user-facing "reload to complete the update" notice on every mounted run. Serve mode has
    // nothing to detect in the first place: `npm run dev` reads its installed version from the same
    // tracked `module.json` this file falls back to, so the check would compare a value with
    // itself. Keeping the identifier undeclared outside a build lets the `typeof` guard in
    // `src/main.js` short-circuit, uniformly, in the dev server, the mounted harness and the
    // screenshot lab alike. Do not restore the symmetry.
    define: { __FABRICATE_BUILD_VERSION__: JSON.stringify(resolveBuildVersion()) },
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

// Svelte configuration consumed by @sveltejs/vite-plugin-svelte (and Svelte
// tooling/IDE integrations). Having this file present means the plugin no longer
// logs a "no Svelte config found - using default configuration" notice on every
// build. `css: 'injected'` keeps component styles bundled into the JS rather than
// emitted as separate assets, matching the single-file module build.
export default {
  compilerOptions: { css: 'injected' },
};

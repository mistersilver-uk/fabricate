// Svelte configuration consumed by @sveltejs/vite-plugin-svelte (and Svelte
// tooling/IDE integrations). Having this file present means the plugin no longer
// logs a "no Svelte config found - using default configuration" notice on every
// build. `css: 'injected'` keeps component styles bundled into the JS rather than
// emitted as separate assets, matching the single-file module build.
//
// These `compilerOptions` are also read back by `scripts/lib/svelteCompilerWarnings.js`, so
// the standalone warning sweep compiles components exactly as the build does. Do not restate
// them anywhere; a second copy is how a sweep/`onwarn` disagreement stops being diagnostic.
export default {
  compilerOptions: { css: 'injected' },

  /**
   * Fail the build on any Svelte compiler warning (issue 924).
   *
   * The compiler reported seven warnings on `main` and the build passed anyway. Five were real
   * accessibility defects and one — a `css_unused_selector` — was a focus ring the compiler was
   * emitting COMMENTED OUT, so the ring was dead in every shipped build while the source read
   * as if it were there. Nothing counted them, so nothing noticed.
   *
   * Throwing is what fails the build: `vite-plugin-svelte` calls this instead of its default
   * handler, and a handler that merely logs leaves the exit code at 0.
   *
   * THIS IS THE FAST HALF, NOT THE AUTHORITATIVE ONE. A Vite build compiles only the entry
   * graph, so a warning in a component nothing imports (issue 927) never reaches here.
   * `npm run lint:svelte:warnings` sweeps every component under `src/` and is the gate CI runs;
   * this hook exists so an author trips the same bar locally, on the build they were already
   * running. The two share their compiler options through the export above, so if they ever
   * disagree the cause is graph reachability — never config drift.
   *
   * There is deliberately no allowlist parameter. A warning worth keeping is a warning worth
   * suppressing AT ITS SITE with a `<!-- svelte-ignore ... -->` comment and a stated reason,
   * which `svelte/no-unused-svelte-ignore` then polices in the other direction; a list here
   * would be an unreviewed, unexpiring exemption with no pointer back to the code.
   */
  onwarn(warning) {
    const where = warning.filename ?? '<unknown file>';
    const at = warning.start ? `:${warning.start.line}:${warning.start.column}` : '';
    throw new Error(
      `Svelte compiler warning (the build fails on these — issue 924):\n` +
        `  ${where}${at} [${warning.code}] ${warning.message}\n` +
        '  Fix it, or suppress it at the site with a `<!-- svelte-ignore <code> -->` comment' +
        ' and a one-line rationale.'
    );
  },
};

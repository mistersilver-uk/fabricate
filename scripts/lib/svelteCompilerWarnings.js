/**
 * svelteCompilerWarnings.js
 *
 * One definition of "compile a component the way this repository builds it", and one
 * definition of "the warnings that come back".
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN THREE TIMES
 * --------------------------------------------------
 * Three call sites need the Svelte compiler's warning inventory and they are only meaningful
 * if they agree:
 *
 *   - `svelte.config.js`'s `onwarn` hook, which fails `npm run build` on a warning. Fast, and
 *     the one an author trips locally — but a Vite build compiles only the ENTRY GRAPH, so a
 *     warning in a component nothing imports (`RowDisclosure.svelte` today; issue 927) never
 *     reaches it.
 *   - `scripts/check-svelte-warnings.mjs`, the graph-independent sweep over every component
 *     under `src/`. Exhaustive, and therefore the authoritative one — but only while it
 *     compiles with the same options as the build.
 *   - `scripts/compare-svelte-render.mjs`, which prints `svelte_compiler_warnings=N over M
 *     files` alongside its render-drift report and is where issue 924's baseline figure came
 *     from.
 *
 * Before this file, all three built their own `compile()` call and none of them read
 * `svelte.config.js`. That makes a disagreement between them ambiguous: it could be graph
 * reachability (interesting) or config drift (a bug in whichever one diverged). Reading the
 * options from the config removes the second reading, so a disagreement means exactly one
 * thing — and "exhaustive, therefore authoritative" becomes a sound conclusion rather than an
 * assumption.
 *
 * The precise claim is "never drift in `compilerOptions`", and it stops there on purpose.
 * `emitCss` is a `vite-plugin-svelte` option rather than a compiler one, so it is outside this
 * read — and with `emitCss: false` the plugin filters `css_unused_selector` out before `onwarn`
 * is called, which would make the BUILD half go quiet on a class the sweep still reports. That
 * seam is closed by assertion instead, in `tests/svelte-warning-scope.test.js`.
 *
 * THE ONE PERMITTED OVERRIDE, AND WHY IT IS SAFE
 * ----------------------------------------------
 * `compare-svelte-render.mjs` compiles with `css: 'external'` rather than the build's
 * `css: 'injected'`, because under `injected` the compiler returns `result.css === null` and
 * folds the stylesheet into a string literal inside the JS — which would collapse that
 * script's separate `css` render-signal into its whole-module fallback and turn every
 * rewrapped CSS declaration into reported noise.
 *
 * IT INTRODUCES NO NEW RISK; IT DECLINES TO INTRODUCE ONE. Svelte's `css` compiler option
 * DEFAULTS to `'external'`, and that script's pre-change call — `compile(source, { filename,
 * generate: 'client', dev: false })` — carried no `css` key at all. So `{ css: 'external' }`
 * reproduces its prior behaviour EXACTLY. What changed here is that the option became
 * explicit; what did not change is a single byte of what that script compiles.
 *
 * The override is also confined to a signal this file does not produce: `css` selects where
 * the stylesheet is EMITTED, not whether it is ANALYSED, so the warning set is identical
 * either way (`css_unused_selector` is reported under both). That is asserted rather than
 * asserted-in-prose — see `tests/svelte-warning-scope.test.js`, which takes the comparison
 * over sources that actually WARN, one per analysis family, and first observes `result.css`
 * to prove the override reached the compiler at all. It does not compare a real component's
 * warning set, because every component under `src/` is warning-free by the bar this gate
 * enforces and both sides would be `[]` by construction. Adding a second override without
 * evidence of that shape would put the ambiguity straight back.
 *
 * Pure and dependency-free beyond the compiler itself (no autorun, no I/O of its own — the
 * caller supplies the source text), so it is safe to import from `node --test`.
 */
import { compile } from 'svelte/compiler';

import svelteConfig from '../../svelte.config.js';

/**
 * The compiler options the real build uses, read from `svelte.config.js` rather than restated.
 *
 * `generate`/`dev` come first so the config can override them if it ever declares them; the
 * config's own options win, which is the whole point of reading it.
 */
export const BUILD_COMPILER_OPTIONS = Object.freeze({
  generate: 'client',
  dev: false,
  ...svelteConfig.compilerOptions,
});

/**
 * Compile one component with the build's options.
 *
 * @param {string} source the component's source text
 * @param {string} filename the name to report in warnings (repository-relative reads best)
 * @param {object} [overrides] see "THE ONE PERMITTED OVERRIDE" above — not a general escape
 *   hatch, and anything added here needs evidence that it cannot move the warning set
 * @returns {ReturnType<typeof compile>} the raw compiler result
 */
export function compileComponent(source, filename, overrides = {}) {
  return compile(source, { ...BUILD_COMPILER_OPTIONS, ...overrides, filename });
}

/**
 * One warning, flattened to the fields a report needs.
 *
 * `start` is absent on a few warning classes, so the position is normalised to `null` rather
 * than left to read as `undefined` in serialized output.
 */
function describeWarning(file, warning) {
  return {
    file,
    code: warning.code,
    // The compiler appends a docs URL on its own line; the report prints one line per warning.
    message: String(warning.message ?? '').split('\n', 1)[0],
    line: warning.start?.line ?? null,
    column: warning.start?.column ?? null,
  };
}

/**
 * Every warning the compiler reports across `files`, in file order.
 *
 * A component that fails to COMPILE is not silently skipped: it is reported as a synthetic
 * `compile_error` finding, so a sweep can never come back clean because it could not read
 * something. That is the same rule `compare-svelte-render.mjs` applies to a failed side.
 *
 * @param {object} options
 * @param {string[]} options.files repository-relative component paths, used both as the read
 *   key and as the reported filename
 * @param {(file: string) => string} options.readSource returns one component's source text
 * @returns {{ files: number, warnings: ReturnType<typeof describeWarning>[] }}
 */
export function scanComponentWarnings({ files, readSource }) {
  const warnings = [];
  for (const file of files) {
    let result;
    try {
      result = compileComponent(readSource(file), file);
    } catch (error) {
      warnings.push({
        file,
        code: 'compile_error',
        message: error.message,
        line: null,
        column: null,
      });
      continue;
    }
    for (const warning of result.warnings) warnings.push(describeWarning(file, warning));
  }
  return { files: files.length, warnings };
}

/**
 * The summary line, deliberately byte-identical in shape to the one
 * `scripts/compare-svelte-render.mjs` prints, so two runs can be diffed against each other
 * without reading past the first line of either.
 */
export function formatWarningSummary({ files, warnings }) {
  return `svelte_compiler_warnings=${warnings.length} over ${files} files`;
}

/** One warning as a single report line. */
export function formatWarning(warning) {
  const position = warning.line === null ? '' : `:${warning.line}:${warning.column}`;
  return `  ${warning.file}${position} [${warning.code}] ${warning.message}`;
}

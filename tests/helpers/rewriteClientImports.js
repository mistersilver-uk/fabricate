/**
 * The ONE import rewrite every compiled-Svelte test suite shares (issue 1207).
 *
 * This lives in its own leaf, with no imports at all, because the suites that need it are not
 * all mount suites: `tests/stores/*.test.js` and `tests/helpers/compile-svelte-module.js`
 * compile runes MODULES and never touch the DOM. Re-exporting it from
 * `svelte-component-harness.js` is convenient for mount suites but is not a home for it —
 * importing that file pulls in `svelte/legacy` and happy-dom, so a store suite would take on
 * the whole mount harness to reach one pure string function.
 *
 * ---
 *
 * Rewrite a compiled component's imports so they resolve against the temp dir: append `.js`
 * to `.svelte` specifiers, because the temp dir holds the compiled `.svelte.js` siblings.
 *
 * A bare `svelte` import is deliberately LEFT ALONE, and that is the whole of the design. Two
 * earlier versions of this function rewrote it and both were wrong in the same way:
 *
 *   1. `from 'svelte'` -> `from 'svelte/internal/client'` unconditionally. `onDestroy` is not on
 *      `svelte/internal/client`, so one component adding it took every mounted manager test to
 *      `# cancelled 348` behind a single "does not provide an export named 'onDestroy'"
 *      (issue 1185).
 *   2. The same rewrite with a five-name allowlist routed back to the package. Measured against
 *      Svelte 5.56.3 under `--conditions=browser`, `svelte` exports 21 names and
 *      `svelte/internal/client` provides exactly TWO of them — `tick` and `untrack`, and as the
 *      identical function objects. So `getContext`, `setContext`, `flushSync`,
 *      `createEventDispatcher` and 14 others were all routed to a module that does not export
 *      them: issue 1185's failure rebuilt, one import away, in a file ~40 suites share.
 *
 * Both failures are LINK errors, thrown while the module graph is being instantiated and before
 * the suite's first test runs, so `node --test` reports them as `# cancelled N` with `# fail 0`.
 * A gate reading the fail count sees green. Not rewriting the specifier at all removes the split,
 * its allowlist and that whole failure mode together: the temp dir symlinks the repo's real
 * `node_modules`, so bare `svelte` resolves to exactly the module instance the harness itself
 * loaded, and the compiler already emits its own runtime import as `svelte/internal/client`
 * directly, which this leaves untouched.
 *
 * `tests/components/svelte-component-harness.test.js` pins both halves: that the specifier is
 * left intact, and — driven off the installed Svelte's own export list, so it cannot go stale —
 * that whatever specifier a name is routed to really does provide it.
 *
 * @param {string} code Compiled client output from `compile()` or `compileModule()`.
 * @returns {string} The same code with `.svelte` specifiers resolved to their compiled siblings.
 */
export function rewriteClientImports(code) {
  return code.replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

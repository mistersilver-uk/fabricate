/**
 * The ONE import rewrite every compiled-Svelte test suite shares (issue 1207).
 *
 * A `.svelte.js` specifier is rewritten too, because both harnesses write a compiled module to
 * `<path>.js` — so a rune module importing another resolves to `x.svelte.js.js` (issue 1673).
 *
 * @param {string} code Compiled client output from `compile()` or `compileModule()`.
 * @returns {string} The same code with `.svelte` specifiers resolved to their compiled siblings.
 */
export function rewriteClientImports(code) {
  return code.replace(/(from\s+['"][^'"]+\.svelte(?:\.js)?)(['"])/g, '$1.js$2');
}

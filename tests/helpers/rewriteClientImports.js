/**
 * The ONE import rewrite every compiled-Svelte test suite shares (issue 1207).
 *
 * @param {string} code Compiled client output from `compile()` or `compileModule()`.
 * @returns {string} The same code with `.svelte` specifiers resolved to their compiled siblings.
 */
export function rewriteClientImports(code) {
  return code.replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

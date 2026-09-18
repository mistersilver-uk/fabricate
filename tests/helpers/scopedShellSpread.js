/** The spread detector for the scoped-entity list shells (issue 1380). */

/**
 * The value one attribute is given on the FIRST `<Component …>` tag in `source`.
 *
 * @param {string} component the component's local binding name
 * @param {string} attribute the prop name
 * @returns {string|null} the raw attribute value, `''` for a shorthand `{pageIndex}`, or `null`
 * when the tag or the attribute is absent
 */
export function attributeValueOn(source, component, attribute) {
  const start = source.indexOf(`<${component}`);
  if (start === -1) return null;
  const tag = openTagAt(source, start);
  const named = new RegExp(String.raw`\b${attribute}=\{([^{}]*(?:\{[^{}]*\})?[^{}]*)\}`).exec(tag);
  if (named) return named[1].trim();
  // Svelte's shorthand: `{pageIndex}` passes the local of that name, and it is exactly the
  // mutation — a probe that only understood the named form would answer `null` for it and pass.
  return new RegExp(String.raw`\{\s*${attribute}\s*\}`).test(tag) ? '' : null;
}

/**
 * The open tag beginning at `start`, brace-aware.
 *
 * @param {number} start index of the `<`
 * @returns {string} the open tag's text, `<` to its closing `>` inclusive
 */
function openTagAt(source, start) {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '{') depth += 1;
    else if (character === '}') depth = Math.max(0, depth - 1);
    else if (character === '>' && depth === 0) return source.slice(start, cursor + 1);
  }
  return source.slice(start);
}

/**
 * Every local binding in `source` that names one of `componentPaths` by its basename.
 *
 * @param {string} source a `.svelte` file's text
 * @param {readonly string[]} componentPaths repository-relative `.svelte` paths
 * @returns {string[]} the local binding names, in source order
 */
export function shellBindingsIn(source, componentPaths) {
  const basenames = new Set(componentPaths.map((path) => path.split('/').pop()));
  const bindings = [];
  for (const [, binding, specifier] of source.matchAll(
    /import\s+(\w+)\s+from\s+['"]([^'"]+\.svelte)['"]/g
  )) {
    if (basenames.has(specifier.split('/').pop())) bindings.push(binding);
  }
  return bindings;
}

/**
 * Every shell call site in `source` that SPREADS an identifier into it.
 *
 * @param {string} source a `.svelte` file's text
 * @param {readonly string[]} componentPaths repository-relative `.svelte` paths
 * @returns {Array<{binding: string, tag: string}>} one entry per offending call site
 */
export function detectShellSpreads(source, componentPaths) {
  const found = [];
  for (const binding of shellBindingsIn(source, componentPaths)) {
    let cursor = source.indexOf(`<${binding}`);
    while (cursor !== -1) {
      const next = source[cursor + binding.length + 1];
      // A tag boundary, so `<Catalogue` does not match `<CatalogueRow`.
      if (next === undefined || /[\s/>]/.test(next)) {
        const tag = openTagAt(source, cursor);
        if (/\{\s*\.\.\./.test(tag)) found.push({ binding, tag });
      }
      cursor = source.indexOf(`<${binding}`, cursor + 1);
    }
  }
  return found;
}

/**
 * The spread detector for the scoped-entity list shells (issue 1380).
 *
 * ── WHAT IT BANS AND WHY ──────────────────────────────────────────────────────────────────────
 * A shell takes ~20 props and defaults every one of them. That is what makes it usable from four
 * lanes, and it is also what makes `<EntityCatalogueShell {...props} />` dangerous: an object
 * missing a key does not fail, it silently takes the default. A misspelled `sectionNotes` renders
 * every note empty; a misspelled `searchOf` searches the name only; a misspelled `onOpenEntry`
 * gives every row a pen that does nothing. Named props at the call site turn each of those into
 * an unused variable a linter can see.
 *
 * ── IT IS A PURE FUNCTION, AND ITS OWN FIXTURES PROVE IT ──────────────────────────────────────
 * A detector applied to a set that is empty today is exactly the shape that ships green while
 * matching nothing — this epic has already shipped one matcher that could not fail. So this is a
 * function over a STRING rather than a walk baked into a test, and
 * `tests/components/scoped-shell-prop-contract.test.js` exercises it against inline positive and
 * negative fixtures BEFORE applying it to the repository.
 *
 * ── IT KEYS ON THE IMPORT, NOT ON THE TAG NAME ────────────────────────────────────────────────
 * `import Catalogue from '.../EntityCatalogueShell.svelte'` followed by `<Catalogue {...props} />`
 * is the same defect wearing a different name, and a detector matching `<EntityCatalogueShell`
 * literally would miss it — and would then read as coverage for the next lane. So it resolves the
 * LOCAL BINDING from the import specifier's basename first and scans for that.
 */

/**
 * The value one attribute is given on the FIRST `<Component …>` tag in `source`.
 *
 * ── WHY THIS EXISTS BESIDE THE SPREAD DETECTOR ────────────────────────────────────────────────
 * `paginateRows` clamps the index it RETURNS, and both the row slice and the pagination footer
 * have to read that returned value rather than the frame's own state. The frame ALSO writes the
 * clamped value back — which is correct, and which makes the defect unobservable in a settled
 * DOM: within one flush the two indices agree by construction, so a mounted assertion cannot see
 * the single wrong frame in between. Measured: handing `Pagination` the frame's raw `pageIndex`
 * left the whole mounted suite green.
 *
 * So the footer's input is pinned structurally instead, and — like the spread detector — the
 * parse is proved against a positive and a negative fixture before it is applied, because a
 * source probe that matched nothing would report exactly the same green.
 *
 * @param {string} source
 * @param {string} component the component's local binding name
 * @param {string} attribute the prop name
 * @returns {string|null} the raw attribute value, `''` for a shorthand `{pageIndex}`, or `null`
 *   when the tag or the attribute is absent
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
 * A naive `[^>]*` stops at the first `>` in the tag, and Svelte call sites are full of arrow
 * functions — `onSelect={(id) => go(id)}` carries one in the second attribute. Counting brace
 * depth is what makes the scan reach the real end of the tag instead of truncating at the first
 * handler and reporting no spread on a tag that has one.
 *
 * @param {string} source
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

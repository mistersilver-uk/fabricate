/**
 * The ONE reader of a Svelte 5 `$props()` destructure, shared by every source-contract suite
 * that asks what a component declares (issues 1380 and 1372).
 *
 * Two suites need it and a third will: `scoped-shell-prop-contract.test.js` pins the three shared
 * scoped-list shells against a literal set, and `essence-world-scope-screens.test.js` checks the
 * four essence screens against the key set their call site actually supplies. Both questions are
 * "what names does this file destructure out of `$props()`", and two copies of the depth-tracking
 * splitter is the duplication SonarCloud counts — on a `.svelte`-adjacent surface it already
 * indexes.
 *
 * A `...rest` key is reported as the literal `...rest`, so a destructure that opened itself up to
 * arbitrary keys fails a set equality rather than passing under the name it collected them into.
 *
 * @param {string} source a component's full source text.
 * @returns {string[]} the declared prop names, sorted.
 * @throws {Error} when the file has no `let { … } = $props()` destructure at all, which is a
 *   broken parse rather than a component with no props — the caller would otherwise compare an
 *   empty set to an empty set and pass.
 */
export function declaredPropNames(source) {
  const start = source.indexOf('let {');
  const end = source.indexOf('} = $props();', start);
  if (start === -1 || end <= start) {
    throw new Error('no `let { … } = $props()` destructure found');
  }
  // LINE COMMENTS COME OUT BEFORE THE SPLIT, NOT AFTER IT. Stripping them per ENTRY works only
  // while no prop comment contains a comma — and a prose comment about "scope, actions and
  // systemId" contains three. A comma inside a comment then splits one entry into four, and the
  // fragments are read as prop names. Removing them from the whole body first makes the depth
  // walk see only code.
  const body = source
    .slice(start + 'let {'.length, end)
    .replace(/\/\/[^\n]*/g, '');
  const names = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
    if ('([{`'.includes(character)) depth += 1;
    else if (')]}`'.includes(character)) depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      names.push(current);
      current = '';
    } else current += character;
  }
  names.push(current);
  return names
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('...') ? entry : entry.split(/[=:]/)[0].trim()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

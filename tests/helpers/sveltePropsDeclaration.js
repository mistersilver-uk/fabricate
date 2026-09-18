/**
 * The ONE reader of a Svelte 5 `$props()` destructure, shared by every source-contract suite that
 * asks what a component declares (issues 1380 and 1372).
 *
 * @param {string} source a component's full source text.
 * @returns {string[]} the declared prop names, sorted.
 * @throws {Error} when the file has no `let { … } = $props()` destructure at all, which is a broken
 * parse rather than a component with no props — the caller would otherwise compare an empty set to
 * an empty set and pass.
 */
export function declaredPropNames(source) {
  const start = source.indexOf('let {');
  const end = source.indexOf('} = $props();', start);
  if (start === -1 || end <= start) {
    throw new Error('no `let { … } = $props()` destructure found');
  }
  // LINE COMMENTS COME OUT BEFORE THE SPLIT, NOT AFTER IT.
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

/**
 * Finding a named Svelte tag in component source, and reading the classes it is handed (issue
 * 1422).
 */

/**
 * The index of the closing `>` of the opening tag whose attributes start at `from`.
 *
 * @param {string} source component source text
 * @param {number} from index just past the tag NAME
 * @returns {number} index of the tag's closing `>`, or -1 when the tag never closes
 */
function endOfOpeningTag(source, from) {
  let depth = 0;
  let quote = '';
  for (let index = from; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth++;
    else if (character === '}') depth--;
    else if (character === '>' && depth === 0) return index;
  }
  return -1;
}

/**
 * Every `<Name …>` opening tag in `source`, as source text.
 *
 * @param {string} source component source text
 * @param {string} name the tag name to find
 * @returns {string[]} each opening tag's full source text, in document order
 */
export function openingTagsNamed(source, name) {
  const tags = [];
  for (const match of source.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
    const end = endOfOpeningTag(source, match.index + match[0].length);
    if (end < 0) continue;
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

/**
 * Every LITERAL class token a component hands to its `<Name …>` call sites (issue 1458).
 *
 * @param {string} source component source text
 * @param {string} name the tag name to find
 * @param {ReadonlyArray<string>} [classProps] attribute names carrying class tokens
 * @returns {Set<string>} every literal class token passed through those props
 */
export function classTokensPassedTo(source, name, classProps = ['class']) {
  const tokens = new Set();
  for (const tag of openingTagsNamed(source, name)) {
    for (const prop of classProps) {
      const literal = new RegExp(String.raw`(?<![\w-])${prop}="([^"]*)"`).exec(tag);
      if (!literal) continue;
      for (const token of literal[1].split(/\s+/)) if (token) tokens.add(token);
    }
  }
  return tokens;
}

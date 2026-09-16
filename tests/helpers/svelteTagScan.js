/**
 * Finding a named Svelte tag in component source, and reading the classes it is handed.
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN TWICE
 * --------------------------------------------
 * `manager-button-scoped-class-reach.test.js` and `icon-button-source-contract.test.js` both
 * need "every `<X …>` opening tag in this source" and "every literal class token that tag is
 * handed". `manager-button-scoped-class-reach.test.js` grew the first working version of it,
 * and a second copy would be near-identical — which is the shape SonarCloud's new-code
 * duplication gate fails at >3%, and which would also let the two guards drift into disagreeing
 * about what a call site IS.
 *
 * THE ONE SUBTLETY, AND IT IS NOT COSMETIC
 * ----------------------------------------
 * A tag's end cannot be found with `[^<>]*`. Practically every call site in this repository
 * passes an inline arrow handler — `onclick={() => remove(id)}` — and the arrow's `>` ends such
 * a match half way through the attribute list, silently truncating the tag and losing every
 * attribute after it. Both guards read attributes out of the returned text, so a truncated tag
 * does not fail them: it makes them report clean over half a tag.
 *
 * `manager-button-scoped-class-reach.test.js` handled that by skipping any `>` preceded by `=`.
 * That is not sufficient, and issue 1422 found the case it misses: a COMPARISON inside an
 * expression attribute. `VocabularyPanel.svelte` ships
 *
 *     <IconButton class={row.totalUsage > 0 ? '' : 'is-danger'} ariaLabel={…} …>
 *
 * whose `>` is preceded by a space, so the `=>` rule lets it end the tag — five attributes
 * early, taking `ariaLabel` with it. The accessible-name clause in
 * `icon-button-source-contract.test.js` reported that site as unnamed, which is how the blind
 * spot surfaced; a clause looking for the ABSENCE of something would instead have gone quiet.
 *
 * So the scan tracks `{}` DEPTH and ignores everything inside an expression, which is correct
 * for both cases at once and for any other operator an expression may contain. It is still
 * deliberately NOT a full parse: the callers ask only "which literal tokens appear in this
 * tag's `class` attribute" and "does this tag name that attribute", and a compiler-grade AST
 * walk would make these guards depend on the compiler's node shapes for a textual question.
 */

/**
 * The index of the closing `>` of the opening tag whose attributes start at `from`.
 *
 * Depth-aware: a `>` inside a `{…}` expression attribute belongs to the expression, whether it
 * is an arrow's or a comparison's. Quotes are tracked too, so a `}` inside a string literal
 * cannot close the expression early.
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
 * `\b` after the name is what stops `<IconButton` from also matching a future
 * `<IconButtonGroup`, which would silently fold a different component's call sites into
 * whichever guard is asking.
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
 * Every LITERAL class token a component hands to its `<Name …>` call sites.
 *
 * Literal only: a `class={expr}` token cannot be read statically and is not guessed at. Both
 * callers state their own non-vacuity floor over the result, so a corpus in which the scan
 * silently stopped finding tokens fails rather than passing over nothing.
 *
 * `classProps` exists because `class` is not the only prop that carries one (issue 1458).
 * `SearchablePopover` renders THREE elements a caller may class — the trigger, the portaled
 * panel and the value span — so it takes `triggerClass`, `popoverClass`, `valueClass` and
 * `pickerClass` rather than one `class`, and a scan hard-coded to `class` finds zero tokens
 * across all sixteen of its call sites and reports clean. Measured before the option existed:
 * 69 tokens in 16 files, none of them visible to the single-prop form.
 *
 * The pattern is anchored `(?<![\w-])`, not `\b`: `class` is a SUFFIX of `triggerClass` and
 * `valueClass`, so a `\b`-anchored `class="…"` pattern would read a `triggerClass="…"` as the
 * `class` prop — which is wrong in the direction that quietly widens a guard's token set.
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

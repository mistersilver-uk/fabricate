/**
 * BOUNDED slices of production source, for the suites that assert against production TEXT.
 *
 * Bounding is the point, and it is the whole reason this module exists rather than an
 * `indexOf`/`slice` pair at each call site. `source.slice(source.indexOf(marker))` runs to the
 * end of the file, which is harmless for a "must CONTAIN" assertion and permanently red for a
 * "must NOT contain" one — every symbol the rest of the file legitimately uses is inside an
 * unbounded slice. Worse, `indexOf` answers `-1` for a marker that has been RENAMED, and
 * `slice(-1)` is the file's last character: both assertions then pass against a one-character
 * string, silently, forever. Every function here THROWS on a locator that no longer resolves,
 * so a rename fails loudly instead of going vacuous.
 *
 * Single-sourcing the strategy is also what stops the unbounded form being the pattern the
 * next author copies.
 *
 * This module deliberately imports NOTHING. It is loaded by suites that stand up no Foundry
 * globals at all, so a dependency on a production module — or on a harness that reaches one —
 * would make a pure text assertion pay for an import graph it never uses.
 */

/**
 * Slice from a located start to the first line that is exactly `closer`.
 *
 * @param {string} source
 * @param {string} locator the exact text the slice starts at
 * @param {string} closer the closing line, indentation included, e.g. `'\n  }'`
 * @param {string} missing the error message for an unresolvable locator
 * @param {string} unclosed the error message for a slice with no closing line
 * @returns {string}
 */
function sliceToCloser(source, locator, closer, missing, unclosed) {
  const start = source.indexOf(locator);
  if (start < 0) throw new Error(missing);
  const end = source.indexOf(`${closer}\n`, start);
  if (end < 0) throw new Error(unclosed);
  return source.slice(start, end + closer.length);
}

/**
 * The body of ONE class member, bounded at its own closing brace.
 *
 * The bound is the first line that is exactly two-space-indented `}`, which is a class
 * member's closing brace in this repo's formatting. Every deeper brace is indented further, so
 * a nested arrow, object literal or `try` block cannot end the slice early.
 *
 * @param {string} source the file's text
 * @param {string} signature the member signature exactly as authored, INCLUDING its opening
 *   brace — e.g. `_gateBulkTargets(targets, actorId) {`. A bare name would match a call site
 *   as readily as the declaration.
 * @param {string} [label] what the source is, for the failure message
 * @returns {string} the member's own text, closing brace included
 * @throws {Error} when the signature is not found, or has no closing brace — either means the
 *   pin is now vacuous, which must fail loudly rather than assert on `''`.
 */
export function classMemberSource(source, signature, label = 'the source') {
  return sliceToCloser(
    source,
    signature,
    '\n  }',
    `${label} declares no \`${signature}\``,
    `\`${signature}\` has no member-level closing brace`
  );
}

/**
 * The body of ONE module-level function declaration, bounded at its own closing brace.
 *
 * Located by NAME, because a module function's parameter list carries defaults and destructured
 * shapes that a caller would otherwise have to restate character-for-character. The name is
 * still unambiguous: it is searched for as `function <name>(`, which a call site cannot match.
 * An `export` prefix is outside the slice and does not matter.
 *
 * @param {string} source the file's text
 * @param {string} name the declared function name
 * @param {string} [label] what the source is, for the failure message
 * @returns {string} the function's own text, closing brace included
 * @throws {Error} when no such declaration exists, or it has no closing brace
 */
export function moduleFunctionSource(source, name, label = 'the source') {
  return sliceToCloser(
    source,
    `function ${name}(`,
    '\n}',
    `${label} declares no \`function ${name}\``,
    `\`function ${name}\` has no module-level closing brace`
  );
}

/**
 * BOUNDED slices of production source, for the suites that assert against production TEXT. Bounding
 * is the point, and it is the whole reason this module exists rather than an `indexOf`/`slice` pair
 * at each call site.
 */

/**
 * Slice from a located start to the first line that is exactly `closer`.
 *
 * @param {string} locator the exact text the slice starts at
 * @param {string} closer the closing line, indentation included, e.g. `'\n }'`
 * @param {string} missing the error message for an unresolvable locator
 * @param {string} unclosed the error message for a slice with no closing line
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
 * @param {string} source the file's text
 * @param {string} signature the member signature exactly as authored, INCLUDING its opening brace —
 * e.g. `_gateBulkTargets(targets, actorId) {`. A bare name would match a call site as readily as
 * the declaration.
 * @param {string} [label] what the source is, for the failure message
 * @returns {string} the member's own text, closing brace included
 * @throws {Error} when the signature is not found, or has no closing brace — either means the pin
 * is now vacuous, which must fail loudly rather than assert on `''`.
 */
export function classMemberSource(source, signature, label = 'the source') {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`${label} declares no \`${signature}\``);
  // A class member closes on `\n  }` and an object-literal slice member on `\n  },` (issue 1715);
  // the comma is dropped so both spellings hand back the same text to every pin downstream.
  const plain = source.indexOf('\n  }\n', start);
  const listed = source.indexOf('\n  },\n', start);
  const closers = [plain, listed].filter((index) => index >= 0);
  const end = closers.length === 0 ? -1 : Math.min(...closers);
  if (end < 0) throw new Error(`\`${signature}\` has no member-level closing brace`);
  return source.slice(start, end + '\n  }'.length);
}

/**
 * The body of ONE module-level function declaration, bounded at its own closing brace.
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

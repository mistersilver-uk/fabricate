/**
 * Pipe-table reading and re-emission for Markdown, without the column padding.
 *
 * `DOMAIN.md` was 827 KB, of which 441 KB was spaces: every table cell padded to its column's
 * width so the pipes line up in a monospace editor. That alignment is not free — it is loaded
 * into context before any source file is read (issue #1661) — and it is not enforced either:
 * `.markdownlint-cli2.jsonc` turns `MD060` off precisely because pipe alignment is "impractical to
 * maintain by hand".
 *
 * THE ONLY HARD PART IS FINDING THE CELL BOUNDARIES, and a naive `line.split('|')` gets it wrong
 * in a way that DELETES CONTENT rather than failing. `DOMAIN.md:217` carries
 * `` `'success' \| 'failure' \| 'none'` `` — two ESCAPED pipes inside a code span, which are cell
 * text, not separators. Splitting on them turns a four-column row into six, and markdownlint's
 * `MD056` then reports "extra data will be missing" — which is exactly what happened on the first
 * attempt at this transform. So `splitRow` splits on UNESCAPED pipes only, and
 * `tests/domain-table-reflow.test.js` drives it against that shape.
 */

/** Whether the character at `index` is escaped by an odd run of backslashes before it. */
function isEscaped(line, index) {
  let backslashes = 0;
  for (let scan = index - 1; scan >= 0 && line[scan] === String.fromCodePoint(92); scan -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

/**
 * Whether `line` is a pipe-table row: it opens and closes with an unescaped `|`.
 *
 * Leading whitespace is allowed and preserved by `reflowTables`; a trailing `|` that is escaped
 * is not a closing delimiter, so such a line is left alone rather than mangled.
 */
export function isTableRow(line) {
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  return !isEscaped(trimmed, trimmed.length - 1);
}

/**
 * The cells of one pipe-table row, trimmed, with escaped pipes left intact inside them.
 *
 * @param {string} line a line for which `isTableRow` is true
 * @returns {string[]} the cell contents, outer delimiters dropped
 */
export function splitRow(line) {
  const trimmed = line.trim();
  const cells = [];
  let current = '';
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    if (trimmed[index] === '|' && !isEscaped(trimmed, index)) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += trimmed[index];
  }
  cells.push(current.trim());
  return cells;
}

/** Whether every cell of `row` is a `---`, `:---`, `---:` or `:---:` delimiter. */
export function isDelimiterRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/u.test(cell));
}

/**
 * Re-emit every pipe table in `text` with one space of padding per cell.
 *
 * A delimiter row is normalised to `---`, keeping any alignment colons: its only job is to declare
 * the column count and alignment, and a run of thirty dashes carries no more of either than three.
 * Everything that is not a table row is returned byte-for-byte.
 */
export function reflowTables(text) {
  return String(text)
    .split('\n')
    .map((line) => {
      if (!isTableRow(line)) return line;
      const indent = line.slice(0, line.length - line.trimStart().length);
      const cells = splitRow(line);
      const emitted = isDelimiterRow(cells)
        ? cells.map(
            (cell) => `${cell.startsWith(':') ? ':' : ''}---${cell.endsWith(':') ? ':' : ''}`
          )
        : cells;
      return `${indent}| ${emitted.join(' | ')} |`;
    })
    .join('\n');
}

/** Table rows in `text` that still carry column padding, as `{ line, number }`. */
export function paddedRows(text) {
  return String(text)
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => isTableRow(line) && reflowTables(line) !== line);
}

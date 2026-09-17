/** Pipe-table reading and re-emission for Markdown, without the column padding. */

/** Whether the character at `index` is escaped by an odd run of backslashes before it. */
function isEscaped(line, index) {
  let backslashes = 0;
  for (let scan = index - 1; scan >= 0 && line[scan] === String.fromCodePoint(92); scan -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

/** Whether `line` is a pipe-table row: it opens and closes with an unescaped `|`. */
export function isTableRow(line) {
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  return !isEscaped(trimmed, trimmed.length - 1);
}

/** The cells of one pipe-table row, trimmed, with escaped pipes left intact inside them. */
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

/** Whether `line` carries any cell content at all. */
function hasContent(line) {
  return splitRow(line).some((cell) => cell.length > 0);
}

/** Whether every cell of `row` is a `---`, `:---`, `---:` or `:---:` delimiter. */
export function isDelimiterRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/u.test(cell));
}

/** Re-emit every pipe table in `text` with one space of padding per cell. */
export function reflowTables(text) {
  let inFence = false;
  return String(text)
    .split(/\r?\n/u)
    .map((line) => {
      // A fence is verbatim, and that is not a nicety.
      if (/^\s*(?:```|~~~)/u.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !isTableRow(line) || !hasContent(line)) return line;
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

/**
 * Lines of `text` the transform would change, as `{ line, number }`.
 *
 * Reflowed as ONE document rather than line by line, so the fence state in `reflowTables` applies.
 * A per-line `reflowTables(line)` would report a fenced example table as padded, which is the same
 * defect from the other side.
 */
export function paddedRows(text) {
  const before = String(text).split(/\r?\n/u);
  const after = reflowTables(text).split('\n');
  return before
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line, number }) => line !== after[number - 1]);
}

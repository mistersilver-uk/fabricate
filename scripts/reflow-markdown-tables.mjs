/**
 * `npm run format:tables -- <file>…` — re-emit a Markdown file's pipe tables without column padding.
 *
 * The gate in `tests/domain-table-reflow.test.js` reports which rows drifted; this is what fixes
 * them. Without it the failure message would name a property and no way to satisfy it, which is
 * how a gate becomes something people work around rather than run — the sibling ledger gates in
 * this repository all name their regenerator, and this one now does too.
 *
 * Prints what it changed and rewrites in place. With no argument it does `DOMAIN.md`, the file the
 * gate actually guards.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { paddedRows, reflowTables } from './lib/markdownTables.js';

const files = process.argv.slice(2);
const targets = files.length > 0 ? files : ['DOMAIN.md'];

for (const file of targets) {
  const before = readFileSync(file, 'utf8');
  const drifted = paddedRows(before);
  if (drifted.length === 0) {
    console.log(`${file}: already reflowed`);
    continue;
  }
  const after = reflowTables(before);
  writeFileSync(file, after);
  console.log(
    `${file}: reflowed ${drifted.length} row(s), ` +
      `${Math.round(Buffer.byteLength(before, 'utf8') / 1024)} KB -> ` +
      `${Math.round(Buffer.byteLength(after, 'utf8') / 1024)} KB`
  );
}

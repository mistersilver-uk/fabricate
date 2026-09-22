/**
 * The module entry and the `src/bootstrap/` modules it was split into (issue 1715), read once for
 * the whole test run. Prefer `entryModuleSource('src/bootstrap/<module>.js')` — a pin keyed to the
 * module that holds it cannot be satisfied by dead text somewhere else in the tree.
 */
import { resolve } from 'node:path';

import { byCodePoint } from './ratchetBaseline.js';
import { collectSources, repoRoot } from './sourceScan.js';

const isEntryFile = (file) => file.startsWith('src/bootstrap/') || file === 'src/main.js';

const ENTRY_SOURCES = Object.fromEntries(
  Object.entries(collectSources(resolve(repoRoot, 'src'), { extensions: ['.js'] })).filter(
    ([file]) => isEntryFile(file)
  )
);

/** `{ 'src/bootstrap/hooks.js': '…', 'src/main.js': '…' }`, every file of the module entry. */
export const entrySources = ENTRY_SOURCES;

/** One module's text, throwing rather than answering `undefined` for a path that moved. */
export function entryModuleSource(file) {
  const text = ENTRY_SOURCES[file];
  if (text === undefined) {
    throw new Error(`${file} is not part of the module entry; the pin keyed to it is vacuous`);
  }
  return text;
}

/**
 * Every file joined, slices first and `src/main.js` last. Only for a reader whose pins genuinely
 * span most of the entry; anything narrower keys its own module.
 */
export const FABRICATE_ENTRY_SOURCE = Object.keys(ENTRY_SOURCES)
  .sort(byCodePoint)
  .map((file) => ENTRY_SOURCES[file])
  .join('\n');

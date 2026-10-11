/**
 * The ratchet engine's one logical module sheet (issue 1711): `styles/fabricate.css` and every
 * `styles/fabricate-*.css` are one path, whose text on either side is the loader's joined text.
 * No partial path is ever a key; a virtual line is reported at its partial.
 */
import {
  STYLESHEET_ENTRY,
  STYLESHEET_PART_PATTERN,
  locateStylesheetLine,
  readStylesheet,
} from '../../scripts/lib/stylesheetSource.js';

import { byCodePoint } from './codePointOrder.js';

const isPart = (file) => STYLESHEET_PART_PATTERN.test(file);
const isSheet = (file) => file === STYLESHEET_ENTRY || isPart(file);

/** `files` with every partial dropped, the entry standing for them. */
export const logicalFiles = (files) => files.filter((file) => !isPart(file));

/**
 * `changedPaths`' result with the sheet folded into its entry: a rename to or from any sheet path
 * becomes a removal plus an addition, and a change to any partial is a change to the entry.
 */
export function logicalChanges(changes) {
  const touched = [...changes.changed, ...changes.removed, ...changes.renames.values()];
  if (!touched.some(isSheet)) return changes;
  const changed = new Set(changes.changed);
  const added = new Set(changes.added);
  const removed = new Set(changes.removed);
  const renames = new Map();
  for (const [to, from] of changes.renames) {
    if (isSheet(to) || isSheet(from)) {
      added.add(to);
      removed.add(from);
    } else renames.set(to, from);
  }
  if (removed.has(STYLESHEET_ENTRY)) changed.delete(STYLESHEET_ENTRY);
  else changed.add(STYLESHEET_ENTRY);
  const sorted = (set) => logicalFiles([...set]).sort(byCodePoint);
  return { changed: sorted(changed), added: sorted(added), removed: sorted(removed), renames };
}

/** A side's reader over logical paths: the entry is the joined text, and a partial is absent. */
export function logicalReader(readFile) {
  let joined = null;
  return (file) => {
    if (isPart(file)) return undefined;
    if (file !== STYLESHEET_ENTRY) return readFile(file);
    joined ??= { text: readStylesheet(readFile) };
    return joined.text;
  };
}

/** `file:line` for a logical site, naming the partial that holds a line of the sheet. */
export function physicalSite(file, line, readFile) {
  if (file !== STYLESHEET_ENTRY) return `${file}:${line}`;
  const site = locateStylesheetLine(line, readFile);
  return `${site.file}:${site.line}`;
}

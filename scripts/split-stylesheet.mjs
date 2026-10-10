#!/usr/bin/env node
/**
 * Cuts this checkout's module sheet into the `STYLESHEET_CUT` partials under `styles/`, read
 * through the loader so a re-cut of a split sheet is the same cut. An entry that already imports
 * the cut's partials is left as it is, comments included; `--check` only prints the cut.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { STYLESHEET_CUT, cutStylesheet, stylesheetEntry } from './lib/stylesheetCut.js';
import {
  STYLESHEET_ENTRY,
  checkoutReader,
  readStylesheet,
  stylesheetSources,
} from './lib/stylesheetSource.js';

const { values } = parseArgs({ options: { check: { type: 'boolean' } } });
const root = path.resolve(import.meta.dirname, '..');
const read = checkoutReader(root);

const imported = stylesheetSources(read).parts.map(({ file }) => file);
const cut = STYLESHEET_CUT.map(({ partial }) => `styles/${partial}`);
if (imported.length > 0 && imported.join('\n') !== cut.join('\n')) {
  throw new Error(`${STYLESHEET_ENTRY} imports other partials than the cut; reconcile it by hand`);
}
const text = readStylesheet(read);
if (text === undefined) throw new Error(`${root} holds no ${STYLESHEET_ENTRY}`);
const parts = cutStylesheet(text);
for (const [at, { partial, startLine, text: part }] of parts.entries()) {
  const lines = part.split('\n').length - 1;
  process.stdout.write(`${partial}\t${startLine}-${startLine + lines - 1}\t${lines}\n`);
  if (!values.check) writeFileSync(path.join(root, cut[at]), part);
}
if (!values.check && imported.length === 0) {
  writeFileSync(path.join(root, STYLESHEET_ENTRY), stylesheetEntry(parts));
}

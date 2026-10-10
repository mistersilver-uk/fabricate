#!/usr/bin/env node
/**
 * Cuts the module sheet into the `STYLESHEET_CUT` partials and writes them, with an entry importing
 * them, into `--out` (default `styles/` of the checkout at `--root`). It reads the sheet through the
 * loader, so a re-cut of an already split sheet is the same cut.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { cutStylesheet, stylesheetEntry } from './lib/stylesheetCut.js';
import { checkoutReader, readStylesheet } from './lib/stylesheetSource.js';

const { values } = parseArgs({
  options: { root: { type: 'string' }, out: { type: 'string' }, check: { type: 'boolean' } },
});
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..'));
const out = path.resolve(values.out ?? path.join(root, 'styles'));

const text = readStylesheet(checkoutReader(root));
if (text === undefined) throw new Error(`${root} holds no styles/fabricate.css`);
const parts = cutStylesheet(text);
if (!values.check) {
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'fabricate.css'), stylesheetEntry(parts));
}
for (const { partial, startLine, text: part } of parts) {
  const lines = part.split('\n').length - 1;
  process.stdout.write(`${partial}\t${startLine}-${startLine + lines - 1}\t${lines}\n`);
  if (!values.check) writeFileSync(path.join(out, partial), part);
}

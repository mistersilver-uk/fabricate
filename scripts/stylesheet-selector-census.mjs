#!/usr/bin/env node
/** Prints the duplicate-selector census of a stylesheet. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { duplicateSelectorCensus, formatCensusReport } from './lib/stylesheetSelectorCensus.js';
import { STYLESHEET_ENTRY, readStylesheet } from './lib/stylesheetSource.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sheets = process.argv.slice(2);
const targets = sheets.length > 0 ? sheets : [STYLESHEET_ENTRY];

for (const target of targets) {
  const absolute = path.isAbsolute(target) ? target : path.join(repoRoot, target);
  const relative = path.relative(repoRoot, absolute);
  const isModuleSheet = relative.split(path.sep).join('/') === STYLESHEET_ENTRY;
  const census = duplicateSelectorCensus(
    isModuleSheet ? readStylesheet() : readFileSync(absolute, 'utf8')
  );
  process.stdout.write(formatCensusReport(census, relative));
}

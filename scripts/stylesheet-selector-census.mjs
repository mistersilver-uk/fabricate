#!/usr/bin/env node
/**
 * Prints the duplicate-selector census of a stylesheet.
 *
 * A thin shell over `scripts/lib/stylesheetSelectorCensus.js`: it reads a file and prints the
 * report, and owns no part of the predicate. The measurement it publishes — which selectors
 * repeat, under which at-context, and whether any repeated selector LIST could merge without
 * moving a pixel — is the evidence issue 1501 pastes into its PR, and the same library backs the
 * gate that keeps the figure from drifting afterwards, so a report and a gate can never disagree.
 *
 *   node scripts/stylesheet-selector-census.mjs [stylesheet…]
 *
 * With no argument it censuses `styles/fabricate.css`, the sheet the issue is about.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { duplicateSelectorCensus, formatCensusReport } from './lib/stylesheetSelectorCensus.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sheets = process.argv.slice(2);
const targets = sheets.length > 0 ? sheets : ['styles/fabricate.css'];

for (const target of targets) {
  const absolute = path.isAbsolute(target) ? target : path.join(repoRoot, target);
  const census = duplicateSelectorCensus(readFileSync(absolute, 'utf8'));
  process.stdout.write(formatCensusReport(census, path.relative(repoRoot, absolute)));
}

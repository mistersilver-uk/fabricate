/*
 * Ungated View Lab coverage REPORT (issue 823, Task 4).
 *
 * Lives in the UNGATED lab lane (`tests/view-lab/`, excluded from the `npm test`
 * glob) so a pilot-subset registry NEVER breaks `# fail 0`. Prints, in human-readable
 * form, which legacy `VIEW_RECIPES` surfaces the new registry covers and which are
 * still gaps — the same data the machine-readable `coverage-manifest.json` carries for
 * #824. Run with: `node tests/view-lab/coverage.report.mjs`.
 */
import { resolve } from 'node:path';

import { buildCoverageManifest, collectRepoFiles } from '../../scripts/lib/viewLabCoverage.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const manifest = buildCoverageManifest({ repoFiles: collectRepoFiles(repoRoot) });

console.log(`View Lab coverage report (registry vs legacy VIEW_RECIPES)`);
console.log(`  legacy surfaces: ${manifest.legacyViewCount}`);
console.log(`  covered:         ${manifest.coveredCount}`);
console.log(`  gaps:            ${manifest.gapCount}`);
console.log(`  fullCoverage:    ${manifest.fullCoverage} (#824 gates its flip + deletion on true)`);
console.log('');
console.log('Covered legacy surfaces:');
for (const entry of manifest.covered) console.log(`  + ${entry.legacyId} -> ${entry.cases.join(', ')}`);
console.log('');
console.log('Remaining gaps (migrate in the fuller increment before #824 flips the gate):');
for (const gap of manifest.gaps) console.log(`  - ${gap.legacyId}: ${gap.label}`);

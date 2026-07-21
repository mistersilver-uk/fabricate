/**
 * View Lab coverage machinery (issue 823, Task 4).
 *
 * Compares the new canonical view-case registry (`viewLabCases.js`) to the legacy
 * `VIEW_RECIPES` map and emits a machine-readable coverage manifest. Because #823
 * ships a PILOT SUBSET, this is deliberately NOT a gated hard-equality check (that
 * would fail `# fail 0`). It is consumed as an UNGATED report and as the manifest
 * that #824 gates its CI-flip + old-registry deletion on: #824 proceeds only once
 * this manifest reports `fullCoverage: true`, so nothing strands.
 *
 * Coverage model (surface-level, not id-equality): for each legacy recipe, take a
 * representative repo file that legacy recipe matches, then ask the new registry
 * which cases that file selects. A legacy surface is COVERED when the new registry
 * selects at least one NON-fallback case for it; otherwise it is a GAP.
 */

import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

import { VIEW_RECIPES } from '../ui-pr-screenshot-evidence.mjs';
import { FALLBACK_CASE_ID, mapChangedFilesToCases } from './viewLabCases.js';

export const COVERAGE_SCHEMA_VERSION = 1;

/** Walk `src/` + `styles/` under `root`, returning forward-slash repo-relative paths. */
export function collectRepoFiles(root) {
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  const files = [];
  for (const top of ['src', 'styles']) {
    try {
      files.push(...walk(join(root, top)));
    } catch {
      // A missing top-level dir is not fatal for coverage computation.
    }
  }
  return files.map((file) => file.slice(root.length + 1).split(sep).join('/'));
}

/**
 * Compute coverage of the legacy `VIEW_RECIPES` surfaces by the new registry.
 *
 * @param {object} args
 * @param {string[]} args.repoFiles forward-slash repo-relative file list
 * @returns {{ covered: object[], gaps: object[] }}
 */
export function computeCoverage({ repoFiles }) {
  const covered = [];
  const gaps = [];
  for (const recipe of VIEW_RECIPES) {
    const sample = repoFiles.find((file) => recipe.matches.some((pattern) => pattern.test(file))) || null;
    const selected = sample ? mapChangedFilesToCases([sample]) : [];
    const nonFallback = selected.filter((viewCase) => viewCase.id !== FALLBACK_CASE_ID);
    if (nonFallback.length > 0) {
      covered.push({ legacyId: recipe.id, label: recipe.label, sample, cases: nonFallback.map((c) => c.id) });
    } else {
      gaps.push({
        legacyId: recipe.id,
        label: recipe.label,
        sample,
        fallbackOnly: selected.length > 0,
      });
    }
  }
  return { covered, gaps };
}

/**
 * Build the coverage manifest handed to #824. `fullCoverage` is the boolean #824
 * gates its old-registry deletion on.
 */
export function buildCoverageManifest({ repoFiles, generatedAt = null } = {}) {
  const { covered, gaps } = computeCoverage({ repoFiles });
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    note: 'View Lab pilot coverage vs legacy VIEW_RECIPES. #824 gates its CI-flip + VIEW_RECIPES deletion on fullCoverage:true.',
    generatedAt,
    legacyViewCount: VIEW_RECIPES.length,
    coveredCount: covered.length,
    gapCount: gaps.length,
    fullCoverage: gaps.length === 0,
    covered,
    gaps,
  };
}

/*
 * View Lab artifact manifest + coverage machinery (issue 823, Design H + Task 4).
 * Globbed top-level test so `npm test` runs it and its total rises.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  ARTIFACT_SCHEMA_VERSION,
  buildManifest,
  fileForId,
  validateManifest,
} from '../scripts/lib/viewLabArtifact.js';
import { caseIds } from '../scripts/lib/viewLabCases.js';
import { buildCoverageManifest, collectRepoFiles } from '../scripts/lib/viewLabCoverage.js';

const repoRoot = resolve(import.meta.dirname, '..');

test('buildManifest stamps the schema version and normalizes fields', () => {
  const manifest = buildManifest({
    repository: 'owner/repo',
    prNumber: 823,
    headSha: 'deadbeef',
    views: [{ id: 'global-ui', label: 'Global UI', file: 'global-ui.png', sha256: 'x' }],
  });
  assert.equal(manifest.schemaVersion, ARTIFACT_SCHEMA_VERSION);
  assert.equal(manifest.prNumber, '823');
  assert.equal(manifest.views[0].file, fileForId('global-ui'));
});

test('validateManifest binds file === `${id}.png` and rejects a mismatched pairing', () => {
  const allowedIds = new Set(caseIds());
  const good = validateManifest(
    { schemaVersion: ARTIFACT_SCHEMA_VERSION, views: [{ id: 'global-ui', label: 'g', file: 'global-ui.png', sha256: 'aa' }] },
    { allowedIds },
  );
  assert.equal(good.ok, true, good.errors.join('; '));

  // A known id paired with the WRONG known file is rejected (Design H hardening #2).
  const swapped = validateManifest(
    { schemaVersion: ARTIFACT_SCHEMA_VERSION, views: [{ id: 'global-ui', label: 'g', file: 'manager-status-pill.png', sha256: 'aa' }] },
    { allowedIds },
  );
  assert.equal(swapped.ok, false);
  assert.ok(swapped.errors.some((e) => /must be 'global-ui\.png'/.test(e)));
});

test('validateManifest rejects an unregistered id and a bad schema version', () => {
  const allowedIds = new Set(caseIds());
  const unregistered = validateManifest(
    { schemaVersion: ARTIFACT_SCHEMA_VERSION, views: [{ id: 'not-a-case', label: 'x', file: 'not-a-case.png', sha256: 'aa' }] },
    { allowedIds },
  );
  assert.equal(unregistered.ok, false);
  assert.ok(unregistered.errors.some((e) => /not a registered case/.test(e)));

  const badSchema = validateManifest({ schemaVersion: 999, views: [] }, { allowedIds });
  assert.equal(badSchema.ok, false);
});

test('coverage manifest reports pilot coverage vs legacy VIEW_RECIPES without gating equality', () => {
  const manifest = buildCoverageManifest({ repoFiles: collectRepoFiles(repoRoot) });
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.legacyViewCount > 0, 'legacy view count is populated');
  assert.equal(manifest.coveredCount + manifest.gapCount, manifest.legacyViewCount);
  // #824 gates its flip + deletion on fullCoverage; a pilot subset is legitimately
  // NOT full — this is a REPORT, never a hard-equality gate.
  assert.equal(manifest.fullCoverage, manifest.gapCount === 0);
  assert.ok(manifest.coveredCount > 0, 'the pilot covers at least one legacy surface');
});

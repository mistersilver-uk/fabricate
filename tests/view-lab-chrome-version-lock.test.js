/**
 * The smoke and the View Lab must name the same Foundry build (issue #957).
 *
 * The lab has no independent source of Foundry: `discoverArchive()` reads whatever archive the
 * smoke's container downloaded into `.foundry-e2e/cache/`. That coupling is deliberate and right —
 * the live smoke is the fidelity authority, and drawing frames from the same build is what makes a
 * lab frame and a smoke frame comparable at all. What was missing was anything that NOTICED when
 * the two came apart, and they came apart by a whole major: the smoke sat on `felddy/foundryvtt:13`
 * while `module.json` declared `verified: "14"`, so all 150 published frames depicted a Foundry
 * older than the one Fabricate claimed to support, and nothing said so.
 *
 * These assertions run everywhere and never skip. They read only tracked files — the compose pin
 * and the committed provenance record — so a machine with no Foundry licence and no harvest still
 * catches a bump that moved one and not the other.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readProvenance } from '../scripts/lib/foundryChromeCache.js';
import {
  COMPOSE_FILENAME,
  foundryVersionFromTag,
  readPinnedFoundryImage,
} from '../scripts/lib/foundryImagePin.js';
import { FOUNDRY_CHROME_SPEC } from '../scripts/lib/foundryChromeSpec.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_PATH = join(ROOT, COMPOSE_FILENAME);

test('the smoke image is pinned to an exact Foundry build, not a floating major', () => {
  // A floating `:14` would let Foundry upgrade underneath the harness, which reds the provenance
  // gate on whichever unrelated pull request happens to run next. It also defeats the CI
  // `foundry-binary-*` cache key, which hashes this file and therefore cannot tell two builds of
  // one floating tag apart.
  const { tag, image } = readPinnedFoundryImage(COMPOSE_PATH);
  assert.ok(
    foundryVersionFromTag(tag),
    `${COMPOSE_FILENAME} pins "${image}", whose tag names no exact Foundry build. Pin ` +
      'felddy/foundryvtt:<major>.<build>.'
  );
});

test('the committed chrome provenance names the Foundry build the smoke boots', () => {
  const { tag, image } = readPinnedFoundryImage(COMPOSE_PATH);
  const pinnedVersion = foundryVersionFromTag(tag);
  const provenance = readProvenance(ROOT);
  assert.ok(provenance, 'tests/view-lab/chrome-provenance.json is missing');
  assert.equal(
    provenance.foundryVersion,
    pinnedVersion,
    `the smoke boots ${image} (Foundry ${pinnedVersion}) but the View Lab chrome was harvested from ` +
      `Foundry ${provenance.foundryVersion}.\n` +
      'The lab harvests the archive the smoke downloads, so these cannot legitimately differ. ' +
      'Re-harvest and re-attest:\n' +
      '  npm run test:foundry:up\n' +
      '  npm run viewlab:chrome:harvest -- --force --write-provenance\n' +
      'then re-read client/applications/api/application.mjs and confirm ' +
      'scripts/lib/foundryChromeSpec.js still transcribes it.'
  );
});

test('the frame transcription names the same Foundry major as the pinned image', () => {
  // `coreMajor` is what a reviewer reads to decide whether the hand transcription in
  // `foundryChromeSpec.js` is current. A stale one is a claim, not a comment.
  const { tag } = readPinnedFoundryImage(COMPOSE_PATH);
  const [major] = foundryVersionFromTag(tag).split('.');
  assert.equal(
    FOUNDRY_CHROME_SPEC.coreMajor,
    Number(major),
    'FOUNDRY_CHROME_SPEC.coreMajor does not match the pinned image major'
  );
});

test('the smoke world fixture targets the pinned Foundry build', () => {
  // The fixture is re-copied over the runtime data directory on every `test:foundry:up`
  // (scripts/foundry-setup-data.mjs), so an in-container migration is discarded next run and this
  // file is the only place the world's core version can be fixed. A world a major behind core meets
  // Foundry's migration prompt, which the smoke has no handler for — it surfaces two minutes later
  // as a launch timeout rather than as anything mentioning migration.
  const worldPath = join(ROOT, '.foundry-e2e', 'worlds', 'fabricate-smoke-ci', 'world.json');
  if (!existsSync(worldPath)) return; // not checked out in every context
  const world = JSON.parse(readFileSync(worldPath, 'utf8'));
  const pinnedVersion = foundryVersionFromTag(readPinnedFoundryImage(COMPOSE_PATH).tag);
  assert.equal(
    world.coreVersion,
    pinnedVersion,
    `the smoke world declares coreVersion ${world.coreVersion} but the harness boots ${pinnedVersion}`
  );
  assert.equal(
    world.compatibility.verified,
    pinnedVersion.split('.')[0],
    'the smoke world is not verified for the Foundry major the harness boots'
  );
});

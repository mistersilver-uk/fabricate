import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const smokeRunSource = await readFile(join(root, 'scripts', 'foundry-test-run.mjs'), 'utf8');
const releaseSource = await readFile(join(root, 'scripts', 'release.js'), 'utf8');

test('Foundry smoke actors are imported from the dnd5e Starter Heroes compendium', () => {
  assert.match(
    smokeRunSource,
    /game\.packs\.get\('dnd5e\.heroes'\)/,
    'smoke runner should source actors from the dnd5e Starter Heroes compendium (dnd5e.heroes)'
  );
  assert.match(
    smokeRunSource,
    /game\.actors\.importFromCompendium\(heroPack, entry\._id\)/,
    'smoke runner should import each hero into the world via importFromCompendium'
  );
  assert.match(
    smokeRunSource,
    /actor\?\.type === 'character'/,
    'only character-type heroes should be kept as gathering/crafting actors'
  );
  assert.match(
    smokeRunSource,
    /'flags\.fabricate\.smokeSeed': true/,
    'imported heroes should be tagged so re-imports stay idempotent across reruns'
  );
});

test('the smoke harness no longer ships or reads bundled actor portraits', async () => {
  assert.doesNotMatch(
    smokeRunSource,
    /assets\/img\/actors/,
    'smoke runner should not reference the removed actor portrait assets'
  );
  assert.doesNotMatch(
    smokeRunSource,
    /loadSmokeActorFixtures/,
    'the bundled-portrait fixture loader should be gone'
  );
  await assert.rejects(
    access(join(root, 'assets', 'img', 'actors')),
    'assets/img/actors must be removed from the repo (no bundled AI portraits)'
  );
});

// Issue 643 §4b: the recipe editor's context rail is MODE-CONDITIONAL. Its restricted
// (access) branch is only reachable in a `visibilityMode: 'restricted'` system whose
// recipe actually carries a grant — and the smoke world seeded none of that, so a run
// would silently capture the Books & Scrolls branch instead and the PR evidence would
// show the wrong rail. These assertions are the guard: they fail if the fixture is
// dropped, and the failure names what went missing. Issue 796: the grant also seeds four
// extra grant-only characters so the Access tab's three-column grid is captured populated.
test('the smoke world seeds a restricted-visibility system so the recipe access rail is screenshottable', () => {
  assert.match(
    smokeRunSource,
    /updateSystem\(restrictedSystemId, \{ visibilityMode: 'restricted' \}\)/,
    'the smoke world must seed a visibilityMode:"restricted" crafting system'
  );
  assert.match(
    smokeRunSource,
    /access: \{\s*characterIds: \[crafterId, travelMemberId, \.\.\.accessGrantActors\.map\(\(a\) => a\.id\)\]\.filter\(Boolean\),\s*playerIds: \[gathererUserId\]\.filter\(Boolean\)\s*\}/,
    'the restricted recipe must carry an access grant naming BOTH characters and a player'
  );
  assert.match(
    smokeRunSource,
    /const accessGrantActors = await Actor\.createDocuments\(/,
    'the access grant must seed extra grant-only characters so the three-column grid is captured populated'
  );
  assert.match(
    smokeRunSource,
    /observerUser\.update\(\{ character: travelMember\.id \}\)/,
    'a seeded PLAYER user must have an assigned character, or the rail\'s assigned-controller route has no fixture'
  );
  assert.match(
    smokeRunSource,
    /label: 'manager-recipe-edit-access-rail'/,
    'Phase D0 must capture the restricted rail'
  );
});

test('the restricted-rail capture reuses the shared smoke helpers instead of a fresh open/assert span', () => {
  const captureBlock = smokeRunSource.slice(
    smokeRunSource.indexOf("await openManagerRecipeEditor(page, craftingSetup.restrictedRecipeName);"),
    smokeRunSource.indexOf("label: 'manager-recipe-edit-access-rail'")
  );
  assert.ok(captureBlock.length > 0, 'expected to find the restricted-rail capture block');
  // SonarCloud measures duplication in scripts/** despite `sonar.cpd.exclusions`
  // (PR 527 failed on four near-identical open→wait→assert→screenshot spans), so a
  // new capture composes the existing helpers rather than re-inlining them.
  assert.doesNotMatch(
    captureBlock,
    /assertManagerLayoutStable\(|assertNoScreenshotOverlays\(|await screenshot\(page,/,
    'the restricted-rail capture should go through captureStableManagerView, not re-inline its steps'
  );
});

test('release build copies module assets into the Foundry module', () => {
  assert.match(
    releaseSource,
    /copyIfExists\(join\(ROOT, 'assets'\), join\(distDir, 'assets'\)\)/,
    'release build should copy module assets into dist'
  );
});

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

test('release build copies module assets into the Foundry module', () => {
  assert.match(
    releaseSource,
    /copyIfExists\(join\(ROOT, 'assets'\), join\(distDir, 'assets'\)\)/,
    'release build should copy module assets into dist'
  );
});

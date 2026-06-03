import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const smokeRunSource = await readFile(join(root, 'scripts', 'foundry-test-run.mjs'), 'utf8');
const releaseSource = await readFile(join(root, 'scripts', 'release.js'), 'utf8');

test('Foundry smoke actors are discovered from raster portrait assets', async () => {
  assert.match(
    smokeRunSource,
    /const SMOKE_ACTOR_ASSET_DIR = join\(ROOT, 'assets', 'img', 'actors'\);/,
    'smoke runner should use assets/img/actors as the actor fixture source'
  );
  assert.match(
    smokeRunSource,
    /const actorAssetFiles = \(await readdir\(SMOKE_ACTOR_ASSET_DIR\)\)/,
    'smoke runner should discover actor files from the fixture directory'
  );
  assert.match(
    smokeRunSource,
    /name: basename\(file, extname\(file\)\)/,
    'actor names should come from portrait filenames'
  );
  assert.match(
    smokeRunSource,
    /img: `modules\/fabricate\/assets\/img\/actors\/\$\{file\}`/,
    'actor image paths should point at the module actor portrait assets'
  );
  assert.match(
    smokeRunSource,
    /Actor\.createDocuments\(\s*smokeActorFixtures\.map/s,
    'Foundry actor creation should create one actor per discovered fixture'
  );
  assert.doesNotMatch(
    smokeRunSource,
    /icons\/svg\/(?:mystery-man|combat)\.svg/,
    'smoke actors should not use Foundry SVG placeholder portraits'
  );
});

test('actor portrait fixtures cover the representative smoke actors', async () => {
  const actorAssetDir = join(root, 'assets', 'img', 'actors');
  const allActorFiles = await readdir(actorAssetDir);
  assert.equal(
    allActorFiles.some(file => extname(file).toLowerCase() === '.svg'),
    false,
    'actor fixture directory should not rely on SVG portraits'
  );

  const actorFiles = allActorFiles
    .filter(file => ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en'));

  assert.ok(actorFiles.length >= 7, 'actor fixture directory should include the full representative actor set');

  const actorNames = actorFiles.map(file => basename(file, extname(file)));
  for (const expectedName of [
    'Alara the Alchemist',
    'Barek The Hunter',
    'Bromm the Blacksmith',
    'Mirelle the Herbalist',
    'Samira the Enchanter',
    'Tomas The Cook',
    'Zahra the Jeweller'
  ]) {
    assert.ok(actorNames.includes(expectedName), `actor portraits should include ${expectedName}`);
  }
});

test('release build copies actor portrait assets into the Foundry module', () => {
  assert.match(
    releaseSource,
    /copyIfExists\(join\(ROOT, 'assets'\), join\(distDir, 'assets'\)\)/,
    'release build should copy module assets so smoke actor portraits resolve in Foundry'
  );
});

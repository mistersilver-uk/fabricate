/**
 * The V13 arm must stay ENV-ONLY, and the world fixture must stay a single source of truth
 * (issue #1088).
 *
 * Two things could be broken by an innocent-looking edit, and neither would announce itself:
 *
 *  1. **Someone points the compose file at Foundry 13 to "run the V13 arm".** That reds
 *     `tests/view-lab-chrome-version-lock.test.js`, rotates the CI `foundry-binary-*` cache key
 *     (which hashes `docker-compose.foundry.yml`), and leaves the View Lab's harvested chrome
 *     attesting a build nothing boots. The arm is reachable through `FOUNDRY_IMAGE` precisely so
 *     that never has to happen, and this file asserts the separation rather than describing it.
 *  2. **Someone commits a second world fixture for the second arm.** Two fixtures drift, and the
 *     drift presents as a two-minute launch timeout naming nothing. The non-default arm's manifest
 *     is DERIVED from the committed one at setup time, so the derivation is what needs pinning —
 *     specifically that it is the identity function for the default arm, which is the only thing
 *     that makes "derived" and "committed" the same claim.
 *
 * These assertions read tracked files only — no Docker, no Foundry, no network — so they run
 * everywhere `npm test` runs.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPOSE_FILENAME,
  foundryVersionFromTag,
  readPinnedFoundryImage,
} from '../scripts/lib/foundryImagePin.js';
import {
  DEFAULT_SMOKE_ARM,
  SMOKE_ARM_ENV_VAR,
  SMOKE_ARM_IDS,
  deriveWorldManifest,
  normalizeSmokeArmName,
  readWorldFixture,
  resolveSmokeArm,
  resolveSmokeArmFromEnv,
  WORLD_FIXTURE_PATH,
} from '../scripts/lib/foundrySmokeArms.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_PATH = join(ROOT, COMPOSE_FILENAME);

/** The one place the compose pin is read, so this file cannot disagree with the harness. */
function composeImage() {
  return readPinnedFoundryImage(COMPOSE_PATH).image;
}

test('the compose file keeps its image overridable through $FOUNDRY_IMAGE', () => {
  // The `${FOUNDRY_IMAGE:-…}` substitution form is the entire mechanism by which a non-default arm
  // reaches Docker. Replacing it with a bare `image: felddy/foundryvtt:14.365` would still satisfy
  // the version-lock test while silently making every arm but the default unbootable.
  const composeText = readFileSync(COMPOSE_PATH, 'utf8');
  assert.match(
    composeText,
    /^[ \t]*image:[ \t]*"\$\{FOUNDRY_IMAGE:-[^}"]+}"[ \t]*$/m,
    `${COMPOSE_FILENAME} must keep its image as \${FOUNDRY_IMAGE:-<pin>} — that env override is how ` +
      'the V13 arm boots without touching the pin the View Lab version lock reads.'
  );
});

test('the default arm IS the compose pin, and no other arm is', () => {
  const pinned = composeImage();
  assert.equal(
    resolveSmokeArm(DEFAULT_SMOKE_ARM, { root: ROOT }).image,
    pinned,
    'the default smoke arm must read its image from the compose file, not restate it'
  );

  const others = SMOKE_ARM_IDS.filter((id) => id !== DEFAULT_SMOKE_ARM);
  assert.ok(others.length > 0, 'there is no non-default arm at all — this guard would be vacuous');
  for (const id of others) {
    assert.notEqual(
      resolveSmokeArm(id, { root: ROOT }).image,
      pinned,
      `the "${id}" arm names the compose pin, so it is not testing a different Foundry at all`
    );
  }
});

test('every arm names an exact Foundry build', () => {
  for (const id of SMOKE_ARM_IDS) {
    const arm = resolveSmokeArm(id, { root: ROOT });
    const tag = arm.image.slice(arm.image.lastIndexOf(':') + 1);
    assert.equal(
      foundryVersionFromTag(tag),
      arm.foundryVersion,
      `the "${id}" arm's image tag must name the exact build its cached release archive is named for`
    );
    assert.equal(
      Number(arm.foundryVersion.split('.', 1)[0]),
      arm.generation,
      `the "${id}" arm's declared generation must match the major its image boots`
    );
  }
});

test('each arm pins a game system verified for the generation it boots', () => {
  // dnd5e 5.3.3 declares verified "14"; 5.2.5 declares verified "13". An unverified system puts a
  // blocking modal in front of the world launch, which the harness has no handler for.
  const pinnedVersions = SMOKE_ARM_IDS.map((id) => {
    const arm = resolveSmokeArm(id, { root: ROOT });
    assert.ok(arm.systems.length > 0, `the "${id}" arm pins no game system`);
    for (const system of arm.systems) {
      assert.match(
        system.url,
        new RegExp(`release-${system.version.replaceAll('.', String.raw`\.`)}/`),
        `the "${id}" arm's ${system.id} URL does not name version ${system.version}`
      );
    }
    return arm.systems.map((system) => `${system.id}@${system.version}`).join(',');
  });
  assert.equal(
    new Set(pinnedVersions).size,
    pinnedVersions.length,
    'two arms pin the same system version, so one of them is running an unverified system'
  );
});

test('the derived world manifest is the identity function for the default arm', () => {
  // This is what makes ONE committed fixture legitimate. If the derivation ever stopped agreeing
  // with the committed file for the default arm, the runtime world and the file the version lock
  // reads would be different worlds.
  const fixture = readWorldFixture(ROOT);
  const derived = deriveWorldManifest(fixture, resolveSmokeArm(DEFAULT_SMOKE_ARM, { root: ROOT }));
  assert.deepEqual(
    derived,
    fixture,
    'deriving the DEFAULT arm\'s world manifest changed the committed fixture, so the runtime world ' +
      'no longer matches the one tests/view-lab-chrome-version-lock.test.js checks'
  );
});

test('the derived world manifest follows a non-default arm', () => {
  const fixture = readWorldFixture(ROOT);
  const nonDefaultArms = SMOKE_ARM_IDS.filter((armId) => armId !== DEFAULT_SMOKE_ARM);
  for (const id of nonDefaultArms) {
    const arm = resolveSmokeArm(id, { root: ROOT });
    const derived = deriveWorldManifest(fixture, arm);
    assert.equal(derived.coreVersion, arm.foundryVersion);
    assert.equal(derived.compatibility.minimum, String(arm.generation));
    assert.equal(derived.compatibility.verified, String(arm.generation));
    assert.equal(
      derived.systemVersion,
      arm.systems.find((system) => system.id === fixture.system).version,
      `the "${id}" arm's world must declare the system version that arm installs`
    );
    assert.equal(derived.id, fixture.id, 'the world id is what the launch selector matches on');
    assert.notEqual(
      derived.coreVersion,
      fixture.coreVersion,
      `the "${id}" arm derived the SAME core version as the default — the derivation is inert`
    );
  }
});

test('exactly one world fixture exists, and it is the one the version lock reads', () => {
  // The failure this closes is a SECOND fixture appearing beside the first, per arm. Only one
  // manifest may exist under the fixture directory; every other arm is served by the derivation
  // above. (Runtime worlds live under `.foundry-e2e/data/Data/worlds`, not here.)
  const fixturePath = join(ROOT, ...WORLD_FIXTURE_PATH);
  assert.ok(existsSync(fixturePath), `the committed world fixture is missing from ${fixturePath}`);

  const worldsDirectory = join(ROOT, WORLD_FIXTURE_PATH[0], WORLD_FIXTURE_PATH[1]);
  const worldDirectories = readdirSync(worldsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(worldsDirectory, entry.name, 'world.json')))
    .map((entry) => entry.name);
  assert.deepEqual(
    worldDirectories,
    [WORLD_FIXTURE_PATH[2]],
    'a second smoke world fixture has appeared. Arms derive their manifest from the one committed ' +
      'fixture (scripts/foundry-setup-data.mjs stamps the runtime copy); two fixtures drift, and ' +
      'the drift presents as a world-launch timeout naming nothing.'
  );
});

test('the compose pin, the default arm and the committed fixture name one Foundry build', () => {
  // The loop the version lock checks in halves, closed in one place: whatever the compose file
  // pins is what the default arm boots and what the committed world declares.
  const pinnedVersion = foundryVersionFromTag(readPinnedFoundryImage(COMPOSE_PATH).tag);
  assert.equal(resolveSmokeArm(DEFAULT_SMOKE_ARM, { root: ROOT }).foundryVersion, pinnedVersion);
  assert.equal(readWorldFixture(ROOT).coreVersion, pinnedVersion);
});

test('an unknown arm name is refused rather than defaulted', () => {
  assert.equal(normalizeSmokeArmName(undefined), DEFAULT_SMOKE_ARM);
  assert.equal(normalizeSmokeArmName(''), DEFAULT_SMOKE_ARM);
  assert.equal(normalizeSmokeArmName('13'), 'v13');
  assert.equal(normalizeSmokeArmName('V13'), 'v13');
  assert.throws(
    () => normalizeSmokeArmName('v12'),
    /unknown Foundry smoke arm/,
    'a typo must fail loudly: silently defaulting boots the arm you were trying NOT to run'
  );
});

test('the environment selects the arm, and defaults to the compose pin', () => {
  assert.equal(resolveSmokeArmFromEnv({}, { root: ROOT }).image, composeImage());
  assert.equal(
    resolveSmokeArmFromEnv({ [SMOKE_ARM_ENV_VAR]: 'v13' }, { root: ROOT }).id,
    'v13',
    `${SMOKE_ARM_ENV_VAR} must select the arm — it is the only channel the V13 run has`
  );
});

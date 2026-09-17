/** The Foundry generations the smoke harness can boot, and what each one needs (issue #1088). */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPOSE_FILENAME,
  foundryVersionFromTag,
  readPinnedFoundryImage,
} from './foundryImagePin.js';

/** Repository root, resolved from this module so callers need not pass it. */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The arm the harness boots when nothing selects one — the generation `module.json` verifies. */
export const DEFAULT_SMOKE_ARM = 'v14';

/** The environment variable that selects an arm for `up`, `setup-data` and `fetch-systems`. */
export const SMOKE_ARM_ENV_VAR = 'FOUNDRY_SMOKE_ARM';

/** The world fixture every arm derives its manifest from, relative to the repository root. */
export const WORLD_FIXTURE_PATH = ['.foundry-e2e', 'worlds', 'fabricate-smoke-ci', 'world.json'];

/** A dnd5e release, with its download URL derived rather than restated. */
function dnd5eRelease(version) {
  return Object.freeze({
    id: 'dnd5e',
    version,
    url: `https://github.com/foundryvtt/dnd5e/releases/download/release-${version}/dnd5e-release-${version}.zip`,
  });
}

/** The arms, keyed by id. */
const SMOKE_ARMS = Object.freeze({
  v14: Object.freeze({
    id: 'v14',
    generation: 14,
    image: null,
    system: dnd5eRelease('5.3.3'),
  }),
  v13: Object.freeze({
    id: 'v13',
    generation: 13,
    // felddy publishes `13.351` as well as the floating `13`; the exact build is pinned for the
    // same reason the compose file pins one — the cached release archive is named for the build,
    // so a floating tag can silently install a different Foundry than the cache holds.
    image: 'felddy/foundryvtt:13.351',
    system: dnd5eRelease('5.2.5'),
  }),
});

/** Every arm id, in declaration order. */
export const SMOKE_ARM_IDS = Object.freeze(Object.keys(SMOKE_ARMS));

/** Canonicalize an arm name. Accepts `v13`, `13`, `V13` and empty/absent (the default). */
export function normalizeSmokeArmName(name) {
  const raw = String(name ?? '')
    .trim()
    .toLowerCase();
  if (raw.length === 0) return DEFAULT_SMOKE_ARM;
  const candidate = raw.startsWith('v') ? raw : `v${raw}`;
  if (!Object.hasOwn(SMOKE_ARMS, candidate)) {
    throw new Error(
      `unknown Foundry smoke arm "${name}"; expected one of ${SMOKE_ARM_IDS.join(', ')}`
    );
  }
  return candidate;
}

/** Resolve one arm to everything the harness needs to boot it. */
export function resolveSmokeArm(name, { root = REPOSITORY_ROOT } = {}) {
  const id = normalizeSmokeArmName(name);
  const arm = SMOKE_ARMS[id];
  const isDefault = id === DEFAULT_SMOKE_ARM;
  const image = arm.image ?? readPinnedFoundryImage(join(root, COMPOSE_FILENAME)).image;
  const tag = image.slice(image.lastIndexOf(':') + 1);
  const foundryVersion = foundryVersionFromTag(tag);
  if (!foundryVersion) {
    throw new Error(
      `the "${id}" smoke arm names image "${image}", whose tag is no exact Foundry build. The ` +
        'cached release archive is named for the build, so a floating tag would install a Foundry ' +
        'the cache does not hold.'
    );
  }
  return {
    id,
    generation: arm.generation,
    isDefault,
    image,
    foundryVersion,
    systems: [arm.system],
  };
}

/** Resolve the arm an environment selects. */
export function resolveSmokeArmFromEnv(env = process.env, { root = REPOSITORY_ROOT } = {}) {
  return resolveSmokeArm(env[SMOKE_ARM_ENV_VAR], { root });
}

/** Stamp a world manifest for one arm. */
export function deriveWorldManifest(base, arm) {
  const generation = String(arm.generation);
  return {
    ...base,
    coreVersion: arm.foundryVersion,
    systemVersion:
      arm.systems.find((system) => system.id === base.system)?.version ?? base.systemVersion,
    compatibility: { ...base.compatibility, minimum: generation, verified: generation },
  };
}

/** Read the tracked world fixture. */
export function readWorldFixture(root = REPOSITORY_ROOT) {
  return JSON.parse(readFileSync(join(root, ...WORLD_FIXTURE_PATH), 'utf8'));
}

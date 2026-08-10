/**
 * The Foundry generations the smoke harness can boot, and what each one needs (issue #1088).
 *
 * `module.json` declares `minimum: "13"` and `verified: "14"`, but until this module existed the
 * harness could only ever boot 14: the image tag, the world fixture's `coreVersion` and the dnd5e
 * pin were three unrelated constants that happened to agree, and nothing could move them together.
 * An arm is that agreement made explicit — one Foundry generation, with the game-system release and
 * the world manifest that generation can actually launch.
 *
 * THE DEFAULT ARM DOES NOT CARRY ITS OWN IMAGE PIN. It reads `docker-compose.foundry.yml` through
 * `foundryImagePin.js`, because that file is what CI hashes into the `foundry-binary-*` cache key
 * and what `tests/view-lab-chrome-version-lock.test.js` reads to hold the View Lab's harvested
 * chrome to the build the smoke boots. A second copy of the 14 pin here would be a second source of
 * truth for the one constant this repository has already been bitten by twice.
 *
 * THE NON-DEFAULT ARM IS ENV-ONLY, BY CONSTRUCTION. It is selected with `FOUNDRY_SMOKE_ARM` and
 * reaches compose through `FOUNDRY_IMAGE`, so no arm other than the default can be expressed in the
 * compose file at all. That is deliberate: editing the compose pin to boot 13 would red the version
 * lock above, rotate the CI binary cache key, and leave the View Lab attesting a build nothing
 * boots. `tests/foundry-smoke-arms.test.js` pins that separation so a later change cannot quietly
 * couple the two back together.
 *
 * ONE CONTAINER IDENTITY FOR EVERY ARM. The felddy licence binds to the container HOSTNAME (see
 * `docker-compose.foundry.yml` and `foundryRunIdentity.js`), so a per-arm hostname would consume a
 * second Foundry activation per worktree. Every arm therefore reuses this worktree's single derived
 * identity — one container name, one hostname, one host port, one bind-mounted data directory. The
 * unavoidable corollary is that TWO ARMS CANNOT RUN AT THE SAME TIME in one worktree: the second
 * would fight the first for the container and the data directory. Switching arms recreates the
 * container (see `foundry-test-up.mjs`), which is a cost paid deliberately to avoid burning
 * activations.
 *
 * Pure by design — no `process.exit`, no autorun, no Playwright, no Docker — so `npm test` can
 * exercise it with none of those present.
 */

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

/**
 * A dnd5e release, with its download URL derived rather than restated.
 *
 * Deriving removes the one way this entry can be wrong that nothing would notice: a version bumped
 * without its URL points the fetcher at the old archive, which then installs under the new version's
 * name and fails much later as a world-launch mismatch.
 *
 * @param {string} version The dnd5e release version.
 * @returns {{ id: string, version: string, url: string }}
 */
function dnd5eRelease(version) {
  return Object.freeze({
    id: 'dnd5e',
    version,
    url: `https://github.com/foundryvtt/dnd5e/releases/download/release-${version}/dnd5e-release-${version}.zip`,
  });
}

/**
 * The arms, keyed by id.
 *
 * `image: null` on the default arm means "read the compose pin"; see the module comment.
 *
 * The system pins are NOT interchangeable. dnd5e 5.3.3 is the first release declaring
 * `verified: "14"`; 5.2.5 declares `verified: "13"`. Foundry puts a blocking modal in front of a
 * world launch when its system is unverified for the running core, and the smoke has no handler for
 * that modal — it surfaces minutes later as a launch timeout naming nothing.
 */
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

/**
 * Canonicalize an arm name. Accepts `v13`, `13`, `V13` and empty/absent (the default).
 *
 * @param {string|null|undefined} name
 * @returns {string} A key of `SMOKE_ARMS`.
 * @throws {Error} When the name matches no arm — a typo must fail loudly rather than silently boot
 *   the default, because the default is the arm you were trying NOT to run.
 */
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

/**
 * Resolve one arm to everything the harness needs to boot it.
 *
 * @param {string|null|undefined} [name] Arm name; empty or absent selects the default.
 * @param {object} [options]
 * @param {string} [options.root] Repository root, for the compose pin. Injected by tests.
 * @returns {{
 *   id: string,
 *   generation: number,
 *   isDefault: boolean,
 *   image: string,
 *   foundryVersion: string,
 *   systems: Array<{ id: string, version: string, url: string }>
 * }}
 */
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

/**
 * Resolve the arm an environment selects.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {object} [options]
 * @param {string} [options.root]
 * @returns {ReturnType<typeof resolveSmokeArm>}
 */
export function resolveSmokeArmFromEnv(env = process.env, { root = REPOSITORY_ROOT } = {}) {
  return resolveSmokeArm(env[SMOKE_ARM_ENV_VAR], { root });
}

/**
 * Stamp a world manifest for one arm.
 *
 * The tracked fixture is the ONLY world source of truth; a second committed fixture for the second
 * arm would drift the moment either was edited, and the drift would present as a two-minute launch
 * timeout rather than as anything mentioning versions. So the non-default arm's manifest is derived
 * here at setup time and written into the runtime data directory, which
 * `scripts/foundry-setup-data.mjs` wipes and re-copies on every `up` anyway.
 *
 * For the DEFAULT arm this is the identity function on a well-formed fixture, and
 * `tests/foundry-smoke-arms.test.js` asserts exactly that against the committed file — which is
 * what keeps the derivation honest rather than merely plausible.
 *
 * @param {object} base The tracked fixture manifest.
 * @param {ReturnType<typeof resolveSmokeArm>} arm
 * @returns {object} A new manifest; `base` is not mutated.
 */
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

/**
 * Read the tracked world fixture.
 *
 * @param {string} [root] Repository root.
 * @returns {object}
 */
export function readWorldFixture(root = REPOSITORY_ROOT) {
  return JSON.parse(readFileSync(join(root, ...WORLD_FIXTURE_PATH), 'utf8'));
}

/**
 * The Primitive Lab's Foundry globals (issue 1487): the shared shim over the minimal world, plus the
 * harvested client release in core's `ReleaseData` shape. Lab-only, so the main View Lab keeps no
 * `game.release` and `essenceIcons.js` keeps measuring its icon set there.
 */
import CHROME_PROVENANCE from '../chrome-provenance.json' with { type: 'json' };
import { installFoundryShim } from '../foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../foundry/minimalLabWorld.js';

/**
 * Parse a `<generation>.<build>` release, failing closed: a NaN generation would send
 * `essenceIcons.js` down its measured path silently.
 *
 * @param {string} version The harvested `foundryVersion`.
 * @returns {Readonly<{generation: number, build: number, version: string}>} The release.
 * @throws {TypeError} When the version is not a positive generation and an integer build.
 */
export function parseLabRelease(version) {
  const parts = String(version).split('.');
  const [generation, build] = parts.map(Number);
  if (parts.length !== 2 || !Number.isInteger(generation) || generation <= 0 || !Number.isInteger(build)) {
    throw new TypeError(
      `chrome-provenance.json foundryVersion ${JSON.stringify(version)} is not a ` +
        '<generation>.<build> release; re-run npm run viewlab:chrome:harvest'
    );
  }
  return Object.freeze({ generation, build, version: `${generation}.${build}` });
}

/** The client the lab declares itself: the build whose chrome it renders. */
export const LAB_RELEASE = parseLabRelease(CHROME_PROVENANCE.foundryVersion);

/**
 * Install the globals one specimen realm runs under.
 *
 * @param {{localize: Function, format: Function}} i18n The `game.i18n` pair.
 * @returns {{restore: () => void}} The shim handle.
 */
export function installPrimitiveLabFoundry(i18n) {
  const shim = installFoundryShim(createMinimalLabWorld({ i18n }));
  Object.assign(globalThis.game, { release: LAB_RELEASE, version: LAB_RELEASE.version });
  return shim;
}

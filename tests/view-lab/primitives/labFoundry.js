/**
 * The Primitive Lab's Foundry globals (issue 1487): the shared shim over the minimal world, plus the
 * harvested release. Lab-only, so the main View Lab keeps no `game.release` and its icon path.
 */
import CHROME_PROVENANCE from '../chrome-provenance.json' with { type: 'json' };
import { installFoundryShim } from '../foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../foundry/minimalLabWorld.js';

/** Parse `<generation>.<build>` fail-closed: a NaN generation silently picks measured icons. */
export function parseLabRelease(version) {
  const parts = String(version).split('.');
  const [generation, build] = parts.map(Number);
  if (
    parts.length !== 2 ||
    !Number.isInteger(generation) ||
    generation <= 0 ||
    !Number.isInteger(build)
  ) {
    throw new TypeError(
      `chrome-provenance.json foundryVersion ${JSON.stringify(version)} is not a ` +
        '<generation>.<build> release; re-run npm run viewlab:chrome:harvest'
    );
  }
  return Object.freeze({ generation, build, version: `${generation}.${build}` });
}

export const LAB_RELEASE = parseLabRelease(CHROME_PROVENANCE.foundryVersion);

/** Install the globals one specimen realm runs under, and return the shim's handle. */
export function installPrimitiveLabFoundry(i18n) {
  const shim = installFoundryShim(createMinimalLabWorld({ i18n }));
  Object.assign(globalThis.game, { release: LAB_RELEASE, version: LAB_RELEASE.version });
  return shim;
}

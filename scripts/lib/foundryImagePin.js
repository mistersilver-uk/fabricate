/** The single reading of the Foundry image pin in `docker-compose.foundry.yml` (issue #957). */
import { readFileSync } from 'node:fs';

export const COMPOSE_FILENAME = 'docker-compose.foundry.yml';

/**
 * Matches the `foundry` service's `image:` line, whether or not it is wrapped in the
 * `${FOUNDRY_IMAGE:-...}` default-substitution form.
 */
const IMAGE_LINE_PATTERN =
  /^[ \t]*image:[ \t]*"?(?:\$\{FOUNDRY_IMAGE:-([^}"]+)}|([^"\s]+))"?[ \t]*$/m;

/** `<repo>/<name>:<tag>` — the tag is what carries the Foundry build. */
const IMAGE_REFERENCE_PATTERN = /^([^:\s]+):([^:\s]+)$/;

/** Read the pinned Foundry image out of a compose file. */
export function readPinnedFoundryImage(composePath) {
  const match = IMAGE_LINE_PATTERN.exec(readFileSync(composePath, 'utf8'));
  if (!match) {
    throw new Error(`no foundry "image:" line found in ${composePath}`);
  }
  const image = (match[1] ?? match[2]).trim();
  const reference = IMAGE_REFERENCE_PATTERN.exec(image);
  if (!reference) {
    throw new Error(
      `the Foundry image in ${composePath} is "${image}", which carries no tag. Pin an exact build ` +
        '(felddy/foundryvtt:<major>.<build>) so the CI cache key rotates and the harvested View Lab ' +
        'chrome cannot drift from what the smoke boots.'
    );
  }
  const [, repository, tag] = reference;
  return { image, repository, tag };
}

/** The Foundry version the pinned image tag names. */
export function foundryVersionFromTag(tag) {
  const match = /^(\d+\.\d+)(?:\.0)?$/.exec(tag);
  return match ? match[1] : null;
}

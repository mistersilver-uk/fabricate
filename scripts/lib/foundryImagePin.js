/**
 * The single reading of the Foundry image pin in `docker-compose.foundry.yml` (issue #957).
 *
 * The pin used to exist twice — once in the compose file and once as a constant in
 * `scripts/foundry-test-up.mjs` — and the two were wrong in opposite directions. The script's
 * constant is what actually boots, because it writes `process.env.FOUNDRY_IMAGE` before compose
 * reads the default; the compose file is what CI hashes into the `foundry-binary-*` cache key. So
 * editing only the script boots the new build against a cache key that never rotated, and editing
 * only the compose file rotates a key while still booting the old build. Deriving one from the
 * other removes the failure mode rather than documenting it.
 *
 * The same parse backs `tests/view-lab-chrome-version-lock.test.js`, which asserts the harvested
 * View Lab chrome names the version this pin boots. The View Lab has no independent source of
 * Foundry: it harvests whatever archive the smoke's container downloads. That is the right coupling
 * — the smoke is the fidelity authority, and matching it is what makes the two comparable — but
 * until #957 nothing reported when the two drifted, and they drifted a whole major.
 */
import { readFileSync } from 'node:fs';

export const COMPOSE_FILENAME = 'docker-compose.foundry.yml';

/**
 * Matches the `foundry` service's `image:` line, whether or not it is wrapped in the
 * `${FOUNDRY_IMAGE:-...}` default-substitution form. Anchored to `image:` at the start of a line so
 * a mention inside a comment cannot satisfy it.
 */
const IMAGE_LINE_PATTERN =
  /^[ \t]*image:[ \t]*"?(?:\$\{FOUNDRY_IMAGE:-([^}"]+)}|([^"\s]+))"?[ \t]*$/m;

/**
 * `<repo>/<name>:<tag>` — the tag is what carries the Foundry build.
 *
 * Positional rather than named groups: the two halves are read once, immediately below, and a
 * named group that is only ever consumed by an object spread reads as unused.
 */
const IMAGE_REFERENCE_PATTERN = /^([^:\s]+):([^:\s]+)$/;

/**
 * Read the pinned Foundry image out of a compose file.
 *
 * @param {string} composePath Absolute path to `docker-compose.foundry.yml`.
 * @returns {{image: string, repository: string, tag: string}}
 * @throws {Error} When no `image:` line is present or it carries no tag. Both are failures rather
 *   than fallbacks: a harness that silently boots `:latest` is how the version drift happened.
 */
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

/**
 * The Foundry version the pinned image tag names.
 *
 * felddy publishes both `14.365` and `14.365.0`; Foundry's own archive is named `foundryvtt-14.365.zip`
 * and the image's `com.foundryvtt.version` label reads `14.365`, so a trailing `.0` is dropped to
 * match. A floating major such as `14` returns null rather than guessing a build.
 *
 * @param {string} tag An image tag.
 * @returns {string|null} `<major>.<build>`, or null when the tag names no exact build.
 */
export function foundryVersionFromTag(tag) {
  const match = /^(\d+\.\d+)(?:\.0)?$/.exec(tag);
  return match ? match[1] : null;
}

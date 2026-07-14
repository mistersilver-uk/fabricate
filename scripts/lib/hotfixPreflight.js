/**
 * Pre-flight collision guard for cutting a hotfix line (issue #627, task 3.9).
 *
 * A hotfix line is cut from the PUBLIC tag (`git branch 1.4.x v1.4.0`) and lands `fix:` only, so
 * semantic-release computes the next patch of that public version (`v1.4.0` → `1.4.1`). But if the
 * base version is itself SOAKING as a patch — public is `1.5.0` and `v1.5.1` is already minted and
 * distributed in early-access — cutting `1.5.x` from `v1.5.0` recomputes `1.5.1`, a tag that
 * already exists on a DIFFERENT commit. That is the wrong route: a soaking patch carries only
 * `fix`/`perf` by construction, so it must be PROMOTED first, not hotfixed on top of.
 *
 * DEFENSE-IN-DEPTH, not the only guard. semantic-release already refuses this collision — it
 * computes `1.5.1`, finds it out of range for the branch, and hard-fails with `EINVALIDNEXTVERSION`
 * before pushing any tag (rehearsal-confirmed, issue #627 task 2.1(j)). This module refuses the
 * same thing EARLIER and MORE LEGIBLY: at the moment the operator is about to cut the branch,
 * naming the remedy in plain language, rather than deep inside a failed release run "at the worst
 * moment".
 *
 * ZERO DEPENDENCIES, by design: the `scripts/hotfix-preflight.mjs` CLI over this module may run
 * before `npm ci`, exactly like `validate-release-tag.mjs` over `releaseTags.js`. These `.js` files
 * parse as ESM only because the root `package.json` declares `"type": "module"` — do not drop that
 * declaration or relocate them under a directory with its own `package.json`.
 */
import { spawnSync } from 'node:child_process';

import { parseReleaseTag } from './releaseTags.js';
import { parseSemver } from './semver.js';

const USAGE = 'Usage: node scripts/hotfix-preflight.mjs <base-public-tag>   (e.g. v1.5.0)';

/**
 * Compute the next patch tag a hotfix line cut from `baseTag` would mint.
 *
 * The base MUST be a stable public tag (`vX.Y.Z`): a hotfix line is cut from a PUBLISHED public
 * version, never from a prerelease. Version parsing is reused from the release tooling — the tag
 * shape from `parseReleaseTag`, the numeric fields from `parseSemver` — never reinvented here.
 *
 * @param {string} baseTag The hotfix line's base public tag, e.g. `v1.5.0`.
 * @returns {{baseTag: string, baseVersion: string, nextVersion: string, nextTag: string}}
 * @throws {Error} If `baseTag` is not a stable public release tag.
 */
export function nextPatchTag(baseTag) {
  const parsed = parseReleaseTag(baseTag);
  if (!parsed || parsed.kind !== 'stable') {
    throw new Error(
      `'${String(baseTag)}' is not a stable public tag (vX.Y.Z). A hotfix line is cut from a ` +
        'PUBLISHED public version, e.g. v1.5.0.'
    );
  }

  // parsed.kind === 'stable' guarantees this parses, but guard so a future tag-shape change can
  // never let an unparseable version through to an increment on `undefined`.
  const version = parseSemver(parsed.version);
  if (!version) throw new Error(`'${String(baseTag)}' has no parseable version.`);

  const nextVersion = `${version.major}.${version.minor}.${version.patch + 1}`;
  return {
    baseTag: parsed.tag,
    baseVersion: parsed.version,
    nextVersion,
    nextTag: `v${nextVersion}`,
  };
}

/**
 * The default remote-tag lister: the real `git ls-remote` call. Returns its raw stdout so the
 * caller decides existence; a spawn failure or non-zero exit throws, because a hotfix must not
 * proceed on an UNVERIFIABLE remote state (fail closed).
 * @param {string} tag The tag to look up, e.g. `v1.5.1`.
 * @returns {string} The `git ls-remote` stdout (empty when the tag is absent).
 */
function gitListRemoteTags(tag) {
  const result = spawnSync('git', ['ls-remote', '--tags', 'origin', tag], { encoding: 'utf8' });
  if (result.error) throw new Error(`git ls-remote failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ls-remote exited ${result.status}: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

/**
 * Run the pre-flight check for a hotfix line's base tag.
 * @param {string} baseTag The hotfix line's base public tag, e.g. `v1.5.0`.
 * @param {(tag: string) => string} [listRemoteTags] Injectable remote-tag lister (returns the
 *   `git ls-remote` stdout for a tag); defaults to the real `git ls-remote`.
 * @returns {{ok: boolean, code: number, nextTag: string, message: string}} The verdict.
 * @throws {Error} If `baseTag` is not a stable public tag, or the lister throws.
 */
export function hotfixPreflight(baseTag, listRemoteTags = gitListRemoteTags) {
  const { nextTag } = nextPatchTag(baseTag);

  // Match the WHOLE ref, never a substring: `git ls-remote --tags origin v1.5.1` keys on full path
  // components (so it never matches `v1.5.10`), but parse defensively rather than trust that — a
  // substring `includes` would let `refs/tags/v1.5.10` satisfy a lookup for `v1.5.1`. A ref line is
  // `<sha>\trefs/tags/<tag>`, with a `^{}` suffix on a dereferenced annotated tag.
  const refName = `refs/tags/${nextTag}`;
  const exists = String(listRemoteTags(nextTag))
    .split('\n')
    .map((line) => line.split('\t', 2)[1])
    .some((ref) => [refName, `${refName}^{}`].includes(ref));

  if (exists) {
    return {
      ok: false,
      code: 1,
      nextTag,
      message:
        `${nextTag} already exists (it is soaking) — promote it to public first, then cut the ` +
        'hotfix on top if still needed.',
    };
  }

  return {
    ok: true,
    code: 0,
    nextTag,
    message: `${nextTag} does not exist on origin — safe to cut the hotfix line from ${baseTag}.`,
  };
}

/**
 * Resolve the CLI to a process exit code: parse argv, run the check, and return the code. Kept as a
 * pure function of its inputs (argv + injected collaborators) so the test drives it without
 * spawning a subprocess or touching the real remote.
 * @param {string[]} argv Arguments after the script name.
 * @param {{listRemoteTags?: (tag: string) => string, log?: (msg: string) => void,
 *   error?: (msg: string) => void}} [io] Injectable collaborators.
 * @returns {number} The exit code: 0 clear, 1 collision, 2 usage error.
 */
export function run(argv, io = {}) {
  const { listRemoteTags = gitListRemoteTags, log = console.log, error = console.error } = io;
  const baseTag = argv[0];

  // A wholly absent argument is a usage error (exit 2); an explicit --help is not (exit 0). Both
  // print usage.
  if (baseTag === undefined) {
    error(USAGE);
    return 2;
  }
  if (['--help', '-h'].includes(baseTag)) {
    error(USAGE);
    return 0;
  }

  try {
    const result = hotfixPreflight(baseTag, listRemoteTags);
    if (result.ok) {
      log(result.message);
      return 0;
    }
    // `::error::` is a GitHub Actions annotation; harmless noise anywhere else.
    error(`::error::${result.message}`);
    return 1;
  } catch (error_) {
    error(`::error::hotfix-preflight: ${error_.message}`);
    return 2;
  }
}

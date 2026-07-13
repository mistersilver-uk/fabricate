/**
 * The single definition of what a Fabricate release tag looks like.
 *
 * Before this module the RC pattern was hand-copied into four workflow steps as a `grep -E`
 * literal, and every copy rejected `-beta.N`. This is the one place that knowledge lives now:
 * change the shape of a release tag here and every call site follows.
 *
 * Two kinds of tag exist:
 *   - `beta`   — a prerelease tag published to a private channel (`v1.4.0-beta.3`).
 *   - `stable` — a promoted public release tag (`v1.4.0`).
 *
 * TRANSITIONAL: `-rc.N` is still accepted as a `beta`-kind prerelease. The repository's
 * semantic-release preid is `rc` today and only becomes `beta` at the Phase 2 cutover, so the 179
 * existing tags and every tag minted before the cutover use it. Once the cutover has landed and no
 * live workflow needs to name an `-rc.N` tag, drop the `rc` alternative from `BETA_TAG_RE` — the
 * `parseReleaseTag` contract does not otherwise change.
 *
 * Tags are NOT versions. Every parse strips the leading `v`, so a tag can never reach a version
 * comparator (a stray `v` would be compared as an opaque string part by
 * `foundryIsNewerVersion` and silently skew the result).
 */

/** The kinds of release tag a caller may require. */
export const RELEASE_TAG_KINDS = Object.freeze(['beta', 'stable']);

/** `v1.4.0-beta.3` / `v1.4.0-rc.85`. Group 1 is the bare version, group 2 the prerelease id. */
export const BETA_TAG_RE = /^v(\d+\.\d+\.\d+-(beta|rc)\.\d+)$/;

/** `v1.4.0`. Group 1 is the bare version. */
export const STABLE_TAG_RE = /^v(\d+\.\d+\.\d+)$/;

const TAG_SHAPES = 'vX.Y.Z, vX.Y.Z-beta.N, or vX.Y.Z-rc.N';

/**
 * Parse a release tag into its kind and its bare version.
 * @param {unknown} tag The tag to parse, e.g. `v1.4.0-beta.3`.
 * @returns {{tag: string, version: string, kind: 'beta'|'stable', prerelease: string|null}|null}
 *   The parsed tag, or `null` when the value is not a release tag. `version` never carries the
 *   leading `v`; it is the only form safe to hand to a version comparator.
 */
export function parseReleaseTag(tag) {
  if (typeof tag !== 'string') return null;

  const beta = BETA_TAG_RE.exec(tag);
  if (beta) return { tag, version: beta[1], kind: 'beta', prerelease: beta[2] };

  const stable = STABLE_TAG_RE.exec(tag);
  if (stable) return { tag, version: stable[1], kind: 'stable', prerelease: null };

  return null;
}

/**
 * Validate a release tag against a required kind.
 * @param {unknown} tag The tag to validate.
 * @param {'beta'|'stable'|'any'} [kind] The kind the caller requires. `any` accepts both.
 * @returns {{ok: true, tag: string, version: string, kind: 'beta'|'stable', prerelease: string|null}
 *   |{ok: false, error: string}} The parsed tag, or a refusal naming the reason.
 * @throws {TypeError} If `kind` is not one of `beta`, `stable`, or `any` — an unknown kind is a
 *   caller bug, not a bad tag, and must never be reported as "this tag is fine".
 */
export function validateReleaseTag(tag, kind = 'any') {
  if (kind !== 'any' && !RELEASE_TAG_KINDS.includes(kind)) {
    throw new TypeError(`Unknown release tag kind '${kind}'. Expected one of: beta, stable, any.`);
  }

  const parsed = parseReleaseTag(tag);
  if (!parsed) {
    return { ok: false, error: `Tag '${tag}' is not a release tag. Expected ${TAG_SHAPES}.` };
  }
  if (kind !== 'any' && parsed.kind !== kind) {
    return {
      ok: false,
      error: `Tag '${parsed.tag}' is a ${parsed.kind} release tag, but a ${kind} tag is required.`,
    };
  }
  return { ok: true, ...parsed };
}

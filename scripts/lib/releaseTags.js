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

/**
 * Every numeric identifier is SemVer's `(0|[1-9]\d*)`, NOT `\d+`: leading zeros are refused.
 * `v1.04.0` is not a version, it is a typo — and both `promote-release` and `release-s3` take the
 * tag as a HUMAN-TYPED `workflow_dispatch` input, so a typo that validates clean here goes on to
 * mint a permanent garbage tag (and, in `promote-release`, a public GitHub release).
 *
 * `v1.4.0-beta.3` / `v1.4.0-rc.85`. Named groups; see `parseReleaseTag`.
 */
export const BETA_TAG_RE =
  /^v(?<version>(?<base>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-(?<prerelease>beta|rc)\.(?:0|[1-9]\d*))$/;

/** `v1.4.0`. Named groups; `version` and `base` are the same string for a stable tag. */
export const STABLE_TAG_RE =
  /^v(?<version>(?<base>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)))$/;

const TAG_SHAPES = 'vX.Y.Z, vX.Y.Z-beta.N, or vX.Y.Z-rc.N (no leading zeros)';

/**
 * Parse a release tag into its kind, its bare version, and its base version.
 * @param {unknown} tag The tag to parse, e.g. `v1.4.0-beta.3`.
 * @returns {{tag: string, version: string, base: string, kind: 'beta'|'stable',
 *   prerelease: string|null}|null} The parsed tag, or `null` when the value is not a release tag.
 *   `version` never carries the leading `v`; it is the only form safe to hand to a version
 *   comparator. `base` is the version a prerelease would be promoted to (`v1.4.0-beta.3` →
 *   `1.4.0`) — the promotion workflow must derive it HERE, not by stripping `-rc.N` by hand.
 */
export function parseReleaseTag(tag) {
  if (typeof tag !== 'string') return null;

  // Read the named groups explicitly rather than spreading `match.groups`: the two branches must
  // return the SAME SHAPE, and a spread hides which keys each one actually contributes.
  const beta = BETA_TAG_RE.exec(tag);
  if (beta) {
    const { version, base, prerelease } = beta.groups;
    return { tag, version, base, kind: 'beta', prerelease };
  }

  const stable = STABLE_TAG_RE.exec(tag);
  if (stable) {
    const { version, base } = stable.groups;
    return { tag, version, base, kind: 'stable', prerelease: null };
  }

  return null;
}

/**
 * Assert that a caller-supplied kind is one this module understands.
 *
 * Callers must run this EAGERLY, before doing any work — `validate-release-tag.mjs --filter`
 * would otherwise only discover a typo'd `--kind` on the first line of input, and the normal case
 * (no tags at HEAD, empty stdin) has no lines at all, so the bug would exit 0 and silently pass.
 *
 * @param {unknown} kind The kind to check.
 * @throws {TypeError} If `kind` is not one of `beta`, `stable`, or `any` — an unknown kind is a
 *   caller bug, not a bad tag, and must never be reported as "this tag is fine".
 */
export function assertReleaseTagKind(kind) {
  if (kind !== 'any' && !RELEASE_TAG_KINDS.includes(kind)) {
    // String(): `kind` is unknown, and a bare interpolation would report an object as
    // "[object Object]" — the error must name what was actually passed.
    throw new TypeError(
      `Unknown release tag kind '${String(kind)}'. Expected one of: beta, stable, any.`
    );
  }
}

/**
 * Validate a release tag against a required kind.
 * @param {unknown} tag The tag to validate.
 * @param {'beta'|'stable'|'any'} [kind] The kind the caller requires. `any` accepts both.
 * @returns {{ok: true, tag: string, version: string, base: string, kind: 'beta'|'stable',
 *   prerelease: string|null}|{ok: false, error: string}} The parsed tag, or a refusal naming the
 *   reason.
 * @throws {TypeError} If `kind` is unknown. See `assertReleaseTagKind`.
 */
export function validateReleaseTag(tag, kind = 'any') {
  assertReleaseTagKind(kind);

  const parsed = parseReleaseTag(tag);
  if (!parsed) {
    // String(): see assertReleaseTagKind — `tag` is unknown and must not report as [object Object].
    return {
      ok: false,
      error: `Tag '${String(tag)}' is not a release tag. Expected ${TAG_SHAPES}.`,
    };
  }
  if (kind !== 'any' && parsed.kind !== kind) {
    return {
      ok: false,
      error: `Tag '${parsed.tag}' is a ${parsed.kind} release tag, but a ${String(kind)} tag is required.`,
    };
  }
  return { ok: true, ...parsed };
}

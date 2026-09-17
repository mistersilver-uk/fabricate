/** The single definition of what a Fabricate release tag looks like. */

/** The kinds of release tag a caller may require. */
export const RELEASE_TAG_KINDS = Object.freeze(['beta', 'stable']);

/** Every numeric identifier is SemVer's `(0|[1-9]\d*)`, not `\d+`: leading zeros are refused. */
export const BETA_TAG_RE =
  /^v(?<version>(?<base>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-(?<prerelease>beta|rc)\.(?:0|[1-9]\d*))$/;

/** `v1.4.0`. Named groups; `version` and `base` are the same string for a stable tag. */
export const STABLE_TAG_RE =
  /^v(?<version>(?<base>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)))$/;

const TAG_SHAPES = 'vX.Y.Z, vX.Y.Z-beta.N, or vX.Y.Z-rc.N (no leading zeros)';

/** Render an untrusted value for an error message. */
function describe(value) {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    // JSON.stringify returns undefined (not a string) for a function or a symbol.
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    // Circular, or a BigInt — JSON.stringify throws on both.
    return Object.prototype.toString.call(value);
  }
}

/** Parse a release tag into its kind, its bare version, and its base version. */
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

/** Assert that a caller-supplied kind is one this module understands. */
export function assertReleaseTagKind(kind) {
  if (kind !== 'any' && !RELEASE_TAG_KINDS.includes(kind)) {
    throw new TypeError(
      `Unknown release tag kind '${describe(kind)}'. Expected one of: beta, stable, any.`
    );
  }
}

/** Validate a release tag against a required kind. */
export function validateReleaseTag(tag, kind = 'any') {
  assertReleaseTagKind(kind);

  const parsed = parseReleaseTag(tag);
  if (!parsed) {
    return {
      ok: false,
      error: `Tag '${describe(tag)}' is not a release tag. Expected ${TAG_SHAPES}.`,
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

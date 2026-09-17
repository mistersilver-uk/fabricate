/** Pre-flight collision guard for cutting a hotfix line (issue #627, task 3.9). */
import { parseReleaseTag } from './releaseTags.js';
import { parseSemver } from './semver.js';

const USAGE =
  'Usage: git ls-remote --tags origin | node scripts/hotfix-preflight.mjs <base-public-tag>\n' +
  '  e.g. git ls-remote --tags origin | node scripts/hotfix-preflight.mjs v1.5.0';

// A `git ls-remote` line is `<object-id>\t<ref>`. The object id is 40 hex chars (SHA-1) or 64
// (SHA-256); anchoring both ends is what makes a line either a real ref line or ignored noise.
const OBJECT_ID_RE = /^[0-9a-f]{40,64}$/i;

/**
 * Read a readable stream to a UTF-8 string. Lives here so the CLI shim stays a pure argv/stdin
 * wiring with nothing testable of its own.
 */
export async function readStdin(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Compute the next patch tag a hotfix line cut from `baseTag` would mint. */
export function nextPatchTag(baseTag) {
  const parsed = parseReleaseTag(baseTag);
  if (parsed?.kind !== 'stable') {
    throw new Error(
      `'${String(baseTag)}' is not a stable public tag (vX.Y.Z). A hotfix line is cut from a ` +
        'PUBLISHED public version, e.g. v1.5.0.'
    );
  }

  // The stable kind guarantees this parses, but guard so a future tag-shape change can never let an
  // unparseable version through to an increment on `undefined`.
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

/** Extract the `refs/…` refs from a `git ls-remote` listing. */
function parseLsRemoteRefs(lsRemoteOutput) {
  const refs = String(lsRemoteOutput)
    .split('\n')
    .map((line) => line.trim().split('\t', 2))
    .filter(([objectId, ref]) => ref && OBJECT_ID_RE.test(objectId) && ref.startsWith('refs/'))
    .map(([, ref]) => ref);

  if (refs.length === 0) {
    throw new Error(
      'stdin carried no `git ls-remote` tag refs. Pipe `git ls-remote --tags origin` into this ' +
        'tool; empty or malformed input is treated as unverifiable (fail closed).'
    );
  }
  return refs;
}

/**
 * Run the pre-flight check for a hotfix line's base tag against a piped `git ls-remote` listing.
 */
export function hotfixPreflight(baseTag, lsRemoteOutput) {
  const { nextTag } = nextPatchTag(baseTag);
  const refs = parseLsRemoteRefs(lsRemoteOutput);

  const refName = `refs/tags/${nextTag}`;
  const exists = refs.some((ref) => [refName, `${refName}^{}`].includes(ref));

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
 * Resolve the CLI to a process exit code: parse argv, run the check against the already-read stdin,
 * and return the code.
 */
export function run(argv, input, io = {}) {
  const { log = console.log, error = console.error } = io;
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
    const result = hotfixPreflight(baseTag, input);
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

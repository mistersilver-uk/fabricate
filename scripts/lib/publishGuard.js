/**
 * The channel-head guard: the one thing standing between a mistaken publish and a cohort that
 * Foundry will never offer an update to again.
 */

import { compareSemver, foundryIsNewerVersion, parseSemver } from './semver.js';

/**
 * @typedef {object} ManifestHead
 * @property {string} version - the version the head manifest advertises
 * @property {string|undefined} etag - the manifest object's S3 ETag (drives the conditional write)
 * @property {string} body - the manifest EXACTLY as S3 stores it (the PUT body, no trailing newline)
 */

/**
 * @typedef {object} ZipHead
 * @property {string|undefined} etag - the versioned zip's S3 ETag
 * @property {number|undefined} size - the zip's byte length
 * @property {Record<string, string>} metadata - the zip's user metadata (the provenance stamp:
 *   `fabricate-version`, `fabricate-source-sha`, `fabricate-build-profile`), lower-cased by S3
 */

/**
 * @typedef {object} HeadRecord
 * @property {string} label       - the target's stable, secret-free label (`tester-closed-beta-2026`)
 * @property {string} manifestKey - the S3 key of the target's `latest` manifest
 * @property {boolean} present    - does the target have a published head at all?
 * @property {string|null} head   - the version that head advertises, or `null` when absent
 * @property {ManifestHead|null} manifest - the head manifest's version/etag/serialised body, or
 *   `null` when the manifest is a 404. Branched on explicitly — never handed to the comparator.
 * @property {ZipHead|null} zip - the ALREADY-PUBLISHED versioned zip for this version, or `null`
 *   when absent (a fresh publish) or unreadable. Its `metadata` carries the build provenance.
 */

/**
 * @typedef {object} TargetDecision
 * @property {string} label
 * @property {boolean} present
 * @property {string|null} head
 * @property {'allow'|'allow-no-head'|'allow-downgrade'|'allow-resume'|'allow-overwrite'|'refuse'} decision
 * @property {'downgrade'|'provenance'|'missing'|null} [kind] - why a `refuse` refused (or the reason
 *   an `allow-overwrite` was only permitted under `--overwrite`)
 * @property {boolean} [skipZip] - skip this target's zip PUT (the byte-identical zip is already up)
 * @property {boolean} [skipManifest] - skip this target's manifest PUT (already advertises this
 *   version with a byte-identical body)
 * @property {string} reason
 */

/** Read the current head — and the already-published versioned zip — of every target. */
export async function fetchPublishState(targets, { getObject, headObject } = {}) {
  if (typeof getObject !== 'function') {
    throw new TypeError('fetchPublishState: a `getObject(key)` reader is required.');
  }

  // Sequential on purpose: a failure names the FIRST target that could not be read, and there are
  // only ever a handful of targets.
  const state = [];
  for (const target of targets) {
    state.push(await readHead(target, getObject, headObject));
  }
  return state;
}

/** Coerce whatever `headObject` returned into a `ZipHead|null`. */
function normaliseZipHead(raw) {
  if (!raw) return null;
  if (raw === true) return { etag: undefined, size: undefined, metadata: {} };
  return { etag: raw.etag, size: raw.size, metadata: raw.metadata ?? {} };
}

/** Read one target's head manifest and its already-published zip. */
async function readHead(target, getObject, headObject) {
  const { label, manifestKey, zipKey } = target;
  const response = await getObject(manifestKey);

  if (typeof response?.status !== 'number') {
    throw new TypeError(
      `fetchPublishState: getObject('${manifestKey}') must resolve to { status, body }; ` +
        'without an HTTP status a missing manifest cannot be told apart from a denied one.'
    );
  }

  // The zip head is read for EVERY target (a partial publish can leave a zip with no manifest), but
  // only when a reader and a zip key are both available.
  const zip =
    typeof headObject === 'function' && zipKey ? normaliseZipHead(await headObject(zipKey)) : null;

  if (response.status === 404) {
    return { label, manifestKey, present: false, head: null, manifest: null, zip };
  }

  if (response.status !== 200) {
    throw new Error(
      `could not read the current head of ${label} (${manifestKey}): HTTP ${response.status}. ` +
        'This is a storage error, NOT an absent manifest, and it is deliberately fatal. A 403 in ' +
        'particular is what S3 returns for a MISSING key when the caller lacks s3:ListBucket, so ' +
        'treating it as "no head published yet" would let the very first publish of every new ' +
        'channel skip the head check entirely. Grant s3:GetObject and s3:ListBucket to the ' +
        'publishing identity, then re-run.'
    );
  }

  const body = String(response.body);
  let manifest;
  try {
    manifest = JSON.parse(body);
  } catch {
    throw new Error(
      `the head manifest of ${label} (${manifestKey}) is not valid JSON — refusing to publish ` +
        'over a head that cannot be read.'
    );
  }

  const head = manifest?.version;
  if (typeof head !== 'string' || head.trim() === '') {
    throw new Error(
      `the head manifest of ${label} (${manifestKey}) advertises no version — refusing to ` +
        'publish over a head that cannot be compared.'
    );
  }

  // `body` is retained EXACTLY as S3 returned it (the PUT form, with no trailing newline), so the
  // resume check can compare it byte-for-byte against what would be PUT.
  return {
    label,
    manifestKey,
    present: true,
    head: head.trim(),
    manifest: { version: head.trim(), etag: response.etag, body },
    zip,
  };
}

/**
 * Serialise a manifest body exactly as `release-s3.js` PUTs it: two-space-indented JSON with NO
 * trailing newline.
 */
export function serialiseManifestBody(body) {
  return body == null ? null : JSON.stringify(body, null, 2);
}

/** Does an already-published zip's provenance prove it came from this build? */
function provenanceProvesSameBuild(zip, sourceSha, buildProfile) {
  if (!zip?.metadata) return false;
  const zipSha = zip.metadata['fabricate-source-sha'];
  const zipProfile = zip.metadata['fabricate-build-profile'];
  if (!sourceSha || sourceSha === 'unknown') return false;
  if (!zipSha || zipSha === 'unknown') return false;
  if (zipSha !== sourceSha) return false;
  return Boolean(zipProfile) && zipProfile === buildProfile;
}

/**
 * Decide whether a version may be published over the current heads and the already-published zips.
 */
export function assertPublishSafety({
  version,
  sourceSha,
  buildProfile = 'community',
  staged,
  state,
  allowDowngrade = false,
  overwrite = false,
}) {
  const heads = new Map(state.map((record) => [record.manifestKey, record]));
  const decisions = [];
  const warnings = [];
  const skipZipKeys = [];
  const skipManifestKeys = [];

  for (const entry of staged) {
    const target = entry?.target;
    if (!target?.manifestKey) {
      throw new TypeError('assertPublishSafety: every staged entry must carry a `target`.');
    }
    const record = heads.get(target.manifestKey);
    const decision = record
      ? decideTarget({
          version,
          sourceSha,
          buildProfile,
          record,
          manifestBody: entry.body,
          allowDowngrade,
          overwrite,
          warnings,
        })
      : {
          label: target.label,
          present: false,
          head: null,
          decision: 'refuse',
          kind: 'missing',
          // Fail CLOSED on a hole in the state: a target we are about to write but never read is
          // a target whose head we do not know.
          reason: `no head was read for ${target.label}, so it cannot be shown to be safe.`,
        };

    if (decision.skipZip && target.zipKey) skipZipKeys.push(target.zipKey);
    if (decision.skipManifest) skipManifestKeys.push(target.manifestKey);
    decisions.push(decision);
  }

  const violations = decisions.filter((decision) => decision.decision === 'refuse');
  return {
    ok: violations.length === 0,
    version,
    allowDowngrade,
    overwrite,
    decisions,
    warnings,
    violations,
    skipZipKeys,
    skipManifestKeys,
    error: violations.length === 0 ? null : buildCombinedRefusal(version, violations),
  };
}

/**
 * Decide one target against the full decision table, appending any comparator disagreement to
 * `warnings`.
 */
function decideTarget({
  version,
  sourceSha,
  buildProfile,
  record,
  manifestBody,
  allowDowngrade,
  overwrite,
  warnings,
}) {
  const { label, present, head, zip } = record;
  const zipPresent = zip != null;
  const sameBuild = provenanceProvesSameBuild(zip, sourceSha, buildProfile);

  // Rule 2. The absent head is branched on before any comparison — never handed to a comparator
  // that would treat a missing operand as older than everything.
  if (!present) {
    // A zip with no manifest is a publish that died before its manifest write.
    if (zipPresent && !sameBuild && !overwrite) {
      return refusal(label, false, null, 'provenance', provenanceReason(label, version, zip));
    }
    return {
      label,
      present: false,
      head: null,
      decision: 'allow-no-head',
      skipZip: zipPresent && sameBuild,
      reason: `${label} has no published head yet, so nothing can be moved backwards.`,
    };
  }

  // RULE 1. Foundry's comparator, and only Foundry's comparator, decides the head ordering.
  const headIsNewer = foundryIsNewerVersion(head, version);
  reportDisagreement({ version, label, head, warnings });

  if (headIsNewer) {
    if (allowDowngrade) {
      return {
        label,
        present: true,
        head,
        decision: 'allow-downgrade',
        reason:
          `${label} advertises ${head}, which Foundry considers NEWER than ${version} — allowed ` +
          'only because --allow-downgrade was passed.',
      };
    }
    return refusal(
      label,
      true,
      head,
      'downgrade',
      `${label} already advertises ${head}, which Foundry considers newer than ${version}.`
    );
  }

  // The head is not newer. With no already-published zip this is a plain forward publish.
  if (!zipPresent) {
    return {
      label,
      present: true,
      head,
      decision: 'allow',
      reason: `${label} advertises ${head}, which Foundry does not consider newer than ${version}.`,
    };
  }

  // A zip already exists for this version.
  const bodyMatches = serialiseManifestBody(manifestBody) === record.manifest?.body;
  if (sameBuild && bodyMatches) {
    return {
      label,
      present: true,
      head,
      decision: 'allow-resume',
      skipZip: true,
      skipManifest: true,
      reason: `${label} already published ${version} from this same build — resuming, nothing to re-upload.`,
    };
  }

  if (overwrite) {
    return {
      label,
      present: true,
      head,
      decision: 'allow-overwrite',
      kind: 'provenance',
      reason:
        `${label} already published ${version} from a DIFFERENT or unidentified build — replacing ` +
        'its immutable artefacts only because --overwrite was passed.',
    };
  }

  return refusal(label, true, head, 'provenance', provenanceReason(label, version, zip));
}

/** Build a `refuse` decision. */
function refusal(label, present, head, kind, reason) {
  return { label, present, head, decision: 'refuse', kind, reason };
}

/** The reason line for a same-version content swap. */
function provenanceReason(label, version, zip) {
  const sha = zip?.metadata?.['fabricate-source-sha'];
  const provenance = sha && sha !== 'unknown' ? `source ${sha}` : 'no identifiable provenance';
  return (
    `${label} already published ${version} from a build with ${provenance}, which does NOT match ` +
    'the build being published — publishing would replace an already-distributed immutable ' +
    'artefact with different bytes under the same version.'
  );
}

/**
 * Compose the combined refusal message. Head-ordering and missing-head refusals go through the
 * existing backwards-move text (with its minor-bump remedy); content-swap refusals get their own
 * text.
 */
function buildCombinedRefusal(version, violations) {
  const backwards = violations.filter((v) => v.kind === 'downgrade' || v.kind === 'missing');
  const swaps = violations.filter((v) => v.kind === 'provenance');
  const parts = [];
  if (backwards.length > 0) parts.push(buildRefusal(version, backwards));
  if (swaps.length > 0) parts.push(buildProvenanceRefusal(version, swaps));
  return parts.join('\n\n');
}

/** The refusal text for one or more same-version content swaps. */
function buildProvenanceRefusal(version, swaps) {
  const lines = swaps.map((swap) => `  - ${swap.reason}`);
  return (
    `refusing to re-publish ${version}: it would replace ${swaps.length} already-published ` +
    'immutable artefact(s) with bytes from a different build.\n' +
    lines.join('\n') +
    '\nRe-run the publish from the SAME commit to resume it without an override. --overwrite exists ' +
    'only for an artefact NO cohort has installed yet; it must NEVER be the routine remedy for a ' +
    'failed publish of an already-distributed version, because clients already on that version ' +
    'never re-download it and would run different bytes under one version string.'
  );
}

/** Record — never act on — a disagreement between Foundry's comparator and SemVer precedence. */
function reportDisagreement({ version, label, head, warnings }) {
  const semver = compareSemver(version, head);
  if (semver === null) return; // Unparseable by SemVer: no opinion, so nothing to disagree with.

  const semverSaysNewer = semver > 0;
  const foundrySaysNewer = foundryIsNewerVersion(version, head);
  if (semverSaysNewer === foundrySaysNewer) return;

  warnings.push(
    `${label}: Foundry and SemVer disagree about ${version} vs the current head ${head}. ` +
      `Foundry says ${version} is ${foundrySaysNewer ? '' : 'NOT '}newer; SemVer says it is ` +
      `${semverSaysNewer ? '' : 'NOT '}newer. Foundry's verdict is the one that ships — this is a ` +
      'report, not a veto.'
  );
}

/**
 * Build the refusal message. It must name the remedy, because the remedy is counter-intuitive: the
 * fix for a head that outranks you is a higher version, not a downgrade override.
 */
function buildRefusal(version, refusals) {
  const lines = refusals.map((refusal) => `  - ${refusal.reason}`);
  // The remedy is derived from the HEADS, not from the version — see suggestMinorBump. A refusal
  // can name several targets with different heads, and the one suggestion has to clear ALL of them.
  const bump = suggestMinorBump(
    version,
    refusals.map((refusal) => refusal.head)
  );
  const remedy = bump
    ? `Bump the version instead — a forced MINOR bump (e.g. ${bump}) is the supported remedy`
    : 'Bump the version instead — a forced MINOR bump is the supported remedy';

  return (
    `refusing to publish ${version}: it would move ${refusals.length} channel head(s) BACKWARDS, ` +
    'and Foundry would stop offering updates to every client installed from them.\n' +
    lines.join('\n') +
    `\n${remedy}, because it is the only change that makes Foundry compare the new build as newer. ` +
    'Do NOT reach for --allow-downgrade to break an ordering stall: it publishes the older ' +
    'version anyway, the cohort receives no further update, and the next version that DOES compare ' +
    'as newer offers that whole cohort a manifest rewrite out of the private channel.'
  );
}

/** Suggest a version that actually escapes the stall, for the refusal's remedy line. */
function suggestMinorBump(version, heads) {
  const parsedVersion = parseSemver(version);
  if (!parsedVersion) return null;
  const [identifier] = parsedVersion.prerelease;

  const candidates = [];
  for (const head of heads) {
    const parsedHead = parseSemver(head);
    if (!parsedHead) return null;
    const next = `${parsedHead.major}.${parsedHead.minor + 1}.0`;
    candidates.push(identifier ? `${next}-${identifier}.1` : next);
  }

  // Only ever offer a candidate the comparator itself agrees clears every head. If none does, say
  // nothing: no advice beats advice the guard would refuse.
  return (
    candidates.find((candidate) => heads.every((head) => foundryIsNewerVersion(candidate, head))) ??
    null
  );
}

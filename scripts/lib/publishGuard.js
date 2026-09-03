/**
 * The channel-head guard: the one thing standing between a mistaken publish and a cohort that
 * Foundry will never offer an update to again.
 *
 * Every distribution target (a channel's sources feed, and each tester feed inside it) advertises
 * exactly one version through its `latest` manifest — its HEAD. Foundry decides whether to offer a
 * client an update by comparing the head against what the client has installed, using its own
 * comparator. Move a head BACKWARDS — publish a version Foundry considers older than the one the
 * head already advertises — and every client on that target stops being offered updates, silently.
 * Nothing else in the pipeline catches that: the publish succeeds, the manifest is valid, and the
 * cohort simply goes quiet.
 *
 * So the guard is composed BEFORE any `PutObject`, and it is evaluated PER TARGET, never per
 * channel: a channel's sources manifest and its tester manifests are independent feeds that can
 * drift (a half-finished publish writes one and not the other), and the client bakes the URL of
 * the target it installed from, not the channel's.
 *
 * Three rules here are load-bearing; each one is a way this guard could fail OPEN:
 *
 *   1. `foundryIsNewerVersion` DECIDES. `compareSemver` only REPORTS. The two deliberately
 *      disagree (`1.5.0-beta.7` outranks `1.5.0` to Foundry, and the reverse under SemVer), and
 *      the disagreement is the mechanism that keeps a private beta cohort private. A disagreement
 *      is recorded in `warnings[]` and changes NOTHING about the verdict. See `./semver.js`.
 *   2. An ABSENT head is its own branch, taken before any comparison. `foundryIsNewerVersion`
 *      treats a missing reference as older than everything, so passing an absent head to it would
 *      always say "safe" — which happens to be the right answer, by the wrong route. The branch is
 *      explicit so that a storage error can never quietly borrow it.
 *   3. A 403 is a HARD ERROR, never an absent head. Without `s3:ListBucket`, S3 answers a MISSING
 *      key with 403 rather than 404 — so "403 means there is nothing there yet" is exactly the
 *      inference that would fail open on the first publish of every new channel, which is the
 *      failure this guard exists to prevent. Only a 404 means absent.
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

/**
 * Read the current head — and the already-published versioned zip — of every target.
 *
 * Two collaborators, both injected so the guard is exercised against doubles, never against S3:
 *
 *   - `getObject(key)` MUST resolve to `{ status: number, body: string|null, etag?: string }` — an
 *     HTTP status, not a thrown AWS error — so this function can tell 404 (absent) from 403 (a
 *     permissions failure) without knowing the SDK's error taxonomy. The `etag` it returns is what
 *     the manifest's conditional write (`IfMatch`) is anchored to.
 *   - `headObject(zipKey)` is OPTIONAL (the read-only `--check-heads` path omits it: it compares
 *     heads, never zips). When supplied it MUST resolve to `{ etag, size, metadata }` for a present
 *     zip or `null` for an absent one; a bare boolean is tolerated for back-compat (the legacy port
 *     answered "does the key exist?"), but then no provenance is available and the zip is treated as
 *     being of an unidentified build.
 *
 * The return is the array of records `assertPublishSafety` consumes VERBATIM — no reshaping happens
 * between the two, which is where a resume bug would otherwise hide.
 *
 * @param {Array<{label: string, manifestKey: string, zipKey?: string}>} targets The targets about to
 *   be published.
 * @param {{getObject: (key: string) => Promise<{status: number, body: string|null, etag?: string}>,
 *   headObject?: (key: string) => Promise<ZipHead|boolean|null>}} io The injected object readers.
 * @returns {Promise<HeadRecord[]>} One record per target, in the order given.
 * @throws {Error} If any target's manifest cannot be read (403, 5xx, unparseable, or advertising no
 *   version). A storage error is NEVER reported as an absent head.
 */
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

/**
 * Coerce whatever `headObject` returned into a `ZipHead|null`.
 *
 * `null`/`false`/`undefined` ⇒ absent. A bare `true` (the legacy boolean port) ⇒ present but with
 * NO provenance — an empty metadata map, so the guard reads it as an unidentified build. An object
 * is taken as-is, with a metadata map that is always present.
 * @param {ZipHead|boolean|null|undefined} raw What `headObject` resolved to.
 * @returns {ZipHead|null} The normalised zip head.
 */
function normaliseZipHead(raw) {
  if (!raw) return null;
  if (raw === true) return { etag: undefined, size: undefined, metadata: {} };
  return { etag: raw.etag, size: raw.size, metadata: raw.metadata ?? {} };
}

/**
 * Read one target's head manifest and its already-published zip.
 * @param {{label: string, manifestKey: string, zipKey?: string}} target The target to read.
 * @param {(key: string) => Promise<{status: number, body: string|null, etag?: string}>} getObject
 *   The manifest reader.
 * @param {((key: string) => Promise<ZipHead|boolean|null>)|undefined} headObject The zip reader.
 * @returns {Promise<HeadRecord>} The head record.
 */
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
 * Serialise a manifest body EXACTLY as `release-s3.js` PUTs it: two-space-indented JSON with NO
 * trailing newline. `release-s3.js` writes the *dist* manifest with a trailing `\n` but PUTs the
 * body without one, so the resume comparison MUST be against this form — comparing the dist form
 * reads every resume as a different build and fails closed.
 * @param {unknown} body The manifest object about to be published.
 * @returns {string|null} The serialised body, or `null` when there is nothing to compare.
 */
export function serialiseManifestBody(body) {
  return body == null ? null : JSON.stringify(body, null, 2);
}

/**
 * Does an already-published zip's provenance prove it came from THIS build?
 *
 * Sameness of build is established by recorded provenance, never by bytes (the archive is not
 * byte-reproducible across builds). A source sha or profile that is absent, or the sentinel
 * `unknown` a backfill stamps where no tag maps, is treated as an UNIDENTIFIED build and never
 * satisfies the test — so it fails closed rather than assuming a match.
 * @param {ZipHead|null} zip The already-published zip's head.
 * @param {string|undefined} sourceSha The source commit of the build being published.
 * @param {string} buildProfile The build profile being published.
 * @returns {boolean} `true` only when both sha and profile are present, identified, and equal.
 */
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
 * Decide whether a version may be published over the current heads AND the already-published zips.
 * PURE: no I/O, no printing, no throwing on a refusal — it RETURNS the verdict, so the caller (and
 * the tests) can inspect every per-target decision, every warning, and every skip.
 *
 * It does throw on a caller bug (a malformed `staged` entry), which is not a verdict.
 *
 * @param {object} options The options.
 * @param {string} options.version The version being published.
 * @param {string} [options.sourceSha] The source commit of the build being published — the identity
 *   half of the provenance the guard matches against an already-published zip.
 * @param {string} [options.buildProfile] The build profile being published (default `community`).
 * @param {Array<{target: {label: string, manifestKey: string, zipKey?: string}, body?: unknown}>}
 *   options.staged The staged publish entries — one per target that is about to be written. `body`
 *   is the manifest that would be PUT (the resume check compares its serialised form).
 * @param {HeadRecord[]} options.state The heads read by `fetchPublishState`, VERBATIM.
 * @param {boolean} [options.allowDowngrade] Explicit override for a Foundry-newer head.
 * @param {boolean} [options.overwrite] Explicit override for a same-version content swap.
 * @returns {{ok: boolean, version: string, allowDowngrade: boolean, overwrite: boolean,
 *   decisions: TargetDecision[], warnings: string[], violations: TargetDecision[],
 *   skipZipKeys: string[], skipManifestKeys: string[], error: string|null}} The verdict.
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
 * `warnings`. The head ordering is checked FIRST (a Foundry-newer head is refused regardless of the
 * zip); only when the head is not newer does the already-published zip's provenance come into play.
 * @param {{version: string, sourceSha: string|undefined, buildProfile: string, record: HeadRecord,
 *   manifestBody: unknown, allowDowngrade: boolean, overwrite: boolean, warnings: string[]}} args
 *   The publish inputs, the target's head, the overrides, and the warnings sink.
 * @returns {TargetDecision} The decision for this target.
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

  // RULE 2. The absent head is branched on BEFORE any comparison — never handed to a comparator
  // that would treat a missing operand as older than everything. This allow-no-head is a
  // FIRST-PUBLISH posture, and it is correct HERE: this guard runs at publish time, where an absent
  // head means the target has never been written and so nothing can be moved backwards. It is NOT
  // the promotion-time posture — `promote-to-public.yml`'s registry-lead check (evaluateRegistryLeadTarget
  // in ./promoteGuards.js) HARD-FAILS an absent head on a cohort-retaining channel, because there an
  // absent manifest is the 404 the Registry lead prohibition forbids: a retained cohort whose manifest
  // 404s while the module is on the registry is offered a rewrite out of its private channel. The two
  // postures answer different questions and do not conflict.
  if (!present) {
    // A zip with no manifest is a publish that died before its manifest write. Resume it (skip the
    // identical immutable zip) when provenance proves the same build; refuse an orphan zip of a
    // different or unidentified build unless --overwrite, rather than silently replacing immutable
    // bytes.
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

  // A zip already exists for this version. Sameness of build decides: matching provenance AND a
  // byte-identical manifest body is the resume path (skip the zip PUT); anything else is a
  // same-version content swap, refused unless --overwrite.
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

/**
 * Build a `refuse` decision.
 * @param {string} label The target label.
 * @param {boolean} present Whether the target has a head.
 * @param {string|null} head The head version, or null.
 * @param {'downgrade'|'provenance'|'missing'} kind Why it refused.
 * @param {string} reason The human-readable reason.
 * @returns {TargetDecision} The refusal.
 */
function refusal(label, present, head, kind, reason) {
  return { label, present, head, decision: 'refuse', kind, reason };
}

/**
 * The reason line for a same-version content swap.
 * @param {string} label The target label.
 * @param {string} version The version being (re)published.
 * @param {ZipHead|null} zip The already-published zip whose provenance did not match.
 * @returns {string} The reason.
 */
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
 * text. Both may fire in one publish.
 * @param {string} version The version being published.
 * @param {TargetDecision[]} violations Every refused target.
 * @returns {string} The refusal text.
 */
function buildCombinedRefusal(version, violations) {
  const backwards = violations.filter((v) => v.kind === 'downgrade' || v.kind === 'missing');
  const swaps = violations.filter((v) => v.kind === 'provenance');
  const parts = [];
  if (backwards.length > 0) parts.push(buildRefusal(version, backwards));
  if (swaps.length > 0) parts.push(buildProvenanceRefusal(version, swaps));
  return parts.join('\n\n');
}

/**
 * The refusal text for one or more same-version content swaps.
 * @param {string} version The version being (re)published.
 * @param {TargetDecision[]} swaps The refused targets.
 * @returns {string} The refusal text.
 */
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

/**
 * Record — never act on — a disagreement between Foundry's comparator and SemVer precedence.
 *
 * The disagreement is expected and healthy (it is what stops a stable release being offered to a
 * private prerelease cohort), but an UNEXPECTED one is the first sign that a version scheme has
 * drifted, so it is surfaced rather than swallowed. It cannot change the verdict.
 * @param {{version: string, label: string, head: string, warnings: string[]}} args The comparison
 *   inputs and the warnings sink.
 * @returns {void}
 */
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
 * Build the refusal message. It MUST name the remedy, because the remedy is counter-intuitive: the
 * fix for a head that outranks you is a HIGHER version, not a downgrade override.
 * @param {string} version The version being published.
 * @param {TargetDecision[]} refusals The refused targets.
 * @returns {string} The refusal text.
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

/**
 * Suggest a version that actually escapes the stall, for the refusal's remedy line.
 *
 * TWO OPERANDS, AND BOTH ARE EASY TO GET WRONG — this line has now been wrong in each of them.
 *
 *   1. The BUMP IS DERIVED FROM THE HEAD, never from the version being published. The refusal
 *      exists precisely because the head OUTRANKS the version, so bumping the version's own minor
 *      lands wherever the version happened to be — usually still under the head, and in the worst
 *      case exactly ON it. Suggesting the head itself is the dangerous shape: the guard ALLOWS a
 *      publish equal to the head (an equal head is not a backwards move), the head never advances,
 *      and every client on that feed goes quiet — the exact failure this whole file exists to
 *      prevent, re-entered through the advice it prints. The invariant is pinned as a property, not
 *      as strings, in tests/release-s3-guard.test.js: for every refusing pair in a corpus,
 *      `foundryIsNewerVersion(remedy, head)` must be `true`.
 *   2. The PRERELEASE IDENTIFIER COMES FROM THE VERSION, and must be preserved. Suggesting a bare
 *      `1.5.0` to escape a stall on the `beta` channel clears the head (`isNewerVersion('1.5.0',
 *      '1.4.9-beta.3') === true`) but leaves the beta head at a stable version — no longer ahead of
 *      the public registry — so the next public release compares as newer than the beta head and
 *      Foundry offers the entire private cohort a manifest rewrite out of the channel. The remedy
 *      must stay on the line it is rescuing: `1.5.0-beta.1`.
 *
 * A refusal can name several targets whose heads differ, so the suggestion must clear EVERY one of
 * them; a candidate is built per head and the first that clears them all is returned.
 *
 * WHAT THE STALL ACTUALLY IS, since "a double-digit patch rollover" is the wrong summary and would
 * send a reader looking for the bug in the wrong place. It is a double-digit rollover in the part
 * GLUED TO THE PRERELEASE SUFFIX, because only that part is compared as text. Against the real
 * `isNewerVersion`:
 *   - `('1.5.0-beta.10', '1.5.0-beta.9')  === true`   the beta counter is its own dot-part. Fine.
 *   - `('1.10.0-beta.1', '1.9.0-beta.1')  === true`   minor is its own dot-part. Fine.
 *   - `('1.4.10', '1.4.9')                === true`   a pure-stable channel can NEVER stall.
 *   - `('1.4.10-beta.1', '1.4.9-beta.1')  === false`  "10-beta" vs "9-beta", compared as STRINGS.
 * So a refusal for this reason can only ever fire on a channel carrying prereleases — which is
 * precisely why a bare-stable remedy is wrong by construction, not merely untidy.
 *
 * The number semantic-release ultimately computes is its own business; this is an illustration of
 * the SHAPE the operator must force.
 *
 * @param {string} version The version being published (the source of the prerelease identifier).
 * @param {string[]} heads The heads that refused it (the source of the number).
 * @returns {string|null} `1.5.0-beta.1` for `1.4.10-beta.1` over a `1.4.9-beta.3` head; `1.6.0` for
 *   `1.4.1` over a `1.5.0` head; or `null` when no version here parses as SemVer, in which case the
 *   remedy is named without an example rather than guessed at.
 */
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

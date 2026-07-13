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
 * @typedef {object} HeadRecord
 * @property {string} label       - the target's stable, secret-free label (`tester-closed-beta-2026`)
 * @property {string} manifestKey - the S3 key of the target's `latest` manifest
 * @property {boolean} present    - does the target have a published head at all?
 * @property {string|null} head   - the version that head advertises, or `null` when absent
 */

/**
 * @typedef {object} TargetDecision
 * @property {string} label
 * @property {boolean} present
 * @property {string|null} head
 * @property {'allow'|'allow-no-head'|'allow-downgrade'|'refuse'} decision
 * @property {string} reason
 */

/**
 * Read the current head of every target.
 *
 * `getObject` is the only collaborator, and it is injected: the guard is exercised in tests against
 * a double, never against S3. It MUST resolve to `{ status: number, body: string|null }` — an HTTP
 * status, not a thrown AWS error — so that this function can tell 404 (absent) from 403 (a
 * permissions failure) without knowing anything about the SDK's error taxonomy.
 *
 * @param {Array<{label: string, manifestKey: string}>} targets The targets about to be published.
 * @param {{getObject: (key: string) => Promise<{status: number, body: string|null}>}} io The
 *   injected object reader.
 * @returns {Promise<HeadRecord[]>} One record per target, in the order given.
 * @throws {Error} If any target's manifest cannot be read (403, 5xx, unparseable, or advertising no
 *   version). A storage error is NEVER reported as an absent head.
 */
export async function fetchPublishState(targets, { getObject } = {}) {
  if (typeof getObject !== 'function') {
    throw new TypeError('fetchPublishState: a `getObject(key)` reader is required.');
  }

  // Sequential on purpose: a failure names the FIRST target that could not be read, and there are
  // only ever a handful of targets.
  const state = [];
  for (const target of targets) {
    state.push(await readHead(target, getObject));
  }
  return state;
}

/**
 * Read one target's head.
 * @param {{label: string, manifestKey: string}} target The target to read.
 * @param {(key: string) => Promise<{status: number, body: string|null}>} getObject The reader.
 * @returns {Promise<HeadRecord>} The head record.
 */
async function readHead(target, getObject) {
  const { label, manifestKey } = target;
  const response = await getObject(manifestKey);

  if (typeof response?.status !== 'number') {
    throw new TypeError(
      `fetchPublishState: getObject('${manifestKey}') must resolve to { status, body }; ` +
        'without an HTTP status a missing manifest cannot be told apart from a denied one.'
    );
  }

  if (response.status === 404) {
    return { label, manifestKey, present: false, head: null };
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

  let manifest;
  try {
    manifest = JSON.parse(String(response.body));
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

  return { label, manifestKey, present: true, head: head.trim() };
}

/**
 * Decide whether a version may be published over the current heads. PURE: no I/O, no printing, no
 * throwing on a refusal — it RETURNS the verdict, so the caller (and the tests) can inspect every
 * per-target decision and every warning.
 *
 * It does throw on a caller bug (a malformed `staged` entry), which is not a verdict.
 *
 * @param {object} options The options.
 * @param {string} options.version The version being published.
 * @param {Array<{target: {label: string, manifestKey: string}}>} options.staged The staged
 *   publish entries — one per target that is about to be written.
 * @param {HeadRecord[]} options.state The heads read by `fetchPublishState`.
 * @param {boolean} [options.allowDowngrade] Explicit override; see the refusal text for why this is
 *   almost never the right answer.
 * @returns {{ok: boolean, version: string, allowDowngrade: boolean, decisions: TargetDecision[],
 *   warnings: string[], error: string|null}} The verdict.
 */
export function assertPublishSafety({ version, staged, state, allowDowngrade = false }) {
  const heads = new Map(state.map((record) => [record.manifestKey, record]));
  const decisions = [];
  const warnings = [];

  for (const entry of staged) {
    const target = entry?.target;
    if (!target?.manifestKey) {
      throw new TypeError('assertPublishSafety: every staged entry must carry a `target`.');
    }
    const record = heads.get(target.manifestKey);
    decisions.push(
      record
        ? decideTarget({ version, record, allowDowngrade, warnings })
        : {
            label: target.label,
            present: false,
            head: null,
            decision: 'refuse',
            // Fail CLOSED on a hole in the state: a target we are about to write but never read is
            // a target whose head we do not know.
            reason: `no head was read for ${target.label}, so it cannot be shown to be safe.`,
          }
    );
  }

  const refusals = decisions.filter((decision) => decision.decision === 'refuse');
  return {
    ok: refusals.length === 0,
    version,
    allowDowngrade,
    decisions,
    warnings,
    error: refusals.length === 0 ? null : buildRefusal(version, refusals),
  };
}

/**
 * Decide one target, appending any comparator disagreement to `warnings`.
 * @param {{version: string, record: HeadRecord, allowDowngrade: boolean, warnings: string[]}} args
 *   The version being published, the target's head, the override, and the warnings sink.
 * @returns {TargetDecision} The decision for this target.
 */
function decideTarget({ version, record, allowDowngrade, warnings }) {
  const { label, present, head } = record;

  // RULE 2. The absent head is branched on BEFORE any comparison — never handed to a comparator
  // that would treat a missing operand as older than everything.
  if (!present) {
    return {
      label,
      present: false,
      head: null,
      decision: 'allow-no-head',
      reason: `${label} has no published head yet, so nothing can be moved backwards.`,
    };
  }

  // RULE 1. Foundry's comparator, and only Foundry's comparator, decides.
  const headIsNewer = foundryIsNewerVersion(head, version);
  reportDisagreement({ version, label, head, warnings });

  if (!headIsNewer) {
    return {
      label,
      present: true,
      head,
      decision: 'allow',
      reason: `${label} advertises ${head}, which Foundry does not consider newer than ${version}.`,
    };
  }

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

  return {
    label,
    present: true,
    head,
    decision: 'refuse',
    reason: `${label} already advertises ${head}, which Foundry considers newer than ${version}.`,
  };
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
  const bump = suggestMinorBump(version);
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
 * Suggest the next minor version, for the refusal's remedy line — PRESERVING the prerelease
 * identifier, which is the whole correctness of this function.
 *
 * The remedy line is the one string in this file a maintainer will copy verbatim into a release,
 * so suggesting `1.5.0` to escape a stall on the `beta` channel would walk them straight into the
 * failure the guard exists to prevent: `isNewerVersion('1.5.0', '1.4.9-beta.3') === true`, so the
 * publish would be ALLOWED, and it would leave the beta head at a bare stable version — no longer
 * ahead of the public registry. The next public release then compares as newer than the beta head
 * and Foundry offers the entire private cohort a manifest rewrite out of the channel. The
 * suggestion must therefore stay on the line it is rescuing: `1.5.0-beta.1`, which the real
 * comparator also ranks above `1.4.9-beta.3` (verified by differential test).
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
 * @param {string} version The version being published.
 * @returns {string|null} `1.5.0-beta.1` for `1.4.10-beta.1`, `1.5.0` for `1.4.10`, or `null` when
 *   the version is not SemVer.
 */
function suggestMinorBump(version) {
  const parsed = parseSemver(version);
  if (!parsed) return null;
  const next = `${parsed.major}.${parsed.minor + 1}.0`;
  const [identifier] = parsed.prerelease;
  return identifier ? `${next}-${identifier}.1` : next;
}

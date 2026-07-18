/**
 * Promotion-time release guards for `.github/workflows/promote-to-public.yml` (issue #716).
 *
 * The promote workflow is the ONLY thing that makes a version publicly obtainable, and every step
 * that can fail MUST precede the irreversible un-draft. Two MUSTs in the Release and Distribution
 * spec had no machine guard while every sibling MUST did; both are operationalised here, as PURE
 * functions the workflow's inline node steps delegate to, so the load-bearing decisions are unit
 * tested against doubles rather than only against a live promotion.
 *
 *   - `assertHotfixMinimumNotRaised` — §Hotfix isolation: "A hotfix MUST NOT raise the module's
 *     declared minimum Foundry version." Foundry refuses to install a package whose minimum exceeds
 *     the running core version, so a hotfix that raises it strands exactly the users the fix is for.
 *   - `evaluateRegistryLeadTarget` — §Registry lead prohibition: a channel or tester manifest URL
 *     MUST NOT return 404 while the module is listed on the registry, enforced against every private
 *     target that retains a cohort, "a verification performed by the promotion, never an assumption".
 *
 * ⚠️ NEITHER guard uses `compareSemver`. `foundryIsNewerVersion` is the comparator the player's
 * client runs, and it deliberately disagrees with SemVer (`1.4.0-beta.3` outranks `1.4.0`), which is
 * what keeps the private cohorts private. The minimum-version comparison is between Foundry core
 * GENERATION values (bare integers such as `13`, or dotted core versions), never module versions —
 * but it is still Foundry's comparator that decides "raised", because that is the comparison the
 * client makes when it refuses to install. See `./semver.js`.
 */

import { foundryIsNewerVersion } from './semver.js';

const HOTFIX_SPEC_REF = 'Release and Distribution §Hotfix isolation';

/**
 * Normalise a declared `compatibility.minimum` to a comparable string, or `null` when it carries no
 * value. Absent is deliberately distinct from any present value: it means "could not read", never
 * "0".
 * @param {unknown} value The raw `compatibility.minimum` field.
 * @returns {string|null} The trimmed value, or `null` when absent or empty.
 */
function normaliseMinimum(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Refuse a hotfix promotion whose declared minimum Foundry version exceeds the current public
 * release's, per §Hotfix isolation. Only the hotfix path is constrained: a version built on the
 * release line traverses the private stages and MAY raise the minimum, because the cohort it would
 * strand is offered the newer core generation through the normal upgrade path. A hotfix reaches the
 * SAME public cohort a raised minimum would lock out of its own fix, so it is the one route the
 * prohibition binds.
 *
 * The verdict is RETURNED, never thrown or printed, so the workflow step and the tests inspect it.
 *
 * @param {object} options The inputs.
 * @param {boolean} options.isHotfix Whether this is a hotfix-line promotion (source channel `N.N.x`).
 * @param {string} options.version The version being promoted.
 * @param {unknown} options.promotedMinimum The promoted artefact's `compatibility.minimum`.
 * @param {string} [options.previousVersion] The current public version (`prev_public`), for messages.
 * @param {unknown} options.previousMinimum The current public release's `compatibility.minimum`.
 * @returns {{ok: boolean, error?: string, reason?: string}} The verdict.
 */
export function assertHotfixMinimumNotRaised({
  isHotfix,
  version,
  promotedMinimum,
  previousVersion,
  previousMinimum,
}) {
  if (!isHotfix) {
    return { ok: true, reason: 'not a hotfix — the minimum-version prohibition does not apply.' };
  }

  const promoted = normaliseMinimum(promotedMinimum);
  const previous = normaliseMinimum(previousMinimum);

  // A hotfix always fixes an existing public version, so both artefacts MUST declare a minimum to
  // compare. Absence is unverifiable, not proof of no raise — fail closed, matching the house
  // pattern for every other release guard.
  if (promoted === null) {
    return {
      ok: false,
      error:
        `refusing to promote hotfix v${version}: its module.json declares no compatibility.minimum, ` +
        `so the ${HOTFIX_SPEC_REF} prohibition on raising the declared minimum Foundry version cannot ` +
        'be verified.',
    };
  }
  if (previous === null) {
    return {
      ok: false,
      error:
        `refusing to promote hotfix v${version}: the current public release ` +
        `${previousVersion ? `v${previousVersion} ` : ''}declares no readable compatibility.minimum, ` +
        `so the ${HOTFIX_SPEC_REF} prohibition on raising the declared minimum Foundry version cannot ` +
        'be verified.',
    };
  }

  // Foundry's OWN comparator decides "raised", exactly as the running client does when it refuses to
  // install a package whose minimum exceeds its core generation. This compares Foundry core
  // GENERATION values (bare integers or dotted core versions), never module versions and never
  // SemVer.
  if (foundryIsNewerVersion(promoted, previous)) {
    return {
      ok: false,
      error:
        `refusing to promote hotfix v${version}: it raises the declared minimum Foundry version from ` +
        `${previous} (the current public v${previousVersion || '(unknown)'}) to ${promoted}. ` +
        `${HOTFIX_SPEC_REF} forbids this because Foundry refuses to install a package whose minimum ` +
        'exceeds the running core version, stranding exactly the users the hotfix is for. Ship the fix ' +
        'without raising compatibility.minimum, or release it as a normal version through the private ' +
        'stages.',
    };
  }

  return {
    ok: true,
    reason: `hotfix v${version} does not raise the declared minimum Foundry version (${promoted} vs public ${previous}).`,
  };
}

/**
 * Decide one private target for the registry-lead check, per §Registry lead prohibition. Evaluated
 * per target — the channel manifest AND each tester manifest — because Foundry decides the defection
 * offer against the manifest URL the client actually baked, not the channel's.
 *
 * Two ways a cohort-retaining target defects once the registry advertises `version`:
 *
 *   - its head is a version Foundry considers OLDER than `version` (a backwards head), or
 *   - its manifest URL returns 404 (an ABSENT head) while the module is listed on the registry.
 *
 * Both let Foundry offer the client a permanent rewrite to the registry's manifest URL — for a
 * private cohort, a silent, irreversible defection. The absent-head half is the one the guard used
 * to skip; it is now a hard failure for every cohort-retaining NON-SOURCE target. A SOURCE-channel
 * target is exempt here only because the promotion's source-advertises verification already
 * hard-fails an absent head on it, per target, before this check runs.
 *
 * @param {object} options The inputs.
 * @param {string} options.channel The channel this target belongs to (`beta` or `early-access`).
 * @param {string} options.sourceChannel The promotion's source channel (`early-access` or `N.N.x`).
 * @param {string} options.label The target's stable, secret-free label.
 * @param {string|null|undefined} options.head The version the target advertises, or `null` when absent.
 * @param {string} options.version The version being promoted to the registry.
 * @returns {{decision: 'safe'|'refuse', kind?: 'absent'|'backwards', reason: string}} The verdict.
 */
export function evaluateRegistryLeadTarget({ channel, sourceChannel, label, head, version }) {
  const isSourceChannel = channel === sourceChannel;

  if (head === null || head === undefined) {
    // An absent head on the SOURCE channel is already hard-failed, per target, by the
    // source-advertises verification that runs before this loop — skip it here rather than duplicate
    // that refusal. An absent head on a cohort-retaining NON-SOURCE channel is the 404 the spec
    // forbids: the manifest URL a retained cohort baked returns nothing while the module is listed on
    // the registry, so Foundry offers that cohort a rewrite out of its private channel. Enforcement
    // is a verification performed by the promotion, so this is a hard failure, never the assumption
    // that the target was simply never published.
    if (isSourceChannel) {
      return {
        decision: 'safe',
        reason: `${channel} target ${label} is the source channel — its head is verified by the source-advertises check.`,
      };
    }
    return {
      decision: 'refuse',
      kind: 'absent',
      reason:
        `registry-lead: ${channel} target ${label} has NO published head while v${version} is being ` +
        'promoted to the registry. A cohort-retaining channel whose manifest 404s lets Foundry offer ' +
        `its clients a rewrite out of the private channel once v${version} is listed — a silent, ` +
        `irreversible defection. Publish ${channel}'s head (advance it to a version Foundry considers ` +
        'newer than the registry) before re-running this promotion.',
    };
  }

  if (!foundryIsNewerVersion(version, head)) {
    return {
      decision: 'safe',
      reason: `${channel} target ${label} advertises v${head}, which Foundry does not consider older than v${version}.`,
    };
  }

  if (channel === 'beta') {
    return {
      decision: 'refuse',
      kind: 'backwards',
      reason:
        `registry-lead: beta target ${label} advertises v${head}, older than the v${version} being ` +
        'promoted to public. Foundry would defect that cohort. Advance beta first — push the feature ' +
        `work to main so beta.yml mints a newer beta (whose prerelease head sorts above v${version}) — ` +
        'then re-run this promotion.',
    };
  }
  return {
    decision: 'refuse',
    kind: 'backwards',
    reason:
      `registry-lead: early-access target ${label} advertises v${head}, older than the v${version} ` +
      'being promoted to public. Foundry would defect that cohort. Advance early-access first (promote ' +
      'a newer version onto it) — then re-run this promotion.',
  };
}

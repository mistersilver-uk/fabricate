/** Promotion-time release guards for `.github/workflows/promote-to-public.yml` (issue #716). */

import { foundryIsNewerVersion } from './semver.js';

const HOTFIX_SPEC_REF = 'Release and Distribution §Hotfix isolation';

/**
 * Normalise a declared `compatibility.minimum` to a comparable string, or `null` when it carries no
 * value. Absent is deliberately distinct from any present value: it means "could not read", never
 * "0".
 */
function normaliseMinimum(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Refuse a hotfix promotion whose declared minimum Foundry version exceeds the current public
 * release's, per §Hotfix isolation.
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

  // A hotfix always fixes an existing public version, so both artefacts must declare a minimum to
  // compare.
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

  // Foundry's own comparator decides "raised", exactly as the running client does when it refuses
  // to install a package whose minimum exceeds its core generation.
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

/** Decide one private target for the registry-lead check, per §Registry lead prohibition. */
export function evaluateRegistryLeadTarget({ channel, sourceChannel, label, head, version }) {
  const isSourceChannel = channel === sourceChannel;

  if (head === null || head === undefined) {
    // An absent head on the source channel is already hard-failed, per target, by the
    // source-advertises verification that runs before this loop — skip it here rather than
    // duplicate that refusal.
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
    // The remedy is ordered by what is actually reachable.
    return {
      decision: 'refuse',
      kind: 'backwards',
      reason:
        `registry-lead: beta target ${label} advertises v${head}, older than the v${version} being ` +
        'promoted to public. Foundry would defect that cohort. Advance beta first. If the prerelease ' +
        `line is itself numbered below v${version} — which is the case whenever v${head} is a ` +
        'prerelease of a version at or below the released one — no amount of new work on main can ' +
        'raise it, because every version it mints stays on that line: bring the release line back ' +
        'into the prerelease line first (the forward-port, which merges release into main and ' +
        'promotes nothing), and the next prerelease is numbered above the released version. ' +
        'Otherwise push the feature work to main so beta.yml mints a newer beta (whose prerelease ' +
        `head sorts above v${version}). Then re-run this promotion.`,
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

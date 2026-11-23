import { laxNumberOrNull, stringOrNull } from '../../utils/scalars.js';

/**
 * The retained execution claim a GM can reconcile, from the authority's cached identity.
 * Drops the opaque request id and status, so no consumer can show or depend on them.
 * `null` when the value carries no claim id.
 */
export function projectRetainedClaim(value) {
  const claimId = stringOrNull(value?.claimId);
  if (!claimId) return null;
  return {
    claimId,
    requestKind: stringOrNull(value?.requestKind),
    failureReason: stringOrNull(value?.failureReason),
    failureMessage: stringOrNull(value?.failureMessage),
    claimedAt: laxNumberOrNull(value?.claimedAt),
  };
}

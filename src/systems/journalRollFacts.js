/**
 * What the attested initiator of a Journal check may receive of its roll: the executed evidence,
 * the handoff it posts itself, and the roll riding the stage's result card. One entitlement, the
 * operation's `authorizeRollHandoff`, gates all three.
 */
import { cardCarriesHandoff, withOfferedHandoff } from './checkCardRolls.js';
import { checkDisplayForCard } from './craftCardFields.js';

/**
 * A crafting reply's executed check projection for the player's result box (issue 2005), or null:
 * a blind roll, which the roller never sees, a non-crafting run and a stage with no rolled check
 * have none. The caller attaches it only for an entitled initiator.
 */
export function executedCheckFor(runType, checkResult) {
  const check = runType === 'crafting' ? checkDisplayForCard(checkResult) : null;
  return check?.evidence && check.visibility?.rollMode !== 'blindroll' ? check : null;
}

/**
 * Whether the attested initiator may receive a visible roll's private facts, re-read against the
 * fresh actor, sender and run. An operation with no `authorizeRollHandoff` entitles everyone.
 */
export async function initiatorEntitled({
  operation,
  request,
  resolveUuid,
  getUser,
  ...authorization
}) {
  if (typeof operation.authorizeRollHandoff !== 'function') return true;
  try {
    const freshActor = await resolveUuid(request.actorUuid);
    const freshSender = getUser?.(request.senderId) ?? null;
    const hasRun = typeof request.runId === 'string' && request.runId.trim() !== '';
    const freshRun =
      freshActor && hasRun
        ? await operation.getRun?.({
            actor: freshActor,
            runId: request.runId,
            includeHistory: true,
          })
        : null;
    return Boolean(
      freshActor &&
      freshSender &&
      (await operation.authorizeRollHandoff({
        actor: freshActor,
        run: freshRun,
        sender: freshSender,
        ...authorization,
      }))
    );
  } catch {
    return false;
  }
}

/**
 * A public crafting check's result with its handoff offered to the stage's result card under the
 * request id, authored as the attested sender. An initiator the handoff is refused to gets no
 * offer, so the card carries no roll they could not have posted. The gathering card states no
 * roll, so a gathering roll keeps its own message.
 */
export async function cardOffer(checkResult, handoff, authorization) {
  const { request } = authorization;
  if (request.runType !== 'crafting' || !cardCarriesHandoff(checkResult, handoff)) {
    return checkResult;
  }
  if (!(await initiatorEntitled(authorization))) return checkResult;
  return withOfferedHandoff(checkResult, handoff, request.requestId, request.senderId);
}

/** Evidence and the handoff share one entitlement: an unentitled initiator receives neither. */
export async function withEntitledFacts(response, { check, handoff }, authorization) {
  if (!(handoff || check) || !(await initiatorEntitled(authorization))) return response;
  return { ...response, ...(check && { check }), ...(handoff && { rollHandoff: handoff }) };
}

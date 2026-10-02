/**
 * A Journal command's interactive check on the requesting client: the prompt a human answers with
 * no timeout, the settle under the one-use prepare token, and the fresh preparation that keeps a
 * token refused in the meantime from costing the player their roll.
 */
import { safeRollDecision } from './journalPreparedCheck.js';
import { decisionStandsFor } from './preparedDecisionPolicy.js';

/** How many fresh preparations one command may ask for after its prepare token was refused. */
export const PREPARE_RETRY_LIMIT = 3;

const TOKEN_REFUSED = 'prepare-token-invalid';

/**
 * Prompts for `first`, the authority's `checkRequired` reply to `command`, and settles the answer.
 * A refused token re-sends `command` for a fresh preparation: the answer settles under it unasked
 * when `decisionStandsFor` holds, else `onCheckChanged` runs and the fresh descriptor is prompted
 * with `{ changed: true }`, so the reopened prompt can say why it is back.
 * Past `PREPARE_RETRY_LIMIT` the refusal stands, and a preparation that fails answers its reason.
 */
export async function settlePromptedCheck(
  command,
  first,
  { sendCommand, promptCheck, postRollHandoff = null, onCheckChanged = null }
) {
  let prepared = first;
  let decision = await promptCheck(prepared.promptDescriptor);
  for (let retries = 0; ; retries += 1) {
    const token = { prepareToken: prepared.prepareToken };
    if (!decision || decision.confirmed === false) {
      await sendCommand({ ...command, action: 'releaseCheck', payload: token });
      return { success: false, cancelled: true, reason: 'roll-cancelled' };
    }
    const settled = await sendCommand({
      ...command,
      payload: { ...command.payload, ...token, rollDecision: safeRollDecision(decision) },
    });
    if (settled?.reason !== TOKEN_REFUSED || retries >= PREPARE_RETRY_LIMIT) {
      if (settled?.rollHandoff && typeof postRollHandoff === 'function') {
        await postRollHandoff(settled.rollHandoff);
      }
      return settled;
    }
    const fresh = await sendCommand(command);
    if (!fresh?.checkRequired) return fresh;
    if (!decisionStandsFor(decision, prepared.promptDescriptor, fresh.promptDescriptor)) {
      onCheckChanged?.();
      decision = await promptCheck(fresh.promptDescriptor, { changed: true });
    }
    prepared = fresh;
  }
}

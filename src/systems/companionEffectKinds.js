/**
 * The companion reward effect kinds (issue 1954). `plan(payload, evidence)` validates a payload
 * and resolves its world actors, answering `{ failure }` or `{ replayClass, units }`; each unit
 * names its positional `subwriteId` and `target`, and carries `write` and `probe`.
 */
import { placeComponentAward, probeComponentAward } from './companionComponentAward.js';
import { normalizeGrantedBy } from './companionContract.js';
import { createCurrencyCreditKind } from './companionCurrencyEffect.js';
import {
  effectFailureOf,
  exactObject,
  nonblank,
  readRecipients,
  resolveRecipientActors,
} from './companionEffectSupport.js';
import { grantRecipeKnowledgeEntry, probeRecipeKnowledgeGrant } from './companionKnowledgeGrant.js';
import { itemStackQuantityPath } from './itemStackQuantity.js';

function actorItems(actor) {
  const items = actor?.items;
  if (!items) return [];
  return Array.isArray(items.contents) ? items.contents : [...items];
}

function validAward(award) {
  return (
    exactObject(award, ['componentId', 'quantity']) &&
    nonblank(award.componentId) &&
    Number.isSafeInteger(award.quantity) &&
    award.quantity > 0
  );
}

/** Applied receipts of one recipient, reattached to that actor's items so later awards stack. */
function carriedFromEvidence(evidence, index, actor, awards) {
  const carried = new Map();
  for (const [position, award] of awards.entries()) {
    const settled = evidence?.subwrites.find(
      (subwrite) => subwrite.subwriteId === `r${index}.a${position}`
    );
    const itemUuid = settled?.phase === 'applied' ? settled.receipt?.itemUuid : null;
    const document = itemUuid ? actorItems(actor).find((item) => item.uuid === itemUuid) : null;
    if (document) carried.set(award.componentId, document);
  }
  return carried;
}

function createComponentAwardKind(seams) {
  function plan(payload, evidence) {
    if (!exactObject(payload, ['recipients', 'systemId']) || !nonblank(payload.systemId)) {
      return { failure: effectFailureOf('invalidPayload') };
    }
    const read = readRecipients(payload, 'awards');
    if (read.failure) return read;
    if (read.recipients.some(({ awards }) => !awards.every(validAward))) {
      return { failure: effectFailureOf('invalidPayload', 'awards') };
    }
    const system = seams.resolveSystem?.(payload.systemId) || null;
    if (!system) return { failure: effectFailureOf('systemNotFound', payload.systemId) };
    const resolved = resolveRecipientActors(read.recipients, seams.resolveActor);
    if (resolved.failure) return resolved;
    const quantityPath = itemStackQuantityPath();
    const units = read.recipients.flatMap(({ awards }, index) => {
      const actor = resolved.actors[index];
      const carried = carriedFromEvidence(evidence, index, actor, awards);
      return awards.map((entry, position) => ({
        subwriteId: `r${index}.a${position}`,
        target: { actorUuid: actor.uuid, itemUuid: null },
        write: ({ marker, beforeWrite }) =>
          placeComponentAward(
            { actor, entry, system, marker, carried, quantityPath, beforeWrite },
            seams
          ),
        probe: ({ intent }, marker) =>
          probeComponentAward({
            intent,
            marker,
            quantity: entry.quantity,
            documents: actorItems(actor),
            quantityPath,
          }),
      }));
    });
    return { replayClass: 'structuredMarker', units };
  }
  return Object.freeze({ plan });
}

function createKnowledgeGrantKind(seams) {
  const flags = { readFlag: seams.readFlag, writeFlag: seams.writeFlag };
  function plan(payload) {
    if (!exactObject(payload, ['grantedBy', 'recipients'])) {
      return { failure: effectFailureOf('invalidPayload') };
    }
    const label = normalizeGrantedBy(payload.grantedBy);
    if (!label.ok) return { failure: effectFailureOf('invalidPayload', label.outcome) };
    const read = readRecipients(payload, 'recipeIds');
    if (read.failure) return read;
    for (const { recipeIds } of read.recipients) {
      const unknown = recipeIds.find((id) => !nonblank(id) || !seams.resolveRecipe?.(id));
      if (unknown !== undefined) return { failure: effectFailureOf('recipeNotFound', unknown) };
    }
    const resolved = resolveRecipientActors(read.recipients, seams.resolveActor);
    if (resolved.failure) return resolved;
    const grantedBy = label.value;
    const units = read.recipients.flatMap(({ recipeIds }, index) => {
      const actor = resolved.actors[index];
      return recipeIds.map((recipeId, position) => ({
        subwriteId: `r${index}.k${position}`,
        target: { actorUuid: actor.uuid, recipeId },
        write: ({ beforeWrite }) =>
          grantRecipeKnowledgeEntry({ actor, recipeId, grantedBy, beforeWrite }, flags),
        probe: () => probeRecipeKnowledgeGrant(actor, { recipeId, grantedBy }),
      }));
    });
    return { replayClass: 'idempotentKey', units };
  }
  return Object.freeze({ plan });
}

/**
 * The kinds by plan `kind` string. `seams.resolveActor(actorId)` must answer world actors only;
 * the component, knowledge and currency seams are those their writers take.
 */
export function createCompanionEffectKinds(seams = {}) {
  return Object.freeze({
    componentAward: createComponentAwardKind(seams),
    currencyCredit: createCurrencyCreditKind(seams),
    recipeKnowledgeGrant: createKnowledgeGrantKind(seams),
  });
}

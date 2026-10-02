/**
 * What an evaluated check roll leaves behind, shared by the summed and counted evaluations: its
 * dice groups, its pre-roll evidence, its chat post and its entitled roll handoff.
 */
import { cloneJson } from '../utils/scalars.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { offerCardRolls } from './checkCardRolls.js';
import { postBundledCheckRoll } from './checkModifierRolls.js';

/**
 * The evaluated roll's dice as `{ groupId, group: "NdS", sum, results }`. `groupId` is the index
 * in `roll.dice` order, which `diceGroup` triggers target. Rolling check modifiers append their
 * dice after the authored ones (issue 1118), so authored indices never move; a trigger whose
 * index already dangled may now match a modifier's die, deliberately unguarded because a
 * re-parsed group count disagrees with `roll.dice` on some formulas. `sum` is the post-modifier
 * `DiceTerm#total` (else the active faces' sum) and `results` are the active-only raw faces
 * (`.agents/docs/foundry-and-architecture.md`, `DiceTerm#total`).
 */
export function rolledDiceGroups(roll) {
  const dice = Array.isArray(roll?.dice) ? roll.dice : [];
  return dice.map((die, groupId) => {
    const count = Number(die?.number);
    const faces = Number(die?.faces);
    const dieTotal = Number(die?.total);
    // `active !== false`: Foundry omits `active` on a kept result (issue 419).
    const rawResults = Array.isArray(die?.results) ? die.results : [];
    const results = rawResults
      .filter((entry) => entry?.active !== false)
      .map((entry) => Number(entry?.result))
      .filter((face) => Number.isFinite(face));
    // Post-modifier total, else the active faces' sum for an unevaluated die (issue 443).
    const sum = Number.isFinite(dieTotal) ? dieTotal : results.reduce((acc, face) => acc + face, 0);
    return {
      groupId,
      group: `${Number.isFinite(count) ? count : 0}d${Number.isFinite(faces) ? faces : 0}`,
      sum,
      results,
    };
  });
}

/** The settled pre-rolls a result records, without their serialized rolls. */
export function preRollEvidence(rolled) {
  const entries = rolled?.modifierPlacement?.preRolls;
  if (!Array.isArray(entries) || entries.length === 0) return {};
  return {
    preRolls: entries.map(({ source, label, expression, total, destination, negate }) => ({
      source,
      label,
      expression,
      total,
      destination,
      ...(negate === true && { negate: true }),
    })),
  };
}

/**
 * The executed roll mode, on a result whose caller asked for it, and the offer its rolls ride to
 * the result card under; neither is persisted.
 */
export function reportedVisibility(rolled) {
  if (!rolled || !Object.hasOwn(rolled, 'rollMode')) return {};
  return {
    visibility: { rollMode: rolled.rollMode, secret: false },
    ...(rolled.cardRolls && { cardRolls: rolled.cardRolls }),
  };
}

/** The check roll and its pre-rolls as one chat message under `rollMode`. */
async function postRollMessage({ roll, preRolls, speaker, flavor, rollMode }) {
  if (preRolls.length > 0) {
    await postBundledCheckRoll({ mainRoll: roll, preRolls, speaker, flavor, rollMode });
    return;
  }
  await roll.toMessage({ speaker, flavor }, { ...chatModeOption(rollMode), create: true });
}

/**
 * Interactive rolls reach chat, which is what Dice So Nice animates; a failed post is swallowed.
 * A public roll whose caller posts a result card (`options.cardRolls`, with the visibility report
 * the card gates on) is offered to that card instead and answers `{ cardRolls }`, the offer its
 * caller settles; every other roll posts its own message now and answers nothing.
 */
export async function postCheckRoll({ roll, preRolls, options, flavor, rollMode }) {
  if (
    !options?.interactive ||
    options?.post === false ||
    typeof globalThis.ChatMessage?.create !== 'function'
  ) {
    return {};
  }
  const post = async () => {
    try {
      await postRollMessage({ roll, preRolls, speaker: options.speaker, flavor, rollMode });
    } catch (error) {
      console.error('Fabricate | Failed to post check roll to chat:', error);
    }
  };
  const offered = options.cardRolls === true && options.reportVisibility === true;
  if (offered && rollMode === 'publicroll') {
    return { cardRolls: offerCardRolls({ rolls: () => [roll, ...preRolls], post }) };
  }
  await post();
  return {};
}

/** Reconstruct and post an entitled GM-evaluated roll, including serialized pre-rolls without rerolling. */
export async function postCheckRollHandoff(handoff, { Roll = globalThis.Roll } = {}) {
  if (!handoff?.serializedRoll || typeof Roll?.fromData !== 'function') {
    return { success: false, reason: 'invalid-roll-handoff' };
  }
  try {
    const roll = Roll.fromData(handoff.serializedRoll);
    const serializedPreRolls = handoff.serializedPreRolls;
    const preRolls = (Array.isArray(serializedPreRolls) ? serializedPreRolls : []).map((data) =>
      Roll.fromData(data)
    );
    const bundled = preRolls.length > 0;
    if (!roll || preRolls.some((entry) => !entry)) {
      return { success: false, reason: 'invalid-roll-handoff' };
    }
    if (!bundled && typeof roll.toMessage !== 'function') {
      return { success: false, reason: 'invalid-roll-handoff' };
    }
    await postRollMessage({
      roll,
      preRolls,
      speaker: handoff.speaker ?? undefined,
      flavor: handoff.flavor ?? undefined,
      rollMode: handoff.rollMode,
    });
    return { success: true };
  } catch (error) {
    console.error('Fabricate | Failed to post authoritative check roll to chat:', error);
    return { success: false, reason: 'chat-post-failed' };
  }
}

/** The evaluated roll data an entitled caller posts itself, or `null` when not requested. */
export function checkRollHandoff({ roll, placement, options, flavor, rollMode }) {
  const serializedPreRolls = placement.preRolls.map((entry) => entry.serializedRoll);
  if (
    options?.includeRollHandoff !== true ||
    typeof roll?.toJSON !== 'function' ||
    !serializedPreRolls.every(Boolean)
  ) {
    return null;
  }
  return {
    serializedRoll: cloneJson(roll),
    ...(serializedPreRolls.length > 0 && { serializedPreRolls }),
    flavor: flavor ?? null,
    speaker: options?.speaker ?? null,
    rollMode: rollMode ?? null,
  };
}

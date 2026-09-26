/** Evaluates planned modifier expressions once, outside the main check roll. */

import { cloneJson } from '../utils/scalars.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { settlePlacement } from './checkModifierRouter.js';

function restoredRoll(entry, Roll) {
  if (!entry.serializedRoll || typeof Roll?.fromData !== 'function') {
    throw new TypeError('Pre-roll reconstruction is unavailable');
  }
  // `Roll.fromData` mutates its input, so the retained evidence is never handed over directly.
  const roll = Roll.fromData(structuredClone(entry.serializedRoll));
  if (!roll) throw new TypeError('Pre-roll reconstruction failed');
  return roll;
}

/**
 * Evaluates pending placement expressions once and keeps their rolls for a bundled chat message.
 * A library failure aborts the check, while other sources keep their existing local zero fallback.
 */
export async function resolveModifierPreRolls(plan, { Roll, rollData = {} } = {}) {
  const results = [];
  const failed = new Set();
  const evaluated = new Map();

  for (const entry of plan.preRolls) {
    if (Object.hasOwn(entry, 'total')) continue;
    try {
      if (typeof Roll !== 'function') throw new TypeError('Roll engine is unavailable');
      const roll = await new Roll(entry.expression, rollData).evaluate({ allowInteractive: false });
      if (!Number.isFinite(roll?.total)) throw new TypeError('Modifier roll total is not finite');
      evaluated.set(entry.index, roll);
      results.push({
        index: entry.index,
        total: roll.total,
        // `Roll#toJSON` is shallow (a parenthetical term keeps its live inner Roll); JSON is not.
        ...(typeof roll.toJSON === 'function' && { serializedRoll: cloneJson(roll) }),
      });
    } catch (error) {
      if (entry.source === 'library') throw error;
      failed.add(entry.index);
      results.push({ index: entry.index, total: 0 });
    }
  }

  const settled = settlePlacement(plan, results);
  const preRolls = settled.preRolls.filter((entry) => !failed.has(entry.index));
  return {
    placement: { ...settled, preRolls },
    rolls: preRolls.map((entry) => evaluated.get(entry.index) ?? restoredRoll(entry, Roll)),
  };
}

/**
 * Posts the main check and its pre-rolls as one message under the chosen mode.
 * Without a chosen mode, the posting client's current chat-mode setting supplies the visibility.
 * Content is the bare total, as `Roll#toMessage` sets it, so Foundry renders every roll per viewer.
 */
export async function postBundledCheckRoll({
  mainRoll,
  preRolls,
  speaker,
  flavor,
  rollMode,
  ChatMessage = globalThis.ChatMessage,
  game = globalThis.game,
}) {
  if (typeof ChatMessage?.create !== 'function') throw new TypeError('ChatMessage is unavailable');
  const modeOption = chatModeOption(rollMode);
  if (!rollMode) {
    const modeKey = Object.keys(modeOption)[0];
    if (typeof game?.settings?.get !== 'function') {
      throw new TypeError('Client chat mode is unavailable');
    }
    modeOption[modeKey] = game.settings.get('core', modeKey);
  }
  return ChatMessage.create(
    { speaker, flavor, content: String(mainRoll?.total ?? ''), rolls: [mainRoll, ...preRolls] },
    modeOption
  );
}

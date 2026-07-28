/**
 * requirementSlots — the pure projection behind the player Crafting tab's
 * requirement rail (issue 917).
 *
 * One ingredient set is presented as ONE ordered list of slot tiles: the set's
 * fixed component/tag requirements, its choice requirements and its first-class
 * essence requirements, each carrying the state its tile paints and the chooser
 * key the rail opens for it. The same projection derives the consumption plan the
 * "Will be consumed" panel states, so the rail and the panel can never disagree
 * about what the craft spends.
 *
 * Deliberately import-free (design-system §7) and free of Foundry/DOM globals: one
 * raw-module entry covers it in every mounted harness, and it is fully
 * unit-testable on its own.
 */

/** The three requirement shapes a slot tile can present. */
export const SLOT_KIND = Object.freeze({
  FIXED: 'fixed',
  CHOICE: 'choice',
  ESSENCE: 'essence',
});

/**
 * The three slot states. `partial` exists because a two-state surface renders an
 * untouched choice and a genuinely unaffordable one identically, and marks a
 * half-funded essence as an error.
 */
export const SLOT_STATE = Object.freeze({
  MET: 'met',
  PARTIAL: 'partial',
  SHORT: 'short',
});

/**
 * Every first-class essence requirement in a set is funded from ONE shared pool,
 * so every essence tile opens the same chooser. Its tiles stay individually keyed
 * (by group id) for rendering; only the chooser key is shared.
 */
export const ESSENCE_POOL_SLOT_ID = 'essence-pool';

/**
 * The scoped "the player closed the chooser" sentinel.
 *
 * A rail with any openable slot always resolves SOMETHING open, so without this a
 * click on the open tile re-stored the same key and resolved back to the same slot
 * — a no-op on a control reporting `aria-expanded="true"`. Storing this id instead
 * makes the disclosure genuinely collapsible while keeping the memory SCOPED: it is
 * composed and re-validated through exactly the same `${scopeKey}:${slotId}` path as
 * a real slot, so changing set, step or recipe drops the closed state too and the
 * new scope opens its first unsatisfied slot as before.
 */
export const CLOSED_SLOT_ID = '__closed__';

function toCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function kindOf(state) {
  if (state?.isEssence === true) return SLOT_KIND.ESSENCE;
  return state?.hasChoice === true ? SLOT_KIND.CHOICE : SLOT_KIND.FIXED;
}

/**
 * An essence requirement reports `delivered` — the essence amount the resolved
 * allocation supplies it — NOT `have`, which upstream removed from the essence
 * branch precisely because it answered a different question. `have` is retained
 * only as a defensive read for a duck-typed craftability from an older listing.
 */
function ratioOf(kind, state) {
  if (kind !== SLOT_KIND.ESSENCE) return toCount(state?.have);
  return toCount(state?.delivered ?? state?.have);
}

function essenceState(delivered, need) {
  if (need <= 0 || delivered >= need) return SLOT_STATE.MET;
  return delivered > 0 ? SLOT_STATE.PARTIAL : SLOT_STATE.SHORT;
}

/**
 * A choice the player has NOT picked from is a to-do, never an error: the
 * resolver's default pick is a starting point, not a decision the player made. A
 * choice they did pick reports its own numbers, so an explicitly chosen short
 * option still reads as blocking (the shipped selectable-but-flagged rule).
 */
function choiceState(state, chosen) {
  if (state?.satisfied === true) return SLOT_STATE.MET;
  return chosen ? SLOT_STATE.SHORT : SLOT_STATE.PARTIAL;
}

function stateOf(kind, state, chosen) {
  if (kind === SLOT_KIND.ESSENCE) {
    return essenceState(ratioOf(kind, state), toCount(state?.need));
  }
  if (kind === SLOT_KIND.CHOICE) return choiceState(state, chosen);
  return state?.satisfied === true ? SLOT_STATE.MET : SLOT_STATE.SHORT;
}

function buildSlot(state, index, chosenGroupIds) {
  const groupId = state?.groupId ?? null;
  const kind = kindOf(state);
  return {
    key: groupId ?? `requirement-${index}`,
    groupId,
    // Fixed slots are not selectable, so they open nothing.
    slotId: pickSlotId(kind, groupId),
    kind,
    state: stateOf(kind, state, chosenGroupIds.has(groupId)),
    interactive: kind !== SLOT_KIND.FIXED,
    name: toText(state?.name) || toText(state?.description),
    description: toText(state?.description),
    img: state?.img ?? null,
    icon: state?.icon ?? null,
    isEssence: kind === SLOT_KIND.ESSENCE,
    colorToken: state?.colorToken ?? null,
    have: ratioOf(kind, state),
    need: toCount(state?.need),
    owned: toCount(state?.owned ?? state?.have),
    choiceCount: toCount(state?.choiceCount),
    satisfied: state?.satisfied === true,
  };
}

function pickSlotId(kind, groupId) {
  if (kind === SLOT_KIND.ESSENCE) return ESSENCE_POOL_SLOT_ID;
  return kind === SLOT_KIND.CHOICE ? groupId : null;
}

/**
 * Project a per-set craftability into the rail's ordered slot list.
 *
 * @param {object|null} craftability A per-set `evaluateCraftability` result.
 * @param {object} [options]
 * @param {Iterable<string>} [options.chosenGroupIds] Group ids the player has
 *   explicitly picked an option for, so an untouched choice reads as a to-do.
 * @returns {object[]}
 */
export function buildRequirementSlots(craftability, { chosenGroupIds = [] } = {}) {
  const states = Array.isArray(craftability?.ingredientStates)
    ? craftability.ingredientStates
    : [];
  const chosen = new Set(chosenGroupIds);
  return states.map((state, index) => buildSlot(state, index, chosen));
}

/** Compose the store's scoped chooser key. Null scope or slot means "closed". */
export function composeSlotKey(scopeKey, slotId) {
  if (!scopeKey || !slotId) return null;
  return `${scopeKey}:${slotId}`;
}

/** The distinct chooser ids the rail can open, in slot order. */
function openableSlotIds(slots) {
  const ids = [];
  for (const slot of slots) {
    if (!slot?.interactive || !slot.slotId) continue;
    if (!ids.includes(slot.slotId)) ids.push(slot.slotId);
  }
  return ids;
}

function firstUnsatisfiedSlotId(slots, ids) {
  const shortId = ids.find((id) =>
    slots.some((slot) => slot.slotId === id && slot.state !== SLOT_STATE.MET)
  );
  return shortId ?? ids[0];
}

/**
 * The chooser that is open, RE-VALIDATED against the live slot list on every read.
 *
 * A bare sticky key opens a stale or absent chooser the moment the set, step or
 * recipe changes, so the remembered key only wins while it still names a slot in
 * the current scope; otherwise focus falls to the first unsatisfied slot and then
 * to the first slot.
 *
 * A remembered {@link CLOSED_SLOT_ID} in the current scope means the player closed
 * the chooser, and closes it — the one case in which a rail with openable slots
 * opens nothing.
 *
 * @param {object} args
 * @param {object[]} args.slots
 * @param {string|null} args.scopeKey
 * @param {string|null} args.rememberedKey The stored `${scopeKey}:${slotId}`.
 * @returns {string|null}
 */
export function resolveOpenSlotId({ slots = [], scopeKey = null, rememberedKey = null } = {}) {
  const ids = openableSlotIds(slots);
  if (ids.length === 0) return null;
  if (typeof rememberedKey === 'string' && scopeKey) {
    const prefix = `${scopeKey}:`;
    if (rememberedKey.startsWith(prefix)) {
      const remembered = rememberedKey.slice(prefix.length);
      if (remembered === CLOSED_SLOT_ID) return null;
      if (ids.includes(remembered)) return remembered;
    }
  }
  return firstUnsatisfiedSlotId(slots, ids);
}

function planRowFor(slot) {
  return {
    key: slot.key,
    name: slot.name,
    img: slot.img,
    isEssence: false,
    quantity: slot.need,
    owned: slot.have,
    sufficient: slot.state === SLOT_STATE.MET,
    contributions: [],
  };
}

function carrierContributions(carrier, requirementsById) {
  const perUnit = carrier?.perUnit && typeof carrier.perUnit === 'object' ? carrier.perUnit : {};
  return Object.entries(perUnit).map(([essenceId, amountPerUnit]) => {
    const requirement = requirementsById.get(essenceId) ?? null;
    return {
      essenceId,
      name: toText(requirement?.name) || essenceId,
      icon: requirement?.icon ?? null,
      colorToken: requirement?.colorToken ?? null,
      amount: toCount(amountPerUnit) * toCount(carrier?.allocatedUnits),
      required: Boolean(requirement),
    };
  });
}

function carrierPlanRows(pool) {
  const carriers = Array.isArray(pool?.carriers) ? pool.carriers : [];
  const requirements = Array.isArray(pool?.requirements) ? pool.requirements : [];
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.essenceId, requirement])
  );
  return carriers
    .filter((carrier) => toCount(carrier?.allocatedUnits) > 0)
    .map((carrier) => ({
      key: `carrier:${carrier.itemKey}`,
      name: toText(carrier?.name),
      img: carrier?.img ?? null,
      isEssence: true,
      quantity: toCount(carrier.allocatedUnits),
      owned: toCount(carrier.ownedUnits),
      sufficient: toCount(carrier.allocatedUnits) <= toCount(carrier.ownedUnits),
      contributions: carrierContributions(carrier, requirementsById),
    }));
}

function pendingEntries(slots) {
  const pending = [];
  for (const slot of slots) {
    if (slot.kind === SLOT_KIND.ESSENCE) {
      if (slot.state !== SLOT_STATE.MET) {
        pending.push({ key: slot.key, kind: SLOT_KIND.ESSENCE, name: slot.name });
      }
      continue;
    }
    if (slot.kind === SLOT_KIND.CHOICE && slot.state === SLOT_STATE.PARTIAL) {
      pending.push({ key: slot.key, kind: SLOT_KIND.CHOICE, name: slot.name });
    }
  }
  return pending;
}

/**
 * What the craft will spend, and what is still undecided.
 *
 * Non-essence rows come from the slot list (one row per resolved requirement); an
 * untouched choice contributes no row and appears on the pending line instead.
 * Essence rows come from the pool's per-carrier allocation, because the block
 * contributes at most one plan entry per item key regardless of how many
 * requirements that item funds.
 *
 * A RESOLVED-BUT-SHORT requirement (a fixed one the player cannot afford, or a
 * choice they picked that does not cover the need) deliberately KEEPS its row,
 * carrying `sufficient: false` and its `owned` count, which the panel paints in the
 * danger tone beside the "You own N" line. The plan states what the craft spends,
 * not what the player can afford, and there is nothing to choose for such a
 * requirement — so dropping it would erase the only statement of the shortfall
 * anywhere on the surface while leaving the requirement invisible. Only the
 * UNDECIDED (`PARTIAL`) choice is withheld, because it moves to `pending`.
 *
 * @param {object|null} craftability
 * @param {object} [options]
 * @param {Iterable<string>} [options.chosenGroupIds]
 * @returns {{ rows: object[], pending: object[] }}
 */
export function buildConsumptionPlan(craftability, { chosenGroupIds = [] } = {}) {
  const slots = buildRequirementSlots(craftability, { chosenGroupIds });
  const rows = slots
    .filter((slot) => slot.kind !== SLOT_KIND.ESSENCE && slot.state !== SLOT_STATE.PARTIAL)
    .map(planRowFor);
  return {
    rows: [...rows, ...carrierPlanRows(craftability?.essencePool ?? null)],
    pending: pendingEntries(slots),
  };
}

function bestOption(options) {
  const ranked = [...options].sort((left, right) => {
    const satisfied = Number(right?.satisfied === true) - Number(left?.satisfied === true);
    if (satisfied !== 0) return satisfied;
    const held = toCount(right?.have) - toCount(left?.have);
    if (held !== 0) return held;
    return toCount(left?.optionIndex) - toCount(right?.optionIndex);
  });
  return ranked[0] ?? null;
}

function bestStack(stacks) {
  const ranked = [...stacks].sort((left, right) => {
    const held = toCount(right?.have) - toCount(left?.have);
    if (held !== 0) return held;
    return String(left?.itemId ?? '').localeCompare(String(right?.itemId ?? ''));
  });
  return ranked[0] ?? null;
}

function applyOptionChoice(overrides, choice) {
  const option = bestOption(Array.isArray(choice.options) ? choice.options : []);
  if (!option) return;
  overrides.set(choice.groupId, { optionIndex: option.optionIndex, heldItemId: null });
}

function applyStackChoice(overrides, choice) {
  const stack = bestStack(Array.isArray(choice.stacks) ? choice.stacks : []);
  if (!stack) return;
  const existing = overrides.get(choice.groupId) ?? null;
  overrides.set(choice.groupId, {
    optionIndex: existing?.optionIndex ?? choice.optionIndex ?? 0,
    heldItemId: stack.itemId ?? null,
  });
}

/**
 * "Pick for me" for the set's choice slots: the option the player holds most of,
 * preferring one that actually satisfies, with the authored option order as the
 * final tie-break so the suggestion is stable across renders.
 *
 * Read STRAIGHT off the craftability's own `ingredientChoices` — the UI never
 * re-derives what is held or what satisfies, because that is the resolver's answer
 * and a second implementation would drift from the plan the engine consumes.
 *
 * @param {object|null} craftability
 * @returns {Record<string, { optionIndex: number, heldItemId: string|null }>}
 */
export function suggestChoiceOverrides(craftability) {
  const choices = Array.isArray(craftability?.ingredientChoices)
    ? craftability.ingredientChoices
    : [];
  const overrides = new Map();
  for (const choice of choices) {
    if (!choice?.groupId) continue;
    if (choice.kind === 'option') applyOptionChoice(overrides, choice);
    else if (choice.kind === 'stack') applyStackChoice(overrides, choice);
  }
  return Object.fromEntries(overrides);
}

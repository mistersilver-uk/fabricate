// The projection behind the player Crafting tab's requirement rail (issue 917): one ingredient set
// as ONE ordered list of slot tiles. The SAME projection derives the consumption plan the "Will be
// consumed" panel states, so the rail and the panel can never disagree about what a craft spends.
// Import-free and free of Foundry and DOM globals, so one raw-module entry covers it everywhere.

export const SLOT_KIND = Object.freeze({
  FIXED: 'fixed',
  CHOICE: 'choice',
  ESSENCE: 'essence',
});

// `partial` exists because a two-state surface renders an untouched choice and a genuinely
// unaffordable one identically, and marks a half-funded essence as an error.
export const SLOT_STATE = Object.freeze({
  MET: 'met',
  PARTIAL: 'partial',
  SHORT: 'short',
});

// Every essence requirement in a set is funded from ONE pool, so every essence tile opens the same
// chooser. The tiles stay individually keyed for rendering; only the chooser key is shared.
export const ESSENCE_POOL_SLOT_ID = 'essence-pool';

// A rail with any openable slot always resolves SOMETHING open, so without this sentinel a click on
// the open tile re-stored the same key and resolved back to it — a no-op on a control reporting
// `aria-expanded="true"`. It is composed and re-validated through the same `${scopeKey}:${slotId}`
// path as a real slot, so changing set, step or recipe drops the closed state with it.
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

// An essence requirement reports `delivered`, the amount the resolved allocation supplies it, NOT
// `have`, which upstream removed from that branch because it answered a different question.
function ratioOf(kind, state) {
  if (kind !== SLOT_KIND.ESSENCE) return toCount(state?.have);
  return toCount(state?.delivered ?? state?.have);
}

function essenceState(delivered, need) {
  if (need <= 0 || delivered >= need) return SLOT_STATE.MET;
  return delivered > 0 ? SLOT_STATE.PARTIAL : SLOT_STATE.SHORT;
}

// A choice the player has NOT picked from is a to-do, never an error: the resolver's default pick
// is a starting point. A choice they DID pick reports its own numbers, so an explicitly chosen
// short option still reads as blocking.
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
    // A CURRENCY slot reports neither `have` nor `need` (issue 1493): its `need` is a price and its
    // `have` is always 0, so a "0/100" pip would state a shortfall the player may not have.
    isCurrency: state?.isCurrency === true,
    // Carried per slot because that is the projection's shape, but rendered ONCE per rail: the
    // reason belongs to the world's configuration, not to any one requirement.
    issue: toText(state?.issue),
  };
}

function pickSlotId(kind, groupId) {
  if (kind === SLOT_KIND.ESSENCE) return ESSENCE_POOL_SLOT_ID;
  return kind === SLOT_KIND.CHOICE ? groupId : null;
}

export function buildRequirementSlots(craftability, { chosenGroupIds = [] } = {}) {
  const states = Array.isArray(craftability?.ingredientStates)
    ? craftability.ingredientStates
    : [];
  const chosen = new Set(chosenGroupIds);
  return states.map((state, index) => buildSlot(state, index, chosen));
}

// A null scope or slot means "closed".
export function composeSlotKey(scopeKey, slotId) {
  if (!scopeKey || !slotId) return null;
  return `${scopeKey}:${slotId}`;
}

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

// RE-VALIDATED against the live slot list on every read: a bare sticky key opens a stale chooser
// the moment the set, step or recipe changes, so the remembered key wins only while it still names
// a slot in this scope. A remembered `CLOSED_SLOT_ID` is the one case where a rail with openable
// slots opens nothing.
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

// A CURRENCY row reports neither `quantity` nor `owned` (issue 1493) and carries the discriminator
// that says so: its `owned` is the evaluation's placeholder `0` rather than a coin balance, and its
// `quantity` is the price the name already spells out — the shared markup rendered a 100 gp cost as
// "100 gp … You own 0 … x100", restating the price beside a balance nobody measured.
function planRowFor(slot) {
  return {
    key: slot.key,
    name: slot.name,
    img: slot.img,
    isEssence: false,
    isCurrency: slot.isCurrency === true,
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
      // A pool carrier is an ITEM, never a coin, so it always reports its ratio.
      isCurrency: false,
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

// Non-essence rows come from the slot list; essence rows come from the pool's per-carrier
// allocation, because the block contributes at most one entry per item key however many
// requirements that item funds. A RESOLVED-BUT-SHORT requirement KEEPS its row, carrying
// `sufficient: false`: the plan states what the craft SPENDS, not what the player can afford, and
// dropping it would erase the only statement of the shortfall anywhere on the surface. Only the
// UNDECIDED choice is withheld, because it moves to `pending`.
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

// The option the player holds most of, preferring one that satisfies, with the authored option
// order as the final tie-break so the suggestion is stable across renders. Read STRAIGHT off the
// craftability's `ingredientChoices`: a second implementation would drift from the engine's plan.
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

/**
 * The Checks Studio's staged drafts and its rail group (issue 1096). Every check slot holds a draft
 * beside its saved baseline; the header Save persists each dirty activity, and the route-exit guard
 * discards them. Every input is a thunk read at call time. The model owns no effect: the root runs
 * `reseed()` from its own `$effect`.
 */
import {
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveActiveGatheringCheckFormula,
  resolveActiveSalvageCheckFormula,
} from '../../../../../systems/checkModifierResolver.js';

import {
  cloneProgressiveCheck,
  cloneRoutedCheck,
  cloneSimpleCheck,
  readCheckActive,
} from './checkDraftClone.js';
import {
  activeChecksTab as resolveActiveChecksTab,
  buildChecksNavItems,
  checksNavIssueTotal,
} from './checksNav.js';
import { evaluateCheckReadiness, readinessModeForSlot } from './checksReadiness.js';

const ACTIVITIES = Object.freeze(['crafting', 'salvage', 'gathering']);

const keepValue = (value) => value;

/**
 * Every staged slot, in save order within its activity. A `slot` names the sub-config the activity
 * rolls; a slot-less entry is persisted first, whenever it is dirty, before the active slot draft.
 */
const CHECK_SLOTS = Object.freeze([
  {
    key: 'alchemyCheckMode',
    activity: 'crafting',
    save: 'setAlchemyCheckMode',
    clone: keepValue,
    read: (system) => system?.alchemy?.checkMode || 'none',
  },
  {
    key: 'craftingCheckActive',
    activity: 'crafting',
    save: 'saveCraftingCheckActive',
    clone: keepValue,
    read: (system) => readCheckActive(system?.craftingCheck),
  },
  {
    key: 'checkRouted',
    activity: 'crafting',
    slot: 'routed',
    save: 'saveCraftingCheckRouted',
    clone: cloneRoutedCheck,
    read: (system) => system?.craftingCheck?.routed,
  },
  {
    key: 'checkSimple',
    activity: 'crafting',
    slot: 'simple',
    save: 'saveCraftingCheckSimple',
    clone: cloneSimpleCheck,
    read: (system) => system?.craftingCheck?.simple,
  },
  {
    key: 'checkProgressive',
    activity: 'crafting',
    slot: 'progressive',
    save: 'saveCraftingCheckProgressive',
    clone: cloneProgressiveCheck,
    read: (system) => system?.craftingCheck?.progressive,
  },
  {
    key: 'salvageCheckActive',
    activity: 'salvage',
    save: 'saveSalvageCheckActive',
    clone: keepValue,
    read: (system) => readCheckActive(system?.salvageCraftingCheck),
  },
  {
    key: 'salvageRouted',
    activity: 'salvage',
    slot: 'routed',
    save: 'saveSalvageCheckRouted',
    clone: cloneRoutedCheck,
    read: (system) => system?.salvageCraftingCheck?.routed,
  },
  {
    key: 'salvageProgressive',
    activity: 'salvage',
    slot: 'progressive',
    save: 'saveSalvageCheckProgressive',
    clone: cloneProgressiveCheck,
    read: (system) => system?.salvageCraftingCheck?.progressive,
  },
  {
    key: 'salvageSimple',
    activity: 'salvage',
    slot: 'simple',
    save: 'saveSalvageCheckSimple',
    clone: cloneSimpleCheck,
    read: (system) => system?.salvageCraftingCheck?.simple,
  },
  {
    key: 'gatheringCheckActive',
    activity: 'gathering',
    save: 'saveGatheringCheckActive',
    clone: keepValue,
    read: (system) => readCheckActive(system?.gatheringCraftingCheck),
  },
  // d100 has no editable slot draft, so its Active flag is all a d100 gathering check persists.
  {
    key: 'gatheringRouted',
    activity: 'gathering',
    slot: 'routed',
    save: 'saveGatheringCheckRouted',
    clone: cloneRoutedCheck,
    read: (system) => system?.gatheringCraftingCheck?.routed,
  },
  {
    key: 'gatheringProgressive',
    activity: 'gathering',
    slot: 'progressive',
    save: 'saveGatheringCheckProgressive',
    clone: cloneProgressiveCheck,
    read: (system) => system?.gatheringCraftingCheck?.progressive,
  },
]);

/** One staged draft beside its saved baseline; `clone` detaches every copy it takes. */
function createDraftSlot(clone, source) {
  let draft = $state(clone(source));
  let baseline = $state(clone(source));
  let saving = $state(false);
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(baseline));
  return {
    get draft() {
      return draft;
    },
    set draft(next) {
      draft = next;
    },
    get saving() {
      return saving;
    },
    set saving(on) {
      saving = on;
    },
    get dirty() {
      return dirty;
    },
    reseed(next) {
      draft = clone(next);
      baseline = clone(next);
    },
    rebaseline() {
      baseline = clone(draft);
    },
    discard() {
      draft = clone(baseline);
    },
  };
}

function createCheckDrafts(system) {
  return Object.fromEntries(
    CHECK_SLOTS.map(({ key, clone, read }) => [key, createDraftSlot(clone, read(system))])
  );
}

/** Run one slot's store save and answer whether it landed; `false` keeps the baseline. */
async function persistSlot(slot, save) {
  slot.saving = true;
  try {
    if ((await save(slot.draft)) === false) return false;
    slot.rebaseline();
    return true;
  } catch (error) {
    console.error('Failed to save check draft', error);
    return false;
  } finally {
    slot.saving = false;
  }
}

/** One activity's slots, dirty and saving flags, and its save; `slotName` names the rolled slot. */
function createCheckActivity(activity, { drafts, slotName, store, selectedSystemId }) {
  const specs = CHECK_SLOTS.filter((spec) => spec.activity === activity);
  const leads = specs.filter((spec) => !spec.slot);
  const slotSpec = () => {
    const name = slotName?.();
    return specs.find((spec) => spec.slot && spec.slot === name) ?? null;
  };
  const dirty = $derived.by(() => {
    if (leads.some((spec) => drafts[spec.key].dirty)) return true;
    const spec = slotSpec();
    return spec !== null && drafts[spec.key].dirty;
  });
  const saving = $derived(specs.some((spec) => drafts[spec.key].saving));

  const persist = (spec) =>
    persistSlot(drafts[spec.key], (draft) => store?.()?.[spec.save]?.(draft));

  // Each slot is guarded on its own dirty flag, because a moved lead alone dirties the activity.
  async function save() {
    if (!selectedSystemId?.() || saving || !dirty) return true;
    let saved = true;
    for (const spec of leads) {
      if (drafts[spec.key].dirty) saved = (await persist(spec)) && saved;
    }
    const spec = slotSpec();
    if (spec && drafts[spec.key].dirty) return (await persist(spec)) && saved;
    return saved;
  }

  return {
    get dirty() {
      return dirty;
    },
    get saving() {
      return saving;
    },
    save,
    discard() {
      for (const spec of specs) drafts[spec.key].discard();
    },
  };
}

/** The per-activity state the rail's Active card renders. */
function activationFor(system, drafts, gatheringResolutionMode) {
  const mode = system?.resolutionMode || 'simple';
  const alchemyCheckMode = drafts.alchemyCheckMode.draft;
  return {
    crafting: {
      mode,
      // Optional in simple and routedByIngredients, and in alchemy unless tiered.
      optional:
        mode === 'alchemy'
          ? alchemyCheckMode !== 'tiered'
          : ['simple', 'routedByIngredients'].includes(mode),
      enabled: mode === 'alchemy' ? alchemyCheckMode !== 'none' : drafts.craftingCheckActive.draft,
    },
    salvage: {
      mode: system?.salvageResolutionMode || 'simple',
      optional: (system?.salvageResolutionMode || 'simple') === 'simple',
      enabled: drafts.salvageCheckActive.draft,
    },
    // The gathering check's shape is the gathering economy's resolution mode.
    gathering: {
      mode: gatheringResolutionMode,
      optional: gatheringResolutionMode === 'd100',
      enabled: drafts.gatheringCheckActive.draft,
    },
  };
}

/** The crafting slot this system rolls, resolved from the staged alchemy mode. */
function craftingSlotFor(system, alchemyCheckMode) {
  return resolveActiveCraftingCheckFormula(
    system?.resolutionMode === 'alchemy'
      ? { ...system, alchemy: { ...system?.alchemy, checkMode: alchemyCheckMode } }
      : system
  ).slot;
}

function draftForSlot(slot, drafts) {
  return slot ? (drafts[slot] ?? null) : null;
}

/** A switched-off check reports no issues, by the predicate `ChecksView`'s `routeIsOff` uses. */
function checksActivityIsOff(activation, activity) {
  const state = activation?.[activity];
  if (!state || state.enabled === true) return false;
  if (activity === 'gathering') return state.mode !== 'd100';
  return state.optional === true;
}

function checksIssueCount({ activation, draftSystem, activity, slot, drafts }) {
  if (checksActivityIsOff(activation, activity)) return 0;
  return evaluateCheckReadiness(draftForSlot(slot, drafts) || {}, {
    mode: readinessModeForSlot(slot),
    modifierContext: buildCheckModifierContext(draftSystem, activity, null),
    activity,
  }).issues.length;
}

/** The Checks rail group: one slot per activity decides which draft each badge evaluates. */
function createChecksRail({ drafts, activation, craftingCheckMode, activities, inputs }) {
  const { selectedSystem, salvageResolutionMode, gatheringResolutionMode } = inputs;
  const checksDraftSystem = $derived({
    modifiers: inputs.selectedSystemModifiers?.(),
    craftingCheck: selectedSystem?.()?.craftingCheck || {},
    salvageCraftingCheck: selectedSystem?.()?.salvageCraftingCheck || {},
    gatheringCraftingCheck: selectedSystem?.()?.gatheringCraftingCheck || {},
  });
  const salvageDrafts = $derived({
    simple: drafts.salvageSimple.draft,
    routed: drafts.salvageRouted.draft,
    progressive: drafts.salvageProgressive.draft,
  });
  const gatheringDrafts = $derived({
    progressive: drafts.gatheringProgressive.draft,
    routed: drafts.gatheringRouted.draft,
  });
  const salvageCheckSlot = $derived(
    resolveActiveSalvageCheckFormula({
      salvageResolutionMode: salvageResolutionMode?.(),
      salvageCraftingCheck: salvageDrafts,
    }).slot
  );
  const gatheringCheckSlot = $derived(
    resolveActiveGatheringCheckFormula(
      { gatheringCraftingCheck: gatheringDrafts },
      gatheringResolutionMode?.()
    ).slot
  );
  const issueCount = (activity, slot, slotDrafts) =>
    checksIssueCount({
      activation: activation(),
      draftSystem: checksDraftSystem,
      activity,
      slot,
      drafts: slotDrafts,
    });
  const checksIssueCounts = $derived({
    crafting: issueCount('crafting', craftingCheckMode(), {
      simple: drafts.checkSimple.draft,
      routed: drafts.checkRouted.draft,
      progressive: drafts.checkProgressive.draft,
    }),
    salvage: issueCount('salvage', salvageCheckSlot, salvageDrafts),
    gathering: issueCount('gathering', gatheringCheckSlot, gatheringDrafts),
  });
  const checksNavArgs = $derived({
    features: selectedSystem?.()?.features || {},
    resolutionMode: selectedSystem?.()?.resolutionMode || 'simple',
    salvageResolutionMode: salvageResolutionMode?.(),
    gatheringResolutionMode: gatheringResolutionMode?.(),
    issueCounts: checksIssueCounts,
    dirtyActivities: {
      crafting: activities.crafting.dirty,
      salvage: activities.salvage.dirty,
      gathering: activities.gathering.dirty,
    },
  });
  const checksNavItems = $derived(buildChecksNavItems(checksNavArgs));
  // The parent badge sums the three activity children only; Validation's badge restates that total.
  const checksNavCount = $derived(checksNavIssueTotal(checksNavItems));
  const checksActiveTab = $derived(resolveActiveChecksTab(inputs.currentView?.()) || 'crafting');
  return {
    get checksNavArgs() {
      return checksNavArgs;
    },
    get checksNavItems() {
      return checksNavItems;
    },
    get checksNavCount() {
      return checksNavCount;
    },
    get checksActiveTab() {
      return checksActiveTab;
    },
  };
}

/** The staged drafts `ChecksView` renders, under the names the route passes them by. */
function draftAccessors(drafts) {
  return {
    get alchemyCheckModeDraft() {
      return drafts.alchemyCheckMode.draft;
    },
    set alchemyCheckModeDraft(mode) {
      drafts.alchemyCheckMode.draft = mode;
    },
    get checkRoutedDraft() {
      return drafts.checkRouted.draft;
    },
    get checkSimpleDraft() {
      return drafts.checkSimple.draft;
    },
    get checkProgressiveDraft() {
      return drafts.checkProgressive.draft;
    },
    get salvageSimpleDraft() {
      return drafts.salvageSimple.draft;
    },
    get salvageRoutedDraft() {
      return drafts.salvageRouted.draft;
    },
    get salvageProgressiveDraft() {
      return drafts.salvageProgressive.draft;
    },
    get gatheringProgressiveDraft() {
      return drafts.gatheringProgressive.draft;
    },
    get gatheringRoutedDraft() {
      return drafts.gatheringRouted.draft;
    },
  };
}

/** The editors' update callbacks, the rail's Active switch, and the live alchemy-flag write. */
function draftHandlers(drafts, { store, selectedSystem }) {
  const writer = (key) => (next) => {
    drafts[key].draft = next;
  };
  return {
    onUpdateCraftingCheck: writer('checkRouted'),
    onUpdateCraftingCheckSimple: writer('checkSimple'),
    onUpdateCraftingCheckProgressive: writer('checkProgressive'),
    onUpdateSalvageCheckSimple: writer('salvageSimple'),
    onUpdateSalvageCheckRouted: writer('salvageRouted'),
    onUpdateSalvageCheckProgressive: writer('salvageProgressive'),
    onUpdateGatheringCheckProgressive: writer('gatheringProgressive'),
    onUpdateGatheringCheckRouted: writer('gatheringRouted'),
    onToggleCheckActive(kind, enabled) {
      const on = enabled === true;
      if (kind === 'crafting' && selectedSystem?.()?.resolutionMode === 'alchemy') {
        // `simple` is the only mode "on" can mean here: tiered is not optional, so it renders the
        // locked indicator and never reaches this handler.
        drafts.alchemyCheckMode.draft = on ? 'simple' : 'none';
        return;
      }
      if (ACTIVITIES.includes(kind)) drafts[`${kind}CheckActive`].draft = on;
    },
    // Alchemy behaviour flags persist live rather than staging (issue 713).
    onUpdateAlchemyFlags(patch) {
      const current = selectedSystem?.()?.alchemy || {};
      store?.()?.saveAlchemyConfig?.({
        checkMode: current.checkMode,
        learnOnCraft: current.learnOnCraft === true,
        consumeOnFail: current.consumeOnFail !== false,
        showAttemptHistoryToPlayers: current.showAttemptHistoryToPlayers !== false,
        ...patch,
      });
    },
  };
}

/** Copy each part's accessors onto one object; a spread would read every getter once instead. */
function composeModel(...parts) {
  const model = {};
  for (const part of parts) {
    Object.defineProperties(model, Object.getOwnPropertyDescriptors(part));
  }
  return model;
}

/**
 * A system switch reseeds every draft; a same-system resolution-mode change reseeds crafting only.
 * A refresh of the same system reseeds nothing, so a save never clobbers an open draft.
 */
function createReseed(drafts, { selectedSystem, selectedSystemId }) {
  let lastChecksSystemId = selectedSystem?.()?.id || '';
  let lastChecksResolutionMode = selectedSystem?.()?.resolutionMode || 'simple';
  return function reseed() {
    const system = selectedSystem?.();
    const systemId = selectedSystemId?.();
    const resolutionMode = system?.resolutionMode || 'simple';
    const systemChanged = systemId !== lastChecksSystemId;
    if (!systemChanged && resolutionMode === lastChecksResolutionMode) return;
    lastChecksSystemId = systemId;
    lastChecksResolutionMode = resolutionMode;
    for (const { key, activity, read } of CHECK_SLOTS) {
      if (systemChanged || activity === 'crafting') drafts[key].reseed(read(system));
    }
  };
}

function createCheckActivities(drafts, craftingCheckMode, { store, selectedSystemId, ...modes }) {
  const slotNames = {
    crafting: craftingCheckMode,
    salvage: modes.salvageResolutionMode,
    gathering: modes.gatheringResolutionMode,
  };
  return Object.fromEntries(
    ACTIVITIES.map((activity) => [
      activity,
      createCheckActivity(activity, {
        drafts,
        slotName: slotNames[activity],
        store,
        selectedSystemId,
      }),
    ])
  );
}

export function createChecksRouteModel(inputs = {}) {
  const { selectedSystem } = inputs;
  const drafts = createCheckDrafts(selectedSystem?.());
  // Which section a deep link asked for, and the request's identity, bumped on every deep link.
  let checksActiveSection = $state('');
  let checksSectionRequestNonce = $state(0);

  const checkActivation = $derived(
    activationFor(selectedSystem?.(), drafts, inputs.gatheringResolutionMode?.())
  );
  const craftingCheckMode = $derived(
    craftingSlotFor(selectedSystem?.(), drafts.alchemyCheckMode.draft)
  );
  const activities = createCheckActivities(drafts, () => craftingCheckMode, inputs);
  const checksDirtyActivities = $derived(
    ACTIVITIES.filter((activity) => activities[activity].dirty)
  );
  const checksDirty = $derived(checksDirtyActivities.length > 0);
  const checksSaving = $derived(ACTIVITIES.some((activity) => activities[activity].saving));
  const rail = createChecksRail({
    drafts,
    activation: () => checkActivation,
    craftingCheckMode: () => craftingCheckMode,
    activities,
    inputs,
  });

  // The header Save persists every dirty activity, not only the route in view.
  async function saveChecks() {
    let saved = true;
    for (const activity of ACTIVITIES) {
      if (activities[activity].dirty) saved = (await activities[activity].save()) && saved;
    }
    return saved;
  }

  return composeModel(draftAccessors(drafts), draftHandlers(drafts, inputs), rail, {
    get checkActivation() {
      return checkActivation;
    },
    get craftingCheckMode() {
      return craftingCheckMode;
    },
    get checksDirtyActivities() {
      return checksDirtyActivities;
    },
    get checksDirty() {
      return checksDirty;
    },
    get checksSaving() {
      return checksSaving;
    },
    get checksActiveSection() {
      return checksActiveSection;
    },
    get checksSectionRequestNonce() {
      return checksSectionRequestNonce;
    },
    requestSection(section) {
      checksActiveSection = section || 'roll';
      checksSectionRequestNonce += 1;
    },
    reseed: createReseed(drafts, inputs),
    saveChecks,
    discardChecksDrafts() {
      for (const activity of ACTIVITIES) activities[activity].discard();
    },
  });
}

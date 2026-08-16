import { RECIPE_RECORD_KEY_PREFIX } from '../systems/PerRecordCraftingDefinitionRepository.js';

import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;
const GATHERING_ENVIRONMENTS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`;
const PLAYER_CHARACTER_TYPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`;
const RECIPE_STORAGE_LAYOUT_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_LAYOUT}`;
const RECIPE_STORAGE_TARGET_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_TARGET}`;

/**
 * The fully-qualified prefix EVERY per-record recipe key carries — `fabricate.recipe.`,
 * **including the trailing separator** (issue 1080 -b).
 *
 * The trailing dot is not decoration, and dropping it is the defect this constant exists to
 * make unrepresentable. Three live keys begin `fabricate.recipe`:
 *
 * - `fabricate.recipes` — the legacy whole-corpus array, which must keep routing to
 *   `recipeManager.reload()` and NOT be mistaken for a record;
 * - `fabricate.recipeStorageLayout` — the Definition Storage Layout;
 * - `fabricate.recipeStorageTarget` — the Definition Storage Target.
 *
 * All three are named here on purpose: a later reader who retires the legacy key would
 * otherwise conclude the separator had become unnecessary, and the two storage keys would
 * start being parsed as records with ids `StorageLayout` and `StorageTarget`. The same
 * applies to `fabricate.component.` against `componentStorageLayout` /
 * `componentStorageTarget` when component extraction lands (-d).
 *
 * Derived from the adapter's own prefix rather than restated, so the bridge and the store
 * cannot disagree about which keys are records.
 */
export const RECIPE_RECORD_SETTING_KEY_PREFIX = `${FABRICATE_SETTINGS_NAMESPACE}.${RECIPE_RECORD_KEY_PREFIX}`;

/**
 * Coalesce many replicated per-record refreshes into ONE `fabricate.recipesChanged`.
 *
 * **Per batch, not per microtask** (issue 1080 -b, plan Q2). A per-record flush is up to
 * three awaited bulk document calls — creates, then updates, then deletes — and a microtask
 * cannot span an `await`, so microtask coalescing collapses each LEG and still emits up to
 * three signals for one logical batch. `import-export/spec.md` fixes the contract at one
 * change hook per batch and calls the single completion refresh a strictly-better
 * consequence of batching; both have to survive the move to granular storage, where the
 * naive wiring would emit one signal per RECORD.
 *
 * So the bracket is explicit. A writer that knows its batch boundaries — the flush, the
 * Storage Layout Conversion (-c), the compendium importer (-d) — calls `open()` before the
 * first call and `close()` after the last resolves, and exactly one signal is emitted, at
 * the close, however many records and however many legs it spanned. Brackets nest; only the
 * outermost close emits.
 *
 * Outside a bracket the signal is deferred to a microtask instead, which is strictly the
 * best a RECEIVING client can do unaided: it observes each leg as one synchronous burst of
 * N document hooks with no marker saying which batch they belong to, so it collapses a burst
 * to one signal and cannot collapse three legs into one. That residual is recorded rather
 * than hidden — closing it needs a batch-completion signal on the wire, which is #1092's
 * transport and out of scope here.
 *
 * @param {object} [options]
 * @param {(callback: () => void) => void} [options.schedule] Defer a callback to the end of
 *   the current synchronous burst. Injected for tests; `queueMicrotask` in production.
 * @returns {{open: () => void, close: () => void, signal: (emit: () => void) => void,
 *   isOpen: () => boolean}}
 */
export function createRecipeRefreshCoalescer({ schedule = queueMicrotask } = {}) {
  let depth = 0;
  let scheduled = false;
  /** @type {(() => void)|null} The most recent signal's emitter, run once at flush. */
  let pending = null;

  // Deliberately re-reads nothing: the emitter closes over the manager, so the payload it
  // builds describes the corpus AT FLUSH TIME rather than at the moment of the first record.
  const flush = () => {
    scheduled = false;
    // A bracket opened after the microtask was scheduled: leave the signal pending so the
    // close emits it, rather than firing mid-batch.
    if (depth > 0) return;
    const emit = pending;
    pending = null;
    emit?.();
  };

  return {
    open() {
      depth += 1;
    },
    close() {
      if (depth > 0) depth -= 1;
      if (depth === 0) flush();
    },
    signal(emit) {
      pending = emit;
      if (depth > 0 || scheduled) return;
      scheduled = true;
      schedule(flush);
    },
    isOpen: () => depth > 0,
  };
}

/**
 * Bridge a replicated Fabricate world-setting change into the local change hooks the
 * player app listens on.
 *
 * Foundry's `createSetting` / `updateSetting` / `deleteSetting` hooks fire on EVERY
 * connected client when a world setting replicates, but Fabricate's
 * `fabricate.craftingSystemsChanged` /
 * `fabricate.recipesChanged` hooks are `Hooks.callAll` — local to the writing (GM)
 * client only. So on a player's client the in-memory managers are stale after a GM
 * edit and nothing tells the open app to refresh. This reloads the affected manager
 * from the freshly-replicated setting and re-emits the matching change hook.
 *
 * The manager's `reload()` returns `false` when the normalized data is unchanged —
 * true on the writing client, whose map already holds the saved data — so no
 * redundant hook is re-emitted there (avoiding a double refresh). This never writes a
 * setting, so there is no `updateSetting` → write → `updateSetting` loop.
 *
 * @param {string} settingKey Fully-qualified `namespace.key` of the changed setting.
 * @param {object} deps
 * @param {{ reload: () => boolean, getSystems: () => any[] }} [deps.craftingSystemManager]
 * @param {{ reload: () => boolean, getRecipes: () => any[] }} [deps.recipeManager]
 * @param {{ load: () => any[] }} [deps.gatheringEnvironmentStore] Gathering environment
 *   store, reloaded so replicated `nodeRuntime` changes (a GM-applied gather
 *   depletion, a restock, a world-time respawn) are visible on every client. The
 *   store caches `environments` in memory and otherwise only re-reads at startup, so
 *   without this a client's node counts silently diverge from the world.
 * @param {(hook: string, payload: any) => void} deps.callAll Bound `Hooks.callAll`.
 * @param {'create'|'update'|'delete'} [deps.operation] Which settings hook fired. Only the
 *   per-record branch reads it, and it is what distinguishes a removed record from a
 *   changed one — a `deleteSetting` document is already out of the collection, so its
 *   absence cannot be inferred by looking the key up.
 * @param {object|null} [deps.document] The `Setting` document the hook delivered, passed
 *   through for the same reason.
 * @param {{signal: (emit: () => void) => void}|null} [deps.recipeRefresh] The batch
 *   coalescer from {@link createRecipeRefreshCoalescer}. Omitted, each handled per-record
 *   change emits immediately, which is correct for a genuine single-record edit and is what
 *   the existing whole-corpus branches do.
 * @returns {boolean} `true` when `settingKey` was a handled Fabricate data setting.
 */
export function handleFabricateSettingChange(
  settingKey,
  {
    craftingSystemManager,
    recipeManager,
    gatheringEnvironmentStore,
    callAll,
    operation = 'update',
    document = null,
    recipeRefresh = null,
  } = {}
) {
  if (settingKey === CRAFTING_SYSTEMS_KEY) {
    if (craftingSystemManager?.reload?.()) {
      callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager.getSystems());
    }
    return true;
  }
  if (settingKey === RECIPES_KEY) {
    if (recipeManager?.reload?.()) {
      callAll?.('fabricate.recipesChanged', {
        action: 'external',
        recipes: recipeManager.getRecipes(),
      });
    }
    return true;
  }
  if (String(settingKey).startsWith(RECIPE_RECORD_SETTING_KEY_PREFIX)) {
    // One replicated RECORD (issue 1080 -b). Reached only under the per-record backend, so
    // on every world today this branch is unreachable: no key of this shape exists while
    // the Definition Storage Target is `singleArray`.
    //
    // `applyReplicatedRecordChange` returns `false` on the writing client, whose map already
    // holds the record — the same no-double-refresh property `reload()` gives the
    // whole-corpus branches above, and what keeps the writer's single change hook single.
    const changed =
      recipeManager?.applyReplicatedRecordChange?.({ key: settingKey, operation, document }) ===
      true;
    if (changed) {
      // Built at EMIT time, not signal time, so a coalesced batch reports the corpus the
      // whole batch produced rather than the state after its first record.
      const emit = () =>
        callAll?.('fabricate.recipesChanged', {
          action: 'external',
          recipes: recipeManager.getRecipes(),
        });
      if (recipeRefresh) recipeRefresh.signal(emit);
      else emit();
    }
    return true;
  }
  if (settingKey === RECIPE_STORAGE_LAYOUT_KEY || settingKey === RECIPE_STORAGE_TARGET_KEY) {
    // The Definition Storage Layout is the Storage Layout Conversion's sole discriminator,
    // and without this a remote client gets NO signal when it flips — it would keep reading
    // whichever arrangement it resolved at construction until the session ended.
    //
    // The signal is all -b owes: acting on it means rebuilding the manager's repository
    // against the new arrangement, which is the conversion's own job (-c). Deliberately no
    // `reload()` here, because a reload would re-read through the repository this client
    // built BEFORE the flip and would answer confidently from the wrong arrangement.
    callAll?.('fabricate.recipeStorageLayoutChanged', { key: settingKey });
    return true;
  }
  if (settingKey === GATHERING_ENVIRONMENTS_KEY) {
    // `load()` re-reads the setting into the store's in-memory list; it only reads,
    // so there is no write → `updateSetting` → write loop. The hook then tells open
    // views to re-project — without it the reload is invisible, since a player whose
    // gather was applied BY THE GM has no other signal that their node counts moved.
    // Unlike the manager reloads above there is no "unchanged" short-circuit to gate
    // on: the store's `load()` returns the list, not a changed flag.
    gatheringEnvironmentStore?.load?.();
    callAll?.('fabricate.gatheringEnvironmentsChanged');
    return true;
  }
  if (settingKey === PLAYER_CHARACTER_TYPES_KEY) {
    // Issue 1024. There is nothing to reload: the predicate reads the setting per
    // call, and by the time this hook fires Foundry has already replicated the new
    // value into `game.settings`. What IS needed is a local signal, because every
    // surface governed by the player-character concept — the actor-selection bar, the
    // GM stamina roster, the manager's Access and Knowledge rosters, the party member
    // picker — projected its list once and will otherwise show a stale roster until
    // reload. This never writes a setting, so there is no write loop.
    callAll?.('fabricate.playerCharacterTypesChanged');
    return true;
  }
  return false;
}

import { craftingDataChange, emitCraftingDataChanged } from '../systems/craftingDataChange.js';
import { RECIPE_RECORD_KEY_PREFIX } from '../systems/PerRecordCraftingDefinitionRepository.js';

import { FABRICATE_SETTINGS_NAMESPACE, SETTING_KEYS } from './settings.js';

const CRAFTING_SYSTEMS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.CRAFTING_SYSTEMS}`;
const RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;
const GATHERING_ENVIRONMENTS_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`;
const PLAYER_CHARACTER_TYPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`;
const RECIPE_STORAGE_LAYOUT_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_LAYOUT}`;
const RECIPE_STORAGE_TARGET_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_TARGET}`;

/**
 * The keys whose ONE setting holds a whole corpus, for which a document DELETE must never
 * be treated as a change to re-read.
 *
 * Every branch below reacts to a change by re-reading the key. That is right for a create
 * or an update and actively destructive for a delete: the document is already out of the
 * collection by the time the hook fires, so `ClientSettings` answers the re-read with the
 * REGISTERED DEFAULT — `[]` — and the client patches its map empty and tells every open
 * view the corpus is gone.
 *
 * Nothing deletes these keys on a world today, which is why this costs nothing now. It is
 * here because -b wires `deleteSetting` for the first time and the Storage Layout
 * Conversion (-c) retires `fabricate.recipes` as its final step, which is exactly this
 * delete arriving at clients that may still be reading THROUGH the legacy arrangement. Same
 * reasoning as the layout-flip branch below: the signal is real, and what must be refused is
 * acting on it by re-reading an arrangement this client has already left.
 */
const WHOLE_CORPUS_SETTING_KEYS = new Set([
  CRAFTING_SYSTEMS_KEY,
  RECIPES_KEY,
  GATHERING_ENVIRONMENTS_KEY,
]);

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
 * So the bracket is explicit. Whoever knows where the batch begins and ends calls `open()`
 * before the first change is delivered and `close()` after the last, and exactly one signal
 * is emitted, at the close, however many records and however many legs it spanned. Brackets
 * nest; only the outermost close emits.
 *
 * **The bracket belongs to the RECEIVING client, not to the writer.** A writer bracketing
 * its own flush coalesces nothing: `RecipeManager.applyReplicatedRecordChange` returns
 * `false` on the client whose map already holds the record, so the writer never signals at
 * all. The clients with something to coalesce are the ones the documents replicate TO. That
 * is why the live instance is published on the `fabricate` object as
 * `game.fabricate.recipeRefresh` rather than kept private to the hook registration that
 * creates it — a bracket nothing outside one `ready` callback can reach is a contract with
 * no implementation.
 *
 * **A receiver can be told where a batch ends, today, with no new transport.** Verified in
 * installed Foundry source on 13.351 and 14.365: document operation options propagate
 * VERBATIM to every receiver's hook. The server deletes a fixed nine-key list — `data`,
 * `updates`, `ids`, `parent`, `parentUuid`, `pack`, `restoreDelta`, `deleteAll`, `_result`
 * — then `Object.assign`s the rest onto the operation, and the receiving side spreads what
 * survives straight into the hook's `options`. So a writer that stamps its own marker on
 * the final leg of a batch hands every receiver an unambiguous close. Stamping it is the
 * writer's job (-c's Storage Layout Conversion, -d's importer); this module's job is to
 * have a bracket for that marker to drive, and to be reachable from where the marker is
 * read.
 *
 * Outside a bracket the signal is deferred to a microtask instead, which collapses one
 * leg's synchronous burst of N document hooks to one signal and cannot collapse three legs
 * into one. That residual is recorded rather than hidden.
 *
 * @param {object} [options]
 * @param {(callback: () => void) => void} [options.schedule] Defer a callback to the end of
 *   the current synchronous burst. Injected for tests; `queueMicrotask` in production.
 * @returns {{open: () => void, close: () => void, signal: (emit: () => void) => void,
 *   isOpen: () => boolean, collect: (scopes: object[]) => void,
 *   takeCollected: () => object[]}}
 */
export function createRecipeRefreshCoalescer({ schedule = queueMicrotask } = {}) {
  let depth = 0;
  let scheduled = false;
  /** @type {(() => void)|null} The most recent signal's emitter, run once at flush. */
  let pending = null;
  /**
   * The invalidation scopes every record of the batch contributed (issue 1078 part B1).
   *
   * They live HERE rather than in the emitter's closure because `signal()` keeps only the most
   * recent emitter: a per-emitter accumulator would report the batch's last record alone, and
   * the earlier records' domains would be silently lost — which reads as correct narrowing and
   * is in fact a stale read model.
   *
   * @type {object[]}
   */
  let collected = [];

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
    collect(scopes) {
      collected.push(...scopes);
    },
    takeCollected() {
      const taken = collected;
      collected = [];
      return taken;
    },
    isOpen: () => depth > 0,
  };
}

/**
 * The invalidation scopes a manager's most recent replicated change produced (issue 1078 B1).
 *
 * A manager fake without the method answers with NO scopes, which every consumer routes
 * broadly — the same fail-safe an unrecognised payload gets, and the reason the many bridge
 * fixtures that stub `{reload, getRecipes}` keep working without being taught about domains.
 *
 * @param {object|null|undefined} manager
 * @returns {object[]}
 */
function replicatedScopes(manager) {
  return typeof manager?.consumeReplicatedChangeScopes === 'function'
    ? manager.consumeReplicatedChangeScopes()
    : [];
}

/**
 * Emit the scoped change signal for a whole-corpus replicated reload.
 *
 * @param {'recipes'|'systems'} source
 * @param {object} manager
 * @param {((hook: string, payload: object) => void)|undefined} callAll
 * @returns {void}
 */
function announceScopedChange(source, manager, callAll) {
  emitCraftingDataChanged(
    craftingDataChange({ source, scopes: replicatedScopes(manager) }),
    callAll
  );
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
 * @param {'update'|'delete'} [deps.operation] Whether the leg DELIVERED a record or REMOVED
 *   one. Two values, not three, and deliberately not one per settings hook: `'create'` was
 *   declared here in an earlier revision and `src/main.js` never emitted it, which is worse
 *   than a missing value in a seam -c and -d build on — four tests drove a path production
 *   cannot produce.
 *
 *   Removal is the one fact no other leg can express, because a `deleteSetting` document is
 *   already out of the collection and its absence cannot be inferred by looking the key up.
 *   Create-versus-update expresses nothing either reader consumes: both legs deliver the
 *   record inside the document, `PerRecordCraftingDefinitionRepository#readReplicatedRecord`
 *   reads it out identically, and the whole-corpus guard above asks only whether the key
 *   still exists. Anything that later needs provenance should widen this WITH its consumer,
 *   and pay for the second listener that widening costs — `src/main.js` registers ONE shared
 *   listener on `createSetting` and `updateSetting` precisely so the two cannot drift.
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
  if (operation === 'delete' && WHOLE_CORPUS_SETTING_KEYS.has(settingKey)) {
    // Handled, and deliberately inert — see {@link WHOLE_CORPUS_SETTING_KEYS}.
    return true;
  }
  if (settingKey === CRAFTING_SYSTEMS_KEY) {
    if (craftingSystemManager?.reload?.()) {
      callAll?.('fabricate.craftingSystemsChanged', craftingSystemManager.getSystems());
      announceScopedChange('systems', craftingSystemManager, callAll);
    }
    return true;
  }
  if (settingKey === RECIPES_KEY) {
    if (recipeManager?.reload?.()) {
      callAll?.('fabricate.recipesChanged', {
        action: 'external',
        recipes: recipeManager.getRecipes(),
      });
      announceScopedChange('recipes', recipeManager, callAll);
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
      // The scopes are read NOW, not at emit time (issue 1078 part B1).
      // `applyReplicatedRecordChange` mints one delta PER RECORD and the next record's mint
      // replaces it, so a coalesced batch that deferred the read would report only its LAST
      // record and every earlier one would be missed. They accumulate on the coalescer — the
      // object that already owns the batch boundary — and the single flush emits them as one
      // payload, which is the coalescing contract applied to the delta and not only to the
      // hook.
      const scopes = replicatedScopes(recipeManager);
      recipeRefresh?.collect?.(scopes);
      // Built at EMIT time, not signal time, so a coalesced batch reports the corpus the
      // whole batch produced rather than the state after its first record.
      const emit = () => {
        callAll?.('fabricate.recipesChanged', {
          action: 'external',
          recipes: recipeManager.getRecipes(),
        });
        emitCraftingDataChanged(
          craftingDataChange({
            source: 'recipes',
            scopes: recipeRefresh?.takeCollected?.() ?? scopes,
          }),
          callAll
        );
      };
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
    //
    // INTERNAL, deliberately not a published hook. It is absent from `FABRICATE_HOOKS` /
    // `game.fabricate.api.HOOKS` on purpose, alongside the sibling internal signals this
    // same function emits, and it is flat two-segment rather than the three-segment
    // `fabricate.<domain>.<event>` shape with a `schemaVersion` that every PUBLISHED hook
    // carries. Two reasons it stays internal: its payload is the raw setting key and
    // nothing else, so a subscriber must re-read the setting anyway and gains nothing over
    // watching `updateSetting` itself; and the arrangement it announces is -c's to define,
    // so publishing a payload shape now would freeze a contract before the concept it
    // describes exists. Anything that promotes it owes it the three-segment name, a
    // `schemaVersion`, an entry in `src/config/hooks.js` and a row in `DOMAIN.md`.
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

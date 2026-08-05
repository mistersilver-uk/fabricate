/**
 * actorBarStore — shared Svelte 5 runes store for the unified-window actor
 * selection top bar.
 *
 * The bar lives in the shell (`FabricateAppRoot`) but the gathering tab
 * (`GatheringView`) owns the selected environment whose stamina pool the bar
 * displays, and a change of selected actor must re-drive the gathering fetch.
 * This bidirectional shell↔tab state flows through a single store instance hung
 * off `services.actorBar` (created once in `_buildServices()`), so neither side
 * prop-drills through the tab router.
 *
 * The factory is plain: it never touches Foundry globals (`game`/`ui`/…). All
 * environment access goes through the injected `services` bag, preserving the
 * presentational-component boundary.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listSelectableActors()`, `getSelectedActorId()`, `setSelectedActorId(id)`,
 *   and `getGatheringConditions()`.
 * @returns {object} The reactive actor-bar store.
 */
export function createActorBarStore({ services } = {}) {
  let selectedActorId = $state('');
  let selectableActors = $state([]);
  let staminaPool = $state(null);
  let conditions = $state(null);
  // Per-condition display visibility for the header bar's weather/time-of-day
  // chips, mirroring the active gathering system's enable toggles. Defaults to
  // shown so non-gathering tabs and the pre-load window keep prior behavior; the
  // gathering tab pushes the selected environment's flags via setConditionVisibility.
  let conditionVisibility = $state({ weather: true, timeOfDay: true });
  // The party's current-realm summary for the header bar, mirroring the active
  // gathering system's realm/travel subsystem. `enabled` gates the chip;
  // `realms` is the redaction-safe disclosure list (empty → "no realm
  // selected"). Defaults to disabled so the chip is hidden until the gathering
  // tab pushes the selected environment's realm summary via setRealmContext.
  let realmContext = $state({ enabled: false, realms: [] });
  let loaded = $state(false);

  const selectedActor = $derived(
    selectableActors.find((actor) => actor?.id === selectedActorId) ?? null
  );

  /**
   * Set the active selection and persist it.
   *
   * @param {string} id Actor id.
   */
  function selectActor(id) {
    selectedActorId = id ?? '';
    services?.setSelectedActorId?.(selectedActorId);
  }

  /**
   * Seed the selection from an interactable activation's interacting actor.
   *
   * Selects + persists `id` ONLY when it is one of the user's selectable
   * characters (the bar is player-character-only). When the id is absent from
   * `selectableActors` (e.g. a non-PC owned actor) this no-ops so the default
   * seed from {@link loadSelectableActors} stays in place rather than leaving the
   * bar with an unselectable, portrait-less selection.
   *
   * @param {string} id Interacting actor id.
   */
  function selectScopedActor(id) {
    if (!id) return;
    if (!selectableActors.some((actor) => actor?.id === id)) return;
    selectActor(id);
  }

  /**
   * Populate `selectableActors` and seed `selectedActorId` from persistence.
   *
   * Seeds from `services.getSelectedActorId()`. When that id is empty OR not
   * present in the player-character `selectableActors` (stale, including a legacy
   * owned non-PC id), it falls back to the first selectable actor and re-persists
   * that fallback (exactly once) so a fresh client converges on a valid, sticky
   * player-character selection. Guarded by `loaded` so a re-entrant call after a
   * deliberate `selectActor` does NOT clobber the user's choice. When the list is
   * EMPTY it sets no selection, persists nothing, and never indexes
   * `selectableActors[0]` (no throw).
   */
  function loadSelectableActors() {
    if (loaded) return;
    loaded = true;

    const actors = services?.listSelectableActors?.() ?? [];
    selectableActors = Array.isArray(actors) ? actors : [];

    const seededId = services?.getSelectedActorId?.() ?? '';
    const isPresent = seededId
      && selectableActors.some((actor) => actor?.id === seededId);

    if (isPresent) {
      selectedActorId = seededId;
      return;
    }

    if (selectableActors.length === 0) {
      // No player characters available: no selection, no persist, no throw.
      return;
    }

    // Empty or stale id: converge on the first PC and re-persist it.
    selectActor(selectableActors[0].id);
  }

  /**
   * Re-read the selectable-actor list after the world's definition of a player
   * character changed (issue 1024: the GM edited the configured actor types).
   *
   * Distinct from {@link loadSelectableActors}, which is a ONE-SHOT startup seed
   * guarded by `loaded`. This runs on demand, and deliberately does NOT reset the
   * `loaded` latch — that latch exists to stop a later `$effect` run clobbering a
   * deliberate pick, and clearing it here would re-arm exactly that.
   *
   * Selection rules:
   *
   *   - An EMPTY selection with a non-empty list seeds and persists the first entry.
   *     This is the reported scenario: the player owned only a `robot`, so the bar was
   *     empty and nothing was selected. A naive "re-seed only when the current pick is
   *     GONE" guard short-circuits on the falsy id — `''` is trivially "not present" but
   *     reads as "nothing to fix" to a `selectedActorId && !present` test — and renders a
   *     populated but unselected bar.
   *   - A pick that is STILL PRESENT is left untouched and is not re-persisted.
   *   - A pick that VANISHED (its actor type stopped counting) re-seeds to the first
   *     entry.
   *   - An EMPTY list sets nothing, persists nothing, and never indexes `[0]`.
   *
   * Re-seeding routes through {@link selectActor} rather than assigning
   * `selectedActorId`, so the store and the persisted preference converge.
   */
  function refreshSelectableActors() {
    const actors = services?.listSelectableActors?.() ?? [];
    selectableActors = Array.isArray(actors) ? actors : [];

    if (selectableActors.length === 0) return;

    const isPresent =
      selectedActorId && selectableActors.some((actor) => actor?.id === selectedActorId);
    if (isPresent) return;

    selectActor(selectableActors[0].id);
  }

  /**
   * Store the gathering tab's active stamina pool (`{ current, max, … }`) for
   * the header bar, or `null` when the active system is not in stamina mode (or
   * no actor/pool applies).
   *
   * @param {object|null} next Stamina pool state.
   */
  function setStaminaPool(next) {
    staminaPool = next ?? null;
  }

  /**
   * Refresh `conditions` from the current global gathering conditions.
   */
  function refreshConditions() {
    conditions = services?.getGatheringConditions?.() ?? null;
  }

  /**
   * Set whether the header bar's weather / time-of-day chips should display,
   * mirroring the selected gathering environment's per-system enable toggles. A
   * missing flag defaults to shown (`true`).
   *
   * @param {{ weather?: boolean, timeOfDay?: boolean }|null} next Visibility flags.
   */
  function setConditionVisibility(next) {
    conditionVisibility = {
      weather: next?.weather !== false,
      timeOfDay: next?.timeOfDay !== false
    };
  }

  /**
   * Set the header bar's current-realm summary, mirroring the selected gathering
   * environment's realm/travel subsystem. `enabled` gates the chip; `realms` is
   * the redaction-safe disclosure list (empty → "no realm selected").
   *
   * @param {{ enabled?: boolean, realms?: object[] }|null} next Realm summary.
   */
  function setRealmContext(next) {
    realmContext = {
      enabled: next?.enabled === true,
      realms: Array.isArray(next?.realms) ? next.realms : []
    };
  }

  return {
    get selectedActorId() {
      return selectedActorId;
    },
    get selectableActors() {
      return selectableActors;
    },
    get staminaPool() {
      return staminaPool;
    },
    get conditions() {
      return conditions;
    },
    get conditionVisibility() {
      return conditionVisibility;
    },
    get realmContext() {
      return realmContext;
    },
    get loaded() {
      return loaded;
    },
    get selectedActor() {
      return selectedActor;
    },
    loadSelectableActors,
    refreshSelectableActors,
    selectActor,
    selectScopedActor,
    setStaminaPool,
    refreshConditions,
    setConditionVisibility,
    setRealmContext
  };
}

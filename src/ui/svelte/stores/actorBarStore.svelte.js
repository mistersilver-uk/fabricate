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
    get loaded() {
      return loaded;
    },
    get selectedActor() {
      return selectedActor;
    },
    loadSelectableActors,
    selectActor,
    selectScopedActor,
    setStaminaPool,
    refreshConditions,
    setConditionVisibility
  };
}

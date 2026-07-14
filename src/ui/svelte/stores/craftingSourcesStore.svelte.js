/**
 * craftingSourcesStore — Svelte 5 runes store for the player Crafting tab's
 * component-source actor picker (whose inventories the listing pulls ingredients
 * from).
 *
 * Like {@link createActorBarStore} it is a plain factory that never touches
 * Foundry globals; all actor access flows through the injected `services` bag.
 * The acting crafting character is ALWAYS included as a source and is
 * non-removable (you craft from your own inventory); additional owned actors can
 * be toggled in. Picks that reference an actor the viewer no longer owns (or that
 * no longer exists) are dropped. Selections persist through
 * `services.setCraftingComponentSourceIds`.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listCraftingSourceActors()` (owner-scoped `{ id, uuid, name, img }` records),
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and
 *   `setCraftingComponentSourceIds(ids)`.
 * @returns {object} The reactive crafting-sources store.
 */
export function createCraftingSourcesStore({ services } = {}) {
  // The viewer's explicit additional picks (the crafting actor is force-included
  // by the derived selection, so it is not stored here).
  let selectedIds = $state([]);
  let craftingActorId = $state(null);
  let loaded = $state(false);

  const available = $derived.by(() => {
    const actors = services?.listCraftingSourceActors?.() ?? [];
    return Array.isArray(actors) ? actors : [];
  });

  const availableIds = $derived(new Set(available.map((actor) => actor?.id).filter(Boolean)));

  // The crafting actor is the required, non-removable source — but only when it
  // is owned/selectable (present in the available list). A non-owned acting actor
  // forces nothing.
  const requiredId = $derived(
    craftingActorId && availableIds.has(craftingActorId) ? craftingActorId : null
  );

  // Effective source ids: persisted picks still owned/extant, with the required
  // crafting actor forced to the front, deduped.
  const selectedSourceIds = $derived.by(() => {
    const kept = selectedIds.filter((id) => availableIds.has(id));
    const withRequired = requiredId ? [requiredId, ...kept] : kept;
    return [...new Set(withRequired)];
  });

  // Display avatar models in selection order; each flags whether it can be
  // removed (the required crafting actor cannot).
  const sources = $derived.by(() =>
    selectedSourceIds
      .map((id) => available.find((actor) => actor?.id === id) ?? null)
      .filter(Boolean)
      .map((actor) => ({ ...actor, removable: actor.id !== requiredId }))
  );

  function persist() {
    services?.setCraftingComponentSourceIds?.(selectedSourceIds);
  }

  /**
   * Seed the explicit picks + crafting actor from persistence. Guarded by
   * `loaded` so a re-entrant call does not clobber the user's choices.
   */
  function load() {
    if (loaded) return;
    loaded = true;
    const persisted = services?.getCraftingComponentSourceIds?.() ?? [];
    selectedIds = Array.isArray(persisted) ? [...persisted] : [];
    craftingActorId = services?.getSelectedCraftingActorId?.() || null;
  }

  /** Add an owned actor as a component source. No-op for unknown/non-owned ids. */
  function add(id) {
    if (!id || !availableIds.has(id) || selectedIds.includes(id)) return;
    selectedIds = [...selectedIds, id];
    persist();
  }

  /** Remove a component source. The required crafting actor cannot be removed. */
  function remove(id) {
    if (!id || id === requiredId) return;
    if (!selectedIds.includes(id)) return;
    selectedIds = selectedIds.filter((entry) => entry !== id);
    persist();
  }

  /** Toggle a source on/off (the required crafting actor stays put). */
  function toggle(id) {
    if (!id) return;
    if (selectedSourceIds.includes(id)) {
      remove(id);
    } else {
      add(id);
    }
  }

  /**
   * Re-point the required source when the acting crafting character changes. The
   * previously-required actor is retained as an explicit (now removable) pick so
   * the selection is not silently lost, and the new actor becomes the forced,
   * non-removable source.
   *
   * @param {string|null} nextId The new crafting actor id.
   */
  function setCraftingActor(nextId) {
    const next = nextId || null;
    if (next === craftingActorId) return;
    // Capture the OLD required id (derived from the current craftingActorId)
    // before re-pointing, so it can be demoted to a normal pick.
    const previousRequired = requiredId;
    craftingActorId = next;
    if (previousRequired && previousRequired !== next && !selectedIds.includes(previousRequired)) {
      selectedIds = [...selectedIds, previousRequired];
    }
    persist();
  }

  return {
    get available() {
      return available;
    },
    get sources() {
      return sources;
    },
    get selectedSourceIds() {
      return selectedSourceIds;
    },
    get requiredId() {
      return requiredId;
    },
    get craftingActorId() {
      return craftingActorId;
    },
    get loaded() {
      return loaded;
    },
    load,
    add,
    remove,
    toggle,
    setCraftingActor,
  };
}

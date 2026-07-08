/**
 * alchemyStore — Svelte 5 runes store backing the player-facing Alchemy tab (the
 * Workbench).
 *
 * Mirrors {@link createCraftingStore}: a plain factory that NEVER touches Foundry
 * globals. Every Foundry-facing read/write flows through the injected `services`
 * bag (the unified-window seam set built in `SvelteFabricateApp._buildServices`),
 * so the store stays presentational and fully unit-testable.
 *
 * It holds the leak-safe listing produced by `AlchemyListingBuilder` (via
 * `services.listAlchemyForActor`) plus the local workbench state (`activeSystemId`,
 * the `workbench` component multiset, `selectedRecipeId`, `search`, `lastBrew`) and
 * the brew action. It derives the five-mode status CLIENT-SIDE against learned
 * recipes plus the local fizzle set — but the client mode is BEST-EFFORT and
 * ADVISORY: `ready`/`assembling` (and select-to-load auto-fill) are scoped to
 * learned recipes reducible to a concrete plain-component multiset. For any recipe
 * with alternatives / tags / essences / multiple ingredient sets the store FAILS
 * SAFE to `untried` and never emits a false `ready`/`assembling`; the engine
 * remains authoritative on brew.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag.
 * @returns {object} The reactive alchemy store.
 */

import { canonicalSignatureKey } from '../../../utils/alchemySignatureKey.js';

export function createAlchemyStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let loadedOnce = $state(false);
  let activeSystemId = $state(services?.getSelectedAlchemySystemId?.() || null);
  // workbench: { [componentId]: units } — a concrete plain-component multiset.
  let workbench = $state({});
  let selectedRecipeId = $state(null);
  let search = $state('');
  let lastBrew = $state(null);
  let brewInFlight = $state(false);

  function currentActorId() {
    return services?.getSelectedCraftingActorId?.() || null;
  }

  function currentSourceIds() {
    const fromSibling = services?.craftingSources?.selectedSourceIds;
    if (Array.isArray(fromSibling)) return fromSibling;
    const persisted = services?.getCraftingComponentSourceIds?.();
    return Array.isArray(persisted) ? persisted : [];
  }

  /** The shared signature-key helper (also the mode helper), re-exported so the
   *  drift test can assert engine-write == builder-projection == store-helper. */
  function signatureKey(multiset) {
    return canonicalSignatureKey(multiset);
  }

  const systems = $derived(Array.isArray(listing?.systems) ? listing.systems : []);
  const canSwitch = $derived(systems.length > 1);
  // The chooser is shown when more than one alchemy system exists and none is
  // active yet. Exactly one system auto-enters (see `load`).
  const needsChooser = $derived(systems.length > 1 && !activeSystemId);

  const knownRecipes = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    const query = search.trim().toLowerCase();
    const filtered = query
      ? recipes.filter((recipe) => String(recipe?.name ?? '').toLowerCase().includes(query))
      : recipes;
    return [...filtered].sort((left, right) =>
      String(left?.name ?? '').localeCompare(String(right?.name ?? ''))
    );
  });

  const knownCount = $derived(Array.isArray(listing?.recipes) ? listing.recipes.length : 0);
  const undiscoveredCount = $derived(Number(listing?.undiscoveredCount ?? 0));
  const fizzleKeys = $derived(new Set(Array.isArray(listing?.fizzleKeys) ? listing.fizzleKeys : []));

  /** Owned components with availability (held minus placed on the bench). */
  const components = $derived.by(() => {
    const owned = Array.isArray(listing?.components) ? listing.components : [];
    return owned.map((component) => {
      const placed = workbench[component.componentId] || 0;
      const available = Math.max(0, Number(component.held || 0) - placed);
      return {
        componentId: component.componentId,
        name: component.name,
        img: component.img,
        held: Number(component.held || 0),
        placed,
        available,
        disabled: available <= 0,
      };
    });
  });

  const componentById = $derived.by(() => {
    const map = new Map();
    for (const component of Array.isArray(listing?.components) ? listing.components : []) {
      map.set(component.componentId, component);
    }
    return map;
  });

  /** The bench chips ({ componentId, name, img, qty }) for placed components. */
  const benchChips = $derived.by(() =>
    Object.entries(workbench)
      .filter(([, qty]) => qty > 0)
      .map(([componentId, qty]) => {
        const component = componentById.get(componentId);
        return {
          componentId,
          name: component?.name ?? componentId,
          img: component?.img ?? null,
          qty,
        };
      })
  );

  const benchEmpty = $derived(benchChips.length === 0);
  const benchKey = $derived(signatureKey(workbench));

  const selectedRecipe = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    return recipes.find((recipe) => recipe?.id === selectedRecipeId) ?? null;
  });

  /**
   * Five-mode resolution (best-effort, engine-authoritative, fail-safe to
   * `untried`). `ready`/`assembling` are scoped to recipes with a `concrete`
   * plain-component multiset; a rich-signature recipe never yields a false
   * `ready`/`assembling`.
   */
  const resolution = $derived.by(() => {
    if (benchEmpty) return { mode: 'empty', target: null, missing: [] };

    // 1. Bench equals a known recipe's concrete signature -> ready.
    for (const recipe of Array.isArray(listing?.recipes) ? listing.recipes : []) {
      if (recipe?.concrete && signatureKey(recipe.concrete) === benchKey) {
        return { mode: 'ready', target: recipe, missing: [] };
      }
    }

    // 2. Bench is a strict subset of the SELECTED known recipe's concrete
    //    signature -> assembling (with the still-needed components).
    if (selectedRecipe?.concrete) {
      const concrete = selectedRecipe.concrete;
      const entries = Object.entries(workbench).filter(([, qty]) => qty > 0);
      const isSubset =
        entries.length > 0 && entries.every(([cid, qty]) => qty <= (concrete[cid] || 0));
      if (isSubset && signatureKey(concrete) !== benchKey) {
        const missing = Object.entries(concrete)
          .map(([cid, need]) => {
            const component = componentById.get(cid);
            return {
              componentId: cid,
              name: component?.name ?? cid,
              img: component?.img ?? null,
              need: need - (workbench[cid] || 0),
            };
          })
          .filter((row) => row.need > 0);
        return { mode: 'assembling', target: selectedRecipe, missing };
      }
    }

    // 3. A remembered fizzle for this exact set -> no-reaction. Otherwise the set
    //    is untried (an undiscovered recipe and a never-tried dead-end are
    //    indistinguishable until brewed — both present as `untried`).
    if (fizzleKeys.has(benchKey)) return { mode: 'no-reaction', target: null, missing: [] };
    return { mode: 'untried', target: null, missing: [] };
  });

  const mode = $derived(resolution.mode);
  const target = $derived(resolution.target);
  const missing = $derived(resolution.missing);
  // Brew is enabled when the player can act: a ready known recipe, or an
  // experiment on an untried / remembered-fizzle set. `empty` and `assembling`
  // (mid-build toward a selected recipe) are disabled.
  const brewEnabled = $derived(mode === 'ready' || mode === 'untried' || mode === 'no-reaction');

  /**
   * Fetch the alchemy listing for the current actor + sources scoped to the
   * active system. Auto-enters the sole system when exactly one exists and none is
   * active; drops a stale active id no longer offered.
   */
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = null;
    try {
      const result = await services?.listAlchemyForActor?.({
        actorId: currentActorId(),
        craftingSystemId: activeSystemId,
        componentSourceActorIds: currentSourceIds(),
      });
      listing = result ?? null;
      loadedOnce = true;

      const offered = Array.isArray(listing?.systems) ? listing.systems : [];
      // Drop a stale active id (system disabled / lost its recipes).
      if (activeSystemId && !offered.some((system) => system.id === activeSystemId)) {
        activeSystemId = null;
        services?.setSelectedAlchemySystemId?.('');
      }
      // Auto-enter the sole discipline.
      if (!activeSystemId && offered.length === 1) {
        activeSystemId = offered[0].id;
        services?.setSelectedAlchemySystemId?.(activeSystemId);
        await load(quiet);
      }
    } catch (err) {
      error = err?.message ?? String(err);
    } finally {
      if (!quiet) loading = false;
    }
  }

  /** Choose an alchemy discipline (from the chooser), resetting workbench state. */
  function chooseSystem(systemId) {
    if (!systemId) return;
    activeSystemId = systemId;
    services?.setSelectedAlchemySystemId?.(systemId);
    resetBench();
    load();
  }

  /** Return to the chooser, resetting workbench/selection/last-brew/search. */
  function switchDiscipline() {
    if (!canSwitch) return;
    activeSystemId = null;
    services?.setSelectedAlchemySystemId?.('');
    resetBench();
    search = '';
    load();
  }

  function resetBench() {
    workbench = {};
    selectedRecipeId = null;
    lastBrew = null;
  }

  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
  }

  /** Available (held minus placed) units of a component. */
  function availableOf(componentId) {
    const component = componentById.get(componentId);
    const held = Number(component?.held || 0);
    return Math.max(0, held - (workbench[componentId] || 0));
  }

  /** Place one unit of a component on the bench (capped at owned availability). */
  function add(componentId) {
    if (!componentId || availableOf(componentId) <= 0) return;
    workbench = { ...workbench, [componentId]: (workbench[componentId] || 0) + 1 };
    lastBrew = null;
  }

  /** Remove one unit of a component from the bench. */
  function removeOne(componentId) {
    const next = { ...workbench };
    next[componentId] = (next[componentId] || 0) - 1;
    if (next[componentId] <= 0) delete next[componentId];
    workbench = next;
    lastBrew = null;
  }

  /** Clear the whole bench and selection. */
  function clear() {
    resetBench();
  }

  /**
   * Select a known recipe. Auto-loads its concrete signature onto the bench when
   * it reduces to a plain-component multiset (capped by owned availability); a
   * rich-signature recipe is selected for display only (no auto-fill).
   */
  function selectRecipe(recipeId) {
    selectedRecipeId = recipeId ?? null;
    lastBrew = null;
    const recipe = (Array.isArray(listing?.recipes) ? listing.recipes : []).find(
      (candidate) => candidate?.id === recipeId
    );
    if (!recipe?.concrete) return;
    const next = {};
    for (const [componentId, need] of Object.entries(recipe.concrete)) {
      const component = componentById.get(componentId);
      const held = Number(component?.held || 0);
      const place = Math.min(need, held);
      if (place > 0) next[componentId] = place;
    }
    workbench = next;
  }

  /** Expand the bench multiset into one component id per placed unit. */
  function submittedComponentIds() {
    const ids = [];
    for (const [componentId, qty] of Object.entries(workbench)) {
      for (let unit = 0; unit < qty; unit += 1) ids.push(componentId);
    }
    return ids;
  }

  /**
   * Brew the current bench through the engine (authoritative). Guards
   * re-entrancy; a dismissed interactive roll is returned quietly. On a resolved
   * attempt it records the outcome banner, clears the bench, and reloads so newly
   * learned recipes + fizzle keys refresh.
   */
  async function brew() {
    if (brewInFlight || !brewEnabled) return null;
    brewInFlight = true;
    const priorKnown = new Set((Array.isArray(listing?.recipes) ? listing.recipes : []).map((r) => r.id));
    try {
      const result = await services?.submitAlchemyAttempt?.({
        actorId: currentActorId(),
        craftingSystemId: activeSystemId,
        submittedComponentIds: submittedComponentIds(),
        componentSourceActorIds: currentSourceIds(),
        interactive: true,
      });
      if (result && result.cancelled === true) return result;
      workbench = {};
      selectedRecipeId = null;
      await load(true);
      const nowKnown = Array.isArray(listing?.recipes) ? listing.recipes : [];
      const discovered = nowKnown.find((recipe) => !priorKnown.has(recipe.id)) ?? null;
      if (result && result.success === true) {
        lastBrew = { ok: true, discovered: discovered?.name ?? null, message: result.message ?? '' };
      } else if (result && result.disposition === 'no-match') {
        lastBrew = { ok: false, discovered: null, message: result.message ?? '' };
      } else {
        lastBrew = { ok: false, discovered: null, message: result?.message ?? '' };
        if (result?.message) services?.notify?.(result.message);
      }
      return result ?? null;
    } catch (err) {
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
      lastBrew = { ok: false, discovered: null, message: err?.message ?? String(err) };
      return { success: false, results: null, message: err?.message ?? String(err) };
    } finally {
      brewInFlight = false;
    }
  }

  return {
    get listing() {
      return listing;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get loadedOnce() {
      return loadedOnce;
    },
    get activeSystemId() {
      return activeSystemId;
    },
    get systems() {
      return systems;
    },
    get canSwitch() {
      return canSwitch;
    },
    get needsChooser() {
      return needsChooser;
    },
    get denied() {
      return listing?.denied === true;
    },
    get knownRecipes() {
      return knownRecipes;
    },
    get knownCount() {
      return knownCount;
    },
    get undiscoveredCount() {
      return undiscoveredCount;
    },
    get components() {
      return components;
    },
    get benchChips() {
      return benchChips;
    },
    get benchEmpty() {
      return benchEmpty;
    },
    get benchKey() {
      return benchKey;
    },
    get search() {
      return search;
    },
    get selectedRecipeId() {
      return selectedRecipeId;
    },
    get selectedRecipe() {
      return selectedRecipe;
    },
    get mode() {
      return mode;
    },
    get target() {
      return target;
    },
    get missing() {
      return missing;
    },
    get brewEnabled() {
      return brewEnabled;
    },
    get brewInFlight() {
      return brewInFlight;
    },
    get lastBrew() {
      return lastBrew;
    },
    signatureKey,
    load,
    chooseSystem,
    switchDiscipline,
    setSearch,
    add,
    removeOne,
    clear,
    selectRecipe,
    brew,
  };
}

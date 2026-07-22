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
 * ADVISORY. `ready`/`assembling` resolve for two recipe shapes: a concrete
 * plain-component multiset (exact match), and an ESSENCE-ONLY requirement (`>=`
 * match, mirroring the engine so surplus essences still read as `ready`).
 * Select-to-load auto-fill stays scoped to the concrete shape — an essence
 * requirement has no unique component solution, so the store never picks which of
 * the player's items to burn. For any recipe with alternatives / tags / multiple
 * ingredient sets, or a set mixing ingredient groups with essences, the store
 * FAILS SAFE to `untried` and never emits a false `ready`/`assembling`; the engine
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
  let componentSearch = $state('');
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

  // True when the actor owns any component in this discipline, regardless of the
  // component-name search. The column uses this to tell the onboarding "acquire
  // components" empty state apart from the "no matches" filtered-empty state.
  const hasOwnedComponents = $derived(
    Array.isArray(listing?.components) && listing.components.length > 0
  );

  /**
   * Owned components with availability (held minus placed on the bench), filtered
   * by the component-name search. Availability math runs before the filter so a
   * placed component still reserves its held units even while hidden by the search.
   */
  const components = $derived.by(() => {
    const owned = Array.isArray(listing?.components) ? listing.components : [];
    const rows = owned.map((component) => {
      const placed = workbench[component.componentId] || 0;
      const available = Math.max(0, Number(component.held || 0) - placed);
      return {
        componentId: component.componentId,
        name: component.name,
        img: component.img,
        essences: Array.isArray(component.essences) ? component.essences : [],
        held: Number(component.held || 0),
        placed,
        available,
        disabled: available <= 0,
      };
    });
    const query = componentSearch.trim().toLowerCase();
    return query
      ? rows.filter((row) => String(row.name ?? '').toLowerCase().includes(query))
      : rows;
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
          essences: Array.isArray(component?.essences) ? component.essences : [],
          qty,
        };
      })
  );

  const benchEmpty = $derived(benchChips.length === 0);
  const benchKey = $derived(signatureKey(workbench));

  /**
   * The aggregate essence profile of everything on the bench: each placed
   * component's PER-UNIT essences multiplied by its placed quantity, summed by
   * essence id. This mirrors the engine's `accumulateItemEssences`, which counts
   * one occurrence per submitted unit. It drives both the bench readout and the
   * essence-aware `ready`/`assembling` resolution below. Zero/absent essences drop
   * out, so the readout renders only where it is meaningful.
   */
  const benchEssences = $derived.by(() => {
    const totals = new Map();
    for (const chip of benchChips) {
      const placed = Number(chip?.qty) || 0;
      if (placed <= 0) continue;
      for (const essence of Array.isArray(chip.essences) ? chip.essences : []) {
        if (!essence?.id) continue;
        const perUnit = Number(essence.quantity) || 0;
        if (perUnit <= 0) continue;
        const existing = totals.get(essence.id);
        if (existing) {
          existing.quantity += perUnit * placed;
        } else {
          totals.set(essence.id, {
            id: essence.id,
            name: essence.name ?? essence.id,
            icon: essence.icon ?? null,
            quantity: perUnit * placed,
          });
        }
      }
    }
    return [...totals.values()]
      .filter((essence) => essence.quantity > 0)
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  });

  const selectedRecipe = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    return recipes.find((recipe) => recipe?.id === selectedRecipeId) ?? null;
  });

  /** The bench essence profile keyed by essence id, for requirement math. */
  const benchEssenceTotals = $derived.by(() => {
    const totals = {};
    for (const essence of benchEssences) totals[essence.id] = essence.quantity;
    return totals;
  });

  /**
   * Whether the bench satisfies an ESSENCE-ONLY recipe's requirement. Mirrors the
   * engine (`_matchAlchemySignature`), which satisfies an essence when the
   * submitted total is at LEAST the required quantity — so surplus essences still
   * match and must still read as `ready`.
   */
  function essencesSatisfied(requirement) {
    return requirement.every(
      (essence) => (benchEssenceTotals[essence.id] || 0) >= essence.quantity
    );
  }

  /** The per-essence shortfall toward a requirement, as `missing`-shaped rows. */
  function essenceShortfall(requirement) {
    return requirement
      .map((essence) => ({
        componentId: essence.id,
        name: essence.name,
        img: null,
        need: essence.quantity - (benchEssenceTotals[essence.id] || 0),
      }))
      .filter((row) => row.need > 0);
  }

  /** An essence-only recipe's resolved requirement, or null when not resolvable. */
  function essenceRequirementOf(recipe) {
    const requirement = recipe?.essenceRequirement;
    return Array.isArray(requirement) && requirement.length > 0 ? requirement : null;
  }

  /**
   * Whether the bench CONTAINS a concrete recipe's multiset — every required unit
   * is present in at least the required count (`>=`, the engine's superset-tolerant
   * rule). Extras on the bench do not disqualify the match.
   */
  function concreteContainedByBench(concrete) {
    return Object.entries(concrete).every(([cid, need]) => (workbench[cid] || 0) >= need);
  }

  /**
   * Whether concrete multiset `a` STRICTLY contains `b` — `a` supplies at least
   * every unit `b` requires and strictly more somewhere. This is the client mirror
   * of the engine's `signatureDominates` specificity order for the concrete
   * single-option-per-group shape.
   */
  function concreteStrictlyContains(a, b) {
    for (const [cid, need] of Object.entries(b)) {
      if ((a[cid] || 0) < need) return false;
    }
    return Object.entries(a).some(([cid, have]) => have > (b[cid] || 0));
  }

  /**
   * The unique MOST-SPECIFIC concrete recipe among candidates the bench contains:
   * the single one no other candidate strictly contains. Returns null on an empty
   * set OR a non-unique maximum (incomparable siblings / duplicate signatures),
   * mirroring the engine's fail-safe fizzle so the client never promises a brew the
   * engine would fizzle.
   */
  function mostSpecificConcrete(candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const maximal = candidates.filter((candidate) =>
      candidates.every(
        (other) => other === candidate || !concreteStrictlyContains(other.concrete, candidate.concrete)
      )
    );
    return maximal.length === 1 ? maximal[0] : null;
  }

  /**
   * Five-mode resolution (best-effort, engine-authoritative, fail-safe to
   * `untried`). Two recipe shapes resolve client-side:
   *  - a COMPONENT recipe with a `concrete` plain-component multiset (exact match);
   *  - an ESSENCE-ONLY recipe with an `essenceRequirement` (`>=` match, mirroring
   *    the engine, so surplus essences still read as `ready`).
   * Anything else — alternatives, tags, multiple sets, or a set mixing ingredient
   * groups with essences — has neither projection and fails safe to `untried`, so
   * a rich-signature recipe never yields a false `ready`/`assembling`.
   */
  const resolution = $derived.by(() => {
    if (benchEmpty) return { mode: 'empty', target: null, missing: [] };

    // 1. Bench satisfies a revealed recipe -> ready. This mirrors the engine's
    //    most-specific match (issue 774): the engine is superset-tolerant (a bench
    //    that CONTAINS a concrete recipe matches it) and, among several matches,
    //    brews the MOST-SPECIFIC (the strict-superset concrete), failing safe to a
    //    fizzle on an incomparable tie. So the client selects the unique concrete
    //    the bench contains that no other contained concrete is a subset of; a
    //    non-unique maximum yields no confident `ready` (the engine would fizzle).
    const concreteWinner = mostSpecificConcrete(
      (Array.isArray(listing?.recipes) ? listing.recipes : []).filter(
        (recipe) => recipe?.concrete && concreteContainedByBench(recipe.concrete)
      )
    );
    if (concreteWinner) return { mode: 'ready', target: concreteWinner, missing: [] };
    for (const recipe of Array.isArray(listing?.recipes) ? listing.recipes : []) {
      const requirement = essenceRequirementOf(recipe);
      if (requirement && essencesSatisfied(requirement)) {
        return { mode: 'ready', target: recipe, missing: [] };
      }
    }

    // 2. Bench is progressing toward the SELECTED recipe -> assembling (with the
    //    still-needed components or essences). A satisfied selection already
    //    returned `ready` above, so reaching here means the requirement is unmet.
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
    } else {
      const requirement = essenceRequirementOf(selectedRecipe);
      if (requirement) {
        return {
          mode: 'assembling',
          target: selectedRecipe,
          missing: essenceShortfall(requirement),
        };
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
    componentSearch = '';
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

  /** Filter the owned-component inventory by name. */
  function setComponentSearch(value) {
    componentSearch = typeof value === 'string' ? value : '';
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

  /** Remove EVERY placed unit of a component from the bench (delete the key). */
  function removeAll(componentId) {
    if (!componentId || !(componentId in workbench)) return;
    const next = { ...workbench };
    delete next[componentId];
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
    // Capture the pre-brew target/selection so a Tiered success can be flagged as a
    // tiered-tier banner even after the bench is cleared and the listing reloads.
    const priorTarget = target;
    const priorSelected = selectedRecipe;
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
      const discoveredName = discovered?.name ?? null;
      // Brew status enum (replaces the old `ok` boolean; the banner styles each):
      //  success           — a passed brew produced its success result set;
      //  tiered-tier       — a passed Tiered brew produced its outcome-tier result set;
      //  produced-on-failure — a matched Simple brew FAILED its check and produced the
      //                        reserved failure result set (must NOT read as success-green);
      //  no-match-fizzle   — no reaction (or a Tiered fail / misconfiguration).
      if (result && result.success === true) {
        const tiered =
          discovered?.checkMode === 'tiered' ||
          priorTarget?.checkMode === 'tiered' ||
          priorSelected?.checkMode === 'tiered';
        lastBrew = {
          status: tiered ? 'tiered-tier' : 'success',
          discovered: discoveredName,
          message: result.message ?? '',
        };
      } else if (result && result.disposition === 'produced-on-failure') {
        lastBrew = {
          status: 'produced-on-failure',
          discovered: discoveredName,
          message: result.message ?? '',
        };
      } else if (result && result.disposition === 'no-match') {
        lastBrew = { status: 'no-match-fizzle', discovered: null, message: result.message ?? '' };
      } else {
        lastBrew = { status: 'no-match-fizzle', discovered: null, message: result?.message ?? '' };
        if (result?.message) services?.notify?.(result.message);
      }
      return result ?? null;
    } catch (err) {
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
      lastBrew = { status: 'no-match-fizzle', discovered: null, message: err?.message ?? String(err) };
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
    get hasOwnedComponents() {
      return hasOwnedComponents;
    },
    get componentSearch() {
      return componentSearch;
    },
    get benchChips() {
      return benchChips;
    },
    get benchEssences() {
      return benchEssences;
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
    setComponentSearch,
    add,
    removeOne,
    removeAll,
    clear,
    selectRecipe,
    brew,
  };
}

/**
 * The Books & Scrolls selection and the recipe-item editor's staged draft: its baseline, the
 * linked item it previews, the recipes it holds, and the open, save, delete and drop around it.
 * Every root value is a thunk read at call time, and each route change lands through the root's
 * `confirmRouteExit`, `afterTruthyResult` and `setActiveView`.
 */
import { mergeAccessors } from '../gatheringRouteModel.svelte.js';

// Deep PLAIN clone for the recipe-item draft + baseline.
function cloneRecipeItemDraft(source) {
  return source ? JSON.parse(JSON.stringify(source)) : null;
}

function recipeItemSourceSnapshot(source) {
  const uuid = String(source?.originItemUuid || '');
  if (!uuid) return null;
  return {
    uuid,
    name: source?.resolvedName || source?.name || '',
    img: source?.resolvedImg || source?.img || '',
    type: source?.derivedType || source?.type || '',
    description: source?.description || '',
  };
}

// Recursively deep-merge a partial patch into the recipe-item draft.
function deepMergeDraft(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMergeDraft(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** The selected Books & Scrolls row and the open editor's cells, under the shell's names. */
function createDraftState() {
  let selectedRecipeItemId = $state('');
  let recipeItemDraft = $state(null);
  let recipeItemDraftBaseline = $state(null);
  let recipeItemLinkedSourceSnapshot = $state(null);
  let recipeItemEditSaving = $state(false);
  // Set on every failed recipe-item save.
  let recipeItemSaveFailed = $state(false);
  let recipeItemActiveTab = $state('overview');

  return {
    get selectedRecipeItemId() {
      return selectedRecipeItemId;
    },
    set selectedRecipeItemId(id) {
      selectedRecipeItemId = id;
    },
    get recipeItemDraft() {
      return recipeItemDraft;
    },
    set recipeItemDraft(next) {
      recipeItemDraft = next;
    },
    get recipeItemDraftBaseline() {
      return recipeItemDraftBaseline;
    },
    set recipeItemDraftBaseline(next) {
      recipeItemDraftBaseline = next;
    },
    get recipeItemLinkedSourceSnapshot() {
      return recipeItemLinkedSourceSnapshot;
    },
    set recipeItemLinkedSourceSnapshot(next) {
      recipeItemLinkedSourceSnapshot = next;
    },
    get recipeItemEditSaving() {
      return recipeItemEditSaving;
    },
    set recipeItemEditSaving(next) {
      recipeItemEditSaving = next;
    },
    get recipeItemSaveFailed() {
      return recipeItemSaveFailed;
    },
    set recipeItemSaveFailed(next) {
      recipeItemSaveFailed = next;
    },
    get recipeItemActiveTab() {
      return recipeItemActiveTab;
    },
    set recipeItemActiveTab(tab) {
      recipeItemActiveTab = tab;
    },
  };
}

/** The inspector's row, the editor's dirty and save flags, its preview and its recipe pools. */
function createDraftViews({ viewState, recipeItemDefinitions, worldItemOptions }, state) {
  const selectedRecipeItem = $derived(
    (recipeItemDefinitions() || []).find((def) => def.id === state.selectedRecipeItemId) || null
  );
  const recipeItemEditDirty = $derived(
    Boolean(state.recipeItemDraft) &&
      JSON.stringify(state.recipeItemDraft) !== JSON.stringify(state.recipeItemDraftBaseline)
  );
  const canSaveRecipeItemEdit = $derived(
    recipeItemEditDirty === true && state.recipeItemEditSaving !== true
  );
  // The linked world item for the editor's Overview preview.
  const recipeItemEditorLinkedItem = $derived.by(() => {
    const uuid = String(state.recipeItemDraft?.originItemUuid || '');
    if (!uuid) return null;
    const snapshot = state.recipeItemLinkedSourceSnapshot;
    if (snapshot?.uuid === uuid) {
      return { ...snapshot };
    }
    const persisted = (recipeItemDefinitions() || []).find((def) => def.originItemUuid === uuid);
    if (persisted) {
      return {
        uuid,
        name: persisted.resolvedName,
        img: persisted.resolvedImg,
        type: persisted.derivedType,
        description: persisted.description || '',
      };
    }
    const option = (worldItemOptions() || []).find((item) => item.uuid === uuid);
    return option ? { ...option } : { uuid, name: '', img: '', type: '' };
  });
  // Recipes contained by the edited recipe item, and the pool that can still be added.
  const recipeItemDraftRecipeIds = $derived(
    new Set((state.recipeItemDraft?.recipeIds || []).map(String))
  );
  const recipeItemEditorLinkedRecipes = $derived(
    state.recipeItemDraft
      ? (viewState().recipes || []).filter((recipe) =>
          recipeItemDraftRecipeIds.has(String(recipe?.id))
        )
      : []
  );
  const recipeItemEditorAvailableRecipes = $derived(
    state.recipeItemDraft
      ? (viewState().recipes || []).filter(
          (recipe) => !recipeItemDraftRecipeIds.has(String(recipe?.id))
        )
      : []
  );

  return {
    get selectedRecipeItem() {
      return selectedRecipeItem;
    },
    get recipeItemEditDirty() {
      return recipeItemEditDirty;
    },
    get canSaveRecipeItemEdit() {
      return canSaveRecipeItemEdit;
    },
    get recipeItemEditorLinkedItem() {
      return recipeItemEditorLinkedItem;
    },
    get recipeItemEditorLinkedRecipes() {
      return recipeItemEditorLinkedRecipes;
    },
    get recipeItemEditorAvailableRecipes() {
      return recipeItemEditorAvailableRecipes;
    },
  };
}

/** The editor's staged edits, the guard's discard and the inspector's live quick limit. */
function createDraftEdits({ store, services, visibilityMode }, state) {
  function patchRecipeItemDraft(patch) {
    if (!state.recipeItemDraft || !patch) return;
    state.recipeItemDraft = deepMergeDraft(state.recipeItemDraft, patch);
  }

  return {
    patchRecipeItemDraft,
    selectRecipeItem(recipeItemId) {
      state.selectedRecipeItemId = recipeItemId;
    },
    // The toggle emits a boolean; the caps patch follows the visibility mode, live-applied.
    toggleRecipeItemQuickLimit(recipeItemId, limited) {
      const patch =
        visibilityMode() === 'item'
          ? { item: { limitUses: limited === true, maxUses: 1 } }
          : {
              learn: {
                limitLearning: limited === true,
                learnScope: 'perInstance',
                learnsAllowed: 1,
              },
            };
      store().updateRecipeItemCaps?.(recipeItemId, patch);
    },
    // Link / unlink the linked world item behind the edited recipe item (staged).
    async linkRecipeItemSource(uuid) {
      if (!uuid) return false;
      const source = await services()?.resolveToolSource?.(uuid);
      if (!source) return false;
      state.recipeItemLinkedSourceSnapshot = { ...source, uuid: source.uuid || uuid };
      patchRecipeItemDraft({ originItemUuid: source.uuid || uuid });
      return true;
    },
    unlinkRecipeItemSource() {
      state.recipeItemLinkedSourceSnapshot = null;
      patchRecipeItemDraft({ originItemUuid: null });
    },
    linkRecipeToItem(recipeId) {
      if (!state.recipeItemDraft?.id || !recipeId) return;
      const next = new Set((state.recipeItemDraft.recipeIds || []).map(String));
      next.add(String(recipeId));
      patchRecipeItemDraft({ recipeIds: [...next] });
    },
    unlinkRecipeFromItem(recipeId) {
      if (!state.recipeItemDraft?.id || !recipeId) return;
      const next = (state.recipeItemDraft.recipeIds || [])
        .map(String)
        .filter((id) => id !== String(recipeId));
      patchRecipeItemDraft({ recipeIds: next });
    },
    /** The `recipe-item-edit` exit guard's discard: the baseline, and the preview it links. */
    discard() {
      state.recipeItemDraft = cloneRecipeItemDraft(state.recipeItemDraftBaseline);
      state.recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(
        state.recipeItemDraftBaseline
      );
    },
  };
}

/** Open, save, delete and drop: what starts or ends an edit, and the route each lands on. */
function createDraftLifecycle(inputs, state) {
  const { store, services, recipeItemDefinitions, selectedSystemId, navRail } = inputs;
  const { setWorldItemOptions, setActiveView, afterTruthyResult, confirmRouteExit } = inputs;

  // Open the full-window recipe-item editor for a definition (recipe-item-edit route).
  function editRecipeItem(recipeItemId) {
    afterTruthyResult(confirmRouteExit('recipe-item-edit'), () => {
      state.selectedRecipeItemId = recipeItemId;
      state.recipeItemEditSaving = false;
      state.recipeItemSaveFailed = false;
      state.recipeItemActiveTab = 'overview';
      const source = (recipeItemDefinitions() || []).find((def) => def.id === recipeItemId) || null;
      state.recipeItemDraft = cloneRecipeItemDraft(source);
      state.recipeItemDraftBaseline = cloneRecipeItemDraft(source);
      state.recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(source);
      setActiveView('recipe-item-edit');
      navRail().expandGroup('crafting');
      Promise.resolve(services()?.getWorldItemOptions?.()).then((options) => {
        setWorldItemOptions(options || []);
      });
    });
  }

  function clearRecipeItemDraft() {
    state.recipeItemDraft = null;
    state.recipeItemDraftBaseline = null;
    state.recipeItemLinkedSourceSnapshot = null;
    state.recipeItemSaveFailed = false;
  }

  // Commit the staged recipe-item draft in a single updateRecipeItemDefinition call (via the
  // store's saveRecipeItem wrapper).
  async function saveRecipeItemDraft() {
    if (state.recipeItemEditSaving) return false;
    const draft = state.recipeItemDraft;
    if (!draft?.id) return false;
    state.recipeItemEditSaving = true;
    state.recipeItemSaveFailed = false;
    try {
      const result = await store().saveRecipeItem?.(draft.id, {
        enabled: draft.enabled !== false,
        originItemUuid: draft.originItemUuid ?? null,
        recipeIds: Array.isArray(draft.recipeIds) ? draft.recipeIds : [],
        caps: draft.caps || {},
      });
      if (result === false) {
        state.recipeItemSaveFailed = true;
        return false;
      }
      state.recipeItemDraftBaseline = cloneRecipeItemDraft(state.recipeItemDraft);
      setActiveView('books-scrolls');
      return result;
    } catch {
      state.recipeItemSaveFailed = true;
      return false;
    } finally {
      state.recipeItemEditSaving = false;
    }
  }

  return {
    editRecipeItem,
    saveRecipeItemDraft,
    async deleteRecipeItemFromEdit() {
      if (!state.recipeItemDraft?.id || state.recipeItemEditSaving) return;
      const result = await store().deleteRecipeItemDefinition?.(state.recipeItemDraft.id);
      if (result === false) return; // cancelled or failed → stay in the editor
      clearRecipeItemDraft();
      setActiveView('books-scrolls');
    },
    // Create a recipe item from a dropped world/compendium Item (issue 844).
    async dropRecipeItem(uuid) {
      if (!uuid) return;
      const created = await store().addRecipeItemFromUuid?.(selectedSystemId(), uuid);
      const newId = typeof created === 'string' ? created : created?.item?.id || created?.id;
      if (newId) editRecipeItem(newId);
    },
  };
}

export function createRecipeItemModel(inputs) {
  const state = createDraftState();
  return mergeAccessors(
    state,
    createDraftViews(inputs, state),
    createDraftEdits(inputs, state),
    createDraftLifecycle(inputs, state)
  );
}

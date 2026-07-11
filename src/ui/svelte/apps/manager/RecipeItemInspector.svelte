<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropData } from '../../util/dropUtils.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js';
  import {
    GENERAL_RECIPE_CATEGORY,
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory
  } from '../../../../utils/recipeCategories.js';

  let {
    recipe = null,
    recipeItemDefinitions = [],
    categories = [],
    multiStepEnabled = false,
    complex = false,
    multiSetAllowed = false,
    // Alchemy recipes always have exactly one ingredient set and derive their result
    // shape from the system-level alchemy.checkMode, so the Simple/Complex toggle is
    // never shown for them (the retired per-recipe routing basis is gone).
    hideComplexToggle = false,
    onSetComplexity = () => {},
    onAddRecipeItem = () => {},
    onSetRecipeItem = () => {},
    onRemoveRecipeItem = () => {},
    onSetCategory = () => {},
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    onOpenItem = () => {},
    onCopyItemUuid = () => {}
  } = $props();

  // The recipe↔recipe-item link is many-to-many (issue 511): a recipe can be
  // taught by several books. The row projects every containing book id as
  // `recipeItemIds`; fall back to the legacy scalar `recipeItemId` when the
  // projection is absent.
  const linkedDefinitionIds = $derived(
    Array.isArray(recipe?.recipeItemIds) && recipe.recipeItemIds.length > 0
      ? recipe.recipeItemIds.map((id) => String(id))
      : (recipe?.recipeItemId ? [String(recipe.recipeItemId)] : [])
  );

  // Resolve each linked id to its definition, preserving projection order.
  const linkedDefinitions = $derived(
    linkedDefinitionIds
      .map((id) => (recipeItemDefinitions || []).find((def) => String(def.id) === id) || null)
      .filter(Boolean)
  );

  // Resolve each book's underlying item document for a live thumb/name + the
  // missing-state, keyed by definition id. Re-resolved when the recipe or its
  // linked set changes so a row never goes stale. Mirrors the single-item
  // resolution the inspector used before the many-to-many redesign.
  let resolvedByDefId = $state({});
  $effect(() => {
    void recipe?.id;
    const defs = linkedDefinitions;
    if (typeof globalThis.fromUuid !== 'function') {
      const next = {};
      for (const def of defs) {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) next[def.id] = { name: '', img: '', missing: true };
      }
      resolvedByDefId = next;
      return;
    }
    let cancelled = false;
    Promise.all(
      defs.map(async (def) => {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) return [def.id, { name: '', img: '', missing: true }];
        try {
          const doc = await Promise.resolve(globalThis.fromUuid(uuid));
          if (!doc) return [def.id, { name: '', img: '', missing: true }];
          return [def.id, { name: String(doc.name || ''), img: String(doc.img || ''), missing: false }];
        } catch {
          return [def.id, { name: '', img: '', missing: true }];
        }
      })
    ).then((entries) => {
      if (!cancelled) resolvedByDefId = Object.fromEntries(entries);
    });
    return () => { cancelled = true; };
  });

  function definitionName(def) {
    return resolvedByDefId[def.id]?.name || def?.name || String(def?.originItemUuid || '');
  }
  function definitionImg(def) {
    return resolvedByDefId[def.id]?.img || def?.img || DEFAULT_RECIPE_IMAGE;
  }
  function definitionMissing(def) {
    return resolvedByDefId[def.id]?.missing === true;
  }

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Recipe category selector. The "general" fallback is always present; custom
  // categories come from the crafting system. With no custom categories the
  // dropdown is disabled and only shows "General".
  const effectiveCategories = $derived(getEffectiveRecipeCategories(categories));
  const hasCustomCategories = $derived(effectiveCategories.length > 1);
  const currentCategory = $derived(normalizeRecipeCategory(recipe?.category));
  // Keep a stale custom value selectable so the field never silently blanks.
  function buildCategoryOptions() {
    if (!hasCustomCategories) return [GENERAL_RECIPE_CATEGORY];
    if (effectiveCategories.includes(currentCategory)) return effectiveCategories;
    return [...effectiveCategories, currentCategory];
  }
  const categoryOptions = $derived(buildCategoryOptions());
  const selectedCategory = $derived(hasCustomCategories ? currentCategory : GENERAL_RECIPE_CATEGORY);

  function changeCategory(event) {
    const next = String(event.currentTarget.value || GENERAL_RECIPE_CATEGORY);
    if (next === currentCategory) return;
    onSetCategory(next);
  }

  // Step mode: a recipe is multi-step when it has an explicit steps array. Switching
  // mode is delegated up (seed-from-top-level on enter, confirm-then-clear on revert).
  const isMultiStep = $derived((recipe?.steps?.length ?? 0) >= 1);

  function selectStepMode(multi) {
    if (multi === isMultiStep) return;
    if (multi) onEnterMultiStep();
    else onRevertToSingleStep();
  }

  // Simple vs Complex authoring mode. Complex is gated on the system's resolution
  // mode (multiSetAllowed); a recipe that is already complex can always stay complex.
  const complexAllowed = $derived(!hideComplexToggle && (multiSetAllowed || complex));

  function selectComplexity(next) {
    if (next === complex) return;
    if (next && !complexAllowed) return;
    onSetComplexity(next);
  }

  // Drop a Foundry Item to link/replace it. Item-only: an unpersisted item drop
  // carries { type: 'Item' } with no uuid and is a no-op.
  async function handleItemDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Item' || !uuid) return;
    const result = await onAddRecipeItem(uuid);
    const linkedId = result?.item?.id;
    if (!linkedId) return;
    onSetRecipeItem(linkedId);
  }

  // Unlink one book from this recipe (remove the recipe from that book's
  // membership). Many-to-many: other linked books are untouched.
  function unlinkDefinition(def) {
    if (def?.id) onRemoveRecipeItem(def.id);
  }

  function onLinkedItemMouseDown(event, def) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkDefinition(def);
  }

  function openItem(def) {
    const uuid = String(def?.originItemUuid || '');
    if (uuid) onOpenItem(uuid);
  }

  function copyItemUuid(def) {
    const uuid = String(def?.originItemUuid || '');
    if (uuid) onCopyItemUuid(uuid);
  }
</script>

<section class="manager-inspector-card" data-recipe-section="recipe-item">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item')}</h3>
  {#if linkedDefinitions.length > 0}
    <!-- Every book (recipe item) that teaches this recipe. Many-to-many: a recipe
         can be taught by several books; each row unlinks only that book. -->
    <ul class="manager-recipe-item-links" data-recipe-item-links aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLinks', 'Linked recipe items')}>
      {#each linkedDefinitions as def (def.id)}
        <!-- Right-click-to-unlink is an enhancement; the visible Unlink button
             inside provides the accessible path. -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li
          class="manager-environment-scene-linked"
          data-recipe-item-linked
          data-recipe-item-link={def.id}
          title={text('FABRICATE.Admin.Manager.Recipe.RecipeItemUnlinkHint', 'Right-click to unlink this book.')}
          oncontextmenu={(event) => { event.preventDefault(); unlinkDefinition(def); }}
          onmousedown={(event) => onLinkedItemMouseDown(event, def)}
        >
          {#if definitionMissing(def)}
            <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-suitcase"></i></span>
            <span class="manager-environment-scene-name manager-muted" data-recipe-item-missing>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing', 'Recipe item unresolved')}</span>
          {:else}
            <img class="manager-environment-scene-thumb" src={definitionImg(def)} alt="" />
            <button type="button" class="manager-environment-scene-name" onclick={(event) => { event.stopPropagation(); openItem(def); }} title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}>{definitionName(def)}</button>
          {/if}
          <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} title={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} disabled={!def?.originItemUuid} onclick={(event) => { event.stopPropagation(); copyItemUuid(def); }}><i class="fas fa-copy" aria-hidden="true"></i></button>
          <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} onclick={(event) => { event.stopPropagation(); unlinkDefinition(def); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
    <div class="manager-environment-scene-dropzone is-compact" data-recipe-item-dropzone use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemLinkAnother', 'Drag an item here to link another.')}</span>
    </div>
  {:else}
    <div class="manager-environment-scene-dropzone" data-recipe-item-dropzone use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}>
      <i class="fas fa-box" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemDropHint', 'Drag an item here to link it.')}</span>
    </div>
  {/if}
</section>

{#if recipe}
  <section class="manager-inspector-card" data-recipe-section="recipe-category">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</h3>
    <label class="manager-field">
      <span class="sr-only">{text('FABRICATE.Admin.Manager.Recipe.CategorySelectLabel', 'Select recipe category')}</span>
      <select
        data-recipe-category-select
        value={selectedCategory}
        disabled={!hasCustomCategories}
        title={hasCustomCategories
          ? text('FABRICATE.Admin.Manager.Recipe.CategorySelectLabel', 'Select recipe category')
          : text('FABRICATE.Admin.Manager.Recipe.CategoryNoneHint', 'No categories defined. Add some under Tags and Categories.')}
        onchange={changeCategory}
      >
        {#each categoryOptions as category (category)}
          <option value={category}>{getRecipeCategoryLabel(category, localize)}</option>
        {/each}
      </select>
    </label>
  </section>

  {#if multiStepEnabled || isMultiStep}
  <section class="manager-inspector-card" data-recipe-section="recipe-step-mode">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}</h3>
    <div class="manager-environment-mode-control" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}>
      <button
        type="button"
        role="radio"
        class={`manager-environment-mode-option ${isMultiStep ? '' : 'is-selected'}`}
        aria-checked={!isMultiStep}
        data-recipe-step-mode-option="single"
        onclick={() => selectStepMode(false)}
      >
        <span class="manager-environment-mode-head">
          <i class="fas fa-square" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step')}</span>
        </span>
      </button>
      <button
        type="button"
        role="radio"
        class={`manager-environment-mode-option ${isMultiStep ? 'is-selected' : ''}`}
        aria-checked={isMultiStep}
        data-recipe-step-mode-option="multi"
        onclick={() => selectStepMode(true)}
      >
        <span class="manager-environment-mode-head">
          <i class="fas fa-list-ol" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.MultiStep', 'Multi-step')}</span>
        </span>
      </button>
    </div>
    <p class="manager-muted manager-environment-mode-hint">{isMultiStep
      ? text('FABRICATE.Admin.Manager.Recipe.MultiStepHint', 'Author an ordered list of named steps in the editor.')
      : text('FABRICATE.Admin.Manager.Recipe.SingleStepHint', 'The recipe is crafted in a single step.')}</p>
  </section>
  {/if}

  {#if complexAllowed}
  <!-- The recipe-mode toggle only appears when Complex is an available choice:
       a system whose resolution mode forbids multiple sets (e.g. simple) crafts
       one set into one result, so the toggle would offer no real choice and is
       hidden entirely. An already-complex recipe keeps the toggle so it can be
       inspected or reverted. -->
  <section class="manager-inspector-card" data-recipe-section="recipe-mode">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.RecipeMode', 'Recipe mode')}</h3>
    <div class="manager-environment-mode-control" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeMode', 'Recipe mode')}>
      <button
        type="button"
        role="radio"
        class={`manager-environment-mode-option ${complex ? '' : 'is-selected'}`}
        aria-checked={!complex}
        data-recipe-mode-option="simple"
        onclick={() => selectComplexity(false)}
      >
        <span class="manager-environment-mode-head">
          <i class="fas fa-equals" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.SimpleMode', 'Simple')}</span>
        </span>
      </button>
      <button
        type="button"
        role="radio"
        class={`manager-environment-mode-option ${complex ? 'is-selected' : ''}`}
        aria-checked={complex}
        data-recipe-mode-option="complex"
        onclick={() => selectComplexity(true)}
      >
        <span class="manager-environment-mode-head">
          <i class="fas fa-diagram-project" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.ComplexMode', 'Complex')}</span>
        </span>
      </button>
    </div>
    <p class="manager-muted manager-environment-mode-hint">{complex
      ? text('FABRICATE.Admin.Manager.Recipe.ComplexHint', 'Author multiple ingredient sets and result sets.')
      : text('FABRICATE.Admin.Manager.Recipe.SimpleHint', 'One set of ingredients makes one result.')}</p>
  </section>
  {/if}
{/if}

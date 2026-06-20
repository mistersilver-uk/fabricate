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
    onAddRecipeItem = () => {},
    onSetRecipeItem = () => {},
    onSetCategory = () => {},
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    onOpenItem = () => {},
    onCopyItemUuid = () => {}
  } = $props();

  // The currently linked recipe-item id is projected onto the recipe row.
  const recipeItemId = $derived(String(recipe?.recipeItemId || ''));

  // Resolve the linked recipe-item definition from the projected definitions.
  const linkedDefinition = $derived(recipeItemId
    ? (recipeItemDefinitions || []).find(def => def.id === recipeItemId) || null
    : null);
  const linkedSourceUuid = $derived(String(linkedDefinition?.sourceItemUuid || ''));

  // Resolve the underlying item document for "open" + missing-state, mirroring
  // EnvironmentSummaryInspector: a cancelled guard, re-resolved when the recipe
  // id / recipeItemId changes so the thumb never goes stale.
  let resolvedItemName = $state('');
  let resolvedItemImg = $state('');
  let resolvedItemMissing = $state(false);
  $effect(() => {
    const uuid = linkedSourceUuid;
    // Re-run when the recipe changes too, even if uuid is stable.
    void recipe?.id;
    resolvedItemName = '';
    resolvedItemImg = '';
    resolvedItemMissing = false;
    if (!recipeItemId) return;
    if (!uuid || typeof globalThis.fromUuid !== 'function') {
      resolvedItemMissing = Boolean(recipeItemId && linkedDefinition && !uuid);
      return;
    }
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid)).then(doc => {
      if (cancelled) return;
      if (!doc) {
        resolvedItemMissing = true;
        return;
      }
      resolvedItemName = String(doc.name || '');
      resolvedItemImg = String(doc.img || '');
    }).catch(() => {
      if (!cancelled) resolvedItemMissing = true;
    });
    return () => { cancelled = true; };
  });

  const linkedItemName = $derived(resolvedItemName || linkedDefinition?.name || linkedSourceUuid);
  const linkedItemImg = $derived(resolvedItemImg || linkedDefinition?.img || DEFAULT_RECIPE_IMAGE);

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

  function unlinkItem() {
    onSetRecipeItem(null);
  }

  function onLinkedItemMouseDown(event) {
    if (event.button !== 2) return;
    event.preventDefault();
    unlinkItem();
  }

  function openItem() {
    if (linkedSourceUuid) onOpenItem(linkedSourceUuid);
  }

  function copyItemUuid() {
    if (linkedSourceUuid) onCopyItemUuid(linkedSourceUuid);
  }
</script>

<section class="manager-inspector-card" data-recipe-section="recipe-item">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item')}</h3>
  {#if recipeItemId}
    <!-- Drop-to-replace and right-click-to-unlink are enhancements; the visible
         Open/Unlink buttons inside provide the accessible path. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="manager-environment-scene-linked"
      data-recipe-item-linked
      role="group"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item')}
      title={text('FABRICATE.Admin.Manager.Recipe.RecipeItemReplaceHint', 'Drop an item to replace it, or right-click to unlink.')}
      use:dragDrop={{ onDrop: handleItemDrop, activeClass: 'is-drop-active' }}
      oncontextmenu={(event) => { event.preventDefault(); unlinkItem(); }}
      onmousedown={onLinkedItemMouseDown}
    >
      {#if resolvedItemMissing}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-suitcase"></i></span>
      {:else}
        <img class="manager-environment-scene-thumb" src={linkedItemImg} alt="" />
      {/if}
      {#if resolvedItemMissing}
        <span class="manager-environment-scene-name manager-muted" data-recipe-item-missing>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing', 'Recipe item unresolved')}</span>
      {:else}
        <button type="button" class="manager-environment-scene-name" onclick={(event) => { event.stopPropagation(); openItem(); }} title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}>{linkedItemName}</button>
      {/if}
      <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} title={text('FABRICATE.Admin.Manager.Recipe.CopyItemUuid', 'Copy item UUID')} disabled={!linkedSourceUuid} onclick={(event) => { event.stopPropagation(); copyItemUuid(); }}><i class="fas fa-copy" aria-hidden="true"></i></button>
      <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')} onclick={(event) => { event.stopPropagation(); unlinkItem(); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
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

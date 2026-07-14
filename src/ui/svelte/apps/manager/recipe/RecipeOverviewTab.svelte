<!-- Svelte 5 runes mode -->
<!--
  Overview tab for the recipe editor (issue 643 rebuild). Reproduces the GM Recipe
  Studio prototype: uppercase micro-labels over unwrapped fields (no card-stack
  chrome), a select row (Category / conditional DC-check / conditional Minimum
  success tier), two side-by-side status cards (Enabled + Locked), and an
  always-visible inline duration-stepper row. Multi-step recipes swap the single
  Duration card for the Step-durations surface (RecipeStepsCard).

  Identity is fully controlled: values come from the staged `recipe` draft and
  edits emit `onUpdateRecipe(...)` patches; the enabled toggle is the immediate
  exception and emits `onToggleEnabled()`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';
  import {
    GENERAL_RECIPE_CATEGORY,
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory
  } from '../../../../../utils/recipeCategories.js';
  import { formatTimeRequirementCompact } from '../../../util/recipeDuration.js';
  import RecipeStepsCard from '../RecipeStepsCard.svelte';
  import RecipeDurationSteppers from './RecipeDurationSteppers.svelte';

  let {
    recipe = null,
    name = '',
    description = '',
    img = '',
    enabled = true,
    saving = false,
    saveFailed = false,
    isRecipeItemLinked = false,
    linkedItemImage = '',
    onPickImagePath = null,
    onNameInput = () => {},
    onDescriptionInput = () => {},
    onToggleEnabled = () => {},
    // True when an enable-blocking validation issue is present while the recipe is
    // OFF: the enable toggle is disabled so the GM cannot trigger the hard activation
    // failure (issue 549). The Validation tab lists the reasons.
    enableBlocked = false,
    onChooseImage = () => {},
    isMultiStep = false,
    // Category lives on Overview (prototype §5.1), authored here rather than in the
    // rail (issue 643). `categories` is the system's custom category list.
    categories = [],
    onSetCategory = () => {},
    checkTierOptions = [],
    // Success outcome tiers of a fixed-type routed check, ranked low→high. Non-empty
    // only for a routed+fixed system, so the "Minimum success tier" control below
    // auto-hides everywhere else.
    minSuccessTierOptions = [],
    // `recipe.locked` — persisted, engine-honoured (`guardCraftStart` refuses a
    // locked craft) and, until issue 643, written by NOTHING in the UI. Its write
    // path is never gated, unlike enable: a GM locks a recipe precisely while it is
    // unfinished.
    locked = false,
    onToggleLocked = () => {},
    onUpdateRecipe = () => {},
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function recipeImage(value) {
    return value || DEFAULT_RECIPE_IMAGE;
  }

  // Category options: the system's custom list (or the neutral "general" fallback
  // when none is defined), keeping any stale custom value selectable so the field
  // never silently blanks.
  const effectiveCategories = $derived(getEffectiveRecipeCategories(categories));
  const hasCustomCategories = $derived(effectiveCategories.length > 1);
  const currentCategory = $derived(normalizeRecipeCategory(recipe?.category));
  const categoryOptions = $derived(
    !hasCustomCategories
      ? [GENERAL_RECIPE_CATEGORY]
      : effectiveCategories.includes(currentCategory)
        ? effectiveCategories
        : [...effectiveCategories, currentCategory]
  );
  const selectedCategory = $derived(hasCustomCategories ? currentCategory : GENERAL_RECIPE_CATEGORY);

  function changeCategory(event) {
    const next = String(event.currentTarget.value || GENERAL_RECIPE_CATEGORY);
    if (next === currentCategory) return;
    onSetCategory(next);
  }
</script>

<section class="manager-recipe-tab manager-recipe-overview" data-recipe-tab="overview" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Overview', 'Overview')}>
  <div class="manager-recipe-overview-identity" data-recipe-section="identity">
    <div class="manager-recipe-overview-media">
      {#if isRecipeItemLinked}
        <span
          class="manager-task-image-picker manager-recipe-overview-image is-recipe-item-linked"
          data-recipe-item-locked-image
          title={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImageTooltip', "This image comes from the linked recipe item and can't be edited. Unlink the recipe item to choose a custom image.")}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLockedImage', 'Image provided by the linked recipe item')}
        >
          <img src={linkedItemImage || recipeImage(img)} alt="" />
          <i class="fas fa-lock" aria-hidden="true"></i>
        </span>
      {:else}
        <button
          type="button"
          class="manager-task-image-picker manager-recipe-overview-image"
          data-recipe-field="img"
          aria-label={text('FABRICATE.Admin.Manager.Recipe.ChooseImage', 'Choose recipe image')}
          onclick={onChooseImage}
          disabled={typeof onPickImagePath !== 'function' || saving}
        >
          <img src={recipeImage(img)} alt="" />
          <i class="fas fa-pen" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
    <div class="manager-recipe-overview-fields">
      <label class="manager-recipe-field" for="manager-recipe-edit-name">
        <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.NameLabel', 'Recipe name')}</span>
        <input id="manager-recipe-edit-name" class="manager-recipe-name-input" data-recipe-field="name" type="text" value={name} oninput={(event) => onNameInput(event.currentTarget.value)} disabled={saving} required />
      </label>
      <label class="manager-recipe-field" for="manager-recipe-edit-description">
        <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.FlavourLabel', 'Flavour text')}</span>
        <textarea id="manager-recipe-edit-description" class="manager-recipe-flavour-input" data-recipe-field="description" rows="3" value={description} oninput={(event) => onDescriptionInput(event.currentTarget.value)} disabled={saving}></textarea>
      </label>
    </div>
  </div>

  {#if saveFailed}
    <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Recipe.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
  {/if}

  <!-- Select row: Category, then the conditional DC-check + Minimum-success-tier
       selects that only a fixed-type routed check surfaces (prototype §5.1). -->
  <div class="manager-recipe-overview-selects">
    <label class="manager-recipe-field" data-recipe-field-category>
      <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span>
      <select
        data-recipe-category-select
        value={selectedCategory}
        disabled={saving || !hasCustomCategories}
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
    {#if checkTierOptions.length > 0}
      <label class="manager-recipe-field" data-recipe-check-tier>
        <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}</span>
        <select
          data-recipe-field="checkTierId"
          value={recipe?.checkTierId || ''}
          onchange={(event) => onUpdateRecipe({ checkTierId: event.currentTarget.value || null })}
          disabled={saving}
        >
          <option value="">{text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC')}</option>
          {#each checkTierOptions as tier (tier.id)}
            <option value={tier.id}>{(tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')) + ` (DC ${tier.dc})`}</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if minSuccessTierOptions.length > 0}
      <label class="manager-recipe-field" data-recipe-min-success-tier>
        <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTier', 'Minimum success tier')}</span>
        <select
          data-recipe-field="minSuccessOutcomeId"
          value={recipe?.minSuccessOutcomeId || ''}
          onchange={(event) => onUpdateRecipe({ minSuccessOutcomeId: event.currentTarget.value || null })}
          disabled={saving}
        >
          <option value="">{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTierNone', 'No override (use rolled tier)')}</option>
          {#each minSuccessTierOptions as tier (tier.id)}
            <option value={tier.id}>{tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <!-- Two side-by-side status cards. "Locked" is OVERLOADED on this tab: it already
       means "the image picker is locked because a recipe item is linked"
       (data-recipe-item-locked-image). This card is a DIFFERENT concept — the recipe
       stays visible to players, but only a GM can craft it — so it gets its own i18n
       keys and its hooks stay out of the `…-locked-image` naming family. -->
  <div class="manager-recipe-overview-status">
    <div class={`manager-recipe-status-card is-enabled ${enabled ? 'is-on' : 'is-off'}`} data-recipe-section="enabled-status">
      <span class="manager-recipe-status-icon" aria-hidden="true"><i class="fas fa-power-off"></i></span>
      <div class="manager-recipe-status-copy">
        <p class="manager-recipe-status-title">{text('FABRICATE.Admin.Manager.Recipe.EnabledTitle', 'Enabled')}</p>
        <p class="manager-recipe-status-sub manager-muted">{enableBlocked
          ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedHint', 'Resolve the issues on the Validation tab before enabling.')
          : text('FABRICATE.Admin.Manager.Recipe.EnabledSub', 'Craftable by players')}</p>
      </div>
      <button
        type="button"
        class={`manager-status-toggle ${enabled ? 'is-on' : 'is-off'}`}
        data-recipe-field="enabled"
        aria-pressed={enabled}
        disabled={saving || enableBlocked}
        title={enableBlocked ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedTooltip', 'Resolve the issues on the Validation tab before enabling this recipe.') : undefined}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.EnabledTitle', 'Enabled')}
        onclick={onToggleEnabled}
      >
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
      </button>
    </div>
    <div class={`manager-recipe-status-card is-locked ${locked ? 'is-on' : 'is-off'}`} data-recipe-section="locked-status">
      <span class="manager-recipe-status-icon" aria-hidden="true"><i class="fas fa-lock"></i></span>
      <div class="manager-recipe-status-copy">
        <p class="manager-recipe-status-title">{text('FABRICATE.Admin.Manager.Recipe.Locked.Title', 'Locked')}</p>
        <p class="manager-recipe-status-sub manager-muted" data-recipe-locked-state>{text('FABRICATE.Admin.Manager.Recipe.Locked.Sub', 'Visible but GM-only to craft')}</p>
      </div>
      <button
        type="button"
        class={`manager-status-toggle ${locked ? 'is-on' : 'is-off'}`}
        data-recipe-field="locked"
        aria-pressed={locked}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.Locked.Toggle', 'Lock this recipe')}
        disabled={saving}
        onclick={() => onToggleLocked(!locked)}
      >
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
      </button>
    </div>
  </div>

  {#if isMultiStep}
    <RecipeStepsCard
      steps={recipe?.steps || []}
      {onAddStep}
      {onReorderSteps}
      {onUpdateStep}
      {onDeleteStep}
    />
  {:else}
    <section class="manager-recipe-duration-card" data-recipe-section="duration">
      <div class="manager-recipe-duration-card-head">
        <div>
          <h3 class="manager-recipe-section-title">{text('FABRICATE.Admin.Manager.Recipe.Duration', 'Duration')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.DurationHint', 'How long this recipe takes to craft. Leave at zero for an instant craft.')}</p>
        </div>
        <span class="manager-chip manager-recipe-duration-pill" data-recipe-duration-summary>
          <i class="fa-solid fa-clock" aria-hidden="true"></i>
          <span>{formatTimeRequirementCompact(recipe?.timeRequirement || null)}</span>
        </span>
      </div>
      <RecipeDurationSteppers
        timeRequirement={recipe?.timeRequirement || null}
        disabled={saving}
        showLabel={false}
        onChange={(next) => onUpdateRecipe({ timeRequirement: next })}
      />
    </section>
  {/if}
</section>

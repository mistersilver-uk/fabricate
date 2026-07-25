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
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import {
    GENERAL_RECIPE_CATEGORY,
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory
  } from '../../../../../utils/recipeCategories.js';
  import { formatTimeRequirementCompact } from '../../../util/recipeDuration.js';
  import ToggleCard from '../ToggleCard.svelte';
  import RecipeStepsCard from '../RecipeStepsCard.svelte';
  import RecipeDurationSteppers from './RecipeDurationSteppers.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';

  let {
    recipe = null,
    name = '',
    description = '',
    img = '',
    enabled = true,
    saving = false,
    saveFailed = false,
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
    // Per-recipe crafting-check modifier override (issue 770). `craftingModifierOptions`
    // is the system's `checkModifiers` catalogue ({id,label}); non-empty only when the
    // system's crafting check is usable and a catalogue is authored, so the control
    // auto-hides everywhere else. `craftingModifierPolicyDefault` is the system default
    // policy, surfaced in the "Inherit" option label. The control writes
    // `recipe.craftingModifier` ({ policy?, modifierIds? } | null): null inherits.
    craftingModifierOptions = [],
    craftingModifierPolicyDefault = 'addAll',
    // `recipe.locked` — persisted, engine-honoured (`guardCraftStart` refuses a
    // locked craft) and, until issue 643, written by NOTHING in the UI. Its write
    // path is never gated, unlike enable: a GM locks a recipe precisely while it is
    // unfinished.
    locked = false,
    onToggleLocked = () => {},
    // Step mode, rehomed here from the deleted context rail (issue 676). Overview is
    // where it belongs: the steps THEMSELVES are authored on this tab (RecipeStepsCard),
    // and this control decides whether that card exists at all. `multiStepEnabled` is
    // the SYSTEM feature (`features.multiStepRecipes`); the control also renders for a
    // recipe that is ALREADY multi-step under a system whose feature was since turned
    // off, which is the only way back to single-step.
    multiStepEnabled = false,
    // COLLAPSED chain (issue 710): the system's multi-step feature is off but this
    // recipe still carries authored steps. Step authoring is gated read-only here (the
    // steps are preserved, not editable and not reverted); the Results tab edits the
    // chain's effective final-step results. Re-enabling the feature restores the full
    // step editor with all data intact.
    collapsed = false,
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    // Whether the system applies time requirements (issue 714). When off, the
    // single-step Duration card and the per-step duration editor are hidden.
    // Defaults true so a caller that omits it keeps the pre-gate behaviour.
    timeRequirementsEnabled = true,
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

  // Per-recipe crafting-modifier override state (issue 770). `overridePolicy` drives the
  // select ('' = inherit the system default); `hasModifierOverride` decides whether the
  // per-modifier picker shows. Writing null clears the override entirely (inherit).
  const MODIFIER_POLICY_LABELS = {
    addAll: () => text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll', 'Add all'),
    highest: () => text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest', 'Pick highest'),
    byRecipe: () => text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipe', 'By recipe')
  };
  const overridePolicy = $derived(recipe?.craftingModifier?.policy || '');
  const overrideModifierIds = $derived(recipe?.craftingModifier?.modifierIds || []);
  const hasModifierOverride = $derived(!!recipe?.craftingModifier);
  const defaultPolicyLabel = $derived(
    (MODIFIER_POLICY_LABELS[craftingModifierPolicyDefault] || MODIFIER_POLICY_LABELS.addAll)()
  );

  function changeModifierPolicy(value) {
    if (!value) {
      onUpdateRecipe({ craftingModifier: null });
      return;
    }
    const modifierIds = recipe?.craftingModifier?.modifierIds || [];
    onUpdateRecipe({
      craftingModifier: { policy: value, ...(modifierIds.length ? { modifierIds } : {}) }
    });
  }

  function toggleModifierId(id, checked) {
    const current = recipe?.craftingModifier?.modifierIds || [];
    const modifierIds = checked
      ? [...new Set([...current, id])]
      : current.filter((existing) => existing !== id);
    const next = {};
    if (recipe?.craftingModifier?.policy) next.policy = recipe.craftingModifier.policy;
    if (modifierIds.length) next.modifierIds = modifierIds;
    onUpdateRecipe({ craftingModifier: Object.keys(next).length ? next : null });
  }

  const STEP_MODE_OPTIONS = [
    {
      value: 'single',
      icon: 'fas fa-square',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.SingleStep',
      fallback: 'Single step'
    },
    {
      value: 'multi',
      icon: 'fas fa-list-ol',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.MultiStep',
      fallback: 'Multi-step'
    }
  ];

  // Reverting to single-step DISCARDS the per-step authoring, so the handler confirms
  // before staging it — never call these unless the mode actually changes.
  function selectStepMode(next) {
    const multi = next === 'multi';
    if (multi === isMultiStep) return;
    if (multi) onEnterMultiStep();
    else onRevertToSingleStep();
  }

  // Resolve the generic item-bag (an unset recipe icon) to the alchemical blueprint
  // default, so a recipe that never got a real icon shows the blueprint, not the bag.
  function recipeImage(value) {
    return resolveRecipeImage({ img: value });
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
      <!-- Always editable: a recipe can belong to many books & scrolls, so its image
           no longer mirrors or locks to a single linked recipe item (issue 643). -->
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
    {#if craftingModifierOptions.length > 0}
      <label class="manager-recipe-field" data-recipe-crafting-modifier>
        <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.CraftingModifier', 'Check modifiers')}</span>
        <select
          data-recipe-field="craftingModifierPolicy"
          value={overridePolicy}
          onchange={(event) => changeModifierPolicy(event.currentTarget.value || null)}
          disabled={saving}
        >
          <option value="">{text('FABRICATE.Admin.Manager.Recipe.CraftingModifierInherit', 'Inherit system default') + ` (${defaultPolicyLabel})`}</option>
          <option value="addAll">{MODIFIER_POLICY_LABELS.addAll()}</option>
          <option value="highest">{MODIFIER_POLICY_LABELS.highest()}</option>
          <option value="byRecipe">{MODIFIER_POLICY_LABELS.byRecipe()}</option>
        </select>
      </label>
      {#if hasModifierOverride}
        <div class="manager-recipe-field" data-recipe-crafting-modifier-picker>
          <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Recipe.CraftingModifierPick', 'Eligible modifiers')}</span>
          <ModifierPillSelect
            options={craftingModifierOptions}
            selectedIds={overrideModifierIds}
            disabled={saving}
            testId="recipe-crafting-modifier"
            menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
            allSelectedLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected', 'All modifiers selected.')}
            noneSelectedLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierInheritDefaults', 'Inheriting the system default modifiers.')}
            onToggle={toggleModifierId}
          />
        </div>
      {/if}
    {/if}
  </div>

  <!-- Two side-by-side status cards. "Locked" here means the recipe stays visible to
       players but only a GM can craft it (recipe.locked) — it is unrelated to the image
       picker, which is always editable now that a recipe can belong to many books. -->
  <div class="manager-recipe-overview-status">
    <ToggleCard
      variant="is-enabled"
      section="enabled-status"
      field="enabled"
      icon="fas fa-power-off"
      title={text('FABRICATE.Admin.Manager.Recipe.EnabledTitle', 'Enabled')}
      sub={enableBlocked
        ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedHint', 'Resolve the issues on the Validation tab before enabling.')
        : text('FABRICATE.Admin.Manager.Recipe.EnabledSub', 'Craftable by players')}
      on={enabled}
      disabled={saving || enableBlocked}
      toggleTitle={enableBlocked
        ? text('FABRICATE.Admin.Manager.Recipe.EnableBlockedTooltip', 'Resolve the issues on the Validation tab before enabling this recipe.')
        : ''}
      onToggle={() => onToggleEnabled()}
    />
    <ToggleCard
      variant="is-locked"
      section="locked-status"
      field="locked"
      icon="fas fa-lock"
      title={text('FABRICATE.Admin.Manager.Recipe.Locked.Title', 'Locked')}
      sub={text('FABRICATE.Admin.Manager.Recipe.Locked.Sub', 'Visible but GM-only to craft')}
      subAttr="data-recipe-locked-state"
      on={locked}
      disabled={saving}
      toggleLabel={text('FABRICATE.Admin.Manager.Recipe.Locked.Toggle', 'Lock this recipe')}
      onToggle={onToggleLocked}
    />
  </div>

  {#if (multiStepEnabled || isMultiStep) && !collapsed}
    <!-- Step mode (issue 676): rehomed from the deleted context rail, which was the ONLY
         surface carrying it — `onEnterMultiStep`/`onRevertToSingleStep` had no other
         consumer in `src/`, so deleting the rail without this would have made multi-step
         recipes unreachable for every system with the feature on. It sits directly above
         the surface it governs: the card below is either the steps list or the recipe's
         single Duration. Hidden while collapsed (issue 710): a collapsed recipe is NOT
         reverted — its steps are preserved and restored when the feature is re-enabled. -->
    <section class="manager-recipe-step-mode-card" data-recipe-section="recipe-step-mode">
      <div>
        <h3 class="manager-recipe-section-title">{text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}</h3>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.StepModeHint', 'A multi-step recipe crafts its ordered steps in sequence, each with its own ingredients, results and tools.')}</p>
      </div>
      <SegmentedControl
        options={STEP_MODE_OPTIONS}
        value={isMultiStep ? 'multi' : 'single'}
        groupName="manager-recipe-step-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}
        optionDataAttr="data-recipe-step-mode-option"
        onChange={selectStepMode}
      />
    </section>
  {/if}

  {#if collapsed}
    <!-- Collapsed chain (issue 710): step authoring is gated read-only. The steps are
         preserved verbatim and listed here for reference; the chain's effective output
         is edited on the Results tab. Turning multi-step recipes back on for this
         system restores the full step editor with every step intact. -->
    <section class="manager-recipe-duration-card manager-recipe-collapsed-steps-card" data-recipe-section="collapsed-steps">
      <div>
        <h3 class="manager-recipe-section-title">{text('FABRICATE.Admin.Manager.Recipe.CollapsedStepsTitle', 'Steps (multi-step disabled)')}</h3>
        <p class="manager-muted" data-recipe-collapsed-note>{text('FABRICATE.Admin.Manager.Recipe.CollapsedStepsNote', 'This recipe keeps its steps but runs as one combined action while multi-step recipes are disabled for this system. Turn multi-step recipes back on to edit steps.')}</p>
      </div>
      <ol class="manager-recipe-collapsed-step-list">
        {#each recipe?.steps || [] as step, index (step.id ?? index)}
          <li class="manager-recipe-collapsed-step">{step.name || `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`}</li>
        {/each}
      </ol>
    </section>
  {:else if isMultiStep}
    <RecipeStepsCard
      steps={recipe?.steps || []}
      {timeRequirementsEnabled}
      {onAddStep}
      {onReorderSteps}
      {onUpdateStep}
      {onDeleteStep}
    />
  {:else if timeRequirementsEnabled}
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

<style>
  [data-recipe-crafting-modifier-picker] {
    margin-top: 0.25rem;
  }
</style>

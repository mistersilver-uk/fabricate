<!-- Svelte 5 runes mode -->
<!--
  Overview tab for the recipe editor: uppercase micro-labels over unwrapped fields, a select row
  (Category / conditional DC-check / conditional Minimum success tier), two side-by-side status
  cards (Enabled + Locked), and an inline duration-stepper row that a multi-step recipe swaps for
  the Step-durations surface (RecipeStepsCard). Fully controlled: values come from the staged
  `recipe` draft and edits emit `onUpdateRecipe(...)` patches; the enabled toggle is the immediate
  exception and emits `onToggleEnabled()`.
-->
<script>
  import ArtPicker from '../../../components/ArtPicker.svelte';
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import {
    GENERAL_RECIPE_CATEGORY,
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory,
  } from '../../../../../utils/recipeCategories.js';
  import { formatTimeRequirementCompact } from '../../../util/recipeDuration.js';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import RecipeStepsCard from '../RecipeStepsCard.svelte';
  import RecipeCraftingModifierField from './RecipeCraftingModifierField.svelte';
  import RecipeDurationSteppers from './RecipeDurationSteppers.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Select from '../../../components/Select.svelte';
  import {
    buildCategoryOptions,
    buildCheckTierOptions,
    buildMinSuccessTierOptions,
  } from './recipeOverviewSelectOptions.js';

  let {
    // The resolution-mode callout, rendered as this tab's heading block (issue 1522).
    modeCallout = undefined,
    recipe = null,
    name = '',
    description = '',
    img = '',
    enabled = true,
    saving = false,
    onPickImagePath = null,
    onNameInput = () => {},
    onDescriptionInput = () => {},
    onToggleEnabled = () => {},
    // True when an enable-blocking readiness issue is present while the recipe is OFF, so the GM
    // cannot trigger the hard activation failure; the Validation tab lists the reasons.
    //
    // NOT the recipe activation gate `RecipeManager.canActivateRecipe`. The two are INCOMPARABLE
    // in both directions: this one UNDER-reports (readiness runs no essence-reference,
    // tag-placeholder, resolution-mode or enabled-essence validation, and its signature-collision
    // branch cannot fire from here) and OVER-reports (`duplicateAlternative` and
    // `duplicateRequirement` disable it for a recipe `canActivateRecipe` accepts). See the ledger
    // row in DOMAIN.md.
    enableToggleBlocked = false,
    onChooseImage = () => {},
    isMultiStep = false,
    // Category is authored here rather than in the rail; `categories` is the system's own list.
    categories = [],
    onSetCategory = () => {},
    checkTierOptions = [],
    // The active crafting check's evaluation, which names each tier's DC, Target or adjustment.
    checkEvaluation = null,
    // Success outcome tiers of a fixed-type routed check, ranked low→high. Non-empty only for a
    // routed+fixed system, so the "Minimum success tier" control below auto-hides elsewhere.
    minSuccessTierOptions = [],
    // The check-modifier picker's inputs, forwarded to `RecipeCraftingModifierField`; an empty
    // `craftingModifierOptions` catalogue hides the whole surface.
    craftingModifierOptions = [],
    // The SYSTEM's combination rule and the whole gate on this surface: only `bySubject` ("By
    // recipe" here) defers the selection to the recipe author, which is never allowed to
    // override the rule, so this tab carries no control for it.
    craftingModifierPolicy = 'addAll',
    craftingModifierDefaultIds = [],
    craftingModifierMaxPicks = null,
    // Why the system's active crafting check applies no check modifiers ('' when it does):
    // 'noCheck' | 'noFormula'. Either makes this recipe's picks inert, so the control is replaced
    // by a callout saying which — the Checks tab explaining it is no use to a GM looking here.
    craftingModifierInertCause = '',
    // Deep link to the Checks tab, where the catalogue and the combination rule live.
    onOpenChecks = () => {},
    // `recipe.locked` — persisted and engine-honoured (`guardCraftStart` refuses a locked craft).
    // Its write path is never gated, unlike enable: a GM locks a recipe while it is unfinished.
    locked = false,
    onToggleLocked = () => {},
    // Step mode, on Overview because the steps THEMSELVES are authored here (RecipeStepsCard) and
    // this control decides whether that card exists. `multiStepEnabled` is the SYSTEM feature
    // (`features.multiStepRecipes`); the control also renders for an ALREADY multi-step recipe
    // whose system since turned it off, the only way back to single-step.
    multiStepEnabled = false,
    // COLLAPSED chain: the system's multi-step feature is off but this recipe still carries
    // authored steps, so step authoring is read-only (preserved, not reverted) and the Results tab
    // edits the chain's effective final-step results. Re-enabling restores the full editor.
    collapsed = false,
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    // Whether the system applies time requirements. When off, the single-step Duration card and
    // the per-step duration editor are hidden; defaults true so an omitting caller is unaffected.
    timeRequirementsEnabled = true,
    onUpdateRecipe = () => {},
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The caption ids the three demoted select wrappers point their triggers at (issue 1510), minted
  // per INSTANCE rather than as three more fixed literals: a recipe editor can be open beside
  // another one, and two triggers sharing a caption id would name both controls the same.
  const instanceId = $props.id();
  const categoryCaptionId = `${instanceId}-category`;
  const checkTierCaptionId = `${instanceId}-check-tier`;
  const minSuccessTierCaptionId = `${instanceId}-min-success-tier`;

  // The callout copy for each inert cause: the same two causes the Checks card names, said from
  // this tab's point of view — what the GM loses here, not what to fix there. Each sentence closes
  // on the RECIPE's outcome, so it stays true however the surface below it is arranged.
  const MODIFIER_INERT_COPY = {
    noCheck: {
      key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoCheck',
      fallback:
        'This system resolves without a crafting check, so check modifiers change nothing for this recipe.',
    },
    noFormula: {
      key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoFormula',
      fallback:
        'The system’s crafting check has no roll formula yet, so check modifiers change nothing for this recipe.',
    },
  };

  const modifierInert = $derived(MODIFIER_INERT_COPY[craftingModifierInertCause] || null);
  const hasModifierCatalogue = $derived(craftingModifierOptions.length > 0);
  // `bySubject` is the ONE rule that defers the selection to the recipe author, so it is the only
  // rule under which this tab shows anything: a control the system will ignore is worse than no
  // control. The comparison is against the CANONICAL token and the projection normalizes the
  // legacy `byRecipe` on the way here, so an unmigrated world still renders the picker.
  const modifierDeferredToRecipe = $derived(
    hasModifierCatalogue && craftingModifierPolicy === 'bySubject'
  );
  // Two mutually exclusive dispositions under that rule, and the inert callout wins: the system
  // asked this recipe to pick but rolls no check for the picks to reach.
  const showModifierInert = $derived(modifierDeferredToRecipe && !!modifierInert);
  const showModifierControls = $derived(modifierDeferredToRecipe && !modifierInert);

  const STEP_MODE_OPTIONS = [
    {
      value: 'single',
      icon: 'fas fa-square',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.SingleStep',
      fallback: 'Single step',
    },
    {
      value: 'multi',
      icon: 'fas fa-list-ol',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.MultiStep',
      fallback: 'Multi-step',
    },
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

  // Category options: the system's custom list (or the neutral "general" fallback), keeping a
  // stale custom value selectable so the field never silently blanks.
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
  const selectedCategory = $derived(
    hasCustomCategories ? currentCategory : GENERAL_RECIPE_CATEGORY
  );

  function changeCategory(next) {
    const chosen = String(next || GENERAL_RECIPE_CATEGORY);
    if (chosen === currentCategory) return;
    onSetCategory(chosen);
  }

  // The four option vocabularies (issue 1510), mapped beside this file rather than in it.
  const categorySelectOptions = $derived(
    buildCategoryOptions(categoryOptions, (category) => getRecipeCategoryLabel(category, localize))
  );
  const checkTierSelectOptions = $derived(
    buildCheckTierOptions(checkTierOptions, text, checkEvaluation)
  );
  const minSuccessTierSelectOptions = $derived(
    buildMinSuccessTierOptions(minSuccessTierOptions, text)
  );
</script>

<section
  class="manager-recipe-tab manager-recipe-overview"
  data-recipe-tab="overview"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Overview', 'Overview')}
>
  {#if modeCallout}
    <div data-tab-heading>{@render modeCallout()}</div>
  {/if}

  <div class="manager-recipe-overview-identity" data-recipe-section="identity">
    <div class="manager-recipe-overview-media">
      <!-- Always editable: a recipe can belong to many books & scrolls, so its image mirrors no
           single linked recipe item. -->
      <ArtPicker
        art={recipeImage(img)}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.ChooseImage', 'Choose recipe image')}
        onPick={onChooseImage}
        disabled={typeof onPickImagePath !== 'function' || saving}
        pickProps={{ 'data-recipe-field': 'img' }}
      />
    </div>
    <div class="manager-recipe-overview-fields">
      <label class="manager-recipe-field" for="manager-recipe-edit-name">
        <span class="manager-recipe-micro-label"
          >{text('FABRICATE.Admin.Manager.Recipe.NameLabel', 'Recipe name')}</span
        >
        <!-- `data-validation-target` is the CONTROL half of the validation row action:
             `recipeReadiness.js`'s `noName` blocker addresses this input by this exact value and
             `validationFocus.js` resolves, focuses and marks it. The literal is written on both
             sides and held together by the pair of gates that file's header names. -->
        <input
          id="manager-recipe-edit-name"
          class="manager-recipe-name-input"
          data-recipe-field="name"
          data-validation-target="recipe-name"
          type="text"
          value={name}
          oninput={(event) => onNameInput(event.currentTarget.value)}
          disabled={saving}
          required
        />
      </label>
      <label class="manager-recipe-field" for="manager-recipe-edit-description">
        <span class="manager-recipe-micro-label"
          >{text('FABRICATE.Admin.Manager.Recipe.FlavourLabel', 'Flavour text')}</span
        >
        <textarea
          id="manager-recipe-edit-description"
          class="manager-recipe-flavour-input"
          data-recipe-field="description"
          rows="3"
          value={description}
          oninput={(event) => onDescriptionInput(event.currentTarget.value)}
          disabled={saving}></textarea>
      </label>
    </div>
  </div>

  <!-- Select row: Category, then the conditional DC-check + Minimum-success-tier selects that
       only a fixed-type routed check surfaces. -->
  <div class="manager-recipe-overview-selects">
    <!-- A <div>, not a <label>: Select.svelte's host invariant — a caption click would dismiss
         then re-open the portaled panel. The caption names the trigger with aria-labelledby; the
         wrapper stays because the micro-label treatment and the cell hooks are the studio's, not
         the primitive's (issue 1510). -->
    <div class="manager-recipe-field" data-recipe-field-category>
      <span class="manager-recipe-micro-label" id={categoryCaptionId}
        >{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span
      >
      <!-- The tooltip rides `triggerTitle`: the primitive overwrites a `title` in `triggerProps`. -->
      <Select
        value={selectedCategory}
        options={categorySelectOptions}
        showTick={false}
        ariaLabelledBy={categoryCaptionId}
        disabled={saving || !hasCustomCategories}
        triggerTitle={hasCustomCategories
          ? text('FABRICATE.Admin.Manager.Recipe.CategorySelectLabel', 'Select recipe category')
          : text(
              'FABRICATE.Admin.Manager.Recipe.CategoryNoneHint',
              'No categories defined. Add some under Tags and Categories.'
            )}
        triggerProps={{ 'data-recipe-category-select': '' }}
        onChange={changeCategory}
      />
    </div>
    {#if checkTierOptions.length > 0}
      <div class="manager-recipe-field" data-recipe-check-tier>
        <span class="manager-recipe-micro-label" id={checkTierCaptionId}
          >{text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}</span
        >
        <Select
          value={recipe?.checkTierId || ''}
          options={checkTierSelectOptions}
          ariaLabelledBy={checkTierCaptionId}
          disabled={saving}
          triggerProps={{ 'data-recipe-field': 'checkTierId' }}
          onChange={(next) => onUpdateRecipe({ checkTierId: next || null })}
        />
      </div>
    {/if}
    {#if minSuccessTierOptions.length > 0}
      <div class="manager-recipe-field" data-recipe-min-success-tier>
        <span class="manager-recipe-micro-label" id={minSuccessTierCaptionId}
          >{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTier', 'Minimum success tier')}</span
        >
        <Select
          value={recipe?.minSuccessOutcomeId || ''}
          options={minSuccessTierSelectOptions}
          ariaLabelledBy={minSuccessTierCaptionId}
          disabled={saving}
          triggerProps={{ 'data-recipe-field': 'minSuccessOutcomeId' }}
          onChange={(next) => onUpdateRecipe({ minSuccessOutcomeId: next || null })}
        />
      </div>
    {/if}
    <!-- Check-modifier picks, rendered only under the system's `bySubject` rule and only when the
         system rolls a check for the picks to reach. There is no rule select: a recipe chooses
         WHICH modifiers apply, never HOW they combine.

         FOUR cells exist in this grid and only THREE can co-render — Category, Check tier OR Min
         success tier, and the picker cell — because the two tier selects are mutually exclusive by
         construction (`resolveRecipeCheckTierOptions` offers tiers only for simple-static or
         routed-relative, `resolveRecipeFixedOutcomeTierOptions` only for routedByCheck + fixed).
         Three is the budget a future widening must fit, and it is why the tri-state select lives
         INSIDE the picker cell rather than becoming another sibling. -->
    {#if showModifierControls}
      <RecipeCraftingModifierField
        {recipe}
        {saving}
        {craftingModifierOptions}
        {craftingModifierDefaultIds}
        {craftingModifierMaxPicks}
        {onUpdateRecipe}
      />
    {/if}
  </div>

  <!-- Full-bleed below the grid rather than a grid cell: it replaces the picker cell, and the
       sentence would wrap to five lines in a 220px column. Warning-toned, because the rule did hand
       the pick to this recipe and the system rolls no check for it to reach; under every other
       rule the tab renders nothing rather than a callout on every recipe. -->
  {#if showModifierInert}
    <Callout
      tone="warning"
      title={`${text('FABRICATE.Admin.Manager.Recipe.CraftingModifier', 'Check modifiers')}: ${text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertLabel',
        'Not used by this system’s check'
      )}`}
      text={text(modifierInert.key, modifierInert.fallback)}
      data-recipe-modifier-inert={craftingModifierInertCause}
    >
      {#snippet actions()}
        <Button
          role="ghost"
          data-recipe-modifier-inert-checks
          title={text(
            'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertHint',
            'These modifiers are added to the crafting check, which is authored for the whole crafting system on the Checks tab.'
          )}
          onclick={() => onOpenChecks()}
        >
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          <span
            >{text('FABRICATE.Admin.Manager.Recipe.CraftingModifierOpenChecks', 'Checks tab')}</span
          >
        </Button>
      {/snippet}
    </Callout>
  {/if}

  <!-- Two side-by-side status cards. "Locked" means the recipe stays visible to players but only
       a GM can craft it (recipe.locked); it does not gate the always-editable image picker. -->
  <div class="manager-recipe-overview-status">
    <ToggleCard
      variant="is-enabled"
      section="enabled-status"
      field="enabled"
      icon="fas fa-power-off"
      title={text('FABRICATE.Admin.Manager.Recipe.EnabledTitle', 'Enabled')}
      sub={enableToggleBlocked
        ? text(
            'FABRICATE.Admin.Manager.Recipe.EnableBlockedHint',
            'Resolve the issues on the Validation tab before enabling.'
          )
        : text('FABRICATE.Admin.Manager.Recipe.EnabledSub', 'Craftable by players')}
      on={enabled}
      disabled={saving || enableToggleBlocked}
      toggleTitle={enableToggleBlocked
        ? text(
            'FABRICATE.Admin.Manager.Recipe.EnableBlockedTooltip',
            'Resolve the issues on the Validation tab before enabling this recipe.'
          )
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
      subDataAttr="data-recipe-locked-state"
      on={locked}
      disabled={saving}
      toggleLabel={text('FABRICATE.Admin.Manager.Recipe.Locked.Toggle', 'Lock this recipe')}
      onToggle={onToggleLocked}
    />
  </div>

  {#if (multiStepEnabled || isMultiStep) && !collapsed}
    <!-- Step mode sits directly above the surface it governs: the card below is either the steps
         list or the recipe's single Duration. Hidden while collapsed, because a collapsed recipe
         is NOT reverted — its steps are preserved and restored when the feature is. -->
    <section class="manager-recipe-step-mode-card" data-recipe-section="recipe-step-mode">
      <div>
        <h3 class="manager-recipe-section-title">
          {text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}
        </h3>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Recipe.StepModeHint',
            'A multi-step recipe crafts its ordered steps in sequence, each with its own ingredients, results and tools.'
          )}
        </p>
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
    <!-- Collapsed chain: step authoring is read-only and the steps are listed verbatim for
         reference, while the chain's effective output is edited on the Results tab. -->
    <section
      class="manager-recipe-duration-card manager-recipe-collapsed-steps-card"
      data-recipe-section="collapsed-steps"
    >
      <div>
        <h3 class="manager-recipe-section-title">
          {text(
            'FABRICATE.Admin.Manager.Recipe.CollapsedStepsTitle',
            'Steps (multi-step disabled)'
          )}
        </h3>
        <p class="manager-muted" data-recipe-collapsed-note>
          {text(
            'FABRICATE.Admin.Manager.Recipe.CollapsedStepsNote',
            'This recipe keeps its steps but runs as one combined action while multi-step recipes are disabled for this system. Turn multi-step recipes back on to edit steps.'
          )}
        </p>
      </div>
      <ol class="manager-recipe-collapsed-step-list">
        {#each recipe?.steps || [] as step, index (step.id ?? index)}
          <li class="manager-recipe-collapsed-step">
            {step.name ||
              `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`}
          </li>
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
          <h3 class="manager-recipe-section-title">
            {text('FABRICATE.Admin.Manager.Recipe.Duration', 'Duration')}
          </h3>
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Recipe.DurationHint',
              'How long this recipe takes to craft. Leave at zero for an instant craft.'
            )}
          </p>
        </div>
        <Chip
          class="manager-recipe-duration-pill"
          icon="fa-solid fa-clock"
          data-recipe-duration-summary
        >
          <span>{formatTimeRequirementCompact(recipe?.timeRequirement || null)}</span>
        </Chip>
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

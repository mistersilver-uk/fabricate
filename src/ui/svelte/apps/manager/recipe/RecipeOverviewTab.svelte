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
  import Chip from '../Chip.svelte';
  import RecipeModeBanner from './RecipeModeBanner.svelte';
  import { formatList, localize } from '../../../util/foundryBridge.js';
  import { resolveRecipeModifierAuthority } from '../../../../../systems/craftingModifierResolver.js';
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import {
    GENERAL_RECIPE_CATEGORY,
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory,
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
    // Per-recipe crafting-check modifier override (issue 770, reshaped by issue 1055).
    // `craftingModifierOptions` is the system's `checkModifiers` catalogue ({id,label});
    // an empty catalogue hides the whole surface. `craftingModifierPolicyDefault` is the
    // system's combination rule, surfaced in the "Inherit" option label, and
    // `craftingModifierDefaultIds` its default eligible set, which the Inherit state and
    // the `none` summary NAME rather than describe abstractly.
    //
    // The control writes `recipe.craftingModifier` ({ policy?, modifierIds? } | null).
    // The two keys are two independent axes: an absent `policy` inherits the rule, an
    // absent `modifierIds` inherits the set, and an AUTHORED EMPTY `modifierIds` is "no
    // modifiers" — a real override that resolves `@craftingmod` to 0, not an absence.
    craftingModifierOptions = [],
    craftingModifierPolicyDefault = 'addAll',
    craftingModifierDefaultIds = [],
    // How much of the above this system delegates (issue 1055): 'none' | 'setOnly' |
    // 'setAndRule', or ABSENT for a system not yet stamped. Deliberately undefined by
    // default and NOT coerced at any call site on the way here — `resolveRecipeModifierAuthority`
    // owns what absence means, and it must mean the same thing here as in the engine.
    craftingModifierAuthority = undefined,
    // Why the system's active crafting check reaches no `@craftingmod` ('' when it does):
    // 'noCheck' | 'noFormula' | 'noPlaceholder'. Any of the three makes a per-recipe
    // override inert, so the control is replaced by a banner that says which — the Checks
    // tab explaining it is no use to a GM looking at this tab.
    craftingModifierInertCause = '',
    // Deep link to the Checks tab, where both the catalogue and the authority level live.
    onOpenChecks = () => {},
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
    onDeleteStep = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Per-recipe crafting-modifier override state (issue 770, reshaped by issue 1055).
  // `byRecipe` is gone from the rule list: it never named a rule, it named who decides,
  // and that is now the system's authority level.
  const MODIFIER_POLICY_LABELS = {
    addAll: () => text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll', 'Add all'),
    highest: () => text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest', 'Highest'),
    playerPicks: () =>
      text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicks', 'Player picks'),
  };
  const MODIFIER_SET_LABEL_ID = 'manager-recipe-crafting-modifier-label';

  // The banner copy for each inert cause. Same three causes the Checks card names, said
  // from this tab's point of view: what the GM loses here, not what to fix there.
  const MODIFIER_INERT_COPY = {
    noCheck: {
      key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoCheck',
      fallback:
        'This system resolves without a crafting check, so per-recipe check modifiers would change nothing.',
    },
    noFormula: {
      key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoFormula',
      fallback:
        'The system’s crafting check has no roll formula yet, so per-recipe check modifiers would change nothing.',
    },
    noPlaceholder: {
      key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoPlaceholder',
      fallback:
        'The system’s crafting-check formula never references @craftingmod, so per-recipe check modifiers would change nothing.',
    },
  };

  const overridePolicy = $derived(recipe?.craftingModifier?.policy || '');
  const overrideModifierIds = $derived(recipe?.craftingModifier?.modifierIds || []);
  const defaultPolicyLabel = $derived(
    (MODIFIER_POLICY_LABELS[craftingModifierPolicyDefault] || MODIFIER_POLICY_LABELS.addAll)()
  );

  // What the ENGINE would honour, so an unstamped system keeps the pre-1055 controls
  // rather than losing them to an invented default.
  const modifierAuthority = $derived(
    resolveRecipeModifierAuthority({ recipeModifierAuthority: craftingModifierAuthority })
  );
  const modifierInert = $derived(MODIFIER_INERT_COPY[craftingModifierInertCause] || null);
  const hasModifierCatalogue = $derived(craftingModifierOptions.length > 0);
  // Three dispositions, mutually exclusive: the inert banner beats everything (nothing
  // authored here could matter), then the read-only summary at `none`, then the controls.
  const showModifierInert = $derived(hasModifierCatalogue && !!modifierInert);
  const showModifierSummary = $derived(
    hasModifierCatalogue && !modifierInert && modifierAuthority === 'none'
  );
  const showModifierControls = $derived(
    hasModifierCatalogue && !modifierInert && modifierAuthority !== 'none'
  );

  // The tri-state the eligible-set select reads back. An authored empty array is "no
  // modifiers", NOT "inherit" — that collapse is the pre-1055 defect this replaces — so
  // the discriminator is `Array.isArray`, exactly as it is in `Recipe` and the resolver.
  function setModeOf(craftingModifier) {
    if (!Array.isArray(craftingModifier?.modifierIds)) return 'inherit';
    return craftingModifier.modifierIds.length > 0 ? 'custom' : 'none';
  }
  const modifierSetMode = $derived(setModeOf(recipe?.craftingModifier));

  // Name the modifiers a set actually contains, through the ACTIVE language's list
  // conventions — "Medicine, Alchemy and Herbalism" is a language rule, not a separator.
  function modifierNames(ids) {
    const byId = new Map(craftingModifierOptions.map((option) => [option.id, option.label]));
    return formatList(
      (Array.isArray(ids) ? ids : [])
        .filter((id) => byId.has(id))
        .map(
          (id) =>
            byId.get(id) ||
            text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierUnnamed', 'Unnamed modifier')
        )
    );
  }
  const inheritedNames = $derived(modifierNames(craftingModifierDefaultIds));

  // One writer for the whole override, so the two axes cannot clobber each other: an
  // empty bag means "no override at all" (null) and every other shape is preserved
  // verbatim, INCLUDING `modifierIds: []`.
  function emitCraftingModifier(next) {
    onUpdateRecipe({ craftingModifier: Object.keys(next).length > 0 ? next : null });
  }

  function changeModifierPolicy(value) {
    const next = {};
    if (value) next.policy = value;
    const ids = recipe?.craftingModifier?.modifierIds;
    if (Array.isArray(ids)) next.modifierIds = [...ids];
    emitCraftingModifier(next);
  }

  // Inherit drops the key; Custom set seeds from what is already chosen, falling back to
  // the system default set so "customize" starts from what the recipe was inheriting
  // rather than from nothing; No modifiers writes the authored empty array.
  function changeModifierSetMode(mode) {
    const next = {};
    const policy = recipe?.craftingModifier?.policy;
    if (policy) next.policy = policy;
    if (mode === 'custom') {
      const seed =
        overrideModifierIds.length > 0 ? overrideModifierIds : craftingModifierDefaultIds;
      next.modifierIds = [...seed];
    } else if (mode === 'none') {
      next.modifierIds = [];
    }
    emitCraftingModifier(next);
  }

  // Clearing the LAST pill posts `{ modifierIds: [] }` — an authored empty set — never
  // `null`. Posting null made emptying the row mean "inherit", so a GM could not express
  // "this recipe gets no check modifiers" at all (issue 1055, defect 3).
  function toggleModifierId(id, checked) {
    const current = recipe?.craftingModifier?.modifierIds || [];
    const modifierIds = checked
      ? [...new Set([...current, id])]
      : current.filter((existing) => existing !== id);
    const next = { modifierIds };
    const policy = recipe?.craftingModifier?.policy;
    if (policy) next.policy = policy;
    emitCraftingModifier(next);
  }

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
  const selectedCategory = $derived(
    hasCustomCategories ? currentCategory : GENERAL_RECIPE_CATEGORY
  );

  function changeCategory(event) {
    const next = String(event.currentTarget.value || GENERAL_RECIPE_CATEGORY);
    if (next === currentCategory) return;
    onSetCategory(next);
  }
</script>

<section
  class="manager-recipe-tab manager-recipe-overview"
  data-recipe-tab="overview"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Overview', 'Overview')}
>
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
        <span class="manager-recipe-micro-label"
          >{text('FABRICATE.Admin.Manager.Recipe.NameLabel', 'Recipe name')}</span
        >
        <input
          id="manager-recipe-edit-name"
          class="manager-recipe-name-input"
          data-recipe-field="name"
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

  {#if saveFailed}
    <p class="manager-muted manager-form-warning">
      {text(
        'FABRICATE.Admin.Manager.Recipe.SaveFailed',
        'Save failed. Check for duplicate or blank names and try again.'
      )}
    </p>
  {/if}

  <!-- Select row: Category, then the conditional DC-check + Minimum-success-tier
       selects that only a fixed-type routed check surfaces (prototype §5.1). -->
  <div class="manager-recipe-overview-selects">
    <label class="manager-recipe-field" data-recipe-field-category>
      <span class="manager-recipe-micro-label"
        >{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span
      >
      <select
        data-recipe-category-select
        value={selectedCategory}
        disabled={saving || !hasCustomCategories}
        title={hasCustomCategories
          ? text('FABRICATE.Admin.Manager.Recipe.CategorySelectLabel', 'Select recipe category')
          : text(
              'FABRICATE.Admin.Manager.Recipe.CategoryNoneHint',
              'No categories defined. Add some under Tags and Categories.'
            )}
        onchange={changeCategory}
      >
        {#each categoryOptions as category (category)}
          <option value={category}>{getRecipeCategoryLabel(category, localize)}</option>
        {/each}
      </select>
    </label>
    {#if checkTierOptions.length > 0}
      <label class="manager-recipe-field" data-recipe-check-tier>
        <span class="manager-recipe-micro-label"
          >{text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}</span
        >
        <select
          data-recipe-field="checkTierId"
          value={recipe?.checkTierId || ''}
          onchange={(event) => onUpdateRecipe({ checkTierId: event.currentTarget.value || null })}
          disabled={saving}
        >
          <option value=""
            >{text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC')}</option
          >
          {#each checkTierOptions as tier (tier.id)}
            <option value={tier.id}
              >{(tier.name ||
                text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')) +
                ` (DC ${tier.dc})`}</option
            >
          {/each}
        </select>
      </label>
    {/if}
    {#if minSuccessTierOptions.length > 0}
      <label class="manager-recipe-field" data-recipe-min-success-tier>
        <span class="manager-recipe-micro-label"
          >{text('FABRICATE.Admin.Manager.Recipe.MinSuccessTier', 'Minimum success tier')}</span
        >
        <select
          data-recipe-field="minSuccessOutcomeId"
          value={recipe?.minSuccessOutcomeId || ''}
          onchange={(event) =>
            onUpdateRecipe({ minSuccessOutcomeId: event.currentTarget.value || null })}
          disabled={saving}
        >
          <option value=""
            >{text(
              'FABRICATE.Admin.Manager.Recipe.MinSuccessTierNone',
              'No override (use final tier)'
            )}</option
          >
          {#each minSuccessTierOptions as tier (tier.id)}
            <option value={tier.id}
              >{tier.name ||
                text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')}</option
            >
          {/each}
        </select>
      </label>
    {/if}
    <!-- Check-modifier override (issue 1055). The system's authority level decides what
         renders: `setAndRule` gets the rule select AND the picker cell, `setOnly` the
         picker cell alone, `none` neither (a read-only banner below the grid instead).
         The grid's worst case therefore stays at five items — Category, Check tier, Min
         success tier, rule select, picker cell — which is why the tri-state select lives
         INSIDE the picker cell rather than becoming a sixth. -->
    {#if showModifierControls}
      {#if modifierAuthority === 'setAndRule'}
        <label class="manager-recipe-field" data-recipe-crafting-modifier>
          <span class="manager-recipe-micro-label"
            >{text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading',
              'Combination rule'
            )}</span
          >
          <select
            data-recipe-field="craftingModifierPolicy"
            value={overridePolicy}
            onchange={(event) => changeModifierPolicy(event.currentTarget.value || null)}
            disabled={saving}
          >
            <option value=""
              >{text(
                'FABRICATE.Admin.Manager.Recipe.CraftingModifierInherit',
                'Inherit system default'
              ) + ` (${defaultPolicyLabel})`}</option
            >
            <option value="addAll">{MODIFIER_POLICY_LABELS.addAll()}</option>
            <option value="highest">{MODIFIER_POLICY_LABELS.highest()}</option>
            <option value="playerPicks">{MODIFIER_POLICY_LABELS.playerPicks()}</option>
          </select>
        </label>
      {/if}
      <div class="manager-recipe-field" data-recipe-crafting-modifier-picker>
        <label class="manager-recipe-modifier-set-field">
          <span class="manager-recipe-micro-label" id={MODIFIER_SET_LABEL_ID}
            >{text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierPick',
              'Eligible modifiers'
            )}</span
          >
          <select
            data-recipe-field="craftingModifierSet"
            value={modifierSetMode}
            onchange={(event) => changeModifierSetMode(event.currentTarget.value)}
            disabled={saving}
          >
            <option value="inherit"
              >{text(
                'FABRICATE.Admin.Manager.Recipe.CraftingModifierSetInherit',
                'Inherit system default'
              )}</option
            >
            <option value="custom"
              >{text(
                'FABRICATE.Admin.Manager.Recipe.CraftingModifierSetCustom',
                'Custom set'
              )}</option
            >
            <option value="none"
              >{text(
                'FABRICATE.Admin.Manager.Recipe.CraftingModifierSetNone',
                'No modifiers'
              )}</option
            >
          </select>
        </label>
        {#if modifierSetMode === 'inherit'}
          <!-- Under Inherit there is nothing to author, so the pill row and its menu
               button are hidden and the inherited set is NAMED instead — "inheriting"
               with no names told the GM nothing about what this recipe actually rolls. -->
          <p class="manager-muted" data-recipe-crafting-modifier-inherited>
            {inheritedNames
              ? `${text('FABRICATE.Admin.Manager.Recipe.CraftingModifierInherited', 'Inheriting the system default set:')} ${inheritedNames}`
              : text(
                  'FABRICATE.Admin.Manager.Recipe.CraftingModifierInheritedEmpty',
                  'The system default set is empty, so no check modifier applies to this recipe.'
                )}
          </p>
        {:else}
          <ModifierPillSelect
            options={craftingModifierOptions}
            selectedIds={overrideModifierIds}
            disabled={saving}
            testId="recipe-crafting-modifier"
            labelledBy={MODIFIER_SET_LABEL_ID}
            menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
            allSelectedLabel={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
              'All modifiers selected.'
            )}
            noneSelectedLabel={text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierEmptySet',
              'No modifiers — @craftingmod resolves to 0 for this recipe.'
            )}
            onToggle={toggleModifierId}
          />
        {/if}
      </div>
    {/if}
  </div>

  <!-- Both banners are FULL-BLEED below the grid, not grid cells: each replaces the
       control the grid would otherwise hold, and a sentence squeezed into a 220px
       column would wrap to five lines. They reuse the resolution-mode banner's chrome
       (issue 1055) with their own tone, so the tab has one visual language for "this is
       set elsewhere" rather than two. -->
  {#if showModifierSummary}
    <RecipeModeBanner
      tone="neutral"
      dataAttr="data-recipe-modifier-banner"
      actionDataAttr="data-recipe-modifier-banner-checks"
      value="none"
      icon="fas fa-lock"
      kicker={text('FABRICATE.Admin.Manager.Recipe.CraftingModifier', 'Check modifiers')}
      label={text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityNone',
        'Set by the system'
      )}
      scope={text(
        'FABRICATE.Admin.Manager.Recipe.ModeBanner.SetForSystem',
        'set for this crafting system'
      )}
      description={inheritedNames
        ? `${text('FABRICATE.Admin.Manager.Recipe.CraftingModifierNoneSummary', 'This system sets check modifiers for every recipe. This one uses:')} ${inheritedNames}`
        : text(
            'FABRICATE.Admin.Manager.Recipe.CraftingModifierNoneSummaryEmpty',
            'This system sets check modifiers for every recipe, and its default set is empty, so none applies here.'
          )}
      actionLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierOpenChecks', 'Checks tab')}
      actionHint={text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierOpenChecksHint',
        'Check modifiers, and how much of them a recipe may override, are set for the whole crafting system on the Checks tab.'
      )}
      onAction={onOpenChecks}
    />
  {/if}

  {#if showModifierInert}
    <RecipeModeBanner
      tone="warning"
      dataAttr="data-recipe-modifier-inert"
      actionDataAttr="data-recipe-modifier-inert-checks"
      value={craftingModifierInertCause}
      icon="fas fa-triangle-exclamation"
      kicker={text('FABRICATE.Admin.Manager.Recipe.CraftingModifier', 'Check modifiers')}
      label={text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertLabel',
        'not used by this system’s check'
      )}
      description={text(modifierInert.key, modifierInert.fallback)}
      actionLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierOpenChecks', 'Checks tab')}
      actionHint={text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertHint',
        'The crafting check and its @craftingmod placeholder are authored for the whole crafting system on the Checks tab.'
      )}
      onAction={onOpenChecks}
    />
  {/if}

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
        ? text(
            'FABRICATE.Admin.Manager.Recipe.EnableBlockedHint',
            'Resolve the issues on the Validation tab before enabling.'
          )
        : text('FABRICATE.Admin.Manager.Recipe.EnabledSub', 'Craftable by players')}
      on={enabled}
      disabled={saving || enableBlocked}
      toggleTitle={enableBlocked
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
    <!-- Collapsed chain (issue 710): step authoring is gated read-only. The steps are
         preserved verbatim and listed here for reference; the chain's effective output
         is edited on the Results tab. Turning multi-step recipes back on for this
         system restores the full step editor with every step intact. -->
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

<style>
  /* The picker cell is now a full grid cell that owns its own micro-label, so the
     0.25rem nudge that used to align a bare pill row under the neighbouring select is
     gone: at `setOnly` the cell is the only one in the row and that nudge pushed it
     out of line with Category beside it. The cell stacks label → tri-state → pill row
     on the shared `.manager-recipe-field` column rules. */
  .manager-recipe-modifier-set-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* The pill row reads as the tri-state's consequence, so it sits tight under it. It is
     a child COMPONENT's root, so this component's scoping hash is not on it — reach it
     through `:global`, nested under a selector that does carry the hash. */
  [data-recipe-crafting-modifier-picker] :global([data-modifier-pill-select]) {
    margin-top: 0.25rem;
  }

  [data-recipe-crafting-modifier-inherited] {
    margin-block: 0.25rem 0;
  }
</style>

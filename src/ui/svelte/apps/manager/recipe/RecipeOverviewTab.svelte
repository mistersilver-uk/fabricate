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
  import { untrack } from 'svelte';
  import Chip from '../../../components/Chip.svelte';
  import RecipeModeBanner from './RecipeModeBanner.svelte';
  import { formatList, localize } from '../../../util/foundryBridge.js';
  import { resolveMaxModifierPicks } from '../../../../../systems/checkModifierResolver.js';
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
  import RecipeDurationSteppers from './RecipeDurationSteppers.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';
  import Select from '../../../components/Select.svelte';
  import {
    buildCategoryOptions,
    buildCheckTierOptions,
    buildMinSuccessTierOptions,
    buildModifierSetOptions,
  } from './recipeOverviewSelectOptions.js';

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
    // Success outcome tiers of a fixed-type routed check, ranked low→high. Non-empty only for a
    // routed+fixed system, so the "Minimum success tier" control below auto-hides elsewhere.
    minSuccessTierOptions = [],
    // Per-recipe crafting-check modifier SELECTION. `craftingModifierOptions` is the world's
    // unified `modifiers` library ({id,label}); an empty catalogue hides the whole surface.
    // `craftingModifierDefaultIds` is the crafting check's MARK over it — the ids its catalogue
    // card calls "Selectable" — which both NAMES the inherited set and BOUNDS a custom pick. The
    // control writes `recipe.craftingModifier` ({ modifierIds? } | null) and authors ONE axis:
    // WHICH modifiers apply (`openspec/specs/data-models/spec.md` `## Recipe` requirement 13a).
    craftingModifierOptions = [],
    // The SYSTEM's combination rule and the whole gate on this surface: only `bySubject` ("By
    // recipe" here) defers the selection to the recipe author, which is never allowed to
    // override the rule, so this tab carries no control for it.
    craftingModifierPolicy = 'addAll',
    craftingModifierDefaultIds = [],
    // The system's cap on how many modifiers this recipe may pick, NOT coerced at any call site
    // on the way here: `resolveMaxModifierPicks` owns what absence means (unlimited).
    craftingModifierMaxPicks = null,
    // Why the system's active crafting check applies no check modifiers ('' when it does):
    // 'noCheck' | 'noFormula'. Either makes this recipe's picks inert, so the control is replaced
    // by a banner saying which — the Checks tab explaining it is no use to a GM looking here.
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

  const MODIFIER_SET_LABEL_ID = 'manager-recipe-crafting-modifier-label';
  const MODIFIER_CAP_HINT_ID = 'manager-recipe-crafting-modifier-cap';
  const MODIFIER_SUPPRESSED_ID = 'manager-recipe-crafting-modifier-suppressed';

  // The caption ids the three demoted select wrappers point their triggers at (issue 1510), minted
  // per INSTANCE rather than as three more fixed literals: a recipe editor can be open beside
  // another one, and two triggers sharing a caption id would name both controls the same. The
  // modifier-set caption keeps its fixed id, being the pill group's target too.
  const instanceId = $props.id();
  const categoryCaptionId = `${instanceId}-category`;
  const checkTierCaptionId = `${instanceId}-check-tier`;
  const minSuccessTierCaptionId = `${instanceId}-min-success-tier`;

  // The banner copy for each inert cause: the same two causes the Checks card names, said from
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

  const overrideModifierIds = $derived(recipe?.craftingModifier?.modifierIds || []);

  const modifierInert = $derived(MODIFIER_INERT_COPY[craftingModifierInertCause] || null);
  const hasModifierCatalogue = $derived(craftingModifierOptions.length > 0);
  // `bySubject` is the ONE rule that defers the selection to the recipe author, so it is the only
  // rule under which this tab shows anything: a control the system will ignore is worse than no
  // control. The comparison is against the CANONICAL token and the projection normalizes the
  // legacy `byRecipe` on the way here, so an unmigrated world still renders the picker.
  const modifierDeferredToRecipe = $derived(
    hasModifierCatalogue && craftingModifierPolicy === 'bySubject'
  );
  // Two mutually exclusive dispositions under that rule, and the inert banner wins: the system
  // asked this recipe to pick but rolls no check for the picks to reach.
  const showModifierInert = $derived(modifierDeferredToRecipe && !!modifierInert);
  const showModifierControls = $derived(modifierDeferredToRecipe && !modifierInert);

  // The cap the ENGINE applies, asked of the resolver rather than re-derived: a stored `0`, `-2`
  // or `"three"` all mean unlimited there, and `Infinity` compares arithmetically so no branch
  // below special-cases "no cap".
  const modifierPickCap = $derived(
    resolveMaxModifierPicks({ maxModifierPicks: craftingModifierMaxPicks })
  );
  const modifierCapBounded = $derived(Number.isFinite(modifierPickCap));

  // WHAT THIS RECIPE MAY PICK FROM is the check's MARK, not the whole library: the offer is the
  // intersection of the catalogue with `defaultModifierIds`, matching the intersection
  // `resolveEligibleModifierIds` applies at roll time so the offer and the roll agree. The mark
  // BOUNDS the pick and never PRUNES it, an EMPTY mark means nothing is selectable, and a
  // non-array is the unknown-basis sentinel that filters nothing — the three readings are the
  // resolver's, stated once in `openspec/specs/resolution-modes/spec.md` → "Check Source".
  const modifierMarkKnown = $derived(Array.isArray(craftingModifierDefaultIds));
  const eligibleOptions = $derived(
    modifierMarkKnown
      ? craftingModifierOptions.filter((option) => craftingModifierDefaultIds.includes(option?.id))
      : craftingModifierOptions
  );
  const eligibleModifierIds = $derived(new Set(eligibleOptions.map((option) => option?.id)));

  // The cap counts what the GM can SEE: a suppressed pick consuming a slot would disable the add
  // button with no way to free one, the freeing chip's remove button not being rendered.
  const pickedEligibleIds = $derived(
    overrideModifierIds.filter((id) => eligibleModifierIds.has(id))
  );
  const suppressedPickCount = $derived(overrideModifierIds.length - pickedEligibleIds.length);
  const atModifierPickCap = $derived(pickedEligibleIds.length >= modifierPickCap);

  // A cap of exactly 1 gets its own sentence rather than "up to 1 modifiers", following the
  // `…Selected` / `…SelectedOne` pair the pill select already uses.
  const CAP_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickCap';
  const capText = $derived.by(() => {
    if (modifierPickCap === 1) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickCapOne',
        'This system lets a recipe pick one check modifier.'
      );
    }
    // `localize`'s interpolating form, with the same fallback contract as `text`: the fallback
    // carries the count itself, so an unlocalized build prints no raw brace.
    const translated = localize(CAP_KEY, { count: modifierPickCap });
    if (translated && translated !== CAP_KEY) return translated;
    return `This system lets a recipe pick up to ${modifierPickCap} check modifiers.`;
  });
  const capReachedText = $derived(
    text(
      'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickCapReached',
      'Remove one to pick another.'
    )
  );

  // Suppressed picks are ACCOUNTED FOR, never silently swallowed: a chip that vanished with no
  // sentence reads as data loss on the one surface that did not lose it, so the note states the
  // count, why they are gone and that they come back — which is also what points the GM at the
  // Checks tab for the repair. It borrows the check pill's own "Not selectable" so the two
  // screens name one fact one way, and singular gets its own sentence.
  const SUPPRESSED_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierSuppressed';
  const suppressedText = $derived.by(() => {
    if (suppressedPickCount === 1) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierSuppressedOne',
        'One chosen modifier is hidden because the check no longer marks it selectable. It is kept and returns if the check marks it again.'
      );
    }
    const translated = localize(SUPPRESSED_KEY, { count: suppressedPickCount });
    if (translated && translated !== SUPPRESSED_KEY) return translated;
    return `${suppressedPickCount} chosen modifiers are hidden because the check no longer marks them selectable. They are kept and return if the check marks them again.`;
  });

  // WHICH ZERO THE PILL ROW IS SHOWING. The row draws no chip in two states and its placeholder —
  // also its `aria-live` summary — carries one sentence. "Nothing is added" is true of an
  // unauthored pick and FALSE when every stored pick is suppressed, where it contradicts the note
  // beneath it, so the STATE decides the sentence rather than the emptiness alone.
  const allPicksSuppressed = $derived(pickedEligibleIds.length === 0 && suppressedPickCount > 0);
  const ALL_SUPPRESSED_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierAllSuppressed';
  const emptyRowText = $derived(
    allPicksSuppressed
      ? text(
          ALL_SUPPRESSED_KEY,
          'All chosen modifiers are currently hidden — the check no longer marks them selectable. They are kept and return if the check marks them again.'
        )
      : text(
          'FABRICATE.Admin.Manager.Recipe.CraftingModifierEmptySet',
          'No modifiers — nothing is added to this recipe’s check roll.'
        )
  );

  // WHEN THE NOTE IS WORTH SAYING SEPARATELY: it explains a suppression the GM sees PART of. Once
  // every pick is suppressed the placeholder above IS that explanation, word for word, so
  // rendering both says the same sentence twice in the one state where both co-occur.
  const showSuppressedNote = $derived(suppressedPickCount > 0 && !allPicksSuppressed);

  // Both notes describe the pill group and `aria-describedby` takes a LIST, so a screen reader
  // hears the suppression as well as the cap. It tracks the note's own condition, so the group is
  // never described by an unrendered element.
  const modifierDescribedBy = $derived(
    [
      modifierCapBounded ? MODIFIER_CAP_HINT_ID : '',
      showSuppressedNote ? MODIFIER_SUPPRESSED_ID : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  // The tri-state the eligible-set select reads back. An authored empty array is "no modifiers",
  // NOT "inherit", so the discriminator is `Array.isArray`, as it is in `Recipe` and the resolver.
  function setModeOf(craftingModifier) {
    if (!Array.isArray(craftingModifier?.modifierIds)) return 'inherit';
    return craftingModifier.modifierIds.length > 0 ? 'custom' : 'none';
  }

  // …which leaves ONE state the persisted shape cannot express: "Custom set, nothing picked yet"
  // writes `modifierIds: []`, the same bytes as "No modifiers", so read purely the select snapped
  // back to No modifiers as though it had rejected the GM's choice. A local pin decides which of
  // the two identical shapes was meant, for that ONE collision only: every other transition still
  // comes straight off `recipe`, so no external edit can be masked by stale local intent, and the
  // PERSISTED shape is untouched.
  //
  // The pin drops when the GM picks another option and when a DIFFERENT recipe arrives — the id is
  // compared explicitly, because every draft patch replaces the whole `recipe` object and tracking
  // its identity alone would clear the pin on the component's own write.
  let pinnedCustomSet = $state(false);
  let pinnedRecipeId = $state(untrack(() => recipe?.id ?? null));

  $effect(() => {
    const id = recipe?.id ?? null;
    if (id === pinnedRecipeId) return;
    pinnedRecipeId = id;
    pinnedCustomSet = false;
  });

  const persistedSetMode = $derived(setModeOf(recipe?.craftingModifier));
  const modifierSetMode = $derived(
    pinnedCustomSet && persistedSetMode === 'none' ? 'custom' : persistedSetMode
  );

  // Name the modifiers a set contains through the ACTIVE language's list conventions, a language
  // rule rather than a separator.
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

  // A legacy `craftingModifier.policy` is CARRIED FORWARD untouched by every writer below: the
  // resolver's contract is that it stays on disk and stays unhonoured, so dropping it while
  // editing a neighbouring key would be data loss disguised as a set edit.
  function preservedPolicy() {
    const policy = recipe?.craftingModifier?.policy;
    return policy ? { policy } : {};
  }

  // One writer for the whole `craftingModifier` bag, so a set edit cannot clobber the
  // carried-forward legacy key: an empty bag is null, every other shape verbatim.
  function emitCraftingModifier(next) {
    onUpdateRecipe({ craftingModifier: Object.keys(next).length > 0 ? next : null });
  }

  // Inherit drops the key; Custom set seeds from what is already chosen, falling back to the
  // system default set so "customize" starts from what was inherited; No modifiers writes the
  // authored empty array. The seed is TRUNCATED to the cap, because the resolver truncates on read
  // anyway and an untruncated seed would show the GM picks that are already not rolled. Custom set
  // PINS itself and every other option releases the pin.
  function changeModifierSetMode(mode) {
    const next = preservedPolicy();
    if (mode === 'custom') {
      const seed =
        overrideModifierIds.length > 0 ? overrideModifierIds : craftingModifierDefaultIds;
      next.modifierIds = seed.slice(0, modifierPickCap);
    } else if (mode === 'none') {
      next.modifierIds = [];
    }
    pinnedCustomSet = mode === 'custom';
    emitCraftingModifier(next);
  }

  // Clearing the LAST pill posts an authored empty set, never `null`: posting null made emptying
  // the row mean "inherit", so a GM could not express "no check modifiers" at all.
  //
  // An ADD at the cap is refused — the second of two guards, and the one holding when the cap is
  // lowered on the Checks tab while this editor is open. It is NOT the invariant:
  // `resolveEligibleModifierIds` truncates on read, and a UI control's constraint is never one.
  // The cap counts ELIGIBLE picks only while the write is over the WHOLE stored list, so an
  // un-marked pick neither consumes a slot nor is lost by an add or a remove.
  function toggleModifierId(id, checked) {
    const current = recipe?.craftingModifier?.modifierIds || [];
    const counted = current.filter((existing) => eligibleModifierIds.has(existing));
    if (checked && !current.includes(id) && counted.length >= modifierPickCap) return;
    const modifierIds = checked
      ? [...new Set([...current, id])]
      : current.filter((existing) => existing !== id);
    emitCraftingModifier({ ...preservedPolicy(), modifierIds });
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
  const checkTierSelectOptions = $derived(buildCheckTierOptions(checkTierOptions, text));
  const minSuccessTierSelectOptions = $derived(
    buildMinSuccessTierOptions(minSuccessTierOptions, text)
  );
  const modifierSetOptions = buildModifierSetOptions(text);
</script>

<section
  class="manager-recipe-tab manager-recipe-overview"
  data-recipe-tab="overview"
  aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Overview', 'Overview')}
>
  <div class="manager-recipe-overview-identity" data-recipe-section="identity">
    <div class="manager-recipe-overview-media">
      <!-- Always editable: a recipe can belong to many books & scrolls, so its image mirrors no
           single linked recipe item. -->
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

  {#if saveFailed}
    <p class="manager-muted manager-form-warning">
      {text(
        'FABRICATE.Admin.Manager.Recipe.SaveFailed',
        'Save failed. Check for duplicate or blank names and try again.'
      )}
    </p>
  {/if}

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
      <!-- The tooltip rides `triggerTitle`, not `triggerData`: the popover spreads that map FIRST
           and then writes `title` from its own prop, so a `title` in the map is deleted green. -->
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
        triggerData={{ 'data-recipe-category-select': '' }}
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
          triggerData={{ 'data-recipe-field': 'checkTierId' }}
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
          triggerData={{ 'data-recipe-field': 'minSuccessOutcomeId' }}
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
      <div class="manager-recipe-field" data-recipe-crafting-modifier-picker>
        <div class="manager-recipe-modifier-set-field">
          <span class="manager-recipe-micro-label" id={MODIFIER_SET_LABEL_ID}
            >{text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierPick',
              'Eligible modifiers'
            )}</span
          >
          <!-- This cell keeps its own `ariaLabel` because the caption also names the pill group
               (WCAG 2.5.3). -->
          <Select
            value={modifierSetMode}
            options={modifierSetOptions}
            showTick={false}
            ariaLabel={text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickSource',
              'Eligible modifiers source'
            )}
            disabled={saving}
            triggerData={{ 'data-recipe-field': 'craftingModifierSet' }}
            onChange={changeModifierSetMode}
          />
        </div>
        {#if modifierSetMode === 'inherit'}
          <!-- Under Inherit there is nothing to author, so the pill row is hidden and the inherited
               set is NAMED — "inheriting" alone says nothing about what this recipe rolls. -->
          <p class="manager-muted" data-recipe-crafting-modifier-inherited>
            {inheritedNames
              ? `${text('FABRICATE.Admin.Manager.Recipe.CraftingModifierInherited', 'Inheriting the system default set:')} ${inheritedNames}`
              : text(
                  'FABRICATE.Admin.Manager.Recipe.CraftingModifierInheritedEmpty',
                  'The system default set is empty, so no check modifier applies to this recipe.'
                )}
          </p>
        {:else}
          <!-- The OFFER is the check's mark, not the world library. `selectedIds` stays the WHOLE
               stored list, so an un-marked pick draws no chip and survives every edit below. -->
          <ModifierPillSelect
            options={eligibleOptions}
            selectedIds={overrideModifierIds}
            disabled={saving}
            addDisabled={atModifierPickCap}
            testId="recipe-crafting-modifier"
            labelledBy={MODIFIER_SET_LABEL_ID}
            describedBy={modifierDescribedBy}
            menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
            allSelectedLabel={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
              'All modifiers selected.'
            )}
            noneSelectedLabel={emptyRowText}
            onToggle={toggleModifierId}
          />
          {#if modifierCapBounded}
            <!-- The cap is a SYSTEM fact this recipe cannot change, so it is stated standing rather
                 than once the menu button has already gone dead;
                 `data-recipe-crafting-modifier-cap` carries which reading is on screen. -->
            <p
              class="manager-muted manager-recipe-modifier-cap"
              id={MODIFIER_CAP_HINT_ID}
              data-recipe-crafting-modifier-cap={atModifierPickCap ? 'reached' : 'available'}
            >
              {capText}{atModifierPickCap ? ` ${capReachedText}` : ''}
            </p>
          {/if}
          {#if showSuppressedNote}
            <!-- Rendered ONLY when a stored pick is un-marked AND at least one survives, so the
                 ordinary recipe carries no standing warning. The count is on the attribute as well
                 as in the localized sentence, which a frame or a test must not read. -->
            <p
              class="manager-muted manager-recipe-modifier-suppressed"
              id={MODIFIER_SUPPRESSED_ID}
              data-recipe-crafting-modifier-suppressed={suppressedPickCount}
            >
              {suppressedText}
            </p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- FULL-BLEED below the grid rather than a grid cell: it REPLACES the picker cell, and the
       sentence would wrap to five lines in a 220px column. It reuses the resolution-mode banner's
       chrome in its own tone, so the tab has one visual language for "this is set elsewhere".

       This is the tab's ONLY check-modifier banner: under `addAll`/`highest`/`playerPicks` the tab
       renders nothing rather than a banner on every recipe of every system that never delegated.
       What remains is a genuine contradiction — the rule DID hand the pick to this recipe and the
       system rolls no check for it to reach — and earns the interruption. -->
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
        // Sentence case: it renders through the `{kicker}: {label}` slot, where a
        // lowercase fragment would read as a broken sentence rather than a state name.
        'Not used by this system’s check'
      )}
      description={text(modifierInert.key, modifierInert.fallback)}
      actionLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierOpenChecks', 'Checks tab')}
      actionHint={text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertHint',
        'These modifiers are added to the crafting check, which is authored for the whole crafting system on the Checks tab.'
      )}
      onAction={onOpenChecks}
    />
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
      subAttr="data-recipe-locked-state"
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

<style>
  /* The picker cell is a full grid cell owning its own micro-label, so it carries no nudge to
     align a bare pill row under a neighbouring select: it can be the only cell in its row. It
     stacks label → tri-state → pill row → cap note on `.manager-recipe-field`'s column rules. */
  .manager-recipe-modifier-set-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* The pill row reads as the tri-state's consequence, so it sits tight under it. It is a child
     COMPONENT's root and carries no scoping hash, hence `:global` nested under one that does. */
  [data-recipe-crafting-modifier-picker] :global([data-modifier-pill-select]) {
    margin-top: 0.25rem;
  }

  [data-recipe-crafting-modifier-inherited] {
    margin-block: 0.25rem 0;
  }

  /* The cap note trails the pill row it constrains at the inherited-set line's rhythm, so the
     cell keeps one vertical beat whichever trailing line is on screen. */
  .manager-recipe-modifier-cap,
  .manager-recipe-modifier-suppressed {
    margin-block: 0.25rem 0;
  }
</style>

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
  import { untrack } from 'svelte';
  import Chip from '../Chip.svelte';
  import RecipeModeBanner from './RecipeModeBanner.svelte';
  import { formatList, localize } from '../../../util/foundryBridge.js';
  import { resolveMaxModifierPicks } from '../../../../../systems/craftingModifierResolver.js';
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
    // True when an enable-blocking readiness issue is present while the recipe is
    // OFF: the enable toggle is disabled so the GM cannot trigger the hard activation
    // failure (issue 549). The Validation tab lists the reasons.
    //
    // This is NOT the recipe activation gate (issue 1018). That one is
    // `RecipeManager.canActivateRecipe`, projected onto the GM browser rows under its own
    // name — a different predicate that this one does NOT bound in either direction. The
    // two are INCOMPARABLE: `enableToggleBlocked === false` does not mean activation would
    // succeed, and `enableToggleBlocked === true` does not mean it would fail.
    // It UNDER-reports, because readiness runs no essence-reference,
    // tag-placeholder, resolution-mode or enabled-essence validation, and its
    // signature-collision branch cannot fire from here at all (issue 1066). It also
    // OVER-reports, because `duplicateAlternative` and `duplicateRequirement` disable this
    // toggle for a recipe `canActivateRecipe` accepts (issue 1067). See the ledger row in
    // DOMAIN.md.
    enableToggleBlocked = false,
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
    // Per-recipe crafting-check modifier SELECTION (issue 770, reshaped by issue 1055).
    // `craftingModifierOptions` is the system's `checkModifiers` catalogue ({id,label});
    // an empty catalogue hides the whole surface. `craftingModifierDefaultIds` is the
    // system's default eligible set, which the Inherit state NAMES rather than describes
    // abstractly.
    //
    // The control writes `recipe.craftingModifier` ({ modifierIds? } | null) and authors
    // ONE axis: WHICH modifiers apply. An absent `modifierIds` inherits the system set,
    // and an AUTHORED EMPTY `modifierIds` is "no modifiers" — a real choice that adds
    // nothing to the roll, not an absence.
    craftingModifierOptions = [],
    // The SYSTEM's combination rule, and the whole gate on this surface: only `byRecipe`
    // ("Recipe picks") defers the selection to the recipe author, so only `byRecipe`
    // renders anything here. A recipe can never override the rule, so this is not a
    // "default" and there is no control for it on this tab.
    craftingModifierPolicy = 'addAll',
    craftingModifierDefaultIds = [],
    // The system's cap on how many modifiers this recipe may pick (issue 1055). `null`
    // and NOT coerced at any call site on the way here — `resolveMaxModifierPicks` owns
    // what absence means (unlimited), and it must mean the same thing here as in the
    // engine.
    craftingModifierMaxPicks = null,
    // Why the system's active crafting check applies no check modifiers ('' when it
    // does): 'noCheck' | 'noFormula'. Either makes this recipe's picks inert, so the
    // control is replaced by a banner that says which — the Checks tab explaining it is
    // no use to a GM looking at this tab.
    craftingModifierInertCause = '',
    // Deep link to the Checks tab, where the catalogue and the combination rule live.
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

  // Per-recipe crafting-modifier selection state (issue 770, reshaped by issue 1055).
  const MODIFIER_SET_LABEL_ID = 'manager-recipe-crafting-modifier-label';
  const MODIFIER_CAP_HINT_ID = 'manager-recipe-crafting-modifier-cap';

  // The banner copy for each inert cause. Same two causes the Checks card names, said
  // from this tab's point of view: what the GM loses here, not what to fix there. There
  // were three until issue 1094 retired the roll-formula placeholder, taking the "the
  // formula never references it" cause with it.
  //
  // Each sentence closes on "check modifiers change nothing for this recipe" rather than
  // on "the picks below would change nothing", because the sentence is about the RECIPE's
  // outcome and stays true however the surface below it is arranged.
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
  // `byRecipe` — "Recipe picks" — is the ONE rule that defers the selection to the recipe
  // author, so it is the only rule under which this tab shows anything at all. Under
  // `addAll`, `highest` and `playerPicks` the recipe has nothing to say about check
  // modifiers and the tab is silent: a control the system will ignore is worse than no
  // control, and a banner explaining its absence would appear on every recipe of every
  // system that never opted in.
  const modifierDeferredToRecipe = $derived(
    hasModifierCatalogue && craftingModifierPolicy === 'byRecipe'
  );
  // Two dispositions under that rule, mutually exclusive. The inert banner wins: the
  // system asked this recipe to pick, but it rolls no check for the picks to reach —
  // that contradiction is worth a warning precisely BECAUSE the rule delegates here.
  const showModifierInert = $derived(modifierDeferredToRecipe && !!modifierInert);
  const showModifierControls = $derived(modifierDeferredToRecipe && !modifierInert);

  // The cap the ENGINE applies, asked of the resolver rather than re-derived: a stored
  // `0`, `-2` or `"three"` all mean unlimited there, and a picker that treated one of
  // them as a bound would refuse picks the engine would honour. `Infinity` compares
  // arithmetically, so no branch below has to special-case "no cap".
  const modifierPickCap = $derived(
    resolveMaxModifierPicks({ maxModifierPicks: craftingModifierMaxPicks })
  );
  const modifierCapBounded = $derived(Number.isFinite(modifierPickCap));
  const atModifierPickCap = $derived(overrideModifierIds.length >= modifierPickCap);
  // A cap of exactly 1 gets its own sentence rather than "up to 1 modifiers", following
  // the `…Selected` / `…SelectedOne` pair the pill select already uses. The at-cap clause
  // needs no count of its own: it renders immediately after the standing sentence that
  // just stated one.
  const CAP_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickCap';
  const capText = $derived.by(() => {
    if (modifierPickCap === 1) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickCapOne',
        'This system lets a recipe pick one check modifier.'
      );
    }
    // `localize`'s interpolating form, with the same fallback contract as `text` — the
    // fallback carries the count itself so an unlocalized build reads identically to a
    // localized one rather than printing a raw brace.
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

  // The tri-state the eligible-set select reads back. An authored empty array is "no
  // modifiers", NOT "inherit" — that collapse is the pre-1055 defect this replaces — so
  // the discriminator is `Array.isArray`, exactly as it is in `Recipe` and the resolver.
  function setModeOf(craftingModifier) {
    if (!Array.isArray(craftingModifier?.modifierIds)) return 'inherit';
    return craftingModifier.modifierIds.length > 0 ? 'custom' : 'none';
  }

  // …which leaves exactly ONE state the persisted shape cannot express: "Custom set,
  // nothing picked yet". It writes `modifierIds: []`, the same bytes as "No modifiers".
  // Read purely, that made Custom set unreachable on a system with a catalogue but an
  // EMPTY `defaultModifierIds` — the ordinary "every recipe picks its own" setup that
  // `byRecipe` exists to serve. The seed came back empty, `setModeOf` mapped it to
  // `none`, and the control snapped to "No modifiers" as though it had rejected the GM's
  // choice; the same snap ran going No modifiers → Custom set.
  //
  // So the select reads the persisted shape for everything EXCEPT that one collision,
  // where a local pin decides which of the two identical shapes was meant. Deliberately
  // narrower than holding the whole mode locally: every other transition still comes
  // straight off `recipe`, so no external edit can be masked by stale local intent, and
  // nothing has to bookkeep which writes were ours. The PERSISTED shape is untouched —
  // only the select's reading is sticky.
  //
  // The pin drops when the GM picks another option (`changeModifierSetMode`) and when a
  // DIFFERENT recipe arrives — the id is compared explicitly because every draft patch
  // replaces the whole `recipe` object, so tracking its identity alone would clear the
  // pin on the component's own write.
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

  // A legacy `craftingModifier.policy` left on disk by a pre-1055 world is CARRIED
  // FORWARD untouched by every writer below. The resolver states the contract: a recipe
  // never overrides the rule, so a stored one "stays on disk and stays unhonoured". This
  // surface no longer authors it and must not silently delete it either — dropping a key
  // while editing a neighbouring one is data loss disguised as a set edit.
  function preservedPolicy() {
    const policy = recipe?.craftingModifier?.policy;
    return policy ? { policy } : {};
  }

  // One writer for the whole `craftingModifier` bag, so a set edit cannot clobber the
  // carried-forward legacy key: an empty bag means "nothing stored at all" (null) and
  // every other shape is preserved verbatim, INCLUDING `modifierIds: []`.
  function emitCraftingModifier(next) {
    onUpdateRecipe({ craftingModifier: Object.keys(next).length > 0 ? next : null });
  }

  // Inherit drops the key; Custom set seeds from what is already chosen, falling back to
  // the system default set so "customize" starts from what the recipe was inheriting
  // rather than from nothing; No modifiers writes the authored empty array.
  //
  // The seed is TRUNCATED to the cap. A system default set longer than the cap, or a cap
  // lowered after the fact, would otherwise seed a selection the system will not honour —
  // and the resolver truncates it on read anyway, so an untruncated seed shows the GM
  // picks that are already not being rolled.
  //
  // Custom set PINS itself and every other option releases the pin, which is what makes
  // "Custom set, seeded empty" a state the control can show at all.
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

  // Clearing the LAST pill posts `{ modifierIds: [] }` — an authored empty set — never
  // `null`. Posting null made emptying the row mean "inherit", so a GM could not express
  // "this recipe gets no check modifiers" at all (issue 1055, defect 3).
  //
  // An ADD at the cap is refused. The menu button is already disabled there, so this is
  // the second of two guards rather than the only one — and it is the one that holds when
  // the cap is lowered on the Checks tab while this editor is open. It is NOT the
  // invariant either: `resolveEligibleModifierIds` truncates on read, deliberately, so a
  // cap lowered below what a recipe already picked is honoured whatever is on disk. A UI
  // control's constraint is never an invariant.
  function toggleModifierId(id, checked) {
    const current = recipe?.craftingModifier?.modifierIds || [];
    if (checked && !current.includes(id) && current.length >= modifierPickCap) return;
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
    <!-- Check-modifier picks (issue 1055). Rendered only under the system's `byRecipe`
         ("Recipe picks") rule, and only when the system actually rolls a check for the
         picks to reach; every other rule leaves this grid at its pre-1055 shape. There is
         no rule select: a recipe may choose WHICH modifiers apply, never HOW they
         combine.

         FOUR cells exist in this grid, and only THREE can co-render — Category, Check
         tier OR Min success tier, and the picker cell — because the two tier selects are
         mutually exclusive by construction (`resolveRecipeCheckTierOptions` returns []
         for a fixed routed check and offers tiers only for simple-static or
         routed-relative; `resolveRecipeFixedOutcomeTierOptions` returns [] for everything
         but routedByCheck + fixed, which is exactly the case the first one refuses).
         Three is the budget a future widening must fit, and it is why the tri-state
         select lives INSIDE the picker cell rather than becoming another sibling. -->
    {#if showModifierControls}
      <div class="manager-recipe-field" data-recipe-crafting-modifier-picker>
        <label class="manager-recipe-modifier-set-field">
          <span class="manager-recipe-micro-label" id={MODIFIER_SET_LABEL_ID}
            >{text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierPick',
              'Eligible modifiers'
            )}</span
          >
          <!-- The micro-label above names TWO things: it implicitly labels this select
               (it is inside the `<label>`) and its id is the pill group's
               `aria-labelledby` below, so a screen-reader user heard "Eligible
               modifiers, combo box" and then "Eligible modifiers, group" and could not
               tell the two controls apart. The select takes an explicit accessible name
               that starts with the visible label (WCAG 2.5.3 label-in-name) and adds
               what it actually chooses: WHERE the eligible set comes from. -->
          <select
            data-recipe-field="craftingModifierSet"
            value={modifierSetMode}
            aria-label={text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierPickSource',
              'Eligible modifiers source'
            )}
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
            addDisabled={atModifierPickCap}
            testId="recipe-crafting-modifier"
            labelledBy={MODIFIER_SET_LABEL_ID}
            describedBy={modifierCapBounded ? MODIFIER_CAP_HINT_ID : ''}
            menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
            allSelectedLabel={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
              'All modifiers selected.'
            )}
            noneSelectedLabel={text(
              'FABRICATE.Admin.Manager.Recipe.CraftingModifierEmptySet',
              'No modifiers — nothing is added to this recipe’s check roll.'
            )}
            onToggle={toggleModifierId}
          />
          {#if modifierCapBounded}
            <!-- The cap is a SYSTEM fact this recipe cannot change, so it is stated
                 standing — not only once the GM hits it and the menu button has already
                 gone dead. `data-recipe-crafting-modifier-cap` carries which of the two
                 readings is on screen. -->
            <p
              class="manager-muted manager-recipe-modifier-cap"
              id={MODIFIER_CAP_HINT_ID}
              data-recipe-crafting-modifier-cap={atModifierPickCap ? 'reached' : 'available'}
            >
              {capText}{atModifierPickCap ? ` ${capReachedText}` : ''}
            </p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- FULL-BLEED below the grid, not a grid cell: it REPLACES the picker cell the grid
       would otherwise hold, and a sentence squeezed into a 220px column would wrap to
       five lines. It reuses the resolution-mode banner's chrome (issue 1055) with its own
       tone, so the tab has one visual language for "this is set elsewhere".

       This is the tab's ONLY check-modifier banner. Its neutral-toned sibling reported
       the retired authority level `none` — "the system decides, you get no control" — and
       went with it: under `addAll`/`highest`/`playerPicks` this tab now renders nothing at
       all rather than a banner on every recipe of every system that never chose to
       delegate. What remains is a genuine contradiction and earns the interruption: the
       system's rule DID hand the pick to this recipe, and the system rolls no check for
       those picks to reach. -->
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
  /* The picker cell is a full grid cell that owns its own micro-label, so the 0.25rem
     nudge that used to align a bare pill row under the neighbouring select is gone: the
     cell can be the only one in its row, and that nudge pushed it out of line with
     Category beside it. The cell stacks label → tri-state → pill row → cap note on the
     shared `.manager-recipe-field` column rules. */
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

  /* The cap note trails the pill row it constrains, at the same 0.25rem rhythm as the
     inherited-set line above, so the cell keeps one vertical beat whichever of the two
     trailing lines is on screen. */
  .manager-recipe-modifier-cap {
    margin-block: 0.25rem 0;
  }
</style>

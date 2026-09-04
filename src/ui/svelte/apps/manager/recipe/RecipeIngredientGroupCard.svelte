<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so when it has two or more alternatives they render linked by a "— or —"
  separator inside a bracketed box; a single-alternative requirement renders as a
  bare row (no box). The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The add-affordances diverge by shape (issue 643): a BARE single-alternative row
  keeps ONE compact "or…" popover inline at its right end, while a multi-alternative
  BOX carries explicit dashed add-buttons at its foot (Add component / tag / cost /
  essence). Both drive the same append semantics: every choice is a real OR
  ALTERNATIVE appended to THIS requirement for the row's own picker to fill in — since
  essence is now a first-class ingredient match type (issue 649), "component OR
  essence" is genuinely authorable and the popover is a single flat "Accept instead"
  list rather than the old two-heading Accept-instead / Require-as-well split.

  Currency appears only when the system ENABLES currency and configures units; Essence
  appears only when the system enables essences at all (`essenceOptions.length > 0`) — an
  OR essence may repeat across groups, so it is NOT gated on system-minus-already-required.

  The `data-recipe-add` token family (`alternative-component` / `alternative-tag` /
  `alternative-essence` / `alternative-currency`) is PRESERVED on the choices.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // (The add-new essence OFFER used to be projected here, through `selectableEssenceOptions`,
  // because the essence adder SEEDED its new alternative with the first selectable essence.
  // It seeds nothing now — issue 1373's maintainer round 5 — so the offer lives where the
  // choice is made, which is `RecipeIngredientOption`'s own field. The `essenceOptions` PROP
  // stays unfiltered here for the reason it always did: `hasEssences` gates the whole essence
  // match TYPE on it, and filtering it would remove essence requirements entirely from a
  // system whose essences are all disabled — including the ability to see and clear the ones
  // it already has, which issue 1036/2 ruled against.)
  import RecipeIngredientOption from './RecipeIngredientOption.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  // The ONE kind table (`proto:4624`), shared with the row's own plate and kind select. The
  // `or…` menu's four entries and the choice group's four adders both read their glyph, their
  // tint class and their one-word name from it.
  import { ingredientKindMarkClass, ingredientKindMeta } from './ingredientKindMeta.js';

  let {
    group = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. Preset units are seeded even for a
    // disabled system, so the currency add-affordances gate on this flag too; existing
    // currency alternatives still render (read-only) when it is false.
    currencyEnabled = true,
    // The system's essences ({ id, name, icon }). Non-empty unlocks the essence OR
    // alternative (an essence match option appended to THIS requirement). Empty means
    // the system has no essences, so the choice is not offered at all.
    essenceOptions = [],
    // WHAT THE `Any one of` PILL'S NOTE SAYS (issue 1373, maintainer round 2, E4). The recipe
    // editor's own sentence enumerates the four kinds a crafter may pick between, which is what
    // a recipe author needs; a Tool's REPAIR set is a different sentence about the same shape -
    // the design says "any one of these mends it" (`proto:2242`) - and the note is the only
    // place the two differ. Empty falls through to the shipped copy, so every recipe and
    // downtime call site is byte-identical.
    anyOneOfHint = '',
    onChange = () => {},
    onRemove = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const options = $derived(Array.isArray(group?.options) ? group.options : []);
  const hasAlternatives = $derived(options.length >= 2);
  const hasEssences = $derived((essenceOptions || []).length > 0);
  // A currency alternative is authorable only when the feature is enabled AND units exist.
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);

  // The accessible name for the trigger, the dialog and its search field. The menu is a
  // single flat "Accept instead" list of real OR alternatives (issue 649).
  const orMenuLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
  );

  // ── THE FOUR CHOICES (`proto:4682`) ───────────────────────────────────────────────────────
  // Each entry is ONE WORD — the kind it appends, taken from the same table the row's own kind
  // select reads. The verb lives once, in the panel's `Accept instead` header (`proto:2293`),
  // so no entry has to carry it.
  //
  // WHAT THIS REPLACES (issue 1373, maintainer round 8): four full sentences, `Add alternative
  // component` / `Add alternative tag requirement` / `Add essence` / `Add alternative cost`.
  // They disagreed with each other as much as with the design — three said `alternative` and
  // one did not; one said `cost` where the row it authors says `currency` — and the four keys
  // behind them are retired from `lang/en.json` with this change.
  //
  // The glyph carries `manager-recipe-option-mark is-<kind>`, which is the SAME class the row's
  // plate and chosen chip wear, so the menu's tints are the row's tints by construction rather
  // than by a second table of tokens. `SearchablePopover` renders an option's `icon` as the
  // whole `class` attribute of its `<i>`, which is what makes that reuse possible.
  //
  // No option groups — a single ungrouped bucket (optionGroups: []) so SearchablePopover
  // renders no lone heading. Currency appears only when the system configures units;
  // essence only when the system enables essences.
  const orMenuChoice = (kind, addMarker) => ({
    id: kind,
    addMarker,
    icon: ingredientKindMarkClass(kind),
    label: text(ingredientKindMeta(kind).labelKey, ingredientKindMeta(kind).label),
  });
  const orMenuOptions = $derived([
    orMenuChoice('component', 'alternative-component'),
    orMenuChoice('tags', 'alternative-tag'),
    ...(hasEssences ? [orMenuChoice('essence', 'alternative-essence')] : []),
    ...(canAddCost ? [orMenuChoice('currency', 'alternative-currency')] : []),
  ]);

  function updateOption(index, nextOption) {
    onChange({
      ...group,
      options: options.map((option, i) => (i === index ? nextOption : option)),
    });
  }

  // Removing an alternative removes that option; removing the LAST alternative
  // drops the whole requirement.
  function removeOption(index) {
    if (options.length <= 1) {
      onRemove();
      return;
    }
    onChange({ ...group, options: options.filter((_, i) => i !== index) });
  }

  /**
   * A NEW ALTERNATIVE IS A KIND AND NOTHING ELSE (issue 1373, maintainer round 5).
   *
   * `proto:4632`'s `blankReq` is the shape: `{kind, ref: '', tags: [], pol: 'any', qty: 1}`.
   * A currency alternative used to arrive holding the first configured unit and an essence
   * alternative the first selectable essence, so that their amount field was usable at once —
   * but that authors a choice the GM did not make, and it is the same choice every time, which
   * is how a set ends up requiring gold pieces nobody asked for. The row's own field is where
   * the value is named now, and it opens on the search face for exactly that reason.
   *
   * @param {'component'|'tags'|'essence'|'currency'} type
   */
  function appendAlternative(type) {
    if (type === 'essence') {
      onChange({
        ...group,
        options: [
          ...options,
          { quantity: 1, match: { type: 'essence', essenceId: '', amount: 1 } },
        ],
      });
      return;
    }
    if (type === 'tags') {
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }],
      });
      return;
    }
    if (type === 'currency') {
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'currency', unit: '', amount: 1 } }],
      });
      return;
    }
    onChange({
      ...group,
      options: [...options, { quantity: 1, match: { type: 'component', componentId: null } }],
    });
  }
</script>

{#snippet orMenu()}
  <SearchablePopover
    options={orMenuOptions}
    optionGroups={[]}
    pickerClass="manager-recipe-or-picker"
    triggerClass="manager-recipe-or-trigger"
    triggerIcon="fa-solid fa-code-branch"
    triggerLabel={text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}
    triggerAriaLabel={orMenuLabel}
    triggerTitle={text(
      'FABRICATE.Admin.Manager.Recipe.OrTriggerHint',
      'Accept another kind of ingredient in place of this one.'
    )}
    dialogAriaLabel={orMenuLabel}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Recipe.OrSearchPlaceholder',
      'Search options...'
    )}
    searchAriaLabel={orMenuLabel}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    showSearch={false}
    popoverTitle={orMenuLabel}
    popoverClass="manager-recipe-or-popover"
    minWidth={150}
    maxWidth={150}
    onChoose={(type) => appendAlternative(type)}
  />
{/snippet}

<div
  class="manager-recipe-ingredient-requirement"
  class:has-alternatives={hasAlternatives}
  data-recipe-group
  data-recipe-group-id={group?.id || ''}
>
  {#if hasAlternatives}
    <!-- ANY ONE OF box (§B2): an accent-bordered container with a header pill + hint;
         the crafter picks any one of the alternatives inside. -->
    <div class="manager-recipe-any-one-of-head">
      <span class="manager-recipe-any-one-of-pill" data-recipe-any-one-of>
        <i class="fas fa-code-branch" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AnyOneOf', 'Any one of')}</span>
      </span>
      <span class="manager-recipe-any-one-of-hint manager-muted"
        >{anyOneOfHint ||
          text(
            'FABRICATE.Admin.Manager.Recipe.AnyOneOfHint',
            'crafter picks a component or a tagged item'
          )}</span
      >
    </div>
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        {#if index > 0}
          <div class="manager-recipe-ingredient-or-separator" aria-hidden="true">
            <span>{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
          </div>
        {/if}
        <RecipeIngredientOption
          {option}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {currencyEnabled}
          {essenceOptions}
          canRemove={true}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
    <!-- THE CHOICE GROUP'S OWN ADDERS (`proto:2305`, built at `proto:4692`): dashed accent
         chips reading `alt component / alt tag / alt essence / alt currency`. They are worded
         and ordered as the design words and orders them — `alt <kind>`, in the same kind order
         the row's own select offers — because inside an `ANY ONE OF` group every one of them
         appends an ALTERNATIVE, and `Add component` beside `Add cost` reads as two different
         verbs for one act.

         Currency shows only when the system enables it AND configures units; essence only when
         the system has a selectable one. The `data-recipe-add` marker family is preserved. -->
    <div class="manager-recipe-requirement-adds">
      <ManagerButton
        role="dashed"
        data-recipe-add="alternative-component"
        onclick={() => appendAlternative('component')}
      >
        <i class={ingredientKindMeta('component').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltComponent', 'alt component')}</span>
      </ManagerButton>
      <ManagerButton
        role="dashed"
        data-recipe-add="alternative-tag"
        onclick={() => appendAlternative('tags')}
      >
        <i class={ingredientKindMeta('tags').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltTag', 'alt tag')}</span>
      </ManagerButton>
      {#if hasEssences}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-essence"
          onclick={() => appendAlternative('essence')}
        >
          <i class={ingredientKindMeta('essence').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltEssence', 'alt essence')}</span>
        </ManagerButton>
      {/if}
      {#if canAddCost}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-cost"
          onclick={() => appendAlternative('currency')}
        >
          <i class={ingredientKindMeta('currency').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltCurrency', 'alt currency')}</span>
        </ManagerButton>
      {/if}
    </div>
  {:else}
    <!-- Bare requirement (§B1): a single row with the "or…" popover inline at its
         right end. -->
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        <RecipeIngredientOption
          {option}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {currencyEnabled}
          {essenceOptions}
          canRemove={true}
          orControl={orMenu}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
  {/if}
</div>

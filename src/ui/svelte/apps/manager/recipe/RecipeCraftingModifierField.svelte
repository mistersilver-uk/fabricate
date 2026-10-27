<!--
  The recipe Overview's check-modifier picker cell: the eligible-set tri-state, the pill row over
  the check's mark, and the cap, suppression and deleted-modifier notes. It writes `recipe.craftingModifier`
  (`{ modifierIds? } | null`) and authors one axis, which modifiers apply
  (`openspec/specs/data-models/spec.md` `## Recipe` requirement 13a).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `recipe` | the staged recipe draft | `null` | Read for `craftingModifier` and `id`. |
  | `craftingModifierOptions` | `[{ id, label }]` | `[]` | The world's unified `modifiers` library. |
  | `craftingModifierDefaultIds` | id array, or a non-array | `[]` | The crafting check's mark: it names the inherited set and bounds a custom pick. |
  | `craftingModifierMaxPicks` | number or `null` | `null` | The system's cap, uncoerced: `resolveMaxModifierPicks` owns what absence means. |
  | `saving` | boolean | `false` | Every control off. |

  Callbacks:
  - `onUpdateRecipe(patch)` — a `{ craftingModifier }` patch for the draft.
-->
<script>
  import { untrack } from 'svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';
  import Select from '../../../components/Select.svelte';
  import { formatList, localize } from '../../../util/foundryBridge.js';
  import {
    partitionPickedModifierIds,
    resolveMaxModifierPicks,
  } from '../../../../../systems/checkModifierResolver.js';
  import { buildModifierSetOptions } from './recipeOverviewSelectOptions.js';

  let {
    recipe = null,
    craftingModifierOptions = [],
    craftingModifierDefaultIds = [],
    craftingModifierMaxPicks = null,
    saving = false,
    onUpdateRecipe = () => {},
  } = $props();

  // ratchet-exempt(text-helper): moved verbatim out of RecipeOverviewTab (issue 2513 T5)
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Fixed rather than per-instance ids: the modifier-set caption is the pill group's target too.
  const MODIFIER_SET_LABEL_ID = 'manager-recipe-crafting-modifier-label';
  const MODIFIER_CAP_HINT_ID = 'manager-recipe-crafting-modifier-cap';
  const MODIFIER_SUPPRESSED_ID = 'manager-recipe-crafting-modifier-suppressed';
  const MODIFIER_MISSING_ID = 'manager-recipe-crafting-modifier-missing';

  const overrideModifierIds = $derived(recipe?.craftingModifier?.modifierIds || []);

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
  // A pick naming a modifier the library no longer holds returns with nothing, so it is counted
  // apart from one the check merely un-marked.
  const partition = $derived(
    partitionPickedModifierIds(
      overrideModifierIds,
      craftingModifierOptions,
      craftingModifierDefaultIds
    )
  );
  const pickedEligibleIds = $derived(partition.eligible);
  const missingPickCount = $derived(partition.missing.length);
  const suppressedPickCount = $derived(partition.suppressed.length);
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
  const allPicksSuppressed = $derived(
    pickedEligibleIds.length === 0 && suppressedPickCount > 0 && missingPickCount === 0
  );
  const ALL_SUPPRESSED_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierAllSuppressed';
  const MODIFIER_ADD_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd';
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

  const MISSING_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierMissing';
  // The deleted id has no chip to remove, so the note names the set modes that drop the stored pick.
  const missingText = $derived.by(() => {
    const clear = text(
      'FABRICATE.Admin.Manager.Recipe.CraftingModifierMissingClear',
      'To clear this, set Eligible modifiers to Inherit system default or No modifiers; that resets the other picks too.'
    );
    if (missingPickCount === 1) {
      return `${text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierMissingOne',
        'One chosen modifier no longer exists in the Modifiers library, so it is hidden and does nothing.'
      )} ${clear}`;
    }
    const translated = localize(MISSING_KEY, { count: missingPickCount });
    const sentence =
      translated && translated !== MISSING_KEY
        ? translated
        : `${missingPickCount} chosen modifiers no longer exist in the Modifiers library, so they are hidden and do nothing.`;
    return `${sentence} ${clear}`;
  });
  const showMissingNote = $derived(missingPickCount > 0);

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
      showMissingNote ? MODIFIER_MISSING_ID : '',
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

  const modifierSetOptions = buildModifierSetOptions(text);
</script>

<div class="manager-recipe-field" data-recipe-crafting-modifier-picker>
  <div class="manager-recipe-modifier-set-field">
    <span class="manager-recipe-micro-label" id={MODIFIER_SET_LABEL_ID}
      >{text('FABRICATE.Admin.Manager.Recipe.CraftingModifierPick', 'Eligible modifiers')}</span
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
      triggerProps={{ 'data-recipe-field': 'craftingModifierSet' }}
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
      data-modifier-pill-select="recipe-crafting-modifier"
      ariaLabelledBy={MODIFIER_SET_LABEL_ID}
      ariaDescribedBy={modifierDescribedBy}
      triggerLabel={text(MODIFIER_ADD_KEY, 'Add modifier')}
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
    {#if showMissingNote}
      <!-- Shares the suppressed note's spacing rule only; it is a different fact. -->
      <p
        class="manager-muted manager-recipe-modifier-suppressed"
        id={MODIFIER_MISSING_ID}
        data-recipe-crafting-modifier-missing={missingPickCount}
      >
        {missingText}
      </p>
    {/if}
  {/if}
</div>

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
    margin-top: var(--fab-space-1);
  }

  [data-recipe-crafting-modifier-inherited] {
    margin-block: var(--fab-space-1) 0;
  }

  /* The cap note trails the pill row it constrains at the inherited-set line's rhythm, so the
     cell keeps one vertical beat whichever trailing line is on screen. */
  .manager-recipe-modifier-cap,
  .manager-recipe-modifier-suppressed {
    margin-block: var(--fab-space-1) 0;
  }
</style>

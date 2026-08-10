<!-- Svelte 5 runes mode -->
<!--
  The SUBJECT's own check-modifier pick, for salvage and gathering (issue 1095).

  Under the `bySubject` combination rule the pick lives on the record being resolved, and
  there are three such records. The recipe's picker is already shipped inside
  `RecipeOverviewTab` (with a tri-state select the other two do not need), so this
  component is the shared surface for the two NEW subjects — `Component.salvage` and
  `GatheringTask` — rather than a third and fourth copy of the same markup.

  ONE COMPONENT RATHER THAN TWO COPIES, deliberately: the pick's semantics are subtle in
  exactly the way a copy gets wrong. An ABSENT array inherits the activity's default set; an
  AUTHORED EMPTY array is a real pick of zero and adds nothing to the roll. The two are
  different rolls, not a presence check, and a second implementation that collapsed them
  would fail silently. The toggle below IS that distinction, made visible.

  The cap is a SYSTEM fact this record cannot change, so it is stated STANDING rather than
  only once the GM hits it and the add button has already gone dead — the same treatment the
  recipe picker gives it.

  Props:
   - options: the system catalogue (`{id,label,icon?}[]`). An empty one hides everything.
   - selectedIds: the AUTHORED pick, or `null` when the record inherits.
   - maxPicks: the activity's `maxModifierPicks`, or `null` for unlimited. Never coerced —
     `resolveMaxModifierPicks` owns what absence means.
   - disabled: while the editor is saving.
   - testId: the `data-subject-modifier-*` hook prefix, so a test can tell salvage's picker
     from gathering's.
   - onChange(nextIdsOrNull): `null` restores inheritance; an array (including an empty one)
     authors a pick.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ModifierPillSelect from '../../components/ModifierPillSelect.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import { resolveMaxModifierPicks } from '../../../../systems/checkModifierResolver.js';

  let {
    options = [],
    selectedIds = null,
    maxPicks = null,
    disabled = false,
    testId = 'subject-modifier',
    inheritedLabel = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const LABEL_ID = $derived(`${testId}-label`);
  const CAP_HINT_ID = $derived(`${testId}-cap-hint`);

  const authored = $derived(Array.isArray(selectedIds));
  const picked = $derived(authored ? selectedIds : []);
  // Routed through the resolver so this surface bounds what the ENGINE bounds: a stored
  // `0`, `-2` or `"three"` all read as unlimited there, and a picker that trusted them
  // verbatim would refuse picks the roll would have honoured.
  const capLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks: maxPicks }));
  const capBounded = $derived(Number.isFinite(capLimit));
  const atCap = $derived(capBounded && picked.length >= capLimit);

  function toggleAuthored(checked) {
    // Turning it ON authors an EMPTY array — a real pick of zero, which is the honest
    // starting state for "this record picks its own". Turning it OFF restores inheritance
    // by clearing the key, which is a different roll, not the same one.
    onChange(checked ? [] : null);
  }

  function togglePick(id, checked) {
    const next = checked ? [...new Set([...picked, id])] : picked.filter((entry) => entry !== id);
    onChange(next);
  }
</script>

{#if options.length > 0}
  <div class="manager-field is-wide" data-subject-modifier-picker={testId}>
    <span class="manager-recipe-micro-label" id={LABEL_ID}>
      {text(
        'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierHeading',
        'Check modifiers for this record'
      )}
    </span>
    <div class="manager-subject-modifier-mode">
      <SelectionCheckbox
        size="sm"
        checked={authored}
        {disabled}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierAuthor',
          'Pick check modifiers for this record'
        )}
        data-subject-modifier-authored={authored ? 'custom' : 'inherit'}
        onChange={toggleAuthored}
      />
      <span class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierAuthor',
          'Pick check modifiers for this record'
        )}
      </span>
    </div>

    {#if authored}
      <ModifierPillSelect
        {options}
        selectedIds={picked}
        {disabled}
        addDisabled={atCap}
        {testId}
        labelledBy={LABEL_ID}
        describedBy={capBounded ? CAP_HINT_ID : ''}
        menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
        allSelectedLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
          'All modifiers selected.'
        )}
        noneSelectedLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierEmptySet',
          'No modifiers — nothing is added to this record’s check roll.'
        )}
        onToggle={togglePick}
      />
      {#if capBounded}
        <!-- Stated STANDING, not only once the menu button has already gone dead. -->
        <p
          class="manager-muted"
          id={CAP_HINT_ID}
          data-subject-modifier-cap={atCap ? 'reached' : 'available'}
        >
          {text(
            'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCap',
            'This system allows at most {max} check modifiers per record.'
          ).replace('{max}', String(capLimit))}
        </p>
      {/if}
    {:else}
      <p class="manager-muted" data-subject-modifier-inherited>
        {inheritedLabel ||
          text(
            'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierInherit',
            'Uses the system default set.'
          )}
      </p>
    {/if}
  </div>
{/if}

<style>
  .manager-subject-modifier-mode {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin-block: 0.25rem;
  }
</style>

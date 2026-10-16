<!--
  The progressive salvage body: the ordered stage list, each stage's read-only DC, Edit link and
  complication list, the stage adder, and the component's own DC card. PROGRESSIVE SALVAGE IS ONE
  GROUP, WHOSE `results` ARE THE STAGES; the view owns that group and every write to it.

  Callbacks:
  - `onAddStage()`, `onRemoveStage(resultId)`, `onMoveStage(from, to)` — the list's three edits.
  - `onUpdateResult(groupId, result, value)` — a stage's picker change.
  - `onOpenComponent(componentId)` — Edit on a stage opens the YIELD component.

  `difficultyCard` is the view's DC card snippet, absent when no progressive surface reads the DC.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import PickerRow from '../recipe/PickerRow.svelte';
  import { toValue } from '../recipe/pickerRowKinds.js';
  // The GM read-only complication list, shared with the Recipe Studio's stage rows (issue 2445).
  import StageComplicationList from '../StageComplicationList.svelte';

  let {
    text,
    saving = false,
    stageGroup = null,
    stages = [],
    resultKinds = [],
    catalogue = [],
    nameProps = {},
    componentOptions = [],
    macroOptions = [],
    complicationTriggerOptions = [],
    componentName = () => '',
    difficultyCard = undefined,
    onAddStage = () => {},
    onRemoveStage = () => {},
    onMoveStage = () => {},
    onUpdateResult = () => {},
    onOpenComponent = () => {},
  } = $props();

  // `difficulty` is projected onto the component options; a component that has never been given
  // one reads null and the badge says so rather than showing a spurious 0.
  function salvageResultDifficulty(componentId) {
    const option = componentOptions.find((opt) => opt.id === componentId);
    const numeric = Number(option?.difficulty);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function salvageComponentOption(componentId) {
    return componentId
      ? componentOptions.find((option) => option.id === componentId) || null
      : null;
  }

  // The read-only complication list under a progressive salvage row (issue 1286): the complications
  // authored on the YIELD component the row REFERENCES, never this component's own. It reads the
  // UNREDACTED authored list, because `forecastComplications` filters to the PLAYER's projection and
  // the authored default is `gmOnly`. Filtered to the SALVAGE activity.
  function salvageComplicationsFor(componentId) {
    const authored = salvageComponentOption(componentId)?.complications;
    return (Array.isArray(authored) ? authored : []).filter(
      (complication) => complication?.activities?.salvage === true
    );
  }

  // The macro and trigger vocabularies are SYSTEM-scoped, so this view's own lists resolve the
  // referenced component's names too; without them the sentence names nothing a GM recognises.
  const complicationMacroNames = $derived(
    new Map(
      (macroOptions || [])
        .filter((macro) => macro?.uuid)
        .map((macro) => [macro.uuid, macro.name || macro.uuid])
    )
  );

  const complicationTriggerLabels = $derived(
    new Map(
      (complicationTriggerOptions || [])
        .filter((option) => option?.id)
        .map((option) => [option.id, option.label || option.id])
    )
  );
</script>

<!-- `data-add-salvage-group` rides this button only while there is no backing group,
     because in that state this IS the add-group control: it takes a progressive component
     from zero groups to one, which the normalizer's clamp requires before `enabled` can
     ever be true. One definition, rendered as the list's footer while there are stages and
     under the empty message otherwise (issue 1512). -->
{#snippet salvageStageAdder()}
  <Button
    role="dashed"
    fullWidth
    data-add-salvage-result
    data-add-salvage-group={stageGroup ? undefined : ''}
    onclick={() => onAddStage()}
    disabled={saving}
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult', 'Add result')}</span>
  </Button>
{/snippet}

<!-- A stage's read-only DC and its Edit link, the row's `trailing`: `difficulty` belongs to
     the result component, whose own editor owns its save lifecycle, so the link is the way
     to change it. The navigation is guarded (the `component-edit` row of
     `ROUTE_EXIT_GUARDS` waives no navigation), so a dirty draft prompts. The DC's fallback
     matches the lang value `DifficultyUnset` resolves to, as the recipe stage row's does. -->
{#snippet salvageStageControls(result)}
  {@const difficulty = salvageResultDifficulty(result.componentId)}
  <span
    class="manager-salvage-result-difficulty"
    data-salvage-result-difficulty={difficulty === null ? '' : String(difficulty)}
    >{difficulty === null
      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset', 'No difficulty')
      : `${text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyShort', 'DC')} ${difficulty}`}</span
  >
  {#if result.componentId}
    <button
      type="button"
      class="manager-salvage-stage-edit"
      data-salvage-result-edit={result.componentId}
      data-keyboard-focus="true"
      aria-label={text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.EditResult',
        'Edit difficulty and complications on {name}'
      ).replace('{name}', componentName(result.componentId))}
      title={text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.EditDcHint',
        'Difficulty and complications are set on this component in its editor'
      )}
      onclick={() => onOpenComponent(result.componentId)}
      disabled={saving}
    >
      <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Edit', 'Edit')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  {/if}
{/snippet}

<!-- PROGRESSIVE: an ordered list of SINGLE results, with no group chrome. See
`stageGroup` for why the groups are still the storage. -->
<span class="manager-component-readonly-label">
  <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Results', 'Results')}</span>
</span>
<!-- The ordered salvage stage list is the shared one (issue 1512): the grip, the
     ordinal badge, the rocker, the delete, the drag source and the announcement are
     all the list's. Every control it draws is an `IconButton`, so each carries
     `type="button"` — this is the one converted site inside a `<form>`, where a
     control without it submits the draft on a keyboard move. The complication list
     is the row's body, and `has-band` is what stops a stage with no complication
     drawing an empty padded one. `removeData` keeps
     `data-remove-salvage-result`, the hook the mounted suite addresses a stage by,
     and its `disabled: saving`. -->
{#if stages.length > 0}
  <SortableList
    items={stages}
    itemLabel={(result) =>
      componentName(result.componentId) ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result')}
    numbered
    alwaysOpen
    reorderable={!saving}
    onReorder={(from, to) => onMoveStage(from, to)}
    removable
    onRemove={(result) => onRemoveStage(result.id)}
    rowClass={(result) =>
      salvageComplicationsFor(result.componentId).length > 0
        ? 'manager-salvage-stage-row has-band'
        : 'manager-salvage-stage-row'}
    rowData={(result) => ({
      'data-salvage-result': result.id,
      'data-salvage-stage': String(stages.indexOf(result) + 1),
    })}
    removeData={() => ({
      'data-remove-salvage-result': '',
      disabled: saving,
    })}
  >
    {#snippet row(result)}
      <!-- No amount (issue 676): progressive awards one entry at a time, so "two
           of X" is authored by listing X twice. The clear stays, because a stage
           swaps its component in place to keep its order. -->
      <PickerRow
        value={toValue(result)}
        kinds={resultKinds}
        {catalogue}
        amount={false}
        removable={false}
        disabled={saving}
        {nameProps}
        class="is-result"
        onChange={(value) => onUpdateResult(stageGroup.id, result, value)}
      >
        {#snippet trailing()}{@render salvageStageControls(result)}{/snippet}
      </PickerRow>
    {/snippet}
    {#snippet body(result)}
      <!-- The read-only complication list (issues 1286, 2445): a nested non-reorderable
           list in the row's body, empty — and the body hidden — for a stage whose yield
           authors none for salvage. -->
      <StageComplicationList
        complications={salvageComplicationsFor(result.componentId)}
        ownerId={result.componentId}
        ownerName={componentName(result.componentId)}
        macroNames={complicationMacroNames}
        triggerLabels={complicationTriggerLabels}
      />
    {/snippet}
    {#snippet footer()}
      <li class="manager-salvage-stage-add">{@render salvageStageAdder()}</li>
    {/snippet}
  </SortableList>
{:else}
  <p class="manager-muted">
    {text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoResultsYet', 'No results yet.')}
  </p>
  <!-- The adder follows the empty message (issue 1512): with no stages there is no
       list to be a footer of, and an empty state that says "add one" with nothing
       to press is a dead end. -->
  {@render salvageStageAdder()}
{/if}
<!-- The reference closes the progressive body with this component's own DC row. -->
{@render difficultyCard?.()}

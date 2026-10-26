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
  // The ordered stage list, shared with the Recipe Studio's progressive stages (issue 2511).
  import ProgressiveStageList from '../ProgressiveStageList.svelte';
  import {
    complicationMacroNames,
    complicationTriggerLabels,
  } from '../complicationVocabularies.js';

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

  // The macro and trigger vocabularies are SYSTEM-scoped, so this view's own lists resolve the
  // referenced component's names too; without them the sentence names nothing a GM recognises.
  const macroNames = $derived(complicationMacroNames(macroOptions));
  const triggerLabels = $derived(complicationTriggerLabels(complicationTriggerOptions));
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

<!-- PROGRESSIVE: an ordered list of SINGLE results, with no group chrome. See
`stageGroup` for why the groups are still the storage. -->
<span class="manager-component-readonly-label">
  <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Results', 'Results')}</span>
</span>
<!-- The shared ordered stage list (issues 1512, 2511). Every control it draws is an
     `IconButton`, so each carries `type="button"` — this is the one site inside a `<form>`, where
     a control without it submits the draft on a keyboard move. `removeData` keeps
     `data-remove-salvage-result`, the hook the mounted suite addresses a stage's delete by. The
     Edit navigation is guarded (the `component-edit` row of `ROUTE_EXIT_GUARDS` waives no
     navigation), so a dirty draft prompts. -->
{#if stages.length > 0}
  <ProgressiveStageList
    items={stages}
    {componentOptions}
    activity="salvage"
    kinds={resultKinds}
    {catalogue}
    {nameProps}
    disabled={saving}
    rowData={(result, index) => ({
      'data-salvage-result': result.id,
      'data-salvage-stage': String(index + 1),
    })}
    removeData={() => ({ 'data-remove-salvage-result': '' })}
    difficultyDataAttr="data-salvage-result-difficulty"
    editDataAttr="data-salvage-result-edit"
    itemLabel={(result) =>
      componentName(result.componentId) ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result')}
    ownerIdOf={(result) => result.componentId}
    dcLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyShort', 'DC')}
    dcUnsetLabel={text(
      'FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset',
      'No difficulty'
    )}
    editLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.Edit', 'Edit')}
    editTitle={text(
      'FABRICATE.Admin.Manager.Component.SalvageEditor.EditDcHint',
      'Difficulty and complications are set on this component in its editor'
    )}
    editAriaLabel={(result) =>
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.EditResult',
        'Edit difficulty and complications on {name}'
      ).replace('{name}', componentName(result.componentId))}
    {macroNames}
    {triggerLabels}
    adderClass="manager-salvage-stage-add"
    onItemChange={(result, _index, value) => onUpdateResult(stageGroup.id, result, value)}
    onReorder={(from, to) => onMoveStage(from, to)}
    onRemove={(result) => onRemoveStage(result.id)}
    adder={salvageStageAdder}
    {onOpenComponent}
  />
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

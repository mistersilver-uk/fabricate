<!--
  The progressive salvage body: the ordered stage list, each stage's read-only DC, Edit link and
  complication band, the stage adder, and the component's own DC card. PROGRESSIVE SALVAGE IS ONE
  GROUP, WHOSE `results` ARE THE STAGES; the view owns that group and every write to it.

  Callbacks:
  - `onAddStage()`, `onRemoveStage(resultId)`, `onMoveStage(from, to)` — the list's three edits.
  - `onUpdateResult(groupId, result, value)` — a stage's picker change.
  - `onOpenComponent(componentId)` — Edit on a stage or its band opens the YIELD component.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import PickerRow from '../recipe/PickerRow.svelte';
  import { toValue } from '../recipe/pickerRowKinds.js';
  // The one complication summary row, in its `readonly-gm` variant: six call sites share that
  // shape, and SonarCloud's copy-paste detector reads `.svelte`.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../model/complicationSummary.js';
  import ComponentDifficultyCard from './ComponentDifficultyCard.svelte';

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
    showDifficulty = false,
    difficulty = null,
    onDifficultyChange = () => {},
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

  /**
   * The complication band's eyebrow. Two FULL key literals rather than one composed key, because
   * `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down.
   */
  function stripTitle(count, componentId) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.Component.Complications.StripTitleOne'
        : 'FABRICATE.Admin.Manager.Component.Complications.StripTitle';
    const fallback = count === 1 ? '1 complication on {name}' : '{count} complications on {name}';
    return text(key, fallback)
      .replace('{count}', String(count))
      .replace('{name}', componentName(componentId));
  }

  // The read-only complication strip under a progressive salvage row (issue 1286): the complications
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

  function complicationStripSummary(complication) {
    return complicationSummary(complication, {
      translate: text,
      macroName: complicationMacroNames.get(complication?.macroUuid) || '',
      triggerName: complicationTriggerLabels.get(complication?.when?.checkTrigger) || '',
    });
  }
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
        'Edit {name}'
      ).replace('{name}', componentName(result.componentId))}
      title={text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.EditDcHint',
        'Set on this component in its editor'
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
     control without it submits the draft on a keyboard move. The complication band
     is the list's body because it is full-bleed, and `has-band` is what stops a
     stage with no complication drawing an empty padded one. `removeData` keeps
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
      {@const stageComplications = salvageComplicationsFor(result.componentId)}
      <!-- The read-only complication strip (issue 1286), the list's body and
           therefore full-bleed, as the Recipe Studio draws the same band: row and
           band are one card, with the band's `border-top` as the divider. This
           OVERRIDES the Component Studio prototype on a maintainer ruling. The
           `:has()` rules that bought the shape by hand are gone with the
           hand-rolled row (issue 1512). `role="presentation"` stays: the band
           annotates the stage above it and must never be announced as one. -->
      {#if stageComplications.length > 0}
        <div
          class="manager-salvage-stage-complications"
          role="presentation"
          data-salvage-stage-complications={result.componentId}
        >
          <div class="manager-salvage-stage-complications-head">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <span class="manager-salvage-stage-complications-title"
              >{stripTitle(stageComplications.length, result.componentId)}</span
            >
            <!-- The only route to changing any of this: a complication belongs to
                 the referenced component, whose own editor owns its save lifecycle.
                 Its label names complications, so it differs from the row's Edit
                 link. -->
            <!-- ratchet-exempt(design-system): moved unchanged from ComponentEditView, whose form it still renders inside -->
            <button
              type="button"
              class="manager-salvage-stage-edit"
              data-salvage-stage-complications-edit={result.componentId}
              aria-label={text(
                'FABRICATE.Admin.Manager.Component.Complications.StripEdit',
                'Edit complications on {name}'
              ).replace('{name}', componentName(result.componentId))}
              title={text(
                'FABRICATE.Admin.Manager.Component.Complications.StripEdit',
                'Edit complications on {name}'
              ).replace('{name}', componentName(result.componentId))}
              onclick={() => onOpenComponent(result.componentId)}
              disabled={saving}
            >
              <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Edit', 'Edit')}</span>
              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </button>
          </div>
          <!-- No `severityLabel`: this prototype draws severity as the coloured dot
               alone. The Recipe Studio's strip draws the word too, and passes it. -->
          {#each stageComplications as complication (complication.id)}
            <ComplicationSummaryRow
              variant="readonly-gm"
              nameEmphasis="inline"
              name={complication.name}
              severity={complication.severity}
              visibility={complication.visibility}
              playerLabel={text(
                'FABRICATE.Admin.Manager.Component.Complications.PlayerPill',
                'Player'
              )}
              playerTitle={text(
                'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
                'Shown to the player when it fires.'
              )}
              triggerSentence={complicationStripSummary(complication)}
              data-salvage-stage-complication={complication.id || true}
            />
          {/each}
        </div>
      {/if}
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
{#if showDifficulty}
  <ComponentDifficultyCard {text} {difficulty} {saving} {onDifficultyChange} />
{/if}

<style>
  /* The read-only complication strip (issue 1286). Component-SCOPED and theme-ROOT tokens only, so
     the band renders the same wherever this row shape is reused. THE BAND IS ATTACHED, overriding the
     prototype on a maintainer ruling: what goes is the margin, the surrounding border and the
     right-hand radii; every value the parity spec measures stands. */

  /* The three `:has()` rules that bought this shape by hand are gone (issue 1512): the list's row
     is already a column whose line carries the padding and which clips itself, so a band rendered
     as the row's body meets the row's own border by construction. */

  /* NO margin and NO radius: the `border-top` IS the divider, and a divider only reads as one when
     the two surfaces meet. The 2px `--fab-warning` left rule marks the stage's warning annotation. */
  .manager-salvage-stage-complications {
    display: flex;
    flex-direction: column;
    /* ratchet-exempt(design-system): moved unchanged from ComponentEditView, which carried it at base */
    gap: 6px;
    /* ratchet-exempt(design-system): moved unchanged from ComponentEditView, which carried it at base */
    padding: 8px 11px;
    border-top: 1px solid var(--fab-warning-border);
    border-left: 2px solid var(--fab-warning);
    background: var(--fab-warning-soft);
  }

  .manager-salvage-stage-complications-head {
    display: flex;
    /* ratchet-exempt(design-system): moved unchanged from ComponentEditView, which carried it at base */
    gap: 7px;
    align-items: center;
    color: var(--fab-warning);
    font-size: 9px;
  }

  /* The band's eyebrow. It names the OWNING component, because a GM scanning a list of stages needs
     the band's subject stated rather than inferred from adjacency. */
  .manager-salvage-stage-complications-title {
    flex: 1 1 auto;
    overflow: hidden;
    color: var(--fab-warning-text);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* `margin-left: auto` is stated rather than inherited: the shared `.manager-salvage-stage-edit`
     rule places the link in the ROW's trailing cluster, and the title above takes the free space. */
  .manager-salvage-stage-complications-head .manager-salvage-stage-edit {
    flex: 0 0 auto;
  }
</style>

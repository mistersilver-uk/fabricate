<!-- Svelte 5 runes mode -->
<!--
  The recipe-step adapter over `components/SortableList.svelte` (issue 1512). What survives here is
  what is genuinely about a step — its name and description and its duration control — rendered
  through the list's `row` snippet; the geometry, the reorder affordances, the delete, the
  disclosure and the accordion state are the shared list's.

  Reordering is overview-only: with `reorderable` the list draws the grip and the rocker and wires
  `onReorderSteps`, and the requirement tabs pass it false so neither is drawn. Deleting a step
  removes its ingredients, results and tools too, so the parent confirms.

  The chevron is the only opener (maintainer ruling, 2026-09-09): clicking the step's copy no longer
  expands it, because a whole-row toggle would nest the row's own grip, rocker and delete in a
  button. Results and Tools pass `alwaysOpen`, because a single-expand accordion on a tab whose
  whole subject is the body showed nothing by default. With `onUpdateStep` the row's time chip
  becomes an editable duration trigger; otherwise it stays a read-only chip.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { formatTimeRequirement } from '../../../util/recipeDuration.js';
  import RecipeDurationEditor from './RecipeDurationEditor.svelte';
  import SortableList from '../../../components/SortableList.svelte';

  let {
    steps = [],
    reorderable = false,
    alwaysOpen = false,
    // Whether the system applies time requirements (issue 714). When false the editable duration
    // trigger is hidden and only the read-only chip shows.
    timeRequirementsEnabled = true,
    onReorderSteps = () => {},
    onDeleteStep = () => {},
    onUpdateStep = null,
    body,
    footer,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stepName(step, index) {
    return step?.name || `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`;
  }

  function stepDescription(step) {
    return String(step?.description || '').trim();
  }

  /** The list names its controls and its announcement without an index, so the fallback finds one. */
  function stepLabel(step) {
    return stepName(step, steps.indexOf(step));
  }
</script>

<SortableList
  items={steps}
  itemLabel={stepLabel}
  numbered
  removable
  {reorderable}
  {alwaysOpen}
  expandable={!alwaysOpen}
  onReorder={(from, to) => onReorderSteps(from, to)}
  onRemove={(step) => onDeleteStep(step.id)}
  rowData={(step) => ({ 'data-recipe-step-id': step.id })}
  removeData={(step) => ({
    'data-recipe-step-delete': step.id,
    ariaLabel: text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step'),
    title: text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step'),
  })}
  {body}
  {footer}
>
  {#snippet row(step, index)}
    <span class="manager-environment-comp-copy">
      <span class="manager-environment-comp-name">{stepName(step, index)}</span>
      <span class="manager-environment-comp-sub"
        >{stepDescription(step) ||
          text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoDescription',
            'No description'
          )}</span
      >
    </span>
    <div class="manager-recipe-steps-requirements">
      {#if onUpdateStep && timeRequirementsEnabled}
        <RecipeDurationEditor
          timeRequirement={step.timeRequirement || null}
          onChange={(next) => onUpdateStep(step.id, { timeRequirement: next })}
        />
      {:else}
        <Chip
          class={step.timeRequirement ? '' : 'is-empty'}
          icon="fa-solid fa-clock"
          data-recipe-step-time={step.id}
        >
          <span
            >{step.timeRequirement
              ? formatTimeRequirement(step.timeRequirement)
              : text('FABRICATE.Admin.Manager.Recipe.Instantaneous', 'Instantaneous')}</span
          >
        </Chip>
      {/if}
    </div>
  {/snippet}
</SortableList>

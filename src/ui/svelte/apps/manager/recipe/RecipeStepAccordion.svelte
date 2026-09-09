<!-- Svelte 5 runes mode -->
<!--
  The recipe-step ADAPTER over `components/SortableList.svelte` (issue 1512).

  It used to hand-roll the ordered-row pattern: its own `<li>` geometry, its own
  `role="button"` header, its own drag code, its own accordion state and a chevron `<i>`
  that was not the disclosure primitive. All of that is the shared list's now, and what
  survives here is what is genuinely about a recipe STEP — the step's name and description,
  its duration control, and its delete button — rendered through the list's `row` snippet.

  Reordering is OVERVIEW-ONLY: pass `reorderable` and the list draws the grip and the
  chevron rocker and wires `onReorderSteps`. The Ingredients / Results / Tools tabs render
  the same ordered steps with `reorderable` false, so the list draws NEITHER affordance
  rather than a handle that reorders nothing, and the chips and delete button stay so a
  step can be removed from any tab. Deleting a step removes the whole step (its
  ingredients, results, and tools), so the parent confirms.

  Accordion and drag state live in the list and are keyed by `step.id`, so they survive the
  store refresh that follows every persisted edit.

  THE CHEVRON IS THE ONLY OPENER (maintainer ruling M3, 2026-09-09). Clicking the step's
  name and description no longer expands it: the copy is inert and the leading
  `RowDisclosure` is the sole disclosure trigger, because a whole-row toggle would have to
  nest this row's own grip, rocker and delete controls inside a button.

  When `onUpdateStep` is supplied (the Overview Steps card) the row's time chip becomes an
  editable duration trigger (RecipeDurationEditor) that patches `step.timeRequirement`;
  otherwise (the requirement tabs) it stays a read-only chip.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { formatTimeRequirement } from '../../../util/recipeDuration.js';
  import RecipeDurationEditor from './RecipeDurationEditor.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';

  let {
    steps = [],
    reorderable = false,
    // Results and Tools render EVERY step as an always-open card (issue 643 §C1):
    // the old single-expand accordion showed NOTHING by default on those tabs, so the
    // most mode-dependent surfaces shipped unseen. Overview keeps the collapsing
    // accordion (it is a reorder list), and Ingredients keeps it too.
    alwaysOpen = false,
    // Whether the system applies time requirements (issue 714). When false the inline
    // editable duration trigger is hidden and the header shows only the read-only
    // duration chip. Defaults true so read-only callers (Ingredients/Results/Tools
    // tabs, which never pass onUpdateStep) keep showing the chip unchanged.
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

  // The list needs an index-free name for its announcement and for every control it names.
  // A step with no name of its own falls back to its position in the array the list is
  // rendering, which is the same sentence the row's own copy reads.
  function stepLabel(step) {
    return stepName(step, steps.indexOf(step));
  }
</script>

<SortableList
  items={steps}
  itemLabel={stepLabel}
  numbered
  handles
  {reorderable}
  {alwaysOpen}
  expandable={!alwaysOpen}
  onReorder={(from, to) => onReorderSteps(from, to)}
  rowData={(step) => ({ 'data-recipe-step-id': step.id })}
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
    <IconButton
      class="is-danger"
      data-recipe-step-delete={step.id}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')}
      title={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')}
      onclick={() => onDeleteStep(step.id)}
      ><i class="fas fa-trash" aria-hidden="true"></i></IconButton
    >
  {/snippet}
</SortableList>

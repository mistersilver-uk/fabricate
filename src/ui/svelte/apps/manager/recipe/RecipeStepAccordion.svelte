<!-- Svelte 5 runes mode -->
<!--
  Shared expandable/collapsible step accordion. Each row's header carries the order pip, the
  name/description toggle, the time summary chip and a delete button, while the expanded body and
  an optional trailing "add step" row are the caller's snippets.

  Reordering is OVERVIEW-ONLY (`reorderable`); the requirement tabs render the same ordered steps
  without drag but keep the chips and the delete button, and deleting a step removes the whole
  step, so the parent confirms. Accordion and drag state are local, so they survive the store
  refresh that follows every persisted edit. With `onUpdateStep` the header's time chip becomes
  an editable duration trigger patching `step.timeRequirement`; otherwise it stays read-only.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { formatTimeRequirement } from '../../../util/recipeDuration.js';
  import RecipeDurationEditor from './RecipeDurationEditor.svelte';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    steps = [],
    reorderable = false,
    // Results and Tools render EVERY step as an always-open card, because a single-expand
    // accordion showed NOTHING by default there. Overview, a reorder list, keeps collapsing.
    alwaysOpen = false,
    // Whether the system applies time requirements; when false the editable duration trigger is
    // hidden and only the read-only chip shows. Defaults true, so read-only callers are
    // unaffected.
    timeRequirementsEnabled = true,
    onReorderSteps = () => {},
    onDeleteStep = () => {},
    onUpdateStep = null,
    body,
    footer,
  } = $props();

  let expandedStepId = $state('');
  let dragIndex = $state(-1);

  function isOpen(stepId) {
    return alwaysOpen || expandedStepId === stepId;
  }

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

  function toggleStep(stepId) {
    expandedStepId = expandedStepId === stepId ? '' : stepId;
  }

  function onStepKeydown(event, stepId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleStep(stepId);
    }
  }

  function handleDrop(targetIndex) {
    if (dragIndex >= 0 && dragIndex !== targetIndex) onReorderSteps(dragIndex, targetIndex);
    dragIndex = -1;
  }
</script>

<ul class="manager-recipe-steps-list">
  {#each steps as step, index (step.id)}
    <li
      class={`manager-recipe-steps-row ${isOpen(step.id) ? 'is-expanded' : ''} ${alwaysOpen ? 'is-always-open' : ''}`}
      data-recipe-step-id={step.id}
      ondragover={reorderable ? (event) => event.preventDefault() : undefined}
      ondrop={reorderable
        ? (event) => {
            event.preventDefault();
            handleDrop(index);
          }
        : undefined}
    >
      <!-- Overview only: the HEADER is the drag handle, so a grab inside the expanded body
           selects text instead of starting a drag. Drag is a mouse-only enhancement; the
           keyboard path is the nested role="button". -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="manager-recipe-steps-row-head"
        draggable={reorderable ? 'true' : undefined}
        ondragstart={reorderable
          ? () => {
              dragIndex = index;
            }
          : undefined}
        ondragend={reorderable
          ? () => {
              dragIndex = -1;
            }
          : undefined}
      >
        <span
          class={`manager-environment-comp-handle ${reorderable ? '' : 'is-static'}`}
          title={reorderable
            ? text('FABRICATE.Admin.Manager.Recipe.DragStep', 'Drag to reorder')
            : undefined}
        >
          {#if reorderable}<i class="fas fa-grip-vertical" aria-hidden="true"></i>{/if}
          <span class="manager-environment-comp-order">{index + 1}</span>
        </span>
        {#if alwaysOpen}
          <!-- Always-open: the header is a static label rather than a toggle. -->
          <div class="manager-recipe-steps-row-main is-static">
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
          </div>
        {:else}
          <div
            role="button"
            tabindex="0"
            class="manager-recipe-steps-row-main"
            aria-expanded={expandedStepId === step.id}
            onclick={() => toggleStep(step.id)}
            onkeydown={(event) => onStepKeydown(event, step.id)}
          >
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
            <i
              class={`fas manager-recipe-steps-chevron ${expandedStepId === step.id ? 'fa-chevron-up' : 'fa-chevron-down'}`}
              aria-hidden="true"
            ></i>
          </div>
        {/if}
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
        <div class="manager-recipe-steps-row-controls">
          <IconButton
            class="is-danger"
            data-recipe-step-delete={step.id}
            ariaLabel={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')}
            title={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')}
            onclick={() => onDeleteStep(step.id)}
            ><i class="fas fa-trash" aria-hidden="true"></i></IconButton
          >
        </div>
      </div>

      {#if isOpen(step.id) && body}
        <div class="manager-recipe-steps-editor">
          {@render body(step, index)}
        </div>
      {/if}
    </li>
  {/each}

  {#if footer}{@render footer()}{/if}
</ul>

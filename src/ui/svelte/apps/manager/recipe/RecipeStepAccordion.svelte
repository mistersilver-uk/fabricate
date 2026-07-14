<!-- Svelte 5 runes mode -->
<!--
  Shared expandable/collapsible step accordion. Renders the recipe's ordered steps
  as a list of rows; each row's header carries the order pip, the name/description
  toggle, the time summary chip, and a delete button, while the expanded
  body is supplied by the caller via the `body` snippet. An optional `footer`
  snippet (e.g. an "add step" row) lets the Overview surface add steps.

  Reordering is OVERVIEW-ONLY: pass `reorderable` to turn the header into a drag
  handle wired to `onReorderSteps`. The Ingredients / Results / Tools tabs render
  the same ordered steps WITHOUT drag (order is set in Overview) but keep the chips
  and delete button so a step can be removed from any tab. Deleting a step removes
  the whole step (its ingredients, results, and tools), so the parent confirms.

  Accordion (`expandedStepId`) + drag (`dragIndex`) state are local so they survive
  the store refresh that follows every persisted edit (rows are keyed by step.id).

  When `onUpdateStep` is supplied (the Overview Steps card) the header's time chip
  becomes an editable duration trigger (RecipeDurationEditor) that patches
  `step.timeRequirement`; otherwise (the requirement tabs) it stays a read-only chip.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { formatTimeRequirement } from '../../../util/recipeDuration.js';
  import RecipeDurationEditor from './RecipeDurationEditor.svelte';

  let {
    steps = [],
    reorderable = false,
    onReorderSteps = () => {},
    onDeleteStep = () => {},
    onUpdateStep = null,
    body,
    footer
  } = $props();

  let expandedStepId = $state('');
  let dragIndex = $state(-1);

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
      class={`manager-recipe-steps-row ${expandedStepId === step.id ? 'is-expanded' : ''}`}
      data-recipe-step-id={step.id}
      ondragover={reorderable ? (event) => event.preventDefault() : undefined}
      ondrop={reorderable ? (event) => { event.preventDefault(); handleDrop(index); } : undefined}
    >
      <!-- Overview only: the header is the drag handle, so a grab inside the expanded
           body inputs selects text instead of starting a drag. Drag is a mouse-only
           enhancement; the keyboard-accessible control is the nested role="button". -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="manager-recipe-steps-row-head"
        draggable={reorderable ? 'true' : undefined}
        ondragstart={reorderable ? () => { dragIndex = index; } : undefined}
        ondragend={reorderable ? () => { dragIndex = -1; } : undefined}
      >
        <span class={`manager-environment-comp-handle ${reorderable ? '' : 'is-static'}`} title={reorderable ? text('FABRICATE.Admin.Manager.Recipe.DragStep', 'Drag to reorder') : undefined}>
          {#if reorderable}<i class="fas fa-grip-vertical" aria-hidden="true"></i>{/if}
          <span class="manager-environment-comp-order">{index + 1}</span>
        </span>
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
            <span class="manager-environment-comp-sub">{stepDescription(step) || text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoDescription', 'No description')}</span>
          </span>
          <i class={`fas manager-recipe-steps-chevron ${expandedStepId === step.id ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
        </div>
        <div class="manager-recipe-steps-requirements">
          {#if onUpdateStep}
            <RecipeDurationEditor
              timeRequirement={step.timeRequirement || null}
              onChange={(next) => onUpdateStep(step.id, { timeRequirement: next })}
            />
          {:else}
            <span class={`manager-chip ${step.timeRequirement ? '' : 'is-empty'}`} data-recipe-step-time={step.id}>
              <i class="fa-solid fa-clock" aria-hidden="true"></i>
              <span>{step.timeRequirement ? formatTimeRequirement(step.timeRequirement) : text('FABRICATE.Admin.Manager.Recipe.Instantaneous', 'Instantaneous')}</span>
            </span>
          {/if}
        </div>
        <div class="manager-recipe-steps-row-controls">
          <button type="button" class="manager-icon-button is-danger" data-recipe-step-delete={step.id} aria-label={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')} title={text('FABRICATE.Admin.Manager.Recipe.DeleteStep', 'Delete step')} onclick={() => onDeleteStep(step.id)}><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>
      </div>

      {#if expandedStepId === step.id && body}
        <div class="manager-recipe-steps-editor">
          {@render body(step, index)}
        </div>
      {/if}
    </li>
  {/each}

  {#if footer}{@render footer()}{/if}
</ul>

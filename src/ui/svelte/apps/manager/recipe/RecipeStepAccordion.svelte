<!-- Svelte 5 runes mode -->
<!--
  Shared expandable/collapsible, drag-to-reorder step accordion. Renders the
  recipe's ordered steps as a list of rows; each row's header is the drag handle +
  order pip + name/description toggle, and the expanded body is supplied by the
  caller via the `body` snippet. Optional `headerExtra` (e.g. requirement pips +
  delete) and `footer` (e.g. an "add step" row) snippets let each surface
  (Overview steps card, Ingredients tab, Results tab) tailor the chrome while
  sharing one accordion + reorder implementation.

  All three surfaces pass the SAME `onReorderSteps`, which reorders the single
  `recipe.steps` array — so dragging a step in Results performs the corresponding
  move in Ingredients (and Overview), keeping every per-step view in sync.

  Accordion (`expandedStepId`) + drag (`dragIndex`) state are local so they survive
  the store refresh that follows every persisted edit (rows are keyed by step.id).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    steps = [],
    onReorderSteps = () => {},
    headerExtra,
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
      ondragover={(event) => event.preventDefault()}
      ondrop={(event) => { event.preventDefault(); handleDrop(index); }}
    >
      <!-- Only the header is draggable, so a grab inside the expanded body inputs
           selects text instead of starting a drag. -->
      <div
        class="manager-recipe-steps-row-head"
        draggable="true"
        ondragstart={() => { dragIndex = index; }}
        ondragend={() => { dragIndex = -1; }}
      >
        <span class="manager-environment-comp-handle" title={text('FABRICATE.Admin.Manager.Recipe.DragStep', 'Drag to reorder')}>
          <i class="fas fa-grip-vertical" aria-hidden="true"></i>
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
        {#if headerExtra}{@render headerExtra(step, index)}{/if}
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

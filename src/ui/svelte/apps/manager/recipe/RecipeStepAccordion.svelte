<!-- Svelte 5 runes mode -->
<!--
  Shared expandable/collapsible step accordion. Renders the recipe's ordered steps
  as a list of rows; each row's header carries the order pip, the name/description
  toggle, the time/currency summary chips, and a delete button, while the expanded
  body is supplied by the caller via the `body` snippet. An optional `footer`
  snippet (e.g. an "add step" row) lets the Overview surface add steps.

  Reordering is OVERVIEW-ONLY: pass `reorderable` to turn the header into a drag
  handle wired to `onReorderSteps`. The Ingredients / Results / Tools tabs render
  the same ordered steps WITHOUT drag (order is set in Overview) but keep the chips
  and delete button so a step can be removed from any tab. Deleting a step removes
  the whole step (its ingredients, results, and tools), so the parent confirms.

  Accordion (`expandedStepId`) + drag (`dragIndex`) state are local so they survive
  the store refresh that follows every persisted edit (rows are keyed by step.id).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    steps = [],
    currencyUnits = [],
    reorderable = false,
    onReorderSteps = () => {},
    onDeleteStep = () => {},
    body,
    footer
  } = $props();

  let expandedStepId = $state('');
  let dragIndex = $state(-1);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TIME_UNITS = ['years', 'months', 'days', 'hours', 'minutes'];

  function stepName(step, index) {
    return step?.name || `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`;
  }

  function stepDescription(step) {
    return String(step?.description || '').trim();
  }

  // Resolve currency unit display from the system's currency units (mirrors
  // SystemEditView): fall back to the abbreviation/id, then the generic coins icon.
  function currencyUnit(unitId) {
    return (currencyUnits || []).find(entry => entry.id === unitId) || null;
  }
  function currencyUnitLabel(unitId) {
    const unit = currencyUnit(unitId);
    return unit?.label || unit?.abbreviation || unitId;
  }
  function currencyUnitIcon(unitId) {
    return currencyUnit(unitId)?.icon || 'fa-solid fa-coins';
  }

  // Compact "2 hours 30 minutes" string from the non-zero fields of a time requirement.
  function formatTimeRequirement(time) {
    if (!time || typeof time !== 'object') return '';
    const parts = [];
    for (const unit of TIME_UNITS) {
      const value = Number(time[unit] || 0);
      if (value > 0) parts.push(`${value} ${text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit)}`);
    }
    return parts.join(' ');
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
           body inputs selects text instead of starting a drag. -->
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
          <span class={`manager-chip ${step.timeRequirement ? '' : 'is-empty'}`} data-recipe-step-time={step.id}>
            <i class="fa-solid fa-clock" aria-hidden="true"></i>
            <span>{step.timeRequirement ? formatTimeRequirement(step.timeRequirement) : text('FABRICATE.Admin.Manager.Recipe.Instantaneous', 'Instantaneous')}</span>
          </span>
          <span class={`manager-chip ${step.currencyRequirement ? '' : 'is-empty'}`} data-recipe-step-currency={step.id}>
            <i class={step.currencyRequirement ? currencyUnitIcon(step.currencyRequirement.unit) : 'fa-solid fa-coins'} aria-hidden="true"></i>
            <span>{step.currencyRequirement ? `${step.currencyRequirement.amount} ${currencyUnitLabel(step.currencyRequirement.unit)}` : text('FABRICATE.Admin.Manager.Recipe.NoCost', 'No cost')}</span>
          </span>
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

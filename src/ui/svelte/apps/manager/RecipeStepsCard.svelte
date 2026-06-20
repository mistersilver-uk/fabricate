<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RecipeStepAccordion from './recipe/RecipeStepAccordion.svelte';
  import RecipeToolsSection from './recipe/RecipeToolsSection.svelte';

  let {
    steps = [],
    currencyUnits = [],
    toolsLibrary = [],
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  // Per-step tool add/remove routes through the existing onUpdateStep with a
  // freshly computed array. Append the chosen tool id string directly; remove
  // filters it out. Ingredients/results live in the dedicated tabs now.
  function stepToolIds(step) {
    return Array.isArray(step?.toolIds) ? step.toolIds : [];
  }
  function addStepTool(step, toolId) {
    if (!toolId || stepToolIds(step).includes(toolId)) return;
    onUpdateStep(step.id, { toolIds: [...stepToolIds(step), toolId] });
  }
  function removeStepTool(step, toolId) {
    onUpdateStep(step.id, { toolIds: stepToolIds(step).filter(id => id !== toolId) });
  }

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TIME_UNITS = ['years', 'months', 'days', 'hours', 'minutes'];

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
</script>

<section class="manager-task-core-card manager-recipe-steps" data-recipe-section="steps">
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.Steps', 'Steps')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.StepsHint', 'Order the named steps used to craft this recipe. Drag to reorder.')}</p>
    </div>
  </div>

  <RecipeStepAccordion {steps} {onReorderSteps}>
    {#snippet headerExtra(step)}
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
    {/snippet}

    {#snippet body(step)}
      <label class="manager-field">
        <span>{text('FABRICATE.Admin.Manager.Recipe.Name', 'Name')}</span>
        <input
          type="text"
          data-recipe-step-field="name"
          value={step.name || ''}
          onchange={(event) => onUpdateStep(step.id, { name: event.currentTarget.value })}
        />
      </label>
      <label class="manager-field">
        <span>{text('FABRICATE.Admin.Manager.Recipe.Description', 'Description')}</span>
        <textarea
          data-recipe-step-field="description"
          value={step.description || ''}
          onchange={(event) => onUpdateStep(step.id, { description: event.currentTarget.value })}
        ></textarea>
      </label>
      <RecipeToolsSection
        idPrefix={`step-${step.id}-`}
        toolIds={stepToolIds(step)}
        {toolsLibrary}
        onAddTool={(toolId) => addStepTool(step, toolId)}
        onRemoveTool={(toolId) => removeStepTool(step, toolId)}
      />
    {/snippet}

    {#snippet footer()}
      <li class="manager-recipe-steps-add">
        <button type="button" class="manager-button" data-recipe-step-add onclick={() => onAddStep()}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AddStep', 'Add a step')}</span>
        </button>
      </li>
    {/snippet}
  </RecipeStepAccordion>
</section>

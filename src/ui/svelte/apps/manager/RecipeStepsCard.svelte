<!-- Svelte 5 runes mode -->
<!--
  Overview "Step durations" card: the single drag-to-reorder surface for a
  multi-step recipe. Each step's header shows its editable duration control (the
  smoke-pinned `[data-recipe-duration-trigger]`) and a delete button (both owned by
  RecipeStepAccordion); the expanded body carries the always-visible inline
  five-column duration steppers (prototype §5.1) plus the step's name and
  description. Order and identity are set here; a step's ingredients, results, and
  tools are authored on their own tabs.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RecipeStepAccordion from './recipe/RecipeStepAccordion.svelte';
  import RecipeDurationSteppers from './recipe/RecipeDurationSteppers.svelte';

  let {
    steps = [],
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<section class="manager-recipe-steps-card manager-recipe-steps" data-recipe-section="steps">
  <div class="manager-recipe-steps-card-head">
    <div>
      <h3 class="manager-recipe-section-title">{text('FABRICATE.Admin.Manager.Recipe.StepDurations', 'Step durations')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.StepDurationsHint', 'Each step takes its own time; they craft in sequence. Set the ingredients per step on the Ingredients tab.')}</p>
    </div>
  </div>

  <RecipeStepAccordion {steps} reorderable {onReorderSteps} {onUpdateStep} {onDeleteStep}>
    {#snippet body(step)}
      <div class="manager-recipe-step-durations">
        <RecipeDurationSteppers
          timeRequirement={step.timeRequirement || null}
          showLabel={false}
          onChange={(next) => onUpdateStep(step.id, { timeRequirement: next })}
        />
      </div>
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

<!-- Svelte 5 runes mode -->
<!--
  Overview "Steps" card: the single drag-to-reorder surface for a multi-step
  recipe. Each step's header shows its editable duration control and a delete
  button (both owned by RecipeStepAccordion); the expanded body edits only the
  step's name and description. Order and identity are set here; a step's
  ingredients, results, and tools are authored on their own tabs.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import RecipeStepAccordion from './recipe/RecipeStepAccordion.svelte';

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

<section class="manager-task-core-card manager-recipe-steps" data-recipe-section="steps">
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.Steps', 'Steps')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.StepsHint', 'Order the named steps used to craft this recipe. Drag to reorder.')}</p>
    </div>
  </div>

  <RecipeStepAccordion {steps} reorderable {onReorderSteps} {onUpdateStep} {onDeleteStep}>
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

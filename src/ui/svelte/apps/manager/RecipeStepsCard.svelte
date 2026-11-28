<!-- Svelte 5 runes mode -->
<!--
  Overview "Step durations" card: the single drag-to-reorder surface for a
  multi-step recipe. Each step's header shows its editable duration control (the
  smoke-pinned `[data-recipe-duration-trigger]`) and a delete button (both owned by
  RecipeStepAccordion); the expanded body carries the always-visible inline
  five-column duration steppers (prototype §5.1) plus the step's name and
  description. Order and identity are set here; a step's ingredients, results, and
  tools are authored on their own tabs.

  Under `iterative` the card is "Steps": every step stays open with its iterative configuration
  after the description, its header counts its issues, and while the system's multi-step feature is
  off a warning says the recipe cannot be started and "Add a step" is withheld.
-->
<script>
  import Callout from '../../components/Callout.svelte';
  import Field from '../../components/Field.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { fill } from '../../../../utils/fillPlaceholders.js';
  import RecipeStepAccordion from './recipe/RecipeStepAccordion.svelte';
  import RecipeDurationSteppers from './recipe/RecipeDurationSteppers.svelte';
  import IterativeStepConfig from './recipe/iterative/IterativeStepConfig.svelte';
  import IterativeStepIssueChip from './recipe/iterative/IterativeStepIssueChip.svelte';
  import Button from '../../components/Button.svelte';

  let {
    steps = [],
    // Whether the system applies time requirements (issue 714). When off, the
    // per-step duration editors (accordion trigger + expanded steppers) are hidden.
    timeRequirementsEnabled = true,
    // The iterative route model in an iterative system, else `null`; `recipe` is the staged draft.
    iterative = null,
    recipe = null,
    multiStepEnabled = true,
    removable = true,
    disabled = false,
    onOpenCraftingSettings = () => {},
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const issues = $derived(iterative ? (iterative.recipeIssues?.(recipe) ?? []) : []);
  const multiStepOff = $derived(Boolean(iterative) && !multiStepEnabled);
  const stepName = (step, index) =>
    step?.name || `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`;
</script>

{#snippet stepIssues(step, index)}
  <IterativeStepIssueChip {issues} {index} stepName={stepName(step, index)} {text} />
{/snippet}

<InspectorCard class="manager-recipe-steps-card manager-recipe-steps" data-recipe-section="steps">
  {#snippet title()}{iterative
      ? text('FABRICATE.Admin.Manager.Recipe.Iterative.StepsHeading', 'Steps')
      : text('FABRICATE.Admin.Manager.Recipe.StepDurations', 'Step durations')}{/snippet}
  {#snippet note()}{iterative
      ? text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.StepsHint',
          'Steps are worked in order. Each ends by its own success and failure rules.'
        )
      : text(
          'FABRICATE.Admin.Manager.Recipe.StepDurationsHint',
          'Each step takes its own time; they craft in sequence. Set the ingredients per step on the Ingredients tab.'
        )}{/snippet}

  {#if multiStepOff}
    <Callout
      tone="warning"
      text={fill(
        text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.MultiStepOff',
          'Multi-step recipes are turned off in {system}, so this recipe can’t be started. Turn them back on in Crafting Settings, or collapse it to one step.'
        ),
        { system: iterative.systemName ?? '' }
      )}
      data-recipe-steps-multistep-off
    >
      {#snippet actions()}
        <Button
          role="ghost"
          data-recipe-steps-open-settings
          onclick={() => onOpenCraftingSettings()}
        >
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.Recipe.Iterative.OpenCraftingSettings',
              'Crafting Settings'
            )}</span
          >
        </Button>
      {/snippet}
    </Callout>
  {/if}

  <RecipeStepAccordion
    {steps}
    reorderable
    alwaysOpen={Boolean(iterative)}
    {removable}
    rowMeta={iterative ? stepIssues : undefined}
    {timeRequirementsEnabled}
    {onReorderSteps}
    {onUpdateStep}
    {onDeleteStep}
    footer={multiStepOff ? undefined : footer}
  >
    {#snippet body(step, index)}
      <!-- A caller-owned wrapper inside the list's body (issue 1512): the body element is the
           primitive's, and a rule keyed on it behind this card's class would put an application
           root in front of a class the primitive writes. -->
      <div class="manager-recipe-steps-editor">
        {#if timeRequirementsEnabled}
          <div class="manager-recipe-step-durations">
            <RecipeDurationSteppers
              timeRequirement={step.timeRequirement || null}
              showLabel={false}
              onChange={(next) => onUpdateStep(step.id, { timeRequirement: next })}
            />
          </div>
        {/if}
        <Field as="label">
          <span>{text('FABRICATE.Admin.Manager.Recipe.Name', 'Name')}</span>
          <input
            type="text"
            data-recipe-step-field="name"
            value={step.name || ''}
            onchange={(event) => onUpdateStep(step.id, { name: event.currentTarget.value })}
          />
        </Field>
        <Field as="label">
          <span>{text('FABRICATE.Admin.Manager.Recipe.Description', 'Description')}</span>
          <textarea
            data-recipe-step-field="description"
            value={step.description || ''}
            onchange={(event) => onUpdateStep(step.id, { description: event.currentTarget.value })}
          ></textarea>
        </Field>
        {#if iterative}
          <IterativeStepConfig
            config={step.iterative ?? null}
            instances={recipe?.iterative?.counters ?? []}
            {iterative}
            multi
            stepNumber={index + 1}
            {disabled}
            {text}
            onChange={(next) => onUpdateStep(step.id, { iterative: next })}
          />
        {/if}
      </div>
    {/snippet}
  </RecipeStepAccordion>
</InspectorCard>

{#snippet footer()}
  <li class="manager-recipe-steps-add">
    <Button role="dashed" fullWidth data-recipe-step-add onclick={() => onAddStep()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddStep', 'Add a step')}</span>
    </Button>
  </li>
{/snippet}

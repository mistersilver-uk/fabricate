<!-- Svelte 5 runes mode -->
<!--
  The recipe Overview's iterative sections, after the step-mode card: the recipe's Counter
  Instances, which carry on across every step, and for a single step "Working the recipe", its
  `Recipe.iterative.step` configuration.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `recipe` | the staged draft | `null` | |
  | `iterative` | the iterative route model | — | the selected system's library and routes |
  | `isMultiStep` | boolean | `false` | whether the recipe has explicit steps |
  | `disabled` | boolean | `false` | while saving: every Counters control, and the step card's as `IterativeStepConfig` states |

  Callbacks:
  - `onUpdateRecipe(patch)` — a staged draft patch.
-->
<script>
  import { localizeOr as text } from '../../../../util/localizeOr.js';
  import InspectorCard from '../../../../components/InspectorCard.svelte';
  import IterativeCountersCard from './IterativeCountersCard.svelte';
  import IterativeStepConfig from './IterativeStepConfig.svelte';

  let {
    recipe = null,
    iterative,
    isMultiStep = false,
    disabled = false,
    onUpdateRecipe = () => {},
  } = $props();

  function writeStep(step) {
    onUpdateRecipe({ iterative: { ...(recipe?.iterative ?? { counters: [] }), step } });
  }
</script>

<IterativeCountersCard {recipe} {iterative} {isMultiStep} {disabled} {text} {onUpdateRecipe} />

{#if !isMultiStep}
  <InspectorCard class="manager-recipe-steps-card" data-recipe-section="iterative-step">
    {#snippet title()}{text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.WorkingHeading',
        'Working the recipe'
      )}{/snippet}
    {#snippet note()}{text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.WorkingHint',
        'What players can do, and when it ends.'
      )}{/snippet}
    <IterativeStepConfig
      config={recipe?.iterative?.step ?? null}
      instances={recipe?.iterative?.counters ?? []}
      {iterative}
      {disabled}
      {text}
      onChange={writeStep}
    />
  </InspectorCard>
{/if}

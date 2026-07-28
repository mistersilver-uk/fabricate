<!-- Svelte 5 runes mode -->
<!--
  SimpleRecipeBody renders a simple-mode recipe: ingredient set selector, the
  (optional) crafting check, the material IO table (Have/Need/Missing + outputs),
  the last-roll result, and the craft button. All shared composition lives in
  RecipeBodyShell; this body only supplies the IO results region.
-->
<script>
  import RecipeBodyShell from './RecipeBodyShell.svelte';
  import IoTable from './IoTable.svelte';
  import StepRequirementsList from './StepRequirementsList.svelte';

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    onChoose = null,
    onChooseOption = null,
    // Per-step requirement projection (issue 765). Present only for an explicit
    // multi-step `simple` recipe; [] otherwise. Forwarded from RecipeDetail's BODIES
    // dispatcher — a prop that skips it silently drops to [] and no step blocks render.
    steps = [],
    // The requirement rail's interaction state (issue 917), spread straight onto
    // IoTable: which chooser is open, whether the rail is inert, and the callbacks
    // back to the store. One cohesive value rather than eight props threaded through
    // four bodies. `{}` renders a read-only rail with no chooser.
    rail = {},
    // The step the engine would execute for this actor's run, so a multi-step body
    // makes only THAT step's rail interactive.
    activeStepId = null
  } = $props();

  // An explicit multi-step recipe (more than one step) swaps the single IoTable for
  // the ordered per-step requirement list plus ONE terminal PRODUCES row. A single-step
  // recipe (or a non-multi-step model with steps === []) renders unchanged.
  const isMultiStep = $derived(Array.isArray(steps) && steps.length > 1);
</script>

<div data-recipe-mode="simple">
  <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
    {#snippet results()}
      {#if isMultiStep}
        <StepRequirementsList {steps} {rail} {activeStepId} activeCraftability={craftability} />
        <!-- The single emphasized final product (terminal step). craftability={null}
             so IoTable emits only the Output group. -->
        <IoTable craftability={null} result={recipe?.result} idPrefix="fabricate-req-result" />
      {:else}
        <IoTable {craftability} result={recipe?.result} {onChooseOption} {...rail} />
      {/if}
    {/snippet}
  </RecipeBodyShell>
</div>

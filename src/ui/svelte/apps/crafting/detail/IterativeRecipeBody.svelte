<!-- Svelte 5 runes mode -->
<!--
  IterativeRecipeBody renders an iterative recipe's two faces (issue 3011). Before a workpiece
  exists it is the shared recipe body, with the requirement table and a goal strip of what the recipe
  succeeds on, fails on and produces. While the actor holds a workpiece of it, the body is one strip
  stating its step, its visible counters and its next session: the work itself is the Journal's, so
  the pane shows no material shortfall and no second start.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import InfoStrip from '../../../components/InfoStrip.svelte';
  import RecipeBodyShell from './RecipeBodyShell.svelte';
  import IoTable from './IoTable.svelte';

  const K = Object.freeze({
    goal: 'FABRICATE.App.Crafting.Iterative.Goal',
    succeeds: 'FABRICATE.App.Crafting.Iterative.SucceedsWhen',
    fails: 'FABRICATE.App.Crafting.Iterative.FailsWhen',
    produces: 'FABRICATE.App.Crafting.Iterative.Produces',
    inProgress: 'FABRICATE.App.Crafting.Iterative.InProgress',
    stepNamed: 'FABRICATE.App.Crafting.Iterative.StepNamed',
    stepNumbered: 'FABRICATE.App.Crafting.Iterative.StepNumbered',
    nextSession: 'FABRICATE.App.Crafting.Iterative.NextSession',
  });

  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
    rollResult = null,
    onChoose = null,
    onChooseOption = null,
    // The requirement rail's interaction state (issue 917), spread straight onto IoTable.
    rail = {},
  } = $props();

  const goal = $derived(recipe?.iterative?.goal ?? null);
  const workpiece = $derived(recipe?.iterative?.workpiece ?? null);

  const goalFacts = $derived(
    [
      ['succeeds', 'fas fa-flag-checkered', goal?.succeeds],
      ['fails', 'fas fa-heart-crack', goal?.fails],
      ['produces', 'fas fa-cube', goal?.produces],
    ]
      .filter(([, , value]) => Boolean(value))
      .map(([id, icon, value]) => ({
        icon,
        label: localize(K[id]),
        value,
        props: { 'data-iterative-goal': id },
      }))
  );

  // "Step 2, Draw out the edge" on a multi-step recipe, else the step's own name.
  const stepText = $derived.by(() => {
    if (!workpiece) return '';
    const index = workpiece.stepIndex + 1;
    if (!workpiece.stepName) return localize(K.stepNumbered, { index });
    return workpiece.stepCount > 1
      ? localize(K.stepNamed, { index, name: workpiece.stepName })
      : workpiece.stepName;
  });
  const workpieceFacts = $derived([
    ...(workpiece?.counters ?? []).map((counter) => ({
      label: counter.label,
      value: String(counter.value),
      props: { 'data-iterative-counter': counter.counterId },
    })),
    ...(workpiece?.nextSession == null
      ? []
      : [
          {
            icon: 'fas fa-arrows-rotate',
            label: localize(K.nextSession),
            value: String(workpiece.nextSession),
            props: { 'data-iterative-next-session': '' },
          },
        ]),
  ]);
</script>

<div data-recipe-mode="iterative" data-iterative-face={workpiece ? 'workpiece' : 'goal'}>
  {#if workpiece}
    <InfoStrip
      label={localize(K.inProgress, { step: stepText })}
      facts={workpieceFacts}
      data-iterative-workpiece={workpiece.runId}
    />
  {:else}
    <RecipeBodyShell {recipe} {selectedSetId} {rollResult} {onChoose}>
      {#snippet results()}
        <IoTable {craftability} result={null} {onChooseOption} {...rail} />
        {#if goalFacts.length > 0}
          <InfoStrip ariaLabel={localize(K.goal)} facts={goalFacts} data-iterative-goal-strip="" />
        {/if}
      {/snippet}
    </RecipeBodyShell>
  {/if}
</div>

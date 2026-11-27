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
    inProgressBare: 'FABRICATE.App.Crafting.Iterative.InProgressBare',
    stepNamed: 'FABRICATE.App.Crafting.Iterative.StepNamed',
    stepNumbered: 'FABRICATE.App.Crafting.Iterative.StepNumbered',
    sessionNext: 'FABRICATE.App.Journal.Iterative.Meta.SessionNext',
  });

  // `rollResult` is not read: an iterative recipe's outcome is the Journal's, in either face.
  let {
    recipe = null,
    selectedSetId = null,
    craftability = null,
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

  // "In progress: Step 2, Draw out the edge" on a multi-step recipe, else the step's own name;
  // an unnamed single step is "In progress" alone, since there is no other step to number it against.
  const kicker = $derived.by(() => {
    if (!workpiece) return '';
    const index = workpiece.stepIndex + 1;
    const multiStep = workpiece.stepCount > 1;
    if (!workpiece.stepName && !multiStep) return localize(K.inProgressBare);
    let step = workpiece.stepName;
    if (!step) step = localize(K.stepNumbered, { index });
    else if (multiStep) step = localize(K.stepNamed, { index, name: workpiece.stepName });
    return localize(K.inProgress, { step });
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
            value: localize(K.sessionNext, { session: workpiece.nextSession }),
            props: { 'data-iterative-next-session': '' },
          },
        ]),
  ]);
</script>

<div data-recipe-mode="iterative" data-iterative-face={workpiece ? 'workpiece' : 'goal'}>
  {#if workpiece}
    <InfoStrip label={kicker} facts={workpieceFacts} data-iterative-workpiece={workpiece.runId} />
  {:else}
    <RecipeBodyShell {recipe} {selectedSetId} rollResult={null} {onChoose}>
      {#snippet results()}
        <IoTable {craftability} result={null} {onChooseOption} {...rail} />
        {#if goalFacts.length > 0}
          <InfoStrip ariaLabel={localize(K.goal)} facts={goalFacts} data-iterative-goal-strip="" />
        {/if}
      {/snippet}
    </RecipeBodyShell>
  {/if}
</div>

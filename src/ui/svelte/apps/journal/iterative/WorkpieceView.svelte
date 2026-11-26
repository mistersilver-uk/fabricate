<!-- Svelte 5 runes mode -->
<!-- The Workpiece view (issue 3011, D-5): an active iterative run's per-step progress, its step
     browser, the viewed step's card (the live workpiece, or a frozen past or future step) and its
     Sessions. Browsing is this view's own and never changes the step being worked. After a press
     settles, focus goes where `journal.iterative.focusTarget` names. -->
<script>
  import { tick, untrack } from 'svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { withRollPromptOrigin } from '../../../util/rollPromptOrigin.js';
  import RunProgress from '../../../components/RunProgress.svelte';
  import StageCard from '../../../components/StageCard.svelte';
  import StageNav from '../../../components/StageNav.svelte';
  import SessionsTable from './SessionsTable.svelte';
  import WorkpieceStep from './WorkpieceStep.svelte';
  import { focusSettled } from './workpieceFocus.js';
  import { frozenFacts, frozenIo, frozenNote, stepHeading, stepView } from './workpieceStepCard.js';

  const K = Object.freeze({
    progress: 'FABRICATE.App.Journal.Progress.Label',
    open: 'FABRICATE.App.Journal.Iterative.Nav.Open',
    previous: 'FABRICATE.App.Journal.Iterative.Nav.Previous',
    next: 'FABRICATE.App.Journal.Iterative.Nav.Next',
    position: 'FABRICATE.App.Journal.Iterative.Nav.Position',
    return: 'FABRICATE.App.Journal.Iterative.Nav.Return',
  });

  /** `runKey` is the journal's key for `run`, the one its busy and pressed state name. */
  let { run, runKey = '', journal = null, services = null } = $props();

  const iterative = $derived(run.iterative);
  const stages = $derived(iterative.progress?.stages ?? []);
  const focus = $derived(iterative.focusStepIndex ?? 0);
  const single = $derived(stages.length <= 1);
  const scope = $derived(`${runKey}:${focus}`);
  let browse = $state({ scope: '', index: null });
  const viewed = $derived(browse.scope === scope && browse.index !== null ? browse.index : focus);
  const view = $derived(stepView(focus, viewed));
  const stage = $derived(stages[viewed] ?? null);
  const runStep = $derived(run.steps?.[viewed] ?? null);
  const heading = $derived(stepHeading(stage, view, localize));
  const pressed = $derived(journal?.iterative?.pressed ?? null);
  const saving = $derived(pressed?.runKey === runKey);
  const anyBusy = $derived(Boolean(journal?.busyRunKey));

  let root = $state(null);
  let lastSerial = untrack(() => journal?.iterative?.settled?.serial ?? 0);
  $effect(() => {
    const settled = journal?.iterative?.settled;
    if (!settled || settled.serial === lastSerial) return;
    lastSerial = settled.serial;
    if (settled.runKey !== runKey) return;
    const target = untrack(() => journal.iterative.focusTarget(run, settled.actionId));
    tick().then(() => focusSettled(root?.closest('[data-journal-detail]'), target));
  });

  function cardState(card) {
    if (saving && pressed.actionId === card.actionId) return 'busy';
    return card.enabled && !anyBusy ? 'ready' : 'disabled';
  }

  function press(actionId, event) {
    return withRollPromptOrigin(event, () => journal?.iterative?.takeAction?.(run, actionId));
  }
</script>

{#snippet live()}
  <WorkpieceStep {iterative} {saving} {services} {cardState} onPress={press} />
{/snippet}

<div class="journal-workpiece" bind:this={root}>
  <RunProgress
    {stages}
    current={focus}
    progress={iterative.progress?.percent ?? 0}
    note={iterative.progress?.note ?? ''}
    label={localize(K.progress)}
  />
  {#if !single && !iterative.redacted}
    <StageNav
      {stages}
      current={focus}
      view={viewed}
      onView={(index) => (browse = { scope, index })}
      stageLabel={(entry, index) => localize(K.open, { index: index + 1, name: entry?.name ?? '' })}
      previousLabel={localize(K.previous)}
      nextLabel={localize(K.next)}
      positionLabel={(index, count) => localize(K.position, { index: index + 1, count })}
      returnLabel={(index) => localize(K.return, { index: index + 1 })}
    />
  {/if}
  {#if stage}
    <div data-iterative-step-card={viewed} data-iterative-step-view={view}>
      <StageCard
        stage={{
          status: stage.status,
          name: iterative.redacted || single ? '' : stage.name,
          summary: iterative.redacted ? '' : heading.sub,
        }}
        index={viewed}
        current={view === 'live'}
        state={stage.status === 'failed' ? 'failed' : view === 'live' ? 'current' : view}
        tag={iterative.redacted ? null : heading.tag}
        showHeading={!iterative.redacted}
        showNumber={!single}
        body={view === 'live' ? live : null}
        facts={view === 'live'
          ? []
          : frozenFacts({ stage, runStep, view, heading, localize })}
        io={view === 'live' ? [] : frozenIo({ stage, runStep, view, localize })}
        note={view === 'live' ? '' : frozenNote(view, localize)}
      />
    </div>
  {/if}
  <SessionsTable
    sessions={iterative.sessions ?? []}
    compacted={iterative.compactedCount ?? 0}
    {scope}
    isOtherWindow={(row) => journal?.iterative?.isOtherWindow?.(run, row) === true}
  />
</div>

<style>
  .journal-workpiece {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }
</style>

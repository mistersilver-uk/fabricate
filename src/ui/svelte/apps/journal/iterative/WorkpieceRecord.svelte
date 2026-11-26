<!-- Svelte 5 runes mode -->
<!-- A closed iterative run's record (issue 3011, D-13): its final counters as this viewer may see
     them, the Sessions of the step it closed on, and inert per-step bars, a failed step's full and
     in danger. It draws no browser, action card or route strip: the archive is never rebuilt. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Kicker from '../../../components/Kicker.svelte';
  import RunProgress from '../../../components/RunProgress.svelte';
  import CounterCard from './CounterCard.svelte';
  import SessionsTable from './SessionsTable.svelte';

  const K = Object.freeze({
    kicker: 'FABRICATE.App.Journal.Iterative.Workpiece.Kicker',
    progress: 'FABRICATE.App.Journal.Progress.Label',
  });

  /** `runKey` names the run, so the table's page belongs to it alone. */
  let { iterative, runKey = '' } = $props();

  const stages = $derived(iterative.progress?.stages ?? []);
  const focus = $derived(iterative.focusStepIndex ?? 0);
  const counters = $derived(iterative.counters ?? []);
  const sessions = $derived(iterative.sessions ?? []);
  const compacted = $derived(iterative.compactedCount ?? 0);
  const hidden = $derived(iterative.meta?.hidden ?? '');
</script>

<div class="workpiece-record" data-iterative-record="">
  {#if counters.length > 0 || hidden}
    <section class="workpiece-record-section">
      <div class="workpiece-record-heading">
        <Kicker as="span">{localize(K.kicker)}</Kicker>
        {#if hidden}<span class="workpiece-record-caption">{hidden}</span>{/if}
      </div>
      <div class="workpiece-record-counters">
        {#each counters as counter (counter.counterId)}<CounterCard {counter} />{/each}
      </div>
    </section>
  {/if}
  {#if sessions.length > 0 || compacted > 0}
    <SessionsTable {sessions} {compacted} scope={`${runKey}:${focus}`} />
  {/if}
  <RunProgress
    {stages}
    current={focus}
    progress={stages[focus]?.status === 'failed' ? 100 : 0}
    label={localize(K.progress)}
  />
</div>

<style>
  .workpiece-record,
  .workpiece-record-section {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }
  .workpiece-record-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--fab-space-2);
  }
  .workpiece-record-caption {
    font-size: 10.5px;
    color: var(--fab-text-muted);
  }
  .workpiece-record-counters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--fab-space-2);
  }
</style>

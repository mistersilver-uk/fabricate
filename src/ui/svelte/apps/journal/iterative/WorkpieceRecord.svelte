<!-- Svelte 5 runes mode -->
<!-- A closed iterative run's record (issue 3011, D-13): its final counters as this viewer may see
     them, the Sessions of the step it closed on, and inert per-step bars, a failed step's full and
     in danger. It draws no browser, action card or route strip: the archive is never rebuilt. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RunProgress from '../../../components/RunProgress.svelte';
  import CounterSection from './CounterSection.svelte';
  import SessionsTable from './SessionsTable.svelte';

  const K = Object.freeze({
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
    <CounterSection {counters} caption={hidden} />
  {/if}
  {#if sessions.length > 0 || compacted > 0}
    <SessionsTable {sessions} {compacted} scope={`${runKey}:${focus}`} />
  {/if}
  <!-- A record keeps no goal (`goal` is null once closed), and a partial fill could show a hidden
       goal counter's progress, so a failed step's bar is full, in danger. -->
  <RunProgress
    {stages}
    current={focus}
    progress={stages[focus]?.status === 'failed' ? 100 : 0}
    label={localize(K.progress)}
  />
</div>

<style>
  .workpiece-record {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }
</style>

<script>
  import { localize } from '../../util/foundryBridge.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { run = null, services = null } = $props();
  function timestamp(value) {
    if (value == null || !Number.isFinite(Number(value)))
      return localize('FABRICATE.App.Journal.History.NotRecorded');
    return (
      worldTimeLabel(services?.getWorldTimeComponents?.(Number(value)), { localize }) ||
      localize('FABRICATE.App.Journal.History.NotRecorded')
    );
  }
</script>

<InspectorCard data-journal-this-run>
  <Kicker>{localize('FABRICATE.App.Journal.History.ThisRun')}</Kicker>
  <div class="journal-timing-facts">
    <JournalFactRow
      inline
      icon="fa-play"
      label={localize('FABRICATE.App.Journal.About.Started')}
      value={timestamp(run?.startedAt)}
    />
    {#if ['succeeded', 'failed', 'cancelled'].includes(run?.status)}
      <JournalFactRow
        inline
        icon="fa-flag-checkered"
        label={localize('FABRICATE.App.Journal.History.Closed')}
        value={timestamp(run?.finishedAt)}
      />
    {/if}
    {#if run?.pauseState?.pausedAt != null}
      <JournalFactRow
        inline
        icon="fa-pause"
        label={localize('FABRICATE.App.Journal.History.PausedAt')}
        value={timestamp(run.pauseState.pausedAt)}
      />
    {/if}
    {#if Number(run?.pausedDurationSeconds) > 0}
      <JournalFactRow
        inline
        icon="fa-hourglass-half"
        label={localize('FABRICATE.App.Journal.History.PausedFor')}
        value={formatDurationHMS(run.pausedDurationSeconds)}
      />
    {/if}
  </div>
</InspectorCard>

<style>
  .journal-timing-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1) var(--fab-space-4);
    margin-top: var(--fab-space-2);
  }
</style>

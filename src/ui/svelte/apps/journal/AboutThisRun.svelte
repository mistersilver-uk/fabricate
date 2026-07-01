<!-- Svelte 5 runes mode -->
<!--
  AboutThisRun is the right-column metadata card: Started (the run's start instant
  rendered as a world-time label via the services seam + pure worldTimeLabel),
  Run ID, Recipe, and the localized resolution-mode label. Card chrome comes from
  the shared JournalCard; rows use the shared JournalFactRow. Rows with no value
  are omitted.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';
  import JournalCard from './JournalCard.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { run = null, services = null } = $props();

  const startedComponents = $derived(
    Number.isFinite(Number(run?.startedAt))
      ? (services?.getWorldTimeComponents?.(Number(run.startedAt)) ?? null)
      : null
  );
  const startedLabel = $derived(worldTimeLabel(startedComponents, { localize }));
  const runId = $derived(String(run?.id ?? ''));
  const recipe = $derived(String(run?.names?.title ?? ''));
  const mode = $derived(String(run?.resolutionModeLabel ?? ''));
</script>

<JournalCard kind="about" title={localize('FABRICATE.App.Journal.About.Title')}>
  <div class="journal-fact-list">
    {#if startedLabel !== ''}
      <JournalFactRow icon="fa-calendar-day" label={localize('FABRICATE.App.Journal.About.Started')} value={startedLabel} />
    {/if}
    {#if runId !== ''}
      <JournalFactRow icon="fa-hashtag" label={localize('FABRICATE.App.Journal.About.RunId')} value={runId} />
    {/if}
    {#if recipe !== ''}
      <JournalFactRow icon="fa-scroll" label={localize('FABRICATE.App.Journal.About.Recipe')} value={recipe} />
    {/if}
    {#if mode !== ''}
      <JournalFactRow icon="fa-sliders" label={localize('FABRICATE.App.Journal.About.Mode')} value={mode} />
    {/if}
  </div>
</JournalCard>

<style>
  .journal-fact-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
</style>

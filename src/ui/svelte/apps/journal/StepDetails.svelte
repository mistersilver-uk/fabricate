<!-- Svelte 5 runes mode -->
<!--
  StepDetails renders the current crafting/salvage step's requirement facts as
  shared JournalFactRows (icon + muted label + value): the required time
  (formatted from the projection's raw `requiredSeconds`), the primary tool, the
  crafting check, and — when the step failed — the failure copy in the danger
  tone. Card chrome comes from the shared JournalCard. Each row is omitted when
  its value is absent; the whole card is omitted when there are no facts.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import JournalCard from './JournalCard.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { step = null } = $props();

  const detail = $derived(step?.detail ?? null);
  const requiredSeconds = $derived(Number(detail?.requiredSeconds));
  const requiredTime = $derived(
    Number.isFinite(requiredSeconds) && requiredSeconds > 0 ? formatDurationHMS(requiredSeconds) : ''
  );
  const primaryTool = $derived(String(detail?.primaryToolName ?? ''));
  const checkLabel = $derived(String(detail?.checkLabel ?? ''));
  const failureText = $derived(String(detail?.failureText ?? ''));

  const hasAnyFact = $derived(
    requiredTime !== '' || primaryTool !== '' || checkLabel !== '' || failureText !== ''
  );
</script>

{#if hasAnyFact}
  <JournalCard kind="step-details" title={localize('FABRICATE.App.Journal.StepDetails.Title')}>
    <div class="journal-fact-list">
      {#if requiredTime !== ''}
        <JournalFactRow
          icon="fa-clock"
          label={localize('FABRICATE.App.Journal.StepDetails.RequiresTime')}
          value={requiredTime}
        />
      {/if}
      {#if primaryTool !== ''}
        <JournalFactRow
          icon="fa-screwdriver-wrench"
          label={localize('FABRICATE.App.Journal.StepDetails.PrimaryTool')}
          value={primaryTool}
        />
      {/if}
      {#if checkLabel !== ''}
        <JournalFactRow
          icon="fa-dice-d20"
          label={localize('FABRICATE.App.Journal.StepDetails.Check')}
          value={checkLabel}
        />
      {/if}
      {#if failureText !== ''}
        <JournalFactRow
          icon="fa-triangle-exclamation"
          label={localize('FABRICATE.App.Journal.StepDetails.Failure')}
          value={failureText}
          danger
        />
      {/if}
    </div>
  </JournalCard>
{/if}

<style>
  .journal-fact-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
</style>

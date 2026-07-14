<!-- Svelte 5 runes mode -->
<!--
  TimeRemainingBox is the amber callout (mirrors the gathering task-callout idiom)
  shown for a run gated on world time. It resolves the absolute calendar position
  of the gate's `availableAt` through the services seam
  (`getWorldTimeComponents`) and renders it via the pure worldTimeLabel helper as
  "Available at Day N HH:MM", plus a "ready when time has passed" hint. A future
  instant cannot map to the current global time-of-day tag, so worldTimeLabel
  renders the clock form (no phase passed).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';

  // hintKey overrides the "ready once time passes" line; the default suits an
  // auto-resolving run, while a final crafting step passes a "ready to finish" key.
  let {
    availableAt = null,
    services = null,
    hintKey = 'FABRICATE.App.Journal.TimeRemaining.WhenPassed'
  } = $props();

  const components = $derived(
    Number.isFinite(Number(availableAt)) ? (services?.getWorldTimeComponents?.(Number(availableAt)) ?? null) : null
  );
  const whenLabel = $derived(worldTimeLabel(components, { localize }));
</script>

<div class="journal-time-remaining" data-journal-time-remaining>
  <i class="fas fa-hourglass-half" aria-hidden="true"></i>
  <div class="journal-time-remaining-copy">
    {#if whenLabel !== ''}
      <span class="journal-time-remaining-when">
        {localize('FABRICATE.App.Journal.TimeRemaining.AvailableAt', { when: whenLabel })}
      </span>
    {/if}
    <span class="journal-time-remaining-hint">{localize(hintKey)}</span>
  </div>
</div>

<style>
  .journal-time-remaining {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: var(--fab-space-2) var(--fab-space-3);
    border-radius: 8px;
    font-size: 12px;
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    border: 1px solid var(--fab-warning-border);
  }

  .journal-time-remaining i {
    margin-top: 2px;
    font-size: 12px;
  }

  .journal-time-remaining-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .journal-time-remaining-when {
    font-weight: 600;
  }

  .journal-time-remaining-hint {
    color: var(--fab-text-muted);
  }
</style>

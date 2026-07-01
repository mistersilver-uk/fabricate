<!-- Svelte 5 runes mode -->
<!--
  ActionsPanel is the run-type-aware action area in the run detail. Crafting runs
  (manualAdvance: true) get the primary green "Trigger Next Step" button, disabled
  unless the active step's time gate has matured. Readiness is RACE-FREE: it is
  derived from `timeGate.availableAt <= now` (the store's reactive world time),
  NEVER from the run's persisted status field, because the engine flips matured
  runs to inProgress asynchronously off the same world-time hook. Gathering/salvage
  runs
  (manualAdvance: false) auto-resolve, so they show an explanatory line and the
  TimeRemainingBox instead of a button.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import TimeRemainingBox from './TimeRemainingBox.svelte';

  let { run = null, now = 0, services = null } = $props();

  const manualAdvance = $derived(run?.manualAdvance === true);
  const availableAt = $derived(Number(run?.timeGate?.availableAt));
  const hasGate = $derived(Number.isFinite(availableAt));
  // Race-free readiness: an un-armed step (no gate) is actionable now; an armed
  // gate is ready only once world time reaches `availableAt`.
  const ready = $derived(!hasGate || availableAt <= now);
  const busy = $derived(String(services?.journal?.busyRunId ?? '') === String(run?.id ?? '') && run?.id);
  const disabled = $derived(!ready || Boolean(busy));

  function trigger() {
    if (disabled || !run) return;
    services?.journal?.advance?.(run);
  }
</script>

<section class="journal-actions" data-journal-actions data-manual-advance={manualAdvance ? 'true' : 'false'}>
  {#if manualAdvance}
    <button
      type="button"
      class="fabricate-app-primary-button"
      data-journal-trigger
      disabled={disabled}
      onclick={trigger}
    >
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Journal.Actions.TriggerNextStep')}</span>
    </button>
    {#if hasGate && !ready}
      <TimeRemainingBox {availableAt} {services} />
    {:else}
      <p class="journal-actions-hint">{localize('FABRICATE.App.Journal.Actions.TriggerHint')}</p>
    {/if}
  {:else}
    <p class="journal-actions-auto" data-journal-auto-resolve>
      <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Journal.Actions.AutoResolve')}</span>
    </p>
    {#if hasGate}
      <TimeRemainingBox {availableAt} {services} />
    {/if}
  {/if}
</section>

<style>
  .journal-actions {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* Layout-only resets here; the green primary treatment + Foundry button
     height/centering override live in the global .fabricate-app-scoped rule in
     styles/fabricate.css (Foundry's global `button` cannot be overridden from a
     scoped Svelte block reliably). */
  .fabricate-app-primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .journal-actions-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .journal-actions-auto {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .journal-actions-auto i {
    color: var(--fab-text-muted);
  }
</style>

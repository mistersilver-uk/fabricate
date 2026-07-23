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
  // The final step resolves the run, so it has no "next step" to trigger: the
  // button + gate hint switch to completion copy.
  const isFinalStep = $derived(run?.isFinalStep === true);
  const availableAt = $derived(Number(run?.timeGate?.availableAt));
  const hasGate = $derived(Number.isFinite(availableAt));
  // Race-free readiness: an un-armed step (no gate) is actionable now; an armed
  // gate is ready only once world time reaches `availableAt`.
  const ready = $derived(!hasGate || availableAt <= now);
  const busy = $derived(String(services?.journal?.busyRunId ?? '') === String(run?.id ?? '') && run?.id);
  const disabled = $derived(!ready || Boolean(busy));

  // Player self-cancel (issue 848): owner-only, live crafting runs only. The
  // projection sets `canCancel` (owned + non-terminal + discovered) and
  // `refundOnCancel` (the system's default-ON refund policy) so the confirm copy
  // tells the player whether their inputs come back before they commit.
  const canCancel = $derived(run?.canCancel === true);
  const refundOnCancel = $derived(run?.refundOnCancel !== false);
  let confirmingCancel = $state(false);

  function trigger() {
    if (disabled || !run) return;
    services?.journal?.advance?.(run);
  }

  function startCancel() {
    if (busy || !run) return;
    confirmingCancel = true;
  }

  function keepCrafting() {
    confirmingCancel = false;
  }

  function confirmCancel() {
    if (busy || !run) return;
    confirmingCancel = false;
    services?.journal?.cancel?.(run);
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
      <span
        >{localize(
          isFinalStep ? 'FABRICATE.App.Journal.Actions.FinishCrafting' : 'FABRICATE.App.Journal.Actions.TriggerNextStep'
        )}</span
      >
    </button>
    {#if hasGate && !ready}
      <TimeRemainingBox
        {availableAt}
        {services}
        hintKey={isFinalStep ? 'FABRICATE.App.Journal.TimeRemaining.WhenPassedFinal' : undefined}
      />
    {:else}
      <p class="journal-actions-hint">
        {localize(isFinalStep ? 'FABRICATE.App.Journal.Actions.FinishHint' : 'FABRICATE.App.Journal.Actions.TriggerHint')}
      </p>
    {/if}
    {#if canCancel}
      <div class="journal-actions-cancel" data-journal-cancel>
        {#if confirmingCancel}
          <p class="journal-actions-cancel-prompt" data-journal-cancel-prompt>
            {localize('FABRICATE.App.Journal.Actions.CancelConfirm')}
            {localize(
              refundOnCancel
                ? 'FABRICATE.App.Journal.Actions.CancelConfirmRefund'
                : 'FABRICATE.App.Journal.Actions.CancelConfirmForfeit'
            )}
          </p>
          <div class="journal-actions-cancel-row">
            <button
              type="button"
              class="journal-actions-cancel-confirm"
              data-journal-cancel-confirm
              disabled={Boolean(busy)}
              onclick={confirmCancel}
            >
              <i class="fas fa-trash-can" aria-hidden="true"></i>
              <span>{localize('FABRICATE.App.Journal.Actions.CancelConfirmYes')}</span>
            </button>
            <button
              type="button"
              class="journal-actions-cancel-keep"
              data-journal-cancel-keep
              disabled={Boolean(busy)}
              onclick={keepCrafting}
            >
              <span>{localize('FABRICATE.App.Journal.Actions.CancelKeep')}</span>
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="journal-actions-cancel-start"
            data-journal-cancel-start
            disabled={Boolean(busy)}
            onclick={startCancel}
          >
            <i class="fas fa-ban" aria-hidden="true"></i>
            <span>{localize('FABRICATE.App.Journal.Actions.CancelCraft')}</span>
          </button>
        {/if}
      </div>
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

  .journal-actions-cancel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }

  .journal-actions-cancel-prompt {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .journal-actions-cancel-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Foundry's global `button` sets a fixed height/line-height that crops these
     compact text buttons, so reset appearance/height like the other Fabricate
     card buttons (see the EnvironmentCard idiom). */
  .journal-actions-cancel-start,
  .journal-actions-cancel-confirm,
  .journal-actions-cancel-keep {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: auto;
    line-height: normal;
    padding: 6px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .journal-actions-cancel-start:hover:not(:disabled),
  .journal-actions-cancel-keep:hover:not(:disabled) {
    background: var(--fab-surface-raised);
  }

  .journal-actions-cancel-confirm {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  .journal-actions-cancel-confirm:hover:not(:disabled) {
    background: var(--fab-danger);
    color: var(--fab-danger-text);
  }

  .journal-actions-cancel-start:disabled,
  .journal-actions-cancel-confirm:disabled,
  .journal-actions-cancel-keep:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>

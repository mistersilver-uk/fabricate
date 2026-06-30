<!-- Svelte 5 runes mode -->
<!--
  RunCard renders one active run in the left column. It mirrors the gathering
  EnvironmentCard idiom (64px thumb, ellipsised name) but adds a status pill, a
  world-time countdown, and a progress bar.

  Countdown + progress are world-time driven (no wall-clock interval): `now` is
  the store's reactive world time, recomputed on the `updateWorldTime` tick, so
  `formatDurationHMS(availableAt - now)` and the progress fraction update when
  game time advances. Selection is an accent border + success-soft background
  (NOT a box-shadow, which the .fabricate-app focus rule would clear on click) and
  aria-pressed. The card is a role=button with Enter/Space keyboard activation.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import RunStatusPill from './RunStatusPill.svelte';

  const DEFAULT_RUN_IMAGE = 'icons/svg/item-bag.svg';

  let { run = null, selected = false, onSelect = null, now = 0 } = $props();

  const id = $derived(String(run?.id ?? ''));
  const title = $derived(String(run?.names?.title ?? ''));
  const subtitle = $derived(String(run?.names?.subtitle ?? ''));
  const img = $derived(String(run?.img ?? '') || DEFAULT_RUN_IMAGE);
  const status = $derived(String(run?.derivedStatus ?? 'inProgress'));
  const stepLabel = $derived(String(run?.stepLabel ?? ''));

  const availableAt = $derived(Number(run?.timeGate?.availableAt));
  const initiatedAt = $derived(Number(run?.timeGate?.initiatedAt));
  const requiredSeconds = $derived(Number(run?.timeGate?.requiredSeconds));
  const hasGate = $derived(Number.isFinite(availableAt));
  const isReady = $derived(hasGate && availableAt <= now);
  const remaining = $derived(hasGate ? formatDurationHMS(availableAt - now) : '');

  // Progress fraction across the current step's time gate, clamped 0..1. Only
  // meaningful when the gate carries a positive required-seconds budget.
  const progress = $derived.by(() => {
    if (!hasGate || !Number.isFinite(initiatedAt) || !(requiredSeconds > 0)) return null;
    const elapsed = now - initiatedAt;
    return Math.max(0, Math.min(1, elapsed / requiredSeconds));
  });
  const progressPercent = $derived(progress === null ? 0 : Math.round(progress * 100));

  function activate() {
    if (id) onSelect?.(id);
  }
  function onKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="journal-run-card"
  class:is-selected={selected}
  role="button"
  tabindex="0"
  data-run-id={id}
  data-run-type={run?.runType ?? ''}
  data-run-status={status}
  data-selected={selected ? 'true' : 'false'}
  aria-pressed={selected}
  onclick={activate}
  onkeydown={onKey}
>
  <div class="journal-run-card-main">
    <img class="journal-run-card-thumb" src={img} alt="" />
    <div class="journal-run-card-copy">
      <span class="journal-run-card-name" title={title}>{title}</span>
      {#if subtitle !== ''}
        <span class="journal-run-card-subtitle">{subtitle}</span>
      {/if}
      <div class="journal-run-card-meta">
        <RunStatusPill {status} />
        {#if stepLabel !== ''}
          <span class="journal-run-card-step">{stepLabel}</span>
        {/if}
      </div>
    </div>
  </div>

  {#if hasGate}
    <div class="journal-run-card-countdown" data-run-countdown>
      <i class="fas fa-clock" aria-hidden="true"></i>
      {#if isReady}
        <span>{localize('FABRICATE.App.Journal.Countdown.ReadyToContinue')}</span>
      {:else}
        <span>{localize('FABRICATE.App.Journal.Countdown.Remaining', { time: remaining })}</span>
      {/if}
    </div>
    {#if progress !== null}
      <div
        class="journal-run-card-progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progressPercent}
        data-run-progress={progressPercent}
      >
        <span class="journal-run-card-progress-fill" style={`width: ${progressPercent}%`}></span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .journal-run-card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .journal-run-card:not(.is-selected):hover {
    background: var(--fab-surface-raised);
  }

  /* Selection is an accent border outline + success-soft fill (not a box-shadow,
     which the global .fabricate-app focus rule clears on mouse-click focus). */
  .journal-run-card.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .journal-run-card-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .journal-run-card-thumb {
    display: block;
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .journal-run-card-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .journal-run-card-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .journal-run-card-subtitle {
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .journal-run-card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .journal-run-card-step {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .journal-run-card-countdown {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .journal-run-card-countdown i {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .journal-run-card-progress {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--fab-surface-raised);
  }

  .journal-run-card-progress-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-accent);
  }
</style>

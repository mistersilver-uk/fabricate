<!-- Svelte 5 runes mode -->
<!--
  SuccessChanceBar renders the static drop-rate approximation a gathering task
  listing carries in `task.successChance` (a 0–1 fraction). It is a meter showing
  the chance at least one drop rolls — NOT whole-attempt success — so it is only
  present for d100 tasks; the engine sends `null` otherwise and this component
  renders nothing.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { value = null } = $props();

  const pct = $derived(Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100));
  const label = $derived(localize('FABRICATE.App.Gathering.Detail.SuccessChance', { x: pct }));
</script>

{#if value != null}
  <div
    class="success-bar"
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={pct}
    aria-label={label}
    title={label}
    data-gathering-success-value={pct}
  >
    <span class="success-bar-caption">{localize('FABRICATE.App.Gathering.Detail.SuccessChanceLabel')}</span>
    <span class="success-bar-track">
      <span class="success-bar-fill" style={`width: ${pct}%`}></span>
    </span>
    <span class="success-bar-percent">{pct}%</span>
  </div>
{/if}

<style>
  .success-bar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 88px;
  }

  .success-bar-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .success-bar-track {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    overflow: hidden;
  }

  .success-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-success);
  }

  .success-bar-percent {
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }
</style>

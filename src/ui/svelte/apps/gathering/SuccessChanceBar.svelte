<!-- Svelte 5 runes mode -->
<!--
  SuccessChanceBar renders the static drop-rate approximation a gathering task
  listing carries in `task.successChance` (a 0–1 fraction). It is a meter showing
  the chance at least one drop rolls — NOT whole-attempt success — so it is only
  present for d100 tasks; the engine sends `null` otherwise and this component
  renders nothing.

  The percent reads in-line at the END of the bar. `showCaption` (default true)
  toggles the small caption above the track so the bar can render compactly when
  placed beside another control (e.g. the inspector Attempt button).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { value = null, showCaption = true } = $props();

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
    {#if showCaption}
      <span class="success-bar-caption">{localize('FABRICATE.App.Gathering.Detail.SuccessChanceLabel')}</span>
    {/if}
    <span class="success-bar-row">
      <span class="success-bar-track">
        <span class="success-bar-fill" style={`width: ${pct}%`}></span>
      </span>
      <span class="success-bar-percent">{pct}%</span>
    </span>
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

  .success-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .success-bar-track {
    position: relative;
    flex: 1 1 auto;
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
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }
</style>

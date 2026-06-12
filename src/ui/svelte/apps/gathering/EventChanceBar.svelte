<!-- Svelte 5 runes mode -->
<!--
  HazardChanceBar renders an environment's static "chance of encountering a
  hazard" (`environment.hazardChance`, a 0–1 fraction) as a meter. Unlike the
  success bar, the scale is REVERSED: a high chance is bad, so the fill colour
  runs Red -> Amber -> Yellow -> Green as the chance falls (red = most hazardous).

  The colour is chosen in tiers (>=75 red, >=50 amber, >=25 yellow, else green)
  using the same risk colour-mix idiom as the danger pip. The percent reads
  in-line at the END of the bar. The parent decides whether to render this bar at
  all (it is hidden, and a "safe" hint shown, when the chance is zero), but the
  component also no-ops on a null value.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { value = null, showCaption = true } = $props();

  const pct = $derived(Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100));
  const tier = $derived(
    pct >= 75 ? 'red'
      : pct >= 50 ? 'amber'
        : pct >= 25 ? 'yellow'
          : 'green'
  );
  const label = $derived(localize('FABRICATE.App.Gathering.Detail.HazardChance', { x: pct }));
</script>

{#if value != null}
  <div
    class={`hazard-bar tier-${tier}`}
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={pct}
    aria-label={label}
    title={label}
    data-gathering-hazard-value={pct}
    data-gathering-hazard-tier={tier}
  >
    {#if showCaption}
      <span class="hazard-bar-caption">{localize('FABRICATE.App.Gathering.Detail.HazardChanceLabel')}</span>
    {/if}
    <span class="hazard-bar-row">
      <span class="hazard-bar-track">
        <span class="hazard-bar-fill" style={`width: ${pct}%`}></span>
      </span>
      <span class="hazard-bar-percent">{pct}%</span>
    </span>
  </div>
{/if}

<style>
  .hazard-bar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 88px;
  }

  .hazard-bar-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .hazard-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hazard-bar-track {
    position: relative;
    flex: 1 1 auto;
    height: 8px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    overflow: hidden;
  }

  .hazard-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-success);
  }

  /* Reversed Red -> Amber -> Yellow -> Green scale (high chance = red), mirroring
     the danger-pip colour mix. */
  .hazard-bar.tier-red .hazard-bar-fill {
    background: var(--fab-danger);
  }

  .hazard-bar.tier-amber .hazard-bar-fill {
    background: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);
  }

  .hazard-bar.tier-yellow .hazard-bar-fill {
    background: var(--fab-warning);
  }

  .hazard-bar.tier-green .hazard-bar-fill {
    background: var(--fab-success);
  }

  .hazard-bar-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }
</style>

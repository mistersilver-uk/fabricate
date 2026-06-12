<!-- Svelte 5 runes mode -->
<!--
  EventChanceBar renders an environment's static "chance of encountering a
  event" (`environment.eventChance`, a 0–1 fraction) as a meter. Unlike the
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
  const label = $derived(localize('FABRICATE.App.Gathering.Detail.EventChance', { x: pct }));
</script>

{#if value != null}
  <div
    class={`event-bar tier-${tier}`}
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={pct}
    aria-label={label}
    title={label}
    data-gathering-event-value={pct}
    data-gathering-event-tier={tier}
  >
    {#if showCaption}
      <span class="event-bar-caption">{localize('FABRICATE.App.Gathering.Detail.EventChanceLabel')}</span>
    {/if}
    <span class="event-bar-row">
      <span class="event-bar-track">
        <span class="event-bar-fill" style={`width: ${pct}%`}></span>
      </span>
      <span class="event-bar-percent">{pct}%</span>
    </span>
  </div>
{/if}

<style>
  .event-bar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 88px;
  }

  .event-bar-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .event-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .event-bar-track {
    position: relative;
    flex: 1 1 auto;
    height: 8px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    overflow: hidden;
  }

  .event-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-success);
  }

  /* Reversed Red -> Amber -> Yellow -> Green scale (high chance = red), mirroring
     the danger-pip colour mix. */
  .event-bar.tier-red .event-bar-fill {
    background: var(--fab-danger);
  }

  .event-bar.tier-amber .event-bar-fill {
    background: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);
  }

  .event-bar.tier-yellow .event-bar-fill {
    background: var(--fab-warning);
  }

  .event-bar.tier-green .event-bar-fill {
    background: var(--fab-success);
  }

  .event-bar-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }
</style>

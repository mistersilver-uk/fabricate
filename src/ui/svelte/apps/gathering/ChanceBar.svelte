<!-- Svelte 5 runes mode -->
<!--
  ChanceBar renders a 0–1 fraction as a labelled meter, in one of two scales:

  - `scale="success"` (default) — the static drop-rate approximation a gathering
    task listing carries in `task.successChance`. It shows the chance at least one
    drop rolls (NOT whole-attempt success), so it is only present for d100 tasks;
    the engine sends `null` otherwise and this component renders nothing. Fill is
    a flat green.
  - `scale="event"` — an environment's static "chance of encountering an event"
    (`environment.eventChance`). Here the scale is REVERSED: a high chance is bad,
    so the fill colour runs Red -> Amber -> Yellow -> Green as the chance falls
    (red = most hazardous), chosen in tiers (>=75 red, >=50 amber, >=25 yellow,
    else green) using the same risk colour-mix idiom as the danger pip.

  The percent reads in-line at the END of the bar. `showCaption` (default true)
  toggles the small caption above the track so the bar can render compactly when
  placed beside another control. The parent decides whether to render this bar at
  all; the component also no-ops on a null value.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent } from '../../util/gatheringFormat.js';

  let { value = null, showCaption = true, scale = 'success' } = $props();

  const pct = $derived(toPercent(value));
  const tier = $derived(
    pct >= 75 ? 'red'
      : pct >= 50 ? 'amber'
        : pct >= 25 ? 'yellow'
          : 'green'
  );
  const label = $derived(
    scale === 'event'
      ? localize('FABRICATE.App.Gathering.Detail.EventChance', { x: pct })
      : localize('FABRICATE.App.Gathering.Detail.SuccessChance', { x: pct })
  );
</script>

{#if value != null}
  {#if scale === 'event'}
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
  {:else}
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

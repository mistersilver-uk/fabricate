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

  Both scales share one markup tree and one `chance-bar` style family; the scale
  only varies the i18n keys, the value/tier data-attributes, and (for `event`) a
  `tier-*` modifier on the root that recolours the fill. The percent reads in-line
  at the END of the bar. `showCaption` (default true) toggles the small caption
  above the track so the bar can render compactly when placed beside another
  control. The parent decides whether to render this bar at all; the component
  also no-ops on a null value.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent } from '../../util/gatheringFormat.js';

  let { value = null, showCaption = true, scale = 'success' } = $props();

  const isEvent = $derived(scale === 'event');
  const pct = $derived(toPercent(value));
  const tier = $derived(
    pct >= 75 ? 'red'
      : pct >= 50 ? 'amber'
        : pct >= 25 ? 'yellow'
          : 'green'
  );
  // Only the event scale recolours the fill by tier; the success scale stays a
  // flat green (the base .chance-bar-fill rule).
  const rootClass = $derived(isEvent ? `chance-bar tier-${tier}` : 'chance-bar');
  const captionKey = $derived(
    isEvent
      ? 'FABRICATE.App.Gathering.Detail.EventChanceLabel'
      : 'FABRICATE.App.Gathering.Detail.SuccessChanceLabel'
  );
  const label = $derived(
    isEvent
      ? localize('FABRICATE.App.Gathering.Detail.EventChance', { x: pct })
      : localize('FABRICATE.App.Gathering.Detail.SuccessChance', { x: pct })
  );
  // Scale-specific value hooks, preserved verbatim so existing selectors keep
  // working: the event scale exposes its tier, the success scale does not.
  const meterAttrs = $derived(
    isEvent
      ? { 'data-gathering-event-value': pct, 'data-gathering-event-tier': tier }
      : { 'data-gathering-success-value': pct }
  );
</script>

{#if value != null}
  <div
    class={rootClass}
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={pct}
    aria-label={label}
    title={label}
    {...meterAttrs}
  >
    {#if showCaption}
      <span class="chance-bar-caption">{localize(captionKey)}</span>
    {/if}
    <span class="chance-bar-row">
      <span class="chance-bar-track">
        <span class="chance-bar-fill" style={`width: ${pct}%`}></span>
      </span>
      <span class="chance-bar-percent">{pct}%</span>
    </span>
  </div>
{/if}

<style>
  .chance-bar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 88px;
  }

  .chance-bar-caption {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .chance-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chance-bar-track {
    position: relative;
    flex: 1 1 auto;
    height: 8px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    overflow: hidden;
  }

  .chance-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-success);
  }

  .chance-bar-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  /* Event scale only: reversed Red -> Amber -> Yellow -> Green fill (high chance
     = red), mirroring the danger-pip colour mix. */
  .chance-bar.tier-red .chance-bar-fill {
    background: var(--fab-danger);
  }

  .chance-bar.tier-amber .chance-bar-fill {
    background: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);
  }

  .chance-bar.tier-yellow .chance-bar-fill {
    background: var(--fab-warning);
  }

  .chance-bar.tier-green .chance-bar-fill {
    background: var(--fab-success);
  }
</style>

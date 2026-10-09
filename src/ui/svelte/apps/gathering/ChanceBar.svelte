<!-- Svelte 5 runes mode -->
<!--
  ChanceBar renders a 0–1 fraction as a single-row `BandedBar` meter, in one of two scales:

  - `scale="success"` (default) — the static drop-rate approximation a gathering
    task listing carries in `task.successChance`. It shows the chance at least one
    drop rolls (NOT whole-attempt success), so it is only present for d100 tasks;
    the engine sends `null` otherwise and this component renders nothing. Fill is
    a flat green.
  - `scale="event"` — an environment's static "chance of encountering an event"
    (`environment.eventChance`). Here the scale is REVERSED: a high chance is bad, so the bar
    reads the risk ramp `descending`, whose four tiers `util/dropRateTier.js` owns.

  `showCaption` (default true) toggles the small caption above the track so the bar can
  render compactly when placed beside another control. The parent decides whether to
  render this bar at all; the component also no-ops on a null value.
-->
<script>
  import BandedBar from '../../components/BandedBar.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { hazardTier } from '../../util/dropRateTier.js';
  import { toPercent } from '../../util/gatheringFormat.js';

  let { value = null, showCaption = true, scale = 'success' } = $props();

  const isEvent = $derived(scale === 'event');
  const pct = $derived(toPercent(value));
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
  // The success scale is a flat green; the event scale takes its fill off the risk ramp.
  const rows = $derived([
    {
      name: showCaption ? localize(captionKey) : '',
      percent: pct,
      fill: isEvent ? undefined : 'success',
    },
  ]);
</script>

{#if value != null}
  <BandedBar
    {rows}
    direction={isEvent ? 'descending' : 'ascending'}
    aria-label={label}
    title={label}
    data-gathering-success-value={isEvent ? undefined : pct}
    data-gathering-event-value={isEvent ? pct : undefined}
    data-gathering-event-tier={isEvent ? hazardTier(pct) : undefined}
  />
{/if}

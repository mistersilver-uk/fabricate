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

  Both scales share one markup tree, one meter role and one `chance-bar` style family; the
  scale only varies the i18n keys, the value/tier data-attributes, and (for `event`) which
  fill colour the tier resolves to. The percent reads in-line at the END of the bar.
  `showCaption` (default true) toggles the small caption above the track so the bar can
  render compactly when placed beside another control. The parent decides whether to
  render this bar at all; the component also no-ops on a null value.

  THE TRACK AND FILL ARE NO LONGER HAND-ROLLED (issue 1096). `ui-integration/spec.md`
  §Shared product UI primitives recorded five copies of that shape as a live
  non-conformance and named the fix precisely: a shared `FillBar` leaf that ChanceBar is
  itself REBUILT on, rather than a widened ChanceBar. So the track geometry and the fill
  live in `FillBar` and this component keeps what it actually owns — the meter semantics,
  the caption, the percent readout and the reversed event scale.

  The four event tiers travel through `FillBar`'s `color` prop rather than its semantic
  `tone`, because they are this component's own domain scale (high = bad) and not the
  primitive's success/warning/danger vocabulary; collapsing amber and yellow onto one tone
  would have dropped a shipped visual distinction.

  What the prop carries is ONE custom-property reference — `var(--chance-bar-fill)` — and
  the four tier values are declared by the `tier-*` rules in this component's own scoped
  block, exactly as they were before the conversion. That indirection is deliberate rather
  than incidental: a scoped `<style>` cannot reach into a child component's element, but a
  custom property set on THIS root inherits into it, so the tier colours stay in the
  stylesheet that owns them instead of becoming four CSS strings in a script.
-->
<script>
  import FillBar from '../../components/FillBar.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent } from '../../util/gatheringFormat.js';

  let { value = null, showCaption = true, scale = 'success' } = $props();

  const isEvent = $derived(scale === 'event');
  const pct = $derived(toPercent(value));
  const tier = $derived(pct >= 75 ? 'red' : pct >= 50 ? 'amber' : pct >= 25 ? 'yellow' : 'green');
  // Only the event scale recolours the fill by tier; the success scale stays a
  // flat green (FillBar's `success` tone).
  const rootClass = $derived(isEvent ? `chance-bar tier-${tier}` : 'chance-bar');
  // The tier custom property, which the scoped block below declares a neutral DEFAULT for as
  // well as four tier values — an unset `var()` resolves to the guaranteed-invalid value and
  // `background` then falls back to `transparent`, painting NOTHING, which is
  // indistinguishable from 0% under a caption reading "78%".
  //
  // The fallback lives in the STYLESHEET rather than inline as `var(--x, var(--y))` because
  // that is where the four tier values live: one block owns the whole scale, and a second
  // copy of the last-resort colour in a script is a second place for it to drift. (An earlier
  // note here justified the same choice by claiming happy-dom's parser would discard a nested
  // `var()` and blind the mounted test. That is true of `.style.cssText`, but the assertion
  // below reads `getAttribute('style')`, which happy-dom returns verbatim — so the inline
  // form was never untestable, and the reason it is not used is cohesion, not tooling.)
  const fillColour = $derived(isEvent ? 'var(--chance-bar-fill)' : '');
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
      <FillBar value={pct} color={fillColour} dataAttr="data-chance-bar-track" />
      <span class="chance-bar-percent">{pct}%</span>
    </span>
  </div>
{/if}

<style>
  .chance-bar {
    /* The DEFAULT for the property the FillBar child paints from. Every tier rule below is
       more specific and overrides it; it exists so that a bar whose tier rule somehow did not
       apply still paints a fill rather than nothing at all.

       It is deliberately NEUTRAL, and not `--fab-danger`. This is the fill of LAST RESORT —
       it can only paint when none of the four tier rules matched — so it must not be
       byte-identical to one of them: `var(--fab-danger)` here made an unstyled bar
       indistinguishable from a genuine `tier-red` reading, which is the most alarming thing
       the event scale can say. A subtle neutral says "no tier resolved" instead of naming a
       hazard the value never claimed. */
    --chance-bar-fill: var(--fab-text-subtle);

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

  .chance-bar-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  /* Event scale only: reversed Red -> Amber -> Yellow -> Green fill (high chance
     = red), mirroring the danger-pip colour mix. Each rule sets the inherited custom
     property the FillBar child reads, because a scoped block cannot select that child's
     own element. */
  .chance-bar.tier-red {
    --chance-bar-fill: var(--fab-danger);
  }

  .chance-bar.tier-amber {
    --chance-bar-fill: color-mix(in srgb, var(--fab-danger) 50%, var(--fab-warning) 50%);
  }

  .chance-bar.tier-yellow {
    --chance-bar-fill: var(--fab-warning);
  }

  .chance-bar.tier-green {
    --chance-bar-fill: var(--fab-success);
  }
</style>

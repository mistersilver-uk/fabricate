<!-- Svelte 5 runes mode -->
<!--
  TimeRemainingBox is the amber callout (mirrors the gathering task-callout idiom)
  shown for a run gated on world time. It resolves the absolute calendar position
  of the gate's `availableAt` through the services seam
  (`getWorldTimeComponents`) and renders it via the pure worldTimeLabel helper as
  "Available at Day N HH:MM", plus a "ready when time has passed" hint. A future
  instant cannot map to the current global time-of-day tag, so worldTimeLabel
  renders the clock form (no phase passed).
-->
<script>
  import Callout from '../manager/Callout.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { worldTimeLabel } from '../../util/worldTimeLabel.js';

  // hintKey overrides the "ready once time passes" line; the default suits an
  // auto-resolving run, while a final crafting step passes a "ready to finish" key.
  let {
    availableAt = null,
    services = null,
    now = 0,
    hintKey = 'FABRICATE.App.Journal.TimeRemaining.WhenPassed',
  } = $props();

  const components = $derived(
    Number.isFinite(Number(availableAt))
      ? (services?.getWorldTimeComponents?.(Number(availableAt)) ?? null)
      : null
  );
  const whenLabel = $derived(worldTimeLabel(components, { localize }));
  const waiting = $derived(Number.isFinite(Number(availableAt)) && Number(availableAt) > now);
</script>

<!--
  THE WHOLE BOX IS THE PRIMITIVE'S (issue 1514). Everything this file's scoped block
  declared, `Callout tone="warning"` already draws: the amber edge, fill and glyph, the
  600-weight warning-toned lead line and the muted sentence under it, the flex-start
  alignment and the 2px between the two lines. The rule carried no `margin`, no
  `max-width` and no padding its parent depended on, so the sweep this change applies to
  every converted banner found nothing that had to move to a caller-owned wrapper.

  The gate's ABSOLUTE moment is the `title` and the "ready once time passes" line is the
  `text`, which is the same split the hand-rolled markup drew with a 600-weight span over
  a muted one. When `whenLabel` resolves to '' there is no title, so `Callout` renders its
  unstructured `<p>` form and the hint stands alone — which is what the `{#if}` did.

  The one ADDITION is `role="note"`, which `Callout` emits whenever a title is set
  (`Callout.svelte:122,131`). This box carried no role before.
-->
{#if waiting}
  <Callout
    tone="warning"
    icon="fas fa-hourglass-half"
    title={whenLabel !== ''
      ? localize('FABRICATE.App.Journal.TimeRemaining.AvailableAt', { when: whenLabel })
      : ''}
    text={localize(hintKey)}
    dataAttr="data-journal-time-remaining"
    dataValue=""
  />
{/if}

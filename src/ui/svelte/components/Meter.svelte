<!--
  A value against a maximum, stated and never operated: the `meter` role over the shared fill leaf,
  named by the caller's own head or by a visually hidden label.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` / `max` | number / number | `0` / `100` | The fill is `value / max` to the whole percent, clamped; a `max` of zero or less reads full, because nothing is owed. `aria-valuenow` is the clamped value. |
  | `segments` | `{ value?, tone?, color? }[]` | `[]` | The fill's segments in order, left to right in every writing direction, each painted by `FillBar`'s `tone` and `color`; a `null` entry reads as `{}`. Each but the last spans its `value` up to the fill's end and the last spans the rest, so its `value` is not read. A `value` that is not a finite number of zero or more reads 0, a numeric string and `Infinity` included. A segment spanning 1e-9 or less on the scale of `max` is not drawn, an absolute bound, so a `max` of 1e-9 or less reads every entry as nothing. Fewer than two drawn draw one fill, in the first entry's paint when none spans anything. No segment takes a minimum width. A `segments` that is not an array is a contained fault: the seam logs it and empties the target. |
  | `valueText` | string | `''` | The caller-formatted reading, already localized, announced as `aria-valuetext`. |
  | `label` / `labelId` | string / string | `''` / `''` | Exactly one: `labelId` names the meter by an element the caller renders; `label` renders visually hidden inside it. With neither, no label is drawn and a rest `aria-label` names it. |

  Rest spread:
  - `{...rest}` lands on the meter root, written after `class={…}`.

  Invariants:
  - The track is `FillBar` at `compact` density — pinned by
    `tests/components/instruments-mounted.test.js`.
  - `.fab-meter-hidden` restates the module's visually hidden set, because a companion's
    ancestor is not `.fabricate` — its clip is pinned by
    `tests/components/published-leaves-mounted.test.js`, and the absence of `.visually-hidden` by
    `tests/published-component-manifest.test.js`.
-->
<script>
  import FillBar from './FillBar.svelte';

  /** A span this close to zero is float residue and draws no segment. */
  const RESIDUE = 1e-9;
  const spanOf = (own) => (Number.isFinite(own) && own >= 0 ? own : 0);

  let {
    value = 0,
    max = 100,
    segments = [],
    valueText = '',
    label = '',
    labelId = '',
    class: extraClass = '',
    ...rest
  } = $props();

  const hiddenLabelId = $props.id();

  const ceiling = $derived(Math.max(0, Number(max) || 0));
  const now = $derived(Math.min(ceiling, Math.max(0, Number(value) || 0)));
  const percent = $derived(ceiling > 0 ? Math.round((now / ceiling) * 100) : 100);
  const drawn = $derived.by(() => {
    let left = now;
    return segments.flatMap((entry, index) => {
      const { value: own, tone, color } = entry ?? {};
      const span = index === segments.length - 1 ? left : Math.min(spanOf(own), left);
      left -= span;
      return span > RESIDUE ? [{ weight: span, tone, color }] : [];
    });
  });
  const fill = $derived(drawn.length === 1 ? drawn[0] : (segments[0] ?? {}));
</script>

<span
  class={['fab-meter', extraClass]}
  role="meter"
  aria-valuemin="0"
  aria-valuemax={ceiling}
  aria-valuenow={now}
  aria-valuetext={valueText || undefined}
  aria-labelledby={labelId || (label ? hiddenLabelId : undefined)}
  {...rest}
>
  {#if !labelId && label}<span class="fab-meter-hidden" id={hiddenLabelId}>{label}</span>{/if}
  <FillBar
    value={percent}
    density="compact"
    tone={fill.tone}
    color={fill.color}
    shares={drawn.length > 1 ? drawn : undefined}
  />
</span>

<style>
  .fab-meter {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .fab-meter-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>

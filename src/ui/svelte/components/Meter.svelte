<!--
  A value against a maximum, stated and never operated: the `meter` role over the shared fill leaf,
  named by the caller's own head or by a visually hidden label.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` / `max` | number / number | `0` / `100` | The fill is `value / max` to the whole percent, clamped; a `max` of zero or less reads full, because nothing is owed. `aria-valuenow` is the clamped value. |
  | `segments` | `{ tone?, color? }[]` | `[]` | The ordered fills. The first paints the track through `FillBar`'s `tone` and `color`; `FillBar` draws one fill, so a later entry is not drawn. |
  | `valueText` | string | `''` | The caller-formatted reading, already localized, announced as `aria-valuetext`. |
  | `label` / `labelId` | string / string | `''` / `''` | Exactly one: `labelId` names the meter by an element the caller renders; `label` renders visually hidden inside it. With neither, no label is drawn and a rest `aria-label` names it. |

  Rest spread:
  - `{...rest}` lands on the meter root, written after `class={…}`.

  Invariants:
  - The track is `FillBar` at `compact` density — pinned by
    `tests/components/instruments-mounted.test.js`.
-->
<script>
  import FillBar from './FillBar.svelte';

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
  const fill = $derived(segments[0] ?? {});
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
  {#if !labelId && label}<span class="visually-hidden" id={hiddenLabelId}>{label}</span>{/if}
  <FillBar value={percent} density="compact" tone={fill.tone} color={fill.color} />
</span>

<style>
  .fab-meter {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }
</style>

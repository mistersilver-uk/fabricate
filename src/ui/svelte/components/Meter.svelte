<!--
  A value against a maximum, stated and never operated: the `meter` role over the shared fill leaf,
  named by the caller's own head or by a visually hidden label.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` / `max` | number / number | `0` / `100` | The fill is `value / max` to the whole percent, clamped; a `max` of zero or less reads full, because nothing is owed. `aria-valuenow` is the clamped value. |
  | `segments` | `{ value?, tone?, color? }[]` | `[]` | The fill's segments in order, left to right in every writing direction, each painted by `FillBar`'s `tone`, its tag names included, and `color`; a `null` entry reads as `{}`. Each but the last spans its `value` up to the fill's end and the last spans the rest, so its `value` is not read. A `value` that is not a finite number of zero or more reads 0, a numeric string and `Infinity` included. A segment spanning 1e-9 or less on the scale of `max` is not drawn, an absolute bound, so a `max` of 1e-9 or less reads every entry as nothing. Fewer than two drawn draw one fill, in the first entry's paint when none spans anything. No segment takes a minimum width. A `segments` that is not an array is a contained fault: the seam logs it and empties the target. |
  | `valueText` | string | `''` | The caller-formatted reading, already localized, announced as `aria-valuetext`. |
  | `label` / `labelId` | string / string | `''` / `''` | Exactly one: `labelId` names the meter by an element the caller renders; `label` renders visually hidden inside it. With neither, no label is drawn and a rest `aria-label` names it. |
  | `marks` | `{ value, label, reached? }[]` | `[]` | Unpublished. Each finite `value` in `[0, max]`, with `max` above zero, draws a 2×12px tick over the track and its figure beneath; any other is not drawn. A mark is reached at `reached` when that is a boolean, else at `value` at or below the meter's, and a reached one takes the accent. `label` is the tick's `data-tooltip-text`, and the caller states a reached mark in it and in `valueText`, so colour never carries it alone. `[]` draws what the meter drew before marks. |

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
    marks = [],
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
  const ticks = $derived.by(() => {
    if (!Array.isArray(marks) || ceiling <= 0) return [];
    return marks
      .filter((mark) => Number.isFinite(mark?.value) && mark.value >= 0 && mark.value <= ceiling)
      .map((mark) => ({
        value: mark.value,
        label: typeof mark.label === 'string' ? mark.label : '',
        at: (mark.value / ceiling) * 100,
        reached: typeof mark.reached === 'boolean' ? mark.reached : now >= mark.value,
      }))
      .sort((left, right) => left.value - right.value);
  });
</script>

{#snippet track()}
  <FillBar
    value={percent}
    density="compact"
    tone={fill.tone}
    color={fill.color}
    shares={drawn.length > 1 ? drawn : undefined}
  />
{/snippet}

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
  {#if ticks.length > 0}
    <span class="fab-meter-marked">
      <span class="fab-meter-scale">
        {@render track()}
        {#each ticks as mark, index (index)}
          <span
            class="fab-meter-mark"
            class:is-reached={mark.reached}
            style:left={`${mark.at}%`}
            data-tooltip-text={mark.label || undefined}
          ></span>
        {/each}
      </span>
      <span class="fab-meter-figures" aria-hidden="true">
        {#each ticks as mark, index (index)}
          <span class="fab-meter-figure" class:is-reached={mark.reached} style:left={`${mark.at}%`}
            >{mark.value}</span
          >
        {/each}
      </span>
    </span>
  {:else}
    {@render track()}
  {/if}
</span>

<style>
  .fab-meter {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .fab-meter-marked {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .fab-meter-scale {
    position: relative;
    display: flex;
  }

  .fab-meter-mark {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 12px;
    border-radius: 999px;
    background: var(--fab-text-muted);
    transform: translateX(-50%);
  }

  .fab-meter-figures {
    position: relative;
    height: 12px;
    margin-top: 1px;
  }

  .fab-meter-figure {
    position: absolute;
    top: 0;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    line-height: 12px;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .fab-meter-mark.is-reached {
    background: var(--fab-accent);
  }

  .fab-meter-figure.is-reached {
    color: var(--fab-accent-text);
  }

  @media (forced-colors: active) {
    .fab-meter-mark {
      forced-color-adjust: none;
      background: canvastext;
    }

    .fab-meter-mark.is-reached {
      background: highlight;
    }
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

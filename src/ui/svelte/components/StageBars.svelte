<!--
  One bar per stage, side by side: the progress instrument of a staged run. The row is a named
  `group`, and each bar is a `progressbar` with its own value.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `stages` | `{ name?, label?, valueText?, value }[]` | `[]` | `value` is the stage's fill, 0–100, and the bar announces it as a whole number, truncated, so an unfinished stage never reads 100. `name` is the visible caption and `label` the bar's accessible name, both final text; a bar is named by `label`, else `name`, else, in a one-stage list only, by the group's own name, so an unnamed stage of several has no name and its caller passes `label`. `valueText`, final text, is the bar's `aria-valuetext` in place of its percentage when it is a non-empty string. A stage is keyed by its index, so `id` is private. `[]` draws an empty named group. |
  | `currentIndex` | number | `0` | The stage being worked; its bar takes the accent until it fills and carries `aria-current="step"`. A finished bar reads success and the rest neutral. |
  | `numbered` | boolean | `true` | Draws the caption beneath each bar: its position and its name, in muted ink and the mono face, the position at weight 500. A named caption carries its stage's `name` as its `title`, so a name the ellipsis cuts shows whole under the pointer. |
  | `ariaLabel` / `ariaLabelledBy` | string / string | `''` / `''` | Exactly one names the group; `ariaLabelledBy` where the caller renders the kicker. |

  Rest spread:
  - `{...rest}` lands on the group root, written after `class={…}`.

  Invariants:
  - Choosing the stage on screen is `StageNav`'s, so this renders no control — pinned by
    `tests/components/instruments-mounted.test.js`.
-->
<script>
  import FillBar from './FillBar.svelte';

  let {
    stages = [],
    currentIndex = 0,
    numbered = true,
    ariaLabel = '',
    ariaLabelledBy = '',
    class: extraClass = '',
    ...rest
  } = $props();

  function percentOf(stage) {
    return Math.min(100, Math.max(0, Number(stage?.value) || 0));
  }

  function toneOf(stage, index) {
    if (percentOf(stage) >= 100) return 'success';
    return index === currentIndex ? 'accent' : 'neutral';
  }

  function readingOf(stage) {
    const reading = stage?.valueText;
    return typeof reading === 'string' && reading ? reading : undefined;
  }

  function nameOf(stage) {
    const label = stage?.label || stage?.name;
    if (label) return { label };
    if (stages.length !== 1) return {};
    return ariaLabelledBy ? { by: ariaLabelledBy } : { label: ariaLabel };
  }
</script>

<div
  class={['fab-stage-bars', extraClass]}
  role="group"
  aria-label={ariaLabel || undefined}
  aria-labelledby={ariaLabelledBy || undefined}
  {...rest}
>
  {#each stages as stage, index (index)}
    {@const tone = toneOf(stage, index)}
    {@const name = nameOf(stage)}
    <span class="fab-stage-bars-stage" data-stage-bars-stage={index} data-stage-bars-state={tone}>
      <span
        class="fab-stage-bars-track"
        role="progressbar"
        aria-label={name.label || undefined}
        aria-labelledby={name.by || undefined}
        aria-current={index === currentIndex ? 'step' : undefined}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.floor(percentOf(stage))}
        aria-valuetext={readingOf(stage)}
      >
        <FillBar value={percentOf(stage)} density="compact" {tone} />
      </span>
      {#if numbered}
        <span class="fab-stage-bars-caption" aria-hidden="true" title={stage?.name || undefined}
          ><span class="fab-stage-bars-number">{index + 1}</span> {stage?.name ?? ''}</span
        >
      {/if}
    </span>
  {/each}
</div>

<style>
  .fab-stage-bars {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: var(--fab-space-chip);
  }

  .fab-stage-bars-stage {
    display: grid;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fab-stage-bars-track {
    display: flex;
    height: 6px;
    min-width: 0;
    overflow: hidden;
    border-radius: 999px;
  }

  .fab-stage-bars-caption {
    overflow: hidden;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-stage-bars-number {
    font-weight: 500;
  }
</style>

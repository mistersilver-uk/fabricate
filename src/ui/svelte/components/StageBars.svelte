<!--
  One bar per stage, side by side: the progress instrument of a staged run. The row is a named
  `group`, and each bar is a `progressbar` named by its stage, so an unfilled stage still reads as
  a stage.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `stages` | `{ id?, name?, value }[]` | `[]` | `value` is the stage's fill, 0–100. `name` is already localized; an unnamed stage is announced as "Stage {index} of {count}", and the only stage of a one-stage list takes the group's own name. |
  | `currentIndex` | number | `0` | The stage being worked; its bar takes the accent until it fills and carries `aria-current="step"`. A finished bar reads success and the rest neutral. |
  | `numbered` | boolean | `true` | Draws the caption beneath each bar: its position and its name. |
  | `ariaLabel` / `ariaLabelledBy` | string / string | `''` / `''` | Exactly one names the group; `ariaLabelledBy` where the caller renders the kicker. |

  Rest spread:
  - `{...rest}` lands on the group root, written after `class={…}`.

  Invariants:
  - Choosing the stage on screen is `StageNav`'s, so this renders no control — pinned by
    `tests/components/instruments-mounted.test.js`.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
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

  function nameOf(stage, index) {
    if (stage?.name) return { label: stage.name };
    if (stages.length === 1 && ariaLabelledBy) return { by: ariaLabelledBy };
    if (stages.length === 1 && ariaLabel) return { label: ariaLabel };
    const position = { index: index + 1, count: stages.length };
    return { label: localize('FABRICATE.Common.StageBars.Unnamed', position) };
  }
</script>

<div
  class={['fab-stage-bars', extraClass]}
  role="group"
  aria-label={ariaLabel || undefined}
  aria-labelledby={ariaLabelledBy || undefined}
  {...rest}
>
  {#each stages as stage, index (stage?.id ?? index)}
    {@const tone = toneOf(stage, index)}
    {@const name = nameOf(stage, index)}
    <span class="fab-stage-bars-stage" data-stage-bars-stage={index} data-stage-bars-state={tone}>
      <span
        class="fab-stage-bars-track"
        role="progressbar"
        aria-label={name.label || undefined}
        aria-labelledby={name.by || undefined}
        aria-current={index === currentIndex ? 'step' : undefined}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percentOf(stage)}
      >
        <FillBar value={percentOf(stage)} density="compact" {tone} />
      </span>
      {#if numbered}
        <span class="fab-stage-bars-caption" aria-hidden="true"
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
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-stage-bars-number {
    font-weight: 700;
  }
</style>

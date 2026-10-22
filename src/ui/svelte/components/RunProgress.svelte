<!-- Run progress presents caller-supplied stage and time state without advancing execution: a run
     heading over `StageBars`, which names its group by the kicker when one is drawn and by
     `ariaLabel` otherwise. An unnamed stage of several is labelled "Stage n of m"; a lone one
     takes the group's name. -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import Kicker from './Kicker.svelte';
  import StageBars from './StageBars.svelte';

  let {
    stages = [],
    current = 0,
    progress = 0,
    blocker = '',
    label = '',
    ariaLabel = '',
  } = $props();

  const kickerId = $props.id();

  function stageProgress(stage, index) {
    if (stage?.status === 'done' || stage?.status === 'succeeded' || index < current) return 100;
    if (index === current) return Math.min(100, Math.max(0, Number(progress) || 0));
    return 0;
  }

  function barOf(stage, index) {
    const name = stage?.presentationSnapshot?.name || stage?.stepName || stage?.name || '';
    const bar = { name, value: stageProgress(stage, index) };
    if (name || stages.length === 1) return bar;
    const position = { index: index + 1, count: stages.length };
    return { ...bar, label: localize('FABRICATE.Common.StageBars.Unnamed', position) };
  }

  const bars = $derived(stages.map(barOf));
</script>

<div class="fab-run-progress" data-run-progress>
  {#if label || blocker}
    <div class="fab-run-progress-heading">
      {#if label}<span class="fab-run-progress-label" id={kickerId}
          ><Kicker as="span">{label}</Kicker></span
        >{/if}
      {#if blocker}<span class="fab-run-progress-blocker" data-run-progress-blocker>{blocker}</span
        >{/if}
    </div>
  {/if}
  <StageBars
    stages={bars}
    currentIndex={current}
    numbered={false}
    ariaLabel={label ? '' : ariaLabel}
    ariaLabelledBy={label ? kickerId : ''}
  />
</div>

<style>
  .fab-run-progress {
    display: grid;
    gap: var(--fab-space-2);
  }

  .fab-run-progress-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  /* A zero line-height leaves the label the kicker's own line box. */
  .fab-run-progress-label {
    line-height: 0;
  }

  .fab-run-progress-blocker {
    min-width: 0;
    color: var(--fab-warning-text);
    font-size: 10.5px;
  }
</style>

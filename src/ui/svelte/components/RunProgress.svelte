<!-- Run progress presents caller-supplied stage and time state without advancing execution: a run
     heading over `StageBars`, which names its group by the kicker when one is drawn and by
     `ariaLabel` otherwise. -->
<script>
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

  const bars = $derived(
    stages.map((stage, index) => ({
      id: stage?.id,
      name: stage?.presentationSnapshot?.name || stage?.stepName || stage?.name || '',
      value: stageProgress(stage, index),
    }))
  );
</script>

<div class="fab-run-progress" data-run-progress>
  {#if label || blocker}
    <div class="fab-run-progress-heading">
      {#if label}<span class="fab-run-progress-kicker" id={kickerId}>{label}</span>{/if}
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

  .fab-run-progress-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-run-progress-blocker {
    min-width: 0;
    color: var(--fab-warning-text);
    font-size: 10.5px;
  }
</style>

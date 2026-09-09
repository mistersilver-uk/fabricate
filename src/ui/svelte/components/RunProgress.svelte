<!-- Svelte 5 runes mode -->
<script>
  import FillBar from './FillBar.svelte';

  let { stages = [], current = 0, progress = 0, blocker = '', label = '' } = $props();

  function stageProgress(stage, index) {
    if (stage?.status === 'done' || stage?.status === 'succeeded' || index < current) return 100;
    if (index === current) return Math.min(100, Math.max(0, Number(progress) || 0));
    return 0;
  }

  function stageTone(stage, index) {
    return stageProgress(stage, index) >= 100
      ? 'success'
      : index === current
        ? 'accent'
        : 'neutral';
  }
</script>

<div class="fab-run-progress" data-run-progress>
  {#if label || blocker}
    <div class="fab-run-progress-heading">
      {#if label}<span class="fab-run-progress-kicker">{label}</span>{/if}
      {#if blocker}<span class="fab-run-progress-blocker" data-run-progress-blocker>{blocker}</span
        >{/if}
    </div>
  {/if}
  <div class="fab-run-progress-tracks" aria-hidden="true">
    {#each stages as stage, index (stage?.id ?? index)}
      <span
        class="fab-run-progress-track"
        data-run-progress-track={index}
        data-stage-progress-state={stageTone(stage, index)}
      >
        <FillBar value={stageProgress(stage, index)} size="sm" tone={stageTone(stage, index)} />
      </span>
    {/each}
  </div>
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

  .fab-run-progress-tracks {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: var(--fab-space-1);
  }

  .fab-run-progress-track {
    display: flex;
    height: 6px;
    min-width: 0;
    overflow: hidden;
    border-radius: 999px;
  }
</style>

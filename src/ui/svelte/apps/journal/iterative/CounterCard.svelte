<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the Well, Meter and Chip members, ruled out as a <CounterGauge> member and shared by the live workpiece and its closed record -->
<!-- One counter of the workpiece (issue 3011, D-7): a `Well` named by the counter, its reading in
     mono, a `Meter` against its scale with the route thresholds as marks, and its one caption. A
     GM sees a hidden counter marked "Hidden from players"; a player is never handed one. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import Meter from '../../../components/Meter.svelte';
  import Well from '../../../components/Well.svelte';

  const K = Object.freeze({
    reading: 'FABRICATE.App.Journal.Iterative.Counter.Reading',
    hidden: 'FABRICATE.App.Journal.Iterative.Counter.Hidden',
  });

  let { counter } = $props();

  const scaled = $derived(Number.isFinite(counter?.scale) && counter.scale > 0);
  const reading = $derived(
    scaled
      ? localize(K.reading, { value: counter.value, scale: counter.scale })
      : String(counter?.value ?? '')
  );
</script>

<Well label={counter?.label ?? ''} data-iterative-counter={counter?.counterId}>
  <div class="workpiece-counter">
    <div class="workpiece-counter-head">
      <span class="workpiece-counter-reading">{reading}</span>
      {#if counter?.hidden}<Chip density="row" icon="fas fa-eye-slash">{localize(K.hidden)}</Chip
        >{/if}
    </div>
    {#if scaled}
      <Meter
        value={counter.value}
        max={counter.scale}
        segments={[{ tone: counter.tone ?? 'accent' }]}
        marks={counter.marks ?? []}
        valueText={counter.valueText}
        label={counter.label}
      />
    {/if}
    {#if counter?.caption}<span
        class="workpiece-counter-caption"
        class:is-danger={counter.tone === 'danger'}>{counter.caption}</span
      >{/if}
  </div>
</Well>

<style>
  .workpiece-counter {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }
  .workpiece-counter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }
  .workpiece-counter-reading {
    font-family: var(--fab-font-mono);
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }
  .workpiece-counter-caption {
    font-size: 10.5px;
    color: var(--fab-text-muted);
  }
  .workpiece-counter-caption.is-danger {
    color: var(--fab-danger-text);
  }
</style>

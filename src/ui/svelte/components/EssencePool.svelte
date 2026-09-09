<!-- Svelte 5 runes mode -->
<script>
  import FillBar from './FillBar.svelte';
  import Medallion from './Medallion.svelte';
  import Stepper from './Stepper.svelte';

  let {
    thresholds = [],
    allocation = $bindable({}),
    onStep = () => {},
    yield: contributionYield = () => 0,
    spare = () => 0,
    held = () => 0,
    locked = false,
    essenceLabel = (essence) => essence,
    sourceReading = () => '',
    overshootLabel = () => '',
    allocationLabel = (source) => source?.label ?? '',
    decrementLabel = () => '',
    incrementLabel = () => '',
    label = '',
    hint = '',
  } = $props();

  function safeTint(tint) {
    const key = String(tint || '').replace(/^--fab-tag-/u, '');
    return /^[a-z0-9-]+$/u.test(key) ? key : '';
  }

  const sources = $derived.by(() => {
    const unique = [];
    for (const threshold of thresholds) {
      for (const source of threshold.sources ?? []) {
        const entry = typeof source === 'string' ? { id: source, label: source } : source;
        if (entry?.id && !unique.some((candidate) => candidate.id === entry.id)) unique.push(entry);
      }
    }
    return unique;
  });

  function allocated(sourceId) {
    return Math.max(0, Number(allocation?.[sourceId]) || 0);
  }

  function totalFor(threshold) {
    return sources.reduce(
      (total, source) =>
        total +
        allocated(source.id) *
          Math.max(0, Number(contributionYield(source.id, threshold.essence)) || 0),
      0
    );
  }

  function met(threshold) {
    return totalFor(threshold) >= Math.max(0, Number(threshold.amount) || 0);
  }

  const everyPoolMet = $derived(thresholds.length > 0 && thresholds.every(met));

  function contributionsFor(source) {
    return thresholds
      .map((threshold) => ({
        essence: threshold.essence,
        label: essenceLabel(threshold.essence),
        amount: Math.max(0, Number(contributionYield(source.id, threshold.essence)) || 0),
      }))
      .filter((entry) => entry.amount > 0);
  }

  function step(source, next) {
    onStep(source.id, next - allocated(source.id));
  }

  const overshoots = $derived(
    thresholds
      .map((threshold) => ({
        essence: threshold.essence,
        amount: totalFor(threshold) - Math.max(0, Number(threshold.amount) || 0),
      }))
      .filter((entry) => entry.amount > 0)
  );
</script>

<section class="fab-essence-pool" data-essence-pool>
  {#if label || hint}
    <header class="fab-essence-pool-heading">
      {#if label}<span class="fab-essence-pool-kicker">{label}</span>{/if}
      {#if hint}<span class="fab-essence-pool-hint">{hint}</span>{/if}
    </header>
  {/if}

  <div class="fab-essence-thresholds">
    {#each thresholds as threshold (threshold.essence)}
      {@const got = totalFor(threshold)}
      {@const need = Math.max(0, Number(threshold.amount) || 0)}
      {@const isMet = got >= need}
      {@const tint = safeTint(threshold.tint)}
      <div class="fab-essence-threshold" data-essence-threshold={threshold.essence}>
        <div class="fab-essence-threshold-heading">
          <Medallion icon={threshold.icon || 'fas fa-droplet'} {tint} size={26} glyph={12} />
          <span class="fab-essence-name">{essenceLabel(threshold.essence)}</span>
          <span
            class:is-met={isMet}
            class="fab-essence-total"
            data-essence-total={threshold.essence}>{got} / {need}</span
          >
        </div>
        <div
          class="fab-essence-progress"
          role="progressbar"
          aria-label={essenceLabel(threshold.essence)}
          aria-valuemin="0"
          aria-valuemax={need}
          aria-valuenow={Math.min(got, need)}
        >
          <FillBar
            value={need > 0 ? (got / need) * 100 : 100}
            size="sm"
            tone={isMet ? 'success' : 'neutral'}
            color={!isMet && tint ? `var(--fab-tag-${tint})` : ''}
          />
        </div>
      </div>
    {/each}
  </div>

  <div class="fab-essence-sources" data-essence-sources>
    {#each sources as source (source.id)}
      {@const value = allocated(source.id)}
      {@const available = Math.max(0, Number(spare(source.id)) || 0)}
      {@const maximum = everyPoolMet ? value : value + available}
      <div class="fab-essence-source" data-essence-source={source.id}>
        <Medallion
          art={source.art || ''}
          icon={source.icon || 'fas fa-flask'}
          tint={source.tint || ''}
          alt=""
          size={26}
        />
        <div class="fab-essence-source-copy">
          <span class="fab-essence-source-name">{source.label}</span>
          <span class="fab-essence-source-reading"
            >{sourceReading(source, contributionsFor(source), held(source.id), available)}</span
          >
        </div>
        <Stepper
          {value}
          min={0}
          max={maximum}
          density="comfortable"
          disabled={locked}
          ariaLabel={allocationLabel(source)}
          decrementLabel={decrementLabel(source)}
          incrementLabel={incrementLabel(source)}
          onChange={(next) => step(source, next)}
        />
      </div>
    {/each}
  </div>

  {#if overshoots.length > 0}
    <div class="fab-essence-overshoots" data-essence-overshoot>
      {#each overshoots as overshoot (overshoot.essence)}
        <span>{overshootLabel(essenceLabel(overshoot.essence), overshoot.amount)}</span>
      {/each}
    </div>
  {/if}
</section>

<style>
  .fab-essence-pool {
    display: grid;
    box-sizing: border-box;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .fab-essence-pool-heading,
  .fab-essence-threshold-heading,
  .fab-essence-source {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .fab-essence-pool-heading {
    align-items: baseline;
  }

  .fab-essence-pool-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-essence-pool-hint,
  .fab-essence-overshoots {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  .fab-essence-thresholds,
  .fab-essence-threshold,
  .fab-essence-sources,
  .fab-essence-overshoots {
    display: grid;
    gap: var(--fab-space-1);
  }

  .fab-essence-name,
  .fab-essence-source-name {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
  }

  .fab-essence-total {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-essence-total.is-met {
    color: var(--fab-success-text);
  }

  .fab-essence-progress {
    display: flex;
  }

  .fab-essence-source {
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .fab-essence-source-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 1px;
  }

  .fab-essence-source-reading {
    overflow-wrap: anywhere;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-essence-overshoots {
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }
</style>

<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';

  let {
    stage = {},
    index = 0,
    current = false,
    state = 'future',
    tag = null,
    facts = [],
    body = null,
    showHeading = true,
  } = $props();

  const completed = $derived(state === 'past' || state === 'done' || stage?.status === 'done');
  const paused = $derived(state === 'paused');
</script>

<article
  class="fab-stage-card"
  class:is-current={current}
  class:is-inactive={!current}
  class:is-headingless={!showHeading}
  data-stage-card={index}
  data-stage-state={state}
>
  {#if showHeading}<header class="fab-stage-card-heading">
      <span class="fab-stage-card-number" class:is-complete={completed} class:is-paused={paused}>
        {#if completed}<i class="fas fa-check" aria-hidden="true"></i>
        {:else if paused}<i class="fas fa-pause" aria-hidden="true"></i>
        {:else}{index + 1}{/if}
      </span>
      <span class="fab-stage-card-identity">
        <span class="fab-stage-card-name">{stage.name}</span>
        {#if stage.summary}<span class="fab-stage-card-summary">{stage.summary}</span>{/if}
      </span>
      {#if tag?.label}
        <Chip density="list" tone={tag.tone || (paused ? 'warning' : 'positive')}>{tag.label}</Chip>
      {/if}
    </header>{/if}

  {#if current && body}
    <div class="fab-stage-card-body">{@render body(stage)}</div>
  {:else if !current && facts.length > 0}
    <div class="fab-stage-card-facts">
      {#each facts as fact (fact.id || fact.label)}
        <div class="fab-stage-card-fact">
          {#if fact.icon}<i class={fact.icon} aria-hidden="true"></i>{/if}
          <span>{fact.label}</span>
          <span class="fab-stage-card-fact-value">{fact.value}</span>
        </div>
      {/each}
    </div>
  {/if}
</article>

<style>
  .fab-stage-card {
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .fab-stage-card.is-inactive {
    border: 1px dashed var(--fab-border);
    background: transparent;
  }

  .fab-stage-card-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .fab-stage-card-number {
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-family: var(--fab-font-mono);
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-stage-card.is-inactive .fab-stage-card-number {
    background: var(--fab-surface-active);
    color: var(--fab-text-subtle);
  }

  .fab-stage-card-number.is-complete {
    background: var(--fab-success);
    color: var(--fab-on-accent);
  }

  .fab-stage-card-number.is-paused {
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .fab-stage-card-identity {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 1px;
  }

  .fab-stage-card-name {
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .fab-stage-card-summary {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    overflow-wrap: anywhere;
  }

  .fab-stage-card.is-inactive .fab-stage-card-name {
    color: var(--fab-text-subtle);
  }

  .fab-stage-card-body,
  .fab-stage-card-facts {
    display: grid;
    gap: var(--fab-space-3);
    padding: 0 var(--fab-space-3) var(--fab-space-3) 48px;
  }

  .fab-stage-card-body {
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .fab-stage-card.is-headingless .fab-stage-card-body {
    padding: var(--fab-space-3);
    border-top: 0;
  }

  .fab-stage-card-fact {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-1);
    border-top: 1px solid var(--fab-border);
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  .fab-stage-card-fact-value {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
    overflow-wrap: anywhere;
  }
</style>

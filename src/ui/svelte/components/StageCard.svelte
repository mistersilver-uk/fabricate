<!-- Stage-relative inputs and outputs retain their actual, current or preview meaning. -->
<script>
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';
  import ListRow from './ListRow.svelte';

  let {
    stage = {},
    index = 0,
    current = false,
    state = 'future',
    tag = null,
    facts = [],
    body = null,
    output = null,
    showHeading = true,
    showNumber = true,
    presentation = 'active',
    io = [],
    note = '',
  } = $props();

  const completed = $derived(
    ['succeeded', 'done'].includes(stage?.status) ||
      (stage?.status == null && (state === 'past' || state === 'done'))
  );
  const paused = $derived(state === 'paused');
</script>

<article
  class="fab-stage-card"
  class:is-current={current}
  class:is-inactive={!current && presentation !== 'history'}
  class:is-history={presentation === 'history'}
  class:is-failed={state === 'failed'}
  class:is-headingless={!showHeading}
  data-stage-card={index}
  data-stage-state={state}
>
  {#if showHeading}<header class="fab-stage-card-heading">
      {#if showNumber}<span
          class="fab-stage-card-number"
          class:is-complete={completed}
          class:is-paused={paused}
        >
          {#if presentation === 'history' && state === 'failed'}<i
              class="fas fa-xmark"
              aria-hidden="true"
            ></i>
          {:else if presentation === 'history'}{index + 1}
          {:else if completed}<i class="fas fa-check" aria-hidden="true"></i>
          {:else if paused}<i class="fas fa-pause" aria-hidden="true"></i>
          {:else}{index + 1}{/if}
        </span>{/if}
      <span class="fab-stage-card-identity">
        <span class="fab-stage-card-name">{stage.name}</span>
        {#if stage.summary}<span class="fab-stage-card-summary">{stage.summary}</span>{/if}
      </span>
      {#if tag?.label}
        <Chip density="list" tone={tag.tone || (paused ? 'warning' : 'positive')}>{tag.label}</Chip>
      {/if}
    </header>{/if}

  {#if output}<div class="fab-stage-card-output">{@render output()}</div>{/if}
  {#if io.length > 0}
    <div class="fab-stage-card-io">
      {#each io as group (group.label)}
        <div class="fab-stage-card-io-group" data-stage-io={group.kind}>
          <Kicker>{group.label}</Kicker>
          <div class="fab-stage-card-items">
            {#if group.content}{@render group.content()}{:else}
              {#each group.items ?? [] as item, index (item.id ?? index)}
                <ListRow
                  name={item.name ?? item.label ?? ''}
                  art={item.img ?? item.art ?? ''}
                  icon={item.icon ?? 'fas fa-box'}
                  tint={item.tint ?? ''}
                  quantity={item.quantityText ?? null}
                />
              {:else}<span class="fab-stage-card-summary">{group.emptyText}</span>{/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if current && body}
    <div class="fab-stage-card-body">{@render body(stage)}</div>
  {:else if !current && facts.length > 0}
    <div class="fab-stage-card-facts">
      {#each facts as fact (fact.id || fact.label)}
        <div class="fab-stage-card-fact" data-stage-fact={fact.id}>
          {#if fact.icon}<i class={fact.icon} aria-hidden="true"></i>{/if}
          <span>{fact.label}</span>
          <span class="fab-stage-card-fact-value">{fact.value}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if note}<p class="fab-stage-card-note">{note}</p>{/if}
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
  .fab-stage-card.is-failed {
    border-color: var(--fab-danger-border);
  }
  .fab-stage-card-io {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: var(--fab-space-3);
    padding: 0 var(--fab-space-3) var(--fab-space-3) calc(var(--fab-space-6) * 2);
  }
  .fab-stage-card-io-group {
    display: grid;
    align-content: start;
    gap: var(--fab-space-1);
  }
  .fab-stage-card-output {
    padding: 0 var(--fab-space-3) var(--fab-space-3) calc(var(--fab-space-6) * 2);
  }
  .fab-stage-card-items {
    display: grid;
    width: 100%;
    gap: var(--fab-space-1);
  }
  .fab-stage-card-note {
    margin: 0;
    padding: 0 var(--fab-space-3) var(--fab-space-3) calc(var(--fab-space-6) * 2);
    color: var(--fab-text-subtle);
    font-size: 10.5px;
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
  .fab-stage-card.is-inactive .fab-stage-card-number.is-complete {
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
    padding: 0 var(--fab-space-3) var(--fab-space-3) calc(var(--fab-space-6) * 2);
  }

  .fab-stage-card-body {
    padding-left: var(--fab-space-3);
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

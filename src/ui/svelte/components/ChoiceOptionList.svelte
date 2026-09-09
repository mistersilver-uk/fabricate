<!-- Svelte 5 runes mode -->
<script>
  import Medallion from './Medallion.svelte';

  let {
    slotId = '',
    options = [],
    needed = 1,
    selectedId = '',
    held = () => 0,
    claimed = () => 0,
    onChoose = () => {},
    label = '',
    summary = '',
    candidateReading = () => '',
    emptyText = '',
  } = $props();

  function reading(option) {
    const heldCount = Math.max(0, Number(held(option.id)) || 0);
    const claimedCount = Math.max(0, Number(claimed(option.id)) || 0);
    const spare = Math.max(0, heldCount - claimedCount);
    return candidateReading({ option, held: heldCount, claimed: claimedCount, spare, needed });
  }

  function unavailable(option) {
    const heldCount = Math.max(0, Number(held(option.id)) || 0);
    const claimedCount = Math.max(0, Number(claimed(option.id)) || 0);
    return option.disabled === true || Math.max(0, heldCount - claimedCount) < needed;
  }
</script>

<div class="fab-choice-option-list" data-choice-options={slotId}>
  {#if label || summary}
    <div class="fab-choice-option-heading">
      {#if label}<span class="fab-choice-option-kicker">{label}</span>{/if}
      {#if summary}<span class="fab-choice-option-summary">{summary}</span>{/if}
    </div>
  {/if}
  <div class="fab-choice-option-items" role="group" aria-label={label || undefined}>
    {#each options as option (option.id)}
      <button
        type="button"
        class="fab-choice-option"
        class:is-selected={option.id === selectedId}
        data-choice-id={option.id}
        data-keyboard-focus="true"
        aria-pressed={option.id === selectedId}
        disabled={unavailable(option)}
        title={option.reason || undefined}
        onclick={() => onChoose(slotId, option.id)}
      >
        <Medallion
          art={option.art || ''}
          icon={option.icon || 'fas fa-circle'}
          tint={option.tint || ''}
          alt=""
          size={26}
        />
        <span class="fab-choice-option-copy">
          <span class="fab-choice-option-name">{option.label}</span>
          <span class="fab-choice-option-reading">{reading(option)}</span>
        </span>
        <i
          class={option.id === selectedId ? 'fas fa-circle-check' : 'far fa-circle'}
          aria-hidden="true"
        ></i>
      </button>
    {:else}
      {#if emptyText}<span class="fab-choice-option-empty">{emptyText}</span>{/if}
    {/each}
  </div>
</div>

<style>
  .fab-choice-option-list {
    display: grid;
    gap: var(--fab-space-2);
  }

  .fab-choice-option-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  .fab-choice-option-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-choice-option-summary,
  .fab-choice-option-empty {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  .fab-choice-option-items {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .fab-choice-option {
    display: inline-flex;
    box-sizing: border-box;
    align-items: center;
    height: 44px;
    min-height: 44px;
    gap: var(--fab-space-2);
    padding: 0 var(--fab-space-3) 0 var(--fab-space-1);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
    color: var(--fab-text);
    cursor: pointer;
  }

  .fab-choice-option.is-selected {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-choice-option:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .fab-choice-option-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
    text-align: left;
  }

  .fab-choice-option-name {
    overflow: hidden;
    font-size: 11.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-choice-option-reading {
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-choice-option:disabled .fab-choice-option-reading {
    color: var(--fab-danger-text);
  }

  .fab-choice-option > i {
    color: var(--fab-text-subtle);
    font-size: 12px;
  }

  .fab-choice-option.is-selected > i {
    color: var(--fab-accent);
  }
</style>

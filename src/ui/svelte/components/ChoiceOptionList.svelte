<!-- ratchet-exempt(design-system): promoted on its second importer at issue 1644; its icon chip, hint line and a short candidate's undimmed reading still disagree with the specimen, carried to issue 1523 -->
<!--
  One open slot's candidates: a single-select radiogroup with a roving tab stop, whose arrows,
  Home and End move both focus and the choice, passing `{ via: 'arrow' }` as `onChoose`'s third
  argument so a caller can keep the list open. Stock is caller-owned and choosing consumes none.
  A candidate is disabled only when it is held but the stage claims it elsewhere; one held short
  of the need is dimmed, still offered, and described by its reading. `option.disabled` is the
  caller's own refusal. The rest spread lands on the root.
-->
<script>
  import Kicker from './Kicker.svelte';
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
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();

  function stock(option) {
    const heldCount = Math.max(0, Number(held(option.id)) || 0);
    const claimedCount = Math.max(0, Number(claimed(option.id)) || 0);
    const need = option.needed ?? needed;
    return {
      held: heldCount,
      claimed: claimedCount,
      spare: Math.max(0, heldCount - claimedCount),
      needed: need,
    };
  }

  const rows = $derived(
    options.map((option) => {
      const counts = stock(option);
      const short = counts.held < counts.needed;
      const claimedElsewhere = !short && counts.spare < counts.needed;
      return {
        option,
        short,
        disabled: option.disabled === true || claimedElsewhere,
        reading: candidateReading({ option, ...counts }),
      };
    })
  );

  const offered = $derived(rows.flatMap((row, index) => (row.disabled ? [] : [index])));

  const tabStop = $derived.by(() => {
    const selected = rows.findIndex((row) => row.option.id === selectedId);
    return offered.includes(selected) ? selected : (offered[0] ?? -1);
  });

  // Where a key moves within the offered candidates, or -1 for a key this model ignores.
  function nextOffered(key, index) {
    const at = offered.indexOf(index);
    const last = offered.length - 1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return offered[at >= last ? 0 : at + 1];
    if (key === 'ArrowLeft' || key === 'ArrowUp') return offered[at <= 0 ? last : at - 1];
    if (key === 'Home') return offered[0];
    if (key === 'End') return offered[last];
    return -1;
  }

  function onKeydown(event, index) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onChoose(slotId, rows[index].option.id);
      return;
    }
    const next = offered.length > 0 ? nextOffered(event.key, index) : -1;
    if (next < 0) return;
    event.preventDefault();
    onChoose(slotId, rows[next].option.id, { via: 'arrow' });
    event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next]?.focus();
  }
</script>

<div class={['fab-choice-option-list', extraClass]} data-choice-options={slotId} {...rest}>
  {#if label || summary}
    <div class="fab-choice-option-heading">
      {#if label}<Kicker as="span">{label}</Kicker>{/if}
      {#if summary}<span class="fab-choice-option-summary">{summary}</span>{/if}
    </div>
  {/if}
  <div class="fab-choice-option-items" role="radiogroup" aria-label={label || undefined}>
    {#each rows as row, index (row.option.id)}
      {@const selected = row.option.id === selectedId}
      {@const described = row.short || row.disabled}
      <button
        type="button"
        role="radio"
        class="fab-choice-option"
        class:is-selected={selected}
        class:is-short={row.short && !row.disabled}
        data-choice-id={row.option.id}
        data-keyboard-focus="true"
        aria-checked={selected}
        aria-labelledby={described ? `${uid}-name-${index}` : undefined}
        aria-describedby={described ? `${uid}-reading-${index}` : undefined}
        tabindex={index === tabStop ? 0 : -1}
        disabled={row.disabled}
        title={row.option.reason || undefined}
        onclick={() => onChoose(slotId, row.option.id)}
        onkeydown={(event) => onKeydown(event, index)}
      >
        <Medallion
          art={row.option.art || ''}
          icon={row.option.icon || 'fas fa-circle'}
          tint={row.option.tint || ''}
          alt=""
          size={26}
        />
        <span class="fab-choice-option-copy">
          <span class="fab-choice-option-name" id={`${uid}-name-${index}`}>{row.option.label}</span>
          <span class="fab-choice-option-reading" id={`${uid}-reading-${index}`}>{row.reading}</span
          >
        </span>
        <i class={selected ? 'fas fa-circle-check' : 'far fa-circle'} aria-hidden="true"></i>
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
    max-width: 100%;
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

  /* Dimmed and still offered (design-system spec, "A player chooses the item"); the reading keeps
     full opacity so its danger ink clears 4.5:1 (issue 1523 records the specimen difference). */
  .fab-choice-option.is-short > :global(.fab-medallion),
  .fab-choice-option.is-short .fab-choice-option-name,
  .fab-choice-option:disabled {
    opacity: 0.6;
  }

  .fab-choice-option:disabled {
    cursor: default;
  }

  .fab-choice-option:disabled > :global(.fab-medallion),
  .fab-choice-option:disabled .fab-choice-option-name {
    color: var(--fab-text-disabled);
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

  .fab-choice-option.is-short .fab-choice-option-reading,
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

<!--
  Displays yield rows with recorded outcomes or a shared preview comparison.

  Props:
  | prop | values | default | contract |
  | `rollModel` | `shared`, `perRow`, `unknown` | `shared` | Only explicit shared evidence permits a global cut. |
  | `labels` | callbacks | `{}` | `evidence(entry)` optionally owns field-local recorded text; quantities are caller-formatted. |
  | `order` | `chance`, `authored` | `chance` | `authored` keeps entry order, where rank is authored, and draws no cut. |

  Invariants:
  - Explicit null outcomes remain neutral; row-only evidence never creates a cut.
  - Outside `perRow` each row sets its reading as a sentence under its name, beside a borderless
    26px mark, on one flex line with its quantity and chance (`bodyBasis="fill"`); a `perRow`
    evidence row keeps its dense inline reading.
-->
<script>
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';
  import ListRow from './ListRow.svelte';
  import Medallion from './Medallion.svelte';

  let {
    entries = [],
    roll = null,
    rollModel = 'shared',
    order = 'chance',
    labels = {},
    label = '',
    hint = '',
  } = $props();

  const authored = $derived(order === 'authored');
  const sorted = $derived(
    entries
      .map((entry, index) => ({ ...entry, authoredIndex: index }))
      .sort(
        (left, right) =>
          (authored ? 0 : Number(right.chance) - Number(left.chance)) ||
          left.authoredIndex - right.authoredIndex
      )
  );
  const hasRoll = $derived(
    rollModel === 'shared' && roll !== null && roll !== undefined && Number.isFinite(Number(roll))
  );
  const cutIndex = $derived(hasRoll ? sorted.findIndex((entry) => cleared(entry) === false) : -1);
  const hasCut = $derived(!authored && hasRoll && sorted.every((entry) => cleared(entry) !== null));

  function cleared(entry) {
    if (Object.hasOwn(entry, 'cleared'))
      return typeof entry.cleared === 'boolean' ? entry.cleared : null;
    return hasRoll ? Number(roll) <= Number(entry.chance) : null;
  }

  function reading(entry) {
    if (labels.evidence) return labels.evidence(entry);
    if (cleared(entry) === null) return labels.threshold?.(entry);
    return cleared(entry)
      ? labels.cleared?.(entry, Number(roll))
      : labels.missed?.(entry, Number(roll));
  }

  // A cleared row's success ground drops the neutral ink under 4.5:1, so its pill reads secondary.
  function chanceTone(entry) {
    if (rollModel === 'shared' && !hasRoll && Number(entry.chance) >= 100) return 'positive';
    return rollModel !== 'perRow' && cleared(entry) === true ? 'secondary' : 'neutral';
  }

  function cutNote(index) {
    if (index === 0) return labels.topCutNote?.(Number(roll), sorted) ?? '';
    if (index === sorted.length) return labels.bottomCutNote?.(Number(roll), sorted) ?? '';
    return labels.cutNote?.(Number(roll), sorted) ?? '';
  }
</script>

{#snippet sharedRoll()}
  <Chip density="list" tone="accent" mono icon="fas fa-dice"
    >{labels.cut?.(Number(roll)) ?? String(roll)}</Chip
  >
{/snippet}

<section class="fab-yield-scale" data-yield-scale>
  {#if label || hint}
    <header class="fab-yield-heading">
      {#if label}<Kicker as="span">{label}</Kicker>{/if}
      {#if hint}<span class="fab-yield-hint">{hint}</span>{/if}
    </header>
  {/if}
  {#if hasRoll && !hasCut}
    <span data-yield-shared-roll>{@render sharedRoll()}</span>
  {/if}
  <div class="fab-yield-rows">
    {#each sorted as entry, index (entry.id)}
      {@const outcome = cleared(entry)}
      {@const sentence = reading(entry)}
      {#if hasCut && cutIndex === index}
        <div class="fab-yield-cut" data-yield-cut>
          {@render sharedRoll()}
          <span class="fab-yield-cut-rule"></span>
          <span class="fab-yield-cut-note">{cutNote(index)}</span>
        </div>
      {/if}
      {#snippet chance()}
        <Chip
          density="list"
          emphasis={rollModel === 'perRow' ? '' : 'bare'}
          tone={chanceTone(entry)}
          mono>{labels.chance?.(entry) ?? entry.chance}</Chip
        >
      {/snippet}
      {#snippet mark()}
        <Medallion
          variant="glyph-chip"
          art={entry.art || ''}
          icon={entry.icon || 'fas fa-circle'}
          tint={outcome === false ? '' : entry.tint || ''}
          alt=""
          size={26}
          glyph={11}
        />
      {/snippet}
      {#snippet line()}
        <span class="fab-yield-reading" data-yield-reading>{sentence}</span>
      {/snippet}
      <div
        class="fab-yield-row"
        class:is-cleared={outcome === true}
        class:is-missed={outcome === false}
        data-yield-entry={entry.id}
      >
        {#if rollModel === 'perRow'}
          <ListRow
            name={entry.name}
            art={entry.art || ''}
            icon={entry.icon || 'fas fa-circle'}
            tint={outcome === false ? '' : entry.tint || ''}
            detail={sentence}
            quantity={labels.quantity?.(entry) ?? entry.qty}
            tone={outcome === true ? 'positive' : 'neutral'}
            muted={outcome === false}
            trailing={chance}
          />
        {:else}
          <ListRow
            name={entry.name}
            quantity={labels.quantity?.(entry) ?? entry.qty}
            tone={outcome === true ? 'positive' : 'neutral'}
            muted={outcome === false}
            bodyBasis="fill"
            leading={mark}
            meta={sentence ? line : null}
            trailing={chance}
          />
        {/if}
      </div>
    {/each}
    {#if hasCut && sorted.length > 0 && cutIndex === -1}
      <div class="fab-yield-cut" data-yield-cut>
        {@render sharedRoll()}
        <span class="fab-yield-cut-rule"></span>
        <span class="fab-yield-cut-note">{cutNote(sorted.length)}</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .fab-yield-scale,
  .fab-yield-rows {
    display: grid;
    gap: var(--fab-space-1);
  }

  .fab-yield-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-1);
  }

  .fab-yield-hint {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .fab-yield-cut-note {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
  }

  /* Muted on the row's ground, secondary on a cleared row's success wash (D13). */
  .fab-yield-reading {
    min-width: 0;
    color: var(--fab-text-muted);
    overflow-wrap: anywhere;
  }

  .fab-yield-row.is-cleared .fab-yield-reading {
    color: var(--fab-text-secondary);
  }

  .fab-yield-cut {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) 0;
  }

  .fab-yield-cut-rule {
    height: 1px;
    min-width: 12px;
    flex: 1 1 auto;
    background: var(--fab-accent-border);
  }
</style>

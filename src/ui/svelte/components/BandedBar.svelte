<!--
  Percentages whose whole fill takes one hue from a fixed ramp, never interpolated. One row is a
  chance bar and a `meter`; several rows are a histogram whose tracks are hidden, because each row
  already states its name and its percentage as text.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rows` | `{ id?, name, percent, fill? }[]` | `[]` | `percent` is 0–100 and is printed as given. `fill` is a semantic tone or a ramp key, and anything else paints `neutral`; absent, it is read off the ramp at `percent` in `direction`. A single row's `name` is its visible caption and default accessible name, and an empty one draws no caption. Every row, a single one included, carries `data-banded-bar-row`, `-track` and `-percent` keyed `id ?? index`. |
  | `direction` | `'ascending'` \| `'descending'` | `'ascending'` | `ascending` is the drop-rate ramp (better is rarer); `descending` is the risk scale, the hazard at a high chance. |
  | `density` | `'default'` \| `'compact'` | `'default'` | Forwarded to `FillBar`. At `compact` a single row stays a meter but draws the histogram's band row. |

  Rest spread:
  - `{...rest}` lands on the root, written after `class={…}`; on the single-row meter a rest
    `aria-label` replaces the caption as its name.

  Invariants:
  - Every hue resolves through `util/dropRateTier.js` or `FillBar`'s own tones, so no colour is
    mixed here — pinned by `tests/components/theme-colour-contract.test.js`.
-->
<script>
  import { dropRateRampKey, hazardFill, rampColour } from '../util/dropRateTier.js';
  import FillBar from './FillBar.svelte';
  import Kicker from './Kicker.svelte';

  let {
    rows = [],
    direction = 'ascending',
    density = 'default',
    class: extraClass = '',
    ...rest
  } = $props();

  const single = $derived(rows.length === 1 ? rows[0] : null);

  function fillOf(row) {
    const key =
      row.fill ??
      (direction === 'descending' ? hazardFill(row.percent) : dropRateRampKey(row.percent));
    const colour = rampColour(key);
    return colour ? { tone: undefined, color: colour } : { tone: key, color: undefined };
  }
</script>

{#snippet band(row, key, hidden)}
  {@const fill = fillOf(row)}
  <span class="fab-banded-bar-name">{row.name}</span>
  <FillBar
    value={row.percent}
    {density}
    tone={fill.tone}
    color={fill.color}
    aria-hidden={hidden ? 'true' : undefined}
    data-banded-bar-track={key}
  />
  <span class="fab-banded-bar-percent" data-banded-bar-percent={key}>{row.percent}%</span>
{/snippet}

{#if single}
  {@const key = single.id ?? 0}
  <div
    class={['fab-banded-bar', 'is-single', extraClass]}
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={single.percent}
    aria-label={single.name || undefined}
    {...rest}
  >
    {#if density === 'compact'}
      <span class="fab-banded-bar-band" data-banded-bar-row={key}>
        {@render band(single, key, false)}
      </span>
    {:else}
      {@const fill = fillOf(single)}
      {#if single.name}<Kicker as="span">{single.name}</Kicker>{/if}
      <span class="fab-banded-bar-row" data-banded-bar-row={key}>
        <FillBar
          value={single.percent}
          {density}
          tone={fill.tone}
          color={fill.color}
          data-banded-bar-track={key}
        />
        <span class="fab-banded-bar-single-percent" data-banded-bar-percent={key}
          >{single.percent}%</span
        >
      </span>
    {/if}
  </div>
{:else if rows.length > 1}
  <ul class={['fab-banded-bar', 'is-histogram', extraClass]} {...rest}>
    {#each rows as row, index (row.id ?? index)}
      <li class="fab-banded-bar-band" data-banded-bar-row={row.id ?? index}>
        {@render band(row, row.id ?? index, true)}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .fab-banded-bar.is-single {
    display: flex;
    flex-direction: column;
    /* ratchet-exempt(design-system): the chance bar's shipped caption gap, moved here verbatim; no step is 3px */
    gap: 3px;
    min-width: 88px;
  }

  .fab-banded-bar-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .fab-banded-bar-single-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .fab-banded-bar.is-histogram {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The name column is bounded so a long localized band name cannot squeeze the bar to nothing,
     and the percentage column is pinned so the numbers align. */
  .fab-banded-bar-band {
    display: grid;
    grid-template-columns: minmax(0, 80px) 1fr 34px;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    margin: 0;
  }

  .fab-banded-bar-name {
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-banded-bar-percent {
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>

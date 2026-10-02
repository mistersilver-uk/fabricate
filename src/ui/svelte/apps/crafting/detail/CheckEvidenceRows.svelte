<!--
  The executed check's evidence rows in a player result box (issue 2005), read from the result's
  display projection and never from later actor or config state. Each row is the shared fact row
  in its keyed form; a box narrower than 360px sets the chat card's 88px key column. A count check
  states its die tiles with their legend above its count rows (issue 2006), on the rows' own
  neutral ground so a toned tile stands apart from a toned box; its sentence rows set as prose,
  its figure rows as figures (issue 2134).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `check` | an `executedCheckDisplay` projection, or `null` | `null` | Renders nothing for a secret or blind roll, a check with no target, or no check. |
-->
<script>
  import {
    checkEvidenceRows,
    pathBreakSegments,
  } from '../../../../presenters/checkEvidenceRows.js';
  import {
    countEvidenceRows,
    statesCountEvidence,
  } from '../../../../presenters/countEvidenceRows.js';
  import DiceTiles from '../../../components/DiceTiles.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import JournalFactRow from '../../journal/JournalFactRow.svelte';

  let { check = null } = $props();

  /** The count rows that read as a sentence rather than a figure. */
  const PROSE_ROWS = new Set(['count', 'pool', 'result']);

  // The roller never sees a blind roll's result, and a secret check's evidence is the GM's.
  const withheld = $derived(
    check?.visibility?.secret === true || check?.visibility?.rollMode === 'blindroll'
  );
  const counted = $derived(!withheld && statesCountEvidence(check));
  // A pool reduced to zero rolled no die, so it draws no tile row at all.
  const tiles = $derived(
    counted && check.count.tiles.tiles.length + check.count.tiles.more > 0
      ? check.count.tiles
      : null
  );
  const rows = $derived.by(() => {
    if (withheld) return [];
    const loc = (key) => localize(key);
    return counted ? countEvidenceRows(check, loc) : checkEvidenceRows(check, loc);
  });
</script>

{#if tiles}
  <div class="check-count-tiles" data-check-count-tiles>
    <DiceTiles model={tiles} legend />
  </div>
{/if}
{#if rows.length > 0}
  <div class="check-evidence" data-check-evidence-rows>
    {#each rows as row (row.id)}
      <div class="check-evidence-row" data-check-evidence={row.id}>
        <JournalFactRow
          icon={null}
          keyed
          prose={counted && PROSE_ROWS.has(row.id)}
          danger={row.tone === 'danger'}
          label={row.label}
          value={pathBreakSegments(row.text)}
        />
      </div>
    {/each}
  </div>
{/if}

<style>
  .check-count-tiles,
  .check-evidence {
    min-width: 0;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  .check-count-tiles {
    padding: var(--fab-space-2) var(--fab-space-3);
    background: var(--fab-bg-2);
  }

  .check-evidence {
    --journal-fact-key-width: 120px;
    container-type: inline-size;
    overflow: hidden;
  }

  .check-evidence-row {
    padding: var(--fab-space-2) var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  /* The Crafting run column is about 289px wide: the rows take the chat card's key column. */
  @container (max-width: 360px) {
    .check-evidence-row {
      --journal-fact-key-width: 88px;
    }
  }
</style>

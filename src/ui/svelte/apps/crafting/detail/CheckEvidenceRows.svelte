<!--
  The executed check's evidence rows in a player result box (issue 2005), read from the result's
  display projection and never from later actor or config state. Each row is the shared fact row
  in its keyed form; a box narrower than 360px sets the chat card's 88px key column.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `check` | an `executedCheckDisplay` projection, or `null` | `null` | Renders nothing for a secret or blind roll, a check with no target, or no check. |
-->
<script>
  import { checkEvidenceRows } from '../../../../presenters/checkEvidenceRows.js';
  import { localize } from '../../../util/foundryBridge.js';
  import JournalFactRow from '../../journal/JournalFactRow.svelte';

  let { check = null } = $props();

  // The roller never sees a blind roll's result, and a secret check's evidence is the GM's.
  const withheld = $derived(
    check?.visibility?.secret === true || check?.visibility?.rollMode === 'blindroll'
  );
  const rows = $derived(withheld ? [] : checkEvidenceRows(check, (key) => localize(key)));
</script>

{#if rows.length > 0}
  <div class="check-evidence" data-check-evidence-rows>
    {#each rows as row (row.id)}
      <div class="check-evidence-row" data-check-evidence={row.id}>
        <JournalFactRow icon={null} keyed label={row.label} value={row.text} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .check-evidence {
    --journal-fact-key-width: 120px;
    container-type: inline-size;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  .check-evidence-row {
    padding: var(--fab-space-2) var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  .check-evidence-row:last-child {
    border-bottom: 0;
  }

  /* The Crafting run column is about 289px wide: the rows take the chat card's key column. */
  @container (max-width: 360px) {
    .check-evidence-row {
      --journal-fact-key-width: 88px;
    }
  }
</style>

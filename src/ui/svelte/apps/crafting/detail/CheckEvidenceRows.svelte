<!--
  The executed check's Target, Pre-rolled and Margin rows in a player result box (issue 2005), read
  from the result's display projection and never from later actor or config state.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `check` | an `executedCheckDisplay` projection, or `null` | `null` | Renders nothing for sum/over/fixed, a secret or blind roll, or no check. |
-->
<script>
  import { checkEvidenceRows } from '../../../../presenters/checkEvidenceRows.js';
  import { localize } from '../../../util/foundryBridge.js';

  let { check = null } = $props();

  // The roller never sees a blind roll's result, and a secret check's evidence is the GM's.
  const withheld = $derived(
    check?.visibility?.secret === true || check?.visibility?.rollMode === 'blindroll'
  );
  const rows = $derived(withheld ? [] : checkEvidenceRows(check, (key) => localize(key)));
</script>

{#if rows.length > 0}
  <dl class="check-evidence" data-check-evidence-rows>
    {#each rows as row (row.id)}
      <div class="check-evidence-row" data-check-evidence={row.id}>
        <dt class="check-evidence-label">{row.label}</dt>
        <dd class="check-evidence-value">{row.text}</dd>
      </div>
    {/each}
  </dl>
{/if}

<style>
  .check-evidence {
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  .check-evidence-row {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
  }

  /* Core styles every `dl dt` and `dd` (a shadowed ink and an indent); each resets here. */
  .check-evidence-label,
  .check-evidence-value {
    margin: 0;
    padding: 0;
    text-shadow: none;
  }

  .check-evidence-label {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    font-weight: 600;
  }

  .check-evidence-value {
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
</style>

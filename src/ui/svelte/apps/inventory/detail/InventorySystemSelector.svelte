<!-- Svelte 5 runes mode -->
<!--
  InventorySystemSelector chooses which crafting-system PARTICIPATION the inspector
  body scopes to, for a physical stack that backs a component in more than one system
  (issue 766). It renders as the FIRST element in the component detail's header, above
  the `Info | Salvage` tablist, and re-parameterizes the WHOLE body (name/img/essences/
  used-by/produced-by/salvage).

  It is a native `<select>` DROP-DOWN — a labeled VALUE choice ("pick which system's data
  this body shows"), not content-tab navigation and not a segmented toggle. A drop-down is
  what scales: a physical item can be registered in more than two or three systems, and a
  segmented radiogroup would grow too wide and wrap. A native select is a11y-clean by
  construction (a labeled listbox), so it needs no bespoke radiogroup/roving-tabindex ARIA.

  Each option reads as the system NAME first, with a plain-text affordance suffix
  ("<name> — Salvageable, Tool") — deliberately NOT `<option label={…}>`, whose present
  non-empty value REPLACES the visible option text per the HTML spec and would hide the
  name. The initially-selected option is the salvageable-biased primary the parent supplies.

  The parent only renders this when there is more than one participation, so the
  single-system surface is byte-identical to before (no selector node, no chrome).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { systems = [], selectedSystemId = null, onSelect = null } = $props();

  const SELECT_ID = 'inventory-system-selector-select';

  const options = $derived(Array.isArray(systems) ? systems : []);
  const activeId = $derived(
    options.some((option) => option.systemId === selectedSystemId)
      ? selectedSystemId
      : (options[0]?.systemId ?? null)
  );

  const label = $derived(localize('FABRICATE.App.Inventory.Detail.SystemSelectorLabel'));

  function isSalvageable(option) {
    return option?.salvage?.enabled === true;
  }
  function isTool(option) {
    return option?.isTool === true;
  }
  // The visible option text: the system NAME first, then a plain-text affordance suffix so
  // the closed drop-down and each option read the salvageable/tool state without an icon
  // (options cannot render markup) and without `label=` shadowing the name.
  function optionText(option) {
    const name = option?.systemName || option?.systemId || '';
    const affordances = [];
    if (isSalvageable(option)) affordances.push(localize('FABRICATE.App.Inventory.Card.SalvageablePip'));
    if (isTool(option)) affordances.push(localize('FABRICATE.App.Inventory.Card.ToolPip'));
    return affordances.length > 0 ? `${name} — ${affordances.join(', ')}` : name;
  }

  function choose(systemId) {
    if (systemId && systemId !== activeId) onSelect?.(systemId);
  }
</script>

<div class="inventory-system-selector" data-inventory-system-selector>
  <label class="inventory-system-selector-label" for={SELECT_ID}>{label}</label>
  <select
    id={SELECT_ID}
    class="inventory-system-selector-select"
    data-inventory-system-select
    value={activeId}
    onchange={(event) => choose(event.currentTarget.value)}
  >
    {#each options as option (option.systemId)}
      <option value={option.systemId} data-inventory-system-option={option.systemId}>
        {optionText(option)}
      </option>
    {/each}
  </select>
</div>

<style>
  .inventory-system-selector {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex-wrap: wrap;
  }

  /* Quieter than the accent Info|Salvage segments: a leading, muted eyebrow. */
  .inventory-system-selector-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fab-text-muted);
  }

  .inventory-system-selector-select {
    box-sizing: border-box;
    height: auto;
    min-height: 28px;
    padding: 2px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    font: inherit;
    font-size: 11.5px;
  }

  .inventory-system-selector-select:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -1px;
  }
</style>

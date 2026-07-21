<!-- Svelte 5 runes mode -->
<!--
  InventorySystemSelector chooses which crafting-system PARTICIPATION the inspector
  body scopes to, for a physical stack that backs a component in more than one system
  (issue 766). It renders as the FIRST element in the component detail's header, above
  the `Info | Salvage` tablist, and re-parameterizes the WHOLE body (name/img/essences/
  used-by/produced-by/salvage) — so it is a VALUE choice, not content-tab navigation.

  ARIA: a `role="radiogroup"` with `role="radio"` children, `aria-checked`, roving
  tabindex, and Arrow-key navigation — deliberately NOT a second `role="tablist"`. Two
  stacked tablists whose "tabs" do not map 1:1 to tabpanels mislead screen-reader users;
  "pick which system's data this body shows" is a radiogroup.

  It keeps the segmented VISUAL (quieter than the accent Info|Salvage segments — no
  two-tab-bar sandwich) but falls back to a native `<select>` beyond three systems, where
  the segments would wrap. Each option is annotated with per-system affordance glyphs: a
  recycle where the participation is salvageable, a wrench where it is a tool there.

  The parent only renders this when there is more than one participation, so the
  single-system surface is byte-identical to before (no selector node, no chrome).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { systems = [], selectedSystemId = null, onSelect = null } = $props();

  const options = $derived(Array.isArray(systems) ? systems : []);
  // Beyond three, the segmented control would wrap; a native select stays compact.
  const useSelect = $derived(options.length > 3);
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
  // A per-option aria annotation naming the system and its affordances, so a screen
  // reader announces "System B, salvageable, tool" rather than a bare name.
  function optionAria(option) {
    const parts = [option?.systemName || option?.systemId || ''];
    if (isSalvageable(option)) parts.push(localize('FABRICATE.App.Inventory.Card.SalvageablePip'));
    if (isTool(option)) parts.push(localize('FABRICATE.App.Inventory.Card.ToolPip'));
    return parts.filter(Boolean).join(', ');
  }

  function choose(systemId) {
    if (systemId && systemId !== activeId) onSelect?.(systemId);
  }

  function onKeydown(event, index) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const nextIndex = (index + (forward ? 1 : -1) + options.length) % options.length;
    choose(options[nextIndex]?.systemId);
    const radios = event.currentTarget.parentElement?.querySelectorAll('[role="radio"]');
    radios?.[nextIndex]?.focus();
  }
</script>

<div class="inventory-system-selector" data-inventory-system-selector>
  <span class="inventory-system-selector-label" id="inventory-system-selector-label">{label}</span>
  {#if useSelect}
    <select
      class="inventory-system-selector-select"
      data-inventory-system-select
      aria-labelledby="inventory-system-selector-label"
      value={activeId}
      onchange={(event) => choose(event.currentTarget.value)}
    >
      {#each options as option (option.systemId)}
        <!-- The annotation rides `title`, NOT `label`: a present non-empty `label`
             attribute REPLACES the option's visible text per the HTML spec, so the player
             would otherwise see "System, Salvageable, Tool" instead of the bare name. -->
        <option value={option.systemId} title={optionAria(option)}>
          {option.systemName || option.systemId}
        </option>
      {/each}
    </select>
  {:else}
    <div
      class="inventory-system-selector-group"
      role="radiogroup"
      aria-labelledby="inventory-system-selector-label"
    >
      {#each options as option, index (option.systemId)}
        <button
          type="button"
          role="radio"
          class="inventory-system-selector-option"
          class:is-active={option.systemId === activeId}
          aria-checked={option.systemId === activeId}
          aria-label={optionAria(option)}
          tabindex={option.systemId === activeId ? 0 : -1}
          data-inventory-system-option={option.systemId}
          onclick={() => choose(option.systemId)}
          onkeydown={(event) => onKeydown(event, index)}
        >
          <span class="inventory-system-selector-name">{option.systemName || option.systemId}</span>
          {#if isSalvageable(option)}
            <i class="fas fa-recycle" aria-hidden="true"></i>
          {/if}
          {#if isTool(option)}
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
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

  .inventory-system-selector-group {
    display: inline-flex;
    align-items: stretch;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  /* Foundry's global `.app button` pins a fixed height and centers content; reset the
     inherited box (the EnvironmentCard pattern) so the option is not cropped. */
  .inventory-system-selector-option {
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--fab-text-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  .inventory-system-selector-option i {
    font-size: 9px;
  }

  .inventory-system-selector-option:hover {
    color: var(--fab-text);
  }

  /* The active participation reads as a filled, but SUBDUED, segment — the surface-active
     fill, not the accent the Info|Salvage control uses, so the two bars do not compete. */
  .inventory-system-selector-option.is-active {
    background: var(--fab-surface-active);
    color: var(--fab-text);
    font-weight: 700;
  }

  .inventory-system-selector-option:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .inventory-system-selector-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>

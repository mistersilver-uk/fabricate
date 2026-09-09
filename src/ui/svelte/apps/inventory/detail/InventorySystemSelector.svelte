<!-- Svelte 5 runes mode -->
<!--
  InventorySystemSelector chooses which crafting-system PARTICIPATION the inspector
  body scopes to, for a physical stack that backs a component in more than one system
  (issue 766). It renders as the FIRST element in the component detail's header, above
  the `Info | Salvage` tablist, and re-parameterizes the WHOLE body (name/img/essences/
  used-by/produced-by/salvage).

  It is the shared `Select` DROP-DOWN (issue 1511) — a VALUE choice ("pick which system's data
  this body shows"), not content-tab navigation and not a segmented toggle. A drop-down is
  what scales: a physical item can be registered in more than two or three systems, and a
  segmented radiogroup would grow too wide and wrap. The primitive is a combobox over a
  listbox, so it needs no bespoke radiogroup/roving-tabindex ARIA of its own.

  Each option reads as the system NAME first, with a plain-text affordance suffix
  ("<name> — Salvageable, Tool"). The suffix is part of the option's own label rather than a
  second field, which is what keeps the closed trigger reading the same as the row it came from.
  The initially-selected option is the salvageable-biased primary the parent supplies.

  The parent only renders this when there is more than one participation, so the
  single-system surface is byte-identical to before (no selector node, no chrome).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Select from '../../../components/Select.svelte';

  let { systems = [], selectedSystemId = null, onSelect = null } = $props();

  // The caption the trigger is named by. It is minted per instance rather than declared as a
  // constant because the constant it replaces was an `id` on a `<select>`, and two component
  // inspectors in one document would have written that id twice.
  const instanceId = $props.id();
  const captionId = `${instanceId}-caption`;

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
    if (isSalvageable(option))
      affordances.push(localize('FABRICATE.App.Inventory.Card.SalvageablePip'));
    if (isTool(option)) affordances.push(localize('FABRICATE.App.Inventory.Card.ToolPip'));
    return affordances.length > 0 ? `${name} — ${affordances.join(', ')}` : name;
  }

  const selectOptions = $derived(
    options.map((option) => ({ value: option.systemId, label: optionText(option) }))
  );

  function choose(systemId) {
    if (systemId && systemId !== activeId) onSelect?.(systemId);
  }
</script>

<div class="inventory-system-selector" data-inventory-system-selector>
  <!-- A `<span>` RATHER THAN THE `<label for>` THIS WAS (issue 1511). This was the only `for`/`id`
       pair of the app's six selects, and there is no longer an `id`-bearing labelable control for
       a `for` to address: the control is a `<button>`, named by this caption through
       `aria-labelledby`. The stable hook rides onto that button through `triggerData`, so the
       smoke's own wait on `[data-inventory-system-select]` keeps resolving; the per-option hook
       goes, because the primitive stamps `data-popover-option` from each option's value. -->
  <span class="inventory-system-selector-label" id={captionId}>{label}</span>
  <Select
    size="inline"
    value={activeId}
    options={selectOptions}
    ariaLabelledBy={captionId}
    triggerData={{ 'data-inventory-system-select': '' }}
    onChange={choose}
  />
</div>

<style>
  .inventory-system-selector {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex-wrap: wrap;
  }

  /* Quieter than the accent Info|Salvage segments: a leading, muted eyebrow.

     HAND-ROLLED, AND RULED OUT AS A `Kicker` (issue 1511). The deciding difference is TYPE:
     `Kicker` draws an 8.5px eyebrow at 0.11em tracking and this caption is 10px at 0.08em, a
     different ramp step at a different tracking, so adopting it would visibly change a caption
     this conversion is not otherwise touching. The second and smaller difference is structural -
     `Kicker` forwards no `id` and takes no rest spread, so it cannot be the `aria-labelledby`
     target the trigger's accessible name now comes from. The decision is recorded in the
     ruled-out register in `openspec/specs/design-system/spec.md`, not only here. */
  .inventory-system-selector-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fab-text-muted);
  }

  /* NO WIDTH FLOOR HERE, AND THE REFUSAL IS STATED RATHER THAN OMITTED (issue 1511). The other
     three converted rows floor their trigger at the measured width of their widest option, so the
     control stops resizing with its value. This row cannot: its options are a system NAME plus a
     data-driven affordance suffix, both of which a world author writes, so there is no widest
     option to size against at authoring time. Measured against a representative long label -
     "Alchemists Supplies v1.6 — Salvageable, Tool" - the trigger measures 264.91px, while the
     one-word "Alchemy" measures 86.05px, so a floor set for the first would leave the second
     stranded in a box three times the width of its own value. The trigger therefore hugs its value, as `Select` draws it by
     default, and the panel takes the `inline` rung's own band.

     Everything else about the control is the rung's: 30px against the 28px minimum this block
     declared, the same 7px corner, and `--fab-bg-2` against the `--fab-surface-soft` it carried -
     which is the largest visible move in this change, because it sits directly above the soft
     Info | Salvage tablist it was written to be quieter than. */
</style>

<!--
  A dropdown-plus-cancellable-pills multi-select: selected entries render as removable chips, and a
  menu button opens a `SearchablePopover` listbox of the still-unselected options. CONTROLLED — it
  renders `options`/`selectedIds` and emits one `onToggle(id, nextSelected)`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` / `selectedIds` / `onToggle(id, nextSelected)` | arrays / function | `[]` / no-op | The vocabulary, the current selection, and one toggle per gesture; the parent owns the set write. |
  | `disabled` | boolean | `false` | The whole control off. |
  | `addDisabled` | boolean | `false` | Disables the ADD path ALONE, leaving every pill removable, because a selection that has hit its cap must stay editable in the one direction that can un-hit it. The caller states WHY through `describedBy`; this leaf authors no copy. |
  | `menuLabel` / `emptyMenuLabel` / `placeholder` / `dataAttr` | pre-localized strings / attribute name | `''` | The closed menu button's label, the note shown when every option is selected, the empty pill-row text, and a test hook on the outer element. |
  | `labelledBy` | element id | `''` | The caller's own label element. The control is a GROUP of controls rather than a labelled field, so it takes `role="group"` + `aria-labelledby`: the menu button and every pill remove button are separate focus stops that would otherwise be announced with no shared context. |
  | `describedBy` | element id | `''` | A caller-owned element describing a CONSTRAINT on the group. It goes on the GROUP rather than on the menu button, because a `disabled` button is skipped by several screen readers' tab order. |

  Invariants:
  - THE AT-CAP STATE IS `aria-disabled`, THE LIVE REGION IS THIS SUMMARY ALONE rather than the pill
    row, and FOCUS DIES WITH THE REMOVED PILL so it is moved before emitting — next pill, previous
    pill, then the menu button, which always exists. All three rules are
    `openspec/specs/design-system/spec.md`'s, under "Naming, announcement and hit targets are
    component obligations"; the refusal the at-cap state needs is `SearchablePopover`'s
    `triggerAriaDisabled`, and the menu button is found by HOOK rather than `bind:this`, which on a
    component tag binds the INSTANCE.
  - `data-keyboard-focus="true"` IS WRITTEN ON THE PILL REMOVE BUTTON, before any spread; the MENU
    button is `SearchablePopover`'s trigger and declares the attribute there.
  - THE FAMILY IS ROOTED AT `fabricate-pill-select`, which rides on the `<Field>` this component
    renders, so that one element carries `fabricate-field` and `fabricate-pill-select` together —
    the two-roots-on-one-element case the same spec requirement states.
-->
<script>
  import Field from './Field.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import { formatList, localize } from '../util/foundryBridge.js';

  let {
    options = [],
    selectedIds = [],
    disabled = false,
    addDisabled = false,
    menuLabel = '',
    allSelectedLabel = '',
    noneSelectedLabel = '',
    testId = '',
    labelledBy = '',
    describedBy = '',
    onToggle = () => {},
  } = $props();

  let open = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, data) {
    const translated = localize(key, data);
    if (translated && translated !== key) return translated;
    return fallback.replace(/\{(\w+)\}/g, (_match, name) => String(data?.[name] ?? ''));
  }

  const allOptions = $derived(Array.isArray(options) ? options : []);
  const selected = $derived(Array.isArray(selectedIds) ? selectedIds : []);
  const selectedOptions = $derived(allOptions.filter((option) => selected.includes(option.id)));
  const availableOptions = $derived(allOptions.filter((option) => !selected.includes(option.id)));

  function optionLabel(option) {
    return (
      option.label ||
      text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierUnnamed', 'Unnamed modifier')
    );
  }

  const selectionSummary = $derived.by(() => {
    if (selectedOptions.length === 0) {
      return (
        noneSelectedLabel ||
        text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillNone', 'No modifiers selected.')
      );
    }
    const names = formatList(selectedOptions.map((option) => optionLabel(option)));
    if (selectedOptions.length === 1) {
      return format(
        'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillSelectedOne',
        '1 modifier selected: {names}',
        { names }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillSelected',
      '{count} modifiers selected: {names}',
      { count: selectedOptions.length, names }
    );
  });

  const menuButtonLabel = $derived(
    menuLabel || text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAdd', 'Add modifier')
  );

  const menuOptions = $derived(
    availableOptions.map((option) => ({
      id: option.id,
      label: optionLabel(option),
      icon: option.icon || 'fa-solid fa-dice-d20',
      data: { 'data-modifier-pill-option': option.id },
    }))
  );

  function add(id) {
    onToggle(id, true);
    open = false;
  }

  function focusAfterRemoval(button) {
    const pill = button?.closest?.('[data-modifier-pill]');
    const neighbour = pill?.nextElementSibling || pill?.previousElementSibling || null;
    const group = pill?.closest?.('.manager-availability-multi');
    const target =
      neighbour?.querySelector?.('[data-modifier-pill-remove]') ||
      group?.querySelector?.('[data-modifier-pill-menu-button]');
    target?.focus?.();
  }

  function remove(id, event) {
    focusAfterRemoval(event?.currentTarget);
    onToggle(id, false);
  }
</script>

<Field
  as="div"
  class="fabricate-pill-select manager-availability-multi"
  role="group"
  aria-labelledby={labelledBy || undefined}
  aria-describedby={describedBy || undefined}
  data-modifier-pill-select={testId || undefined}
>
  <SearchablePopover
    bind:open
    options={menuOptions}
    showSearch={false}
    triggerHasPopup="listbox"
    triggerClass="manager-availability-menu-button"
    triggerLabel={menuButtonLabel}
    dialogAriaLabel={menuButtonLabel}
    triggerAriaDisabled={addDisabled}
    triggerData={{ 'data-modifier-pill-menu-button': '' }}
    {disabled}
    emptyHint={allSelectedLabel ||
      text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
        'All modifiers selected.'
      )}
    onChoose={add}
  />
  <div class="manager-availability-pill-row" data-modifier-pill-row>
    {#each selectedOptions as option (option.id)}
      <span class="manager-availability-pill is-modifier" data-modifier-pill={option.id}>
        <i class={option.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
        <span>{optionLabel(option)}</span>
        <button
          type="button"
          class="manager-availability-remove"
          data-keyboard-focus="true"
          {disabled}
          aria-label={`${text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillRemove', 'Remove')} ${optionLabel(option)}`}
          data-modifier-pill-remove={option.id}
          onclick={(event) => remove(option.id, event)}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </span>
    {:else}
      <span class="manager-muted manager-availability-any">
        {noneSelectedLabel ||
          text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillNone',
            'No modifiers selected.'
          )}
      </span>
    {/each}
  </div>
  <span class="manager-modifier-pill-status" aria-live="polite" data-modifier-pill-status
    >{selectionSummary}</span
  >
</Field>

<style>
  :global(.manager-availability-multi .manager-availability-menu-button[aria-disabled='true']) {
    color: var(--fab-text-disabled);
    cursor: default;
    opacity: 0.55;
  }

  :global(
    .manager-availability-multi .manager-availability-menu-button[aria-disabled='true']:hover
  ) {
    border-color: var(--fab-border);
    box-shadow: none;
  }

  .manager-modifier-pill-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>

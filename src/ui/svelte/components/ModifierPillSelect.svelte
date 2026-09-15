<!--
  A dropdown-plus-cancellable-pills multi-select: selected entries render as removable chips, and a
  menu button opens a `SearchablePopover` listbox of the still-unselected options. CONTROLLED — it
  renders `options`/`selectedIds` and emits one `onToggle(id, nextSelected)`; the parent owns the
  resulting set write.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` / `selectedIds` | arrays | `[]` | The vocabulary and the current selection. |
  | `onToggle(id, nextSelected)` | function | no-op | One toggle per gesture. |
  | `disabled` | boolean | `false` | The whole control off. |
  | `addDisabled` | boolean | `false` | Disables the ADD path ALONE, leaving every pill removable. Distinct from `disabled`: a selection that has hit its cap must stay editable in the one direction that can un-hit it, so a caller reaching for `disabled` here would strand the GM at the cap with no way down. The caller states WHY through `describedBy`; this leaf authors no copy. |
  | `menuLabel` / `emptyMenuLabel` / `placeholder` | pre-localized strings | `''` | The closed menu button's label, the note shown when every option is selected, and the empty pill-row text. |
  | `labelledBy` | element id | `''` | The caller's own label element. The control is a GROUP of controls rather than a labelled field, so it takes `role="group"` + `aria-labelledby` rather than a `<label for>`: the menu button and every pill remove button are separate focus stops that would otherwise be announced with no shared context. The label stays at the CALL SITE because its position differs per surface. |
  | `describedBy` | element id | `''` | A caller-owned element describing a CONSTRAINT on the group — the pick cap. It goes on the GROUP rather than on the menu button, because a `disabled` button is skipped by several screen readers' tab order, so a description hung off it is exactly what a capped user would never hear. |
  | `dataAttr` | attribute name | `''` | A test hook on the outer element. |

  Invariants:
  - THE AT-CAP STATE IS `aria-disabled`, NOT THE `disabled` ATTRIBUTE, and the second reason is a
    real defect rather than a preference. (1) A `disabled` button is removed from the tab order by
    several screen readers, so a capped user tabs straight past the only control that explains the
    cap. (2) The post-removal focus fallback targets this button when the removed pill has no
    surviving neighbour — at a cap of 1, every removal — and `focus()` on a disabled button
    silently no-ops and drops the keyboard user to `<body>`. The trade is that `aria-disabled`
    does not suppress the click, so `SearchablePopover`'s `triggerAriaDisabled` does.
  - THE LIVE REGION IS THIS SUMMARY ALONE, NEVER THE PILL ROW. Neither gesture moves focus into the
    row, but a region wrapped AROUND the pills announces each added pill's whole subtree, its
    remove button's label included, and NOTHING AT ALL on a removal, because `aria-relevant`
    defaults to `additions text` and removing a keyed `{#each}` child is excluded outright. A text
    node that default already covers is the fix, and it says NAMES as well as a count, because "3
    selected" does not tell a non-sighted GM WHICH three.
  - `data-keyboard-focus="true"` IS WRITTEN ON THE PILL REMOVE BUTTON, on the same side of the
    attribute list as its `class` and BEFORE any spread: a spread landing later would win, so a
    caller's `data-*` bag could unset it by accident. That button is outside a `<form>`, so while
    it holds focus Foundry's Space/arrow/Tab bindings stop firing — the intended behaviour change.
    The MENU button is `SearchablePopover`'s trigger and declares the attribute there.
  - FOCUS DIES WITH THE REMOVED PILL and would drop to `<body>`, so it is moved BEFORE emitting:
    next pill, then the previous one, then the menu button, which always exists. That button is
    found by HOOK rather than `bind:this`, because it is `SearchablePopover`'s element and
    `bind:this` on a component tag binds the INSTANCE.
  - THE FAMILY IS ROOTED AT `fabricate-pill-select`, which rides on the `<Field>` this component
    renders, so that one element carries `fabricate-field` and `fabricate-pill-select` together —
    exactly as `RadioCardGroup`'s fieldset carries `fabricate-field` and `fabricate-option-cards`.
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

  // The trigger's visible text AND the popover's accessible name. `menuLabel` alone is usable for
  // neither: it is optional, and an empty `aria-label` is dropped by Svelte, leaving a
  // `role="listbox"` with no accessible name at all.
  const menuButtonLabel = $derived(
    menuLabel || text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAdd', 'Add modifier')
  );

  // The still-unselected options, shaped for `SearchablePopover`. `data` carries the row hook
  // VERBATIM rather than folding it into the primitive's own `dataId`, because four mounted
  // suites address a row by that exact attribute.
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
  <!-- The menu-button hook rides `triggerData` with an EMPTY-STRING value, not as a bare
       attribute: a bare `data-x` on a component tag arrives in the rest spread as boolean `true`
       and renders `data-x="true"`, which every presence selector resolves either way — so the DOM
       would change and nothing would report it. -->
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
  <!-- Visually hidden HERE rather than through the global utility: that utility is rooted at the
       module root, and this is a shared primitive a host may portal out from under any root. -->
  <span class="manager-modifier-pill-status" aria-live="polite" data-modifier-pill-status
    >{selectionSummary}</span
  >
</Field>

<style>
  /* The at-cap menu button keeps its box and its focus ring — it is still a real tab stop,
     deliberately — and loses only the affordance colour and the pointer, so it reads as
     "unavailable right now" rather than "gone". The global sheet gives that class no disabled
     treatment at all, so this is the state's only visual, and it is scoped here because the cap
     is this call site's concept rather than the widget's chrome. */
  /* `:global(...)` around the WHOLE selector, and the ancestor is load-bearing rather than
     decorative. The button is `SearchablePopover`'s element now, so the scoped spelling compiled
     to a hash this component no longer stamps on anything and the compiler PRUNED both rules with
     an `Unused CSS selector` warning. Specificity is preserved EXACTLY, which is why the ancestor
     stays: the scoped form was (0,3,0) and a bare `:global(.the-class[attr])` is (0,2,0), which
     would smuggle a cascade change in as a repair and lose to the sheet's own `:hover` rule. The
     ancestor is the class this component hands its own `<Field>`, so the anchor is local. */
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

<!-- Svelte 5 runes mode -->
<!--
  A dropdown-plus-cancellable-pills multi-select (issue 770). Selected entries render
  as removable chips; a menu button opens a listbox of the still-unselected options.
  Mirrors the gathering availability widget's markup so it inherits the shared
  `manager-availability-*` styling for free (see GatheringEventEditView). Extracted as a
  reusable leaf so the check-modifier "default set" (Checks tab) and a recipe's
  "eligible modifiers" override (Recipe Overview tab) share one control instead of two
  near-identical checkbox lists.

  Controlled: it renders `options`/`selectedIds` and emits a single toggle via
  `onToggle(id, nextSelected)`; the parent owns the resulting set write.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { formatList, localize } from '../util/foundryBridge.js';

  let {
    options = [],
    selectedIds = [],
    disabled = false,
    // Disables the ADD path alone, leaving every pill removable (issue 1055). Distinct
    // from `disabled`, which turns the whole control off: a selection that has hit its
    // cap must stay editable in the one direction that can un-hit it, so a caller that
    // reached for `disabled` here would strand the GM at the cap with no way down. The
    // caller states WHY through `describedBy`; this leaf authors no copy.
    addDisabled = false,
    // Label on the closed menu button (e.g. "Add modifier").
    menuLabel = '',
    // Shown inside the open menu when every option is already selected.
    allSelectedLabel = '',
    // Placeholder pill-row text when nothing is selected.
    noneSelectedLabel = '',
    // A test hook mapped onto the outer element (`data-modifier-pill-select`).
    testId = '',
    // The id of the caller's own label element (issue 1055). The control is a group of
    // controls, not a labelled field, so it takes `role="group"` + `aria-labelledby`
    // rather than a `<label for>`: the menu button and every pill remove button are
    // separate focus stops that would otherwise be announced with no shared context.
    // The label stays at the CALL SITE because its position differs — the Overview cell
    // puts a micro-label above a tri-state select, the Checks card an `<h4>` above the
    // whole default-set block — and only its id is needed here.
    labelledBy = '',
    // The id of a caller-owned element describing a CONSTRAINT on the group — the pick
    // cap, in the recipe editor. It goes on the group rather than on the menu button
    // because a `disabled` button is skipped by several screen readers' tab order, so a
    // description hung off it is exactly the thing a capped user would never hear.
    describedBy = '',
    onToggle = () => {},
  } = $props();

  let open = $state(false);
  let menuButton = $state(null);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // `text`'s interpolating sibling, with the same fallback contract: the fallback carries
  // the same `{name}` placeholders so an unlocalized build reads identically rather than
  // printing a raw brace.
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

  // The live region's whole content, restated on every change to either axis.
  //
  // `aria-live` used to sit on the pill row itself, which announced almost nothing:
  // `aria-relevant` defaults to `additions text`, so REMOVING a keyed `{#each}` child is
  // excluded outright and only emptying the row announced at all — incidentally, via the
  // `{:else}` placeholder's text node. Adding announced the whole new pill subtree,
  // including the remove button's own label, so a pick read as "Medicine, Remove
  // Medicine". `aria-relevant="removals"` is not the fix (support for it is unreliable
  // and it would still re-read pill chrome); a text node the default `additions text`
  // already covers is, and it can say something worth hearing.
  //
  // Names as well as a count, through the active language's list conventions —
  // "Medicine, Alchemy and Herbalism" is a language rule, not a separator — because "3
  // selected" does not tell a non-sighted GM WHICH three the pill row now shows.
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

  // `aria-disabled`, NOT the `disabled` attribute, for the at-cap state. Two reasons, and
  // the second is a real defect rather than a preference:
  //
  //  1. A `disabled` button is removed from the tab order by several screen readers, so a
  //     capped user would tab straight past the only control that explains the cap.
  //  2. `focusAfterRemoval` falls back to this button when the removed pill has no
  //     surviving neighbour. At a cap of 1 that is EVERY removal — and a `disabled`
  //     button cannot take focus, so `focus()` would silently no-op and drop the keyboard
  //     user to `<body>`, which is precisely the regression that fallback exists to
  //     prevent. Staying focusable keeps the landing spot real.
  //
  // The trade is that `aria-disabled` does not suppress the click, so the handler must.
  function openMenu() {
    if (addDisabled) return;
    open = !open;
  }

  function add(id) {
    onToggle(id, true);
    open = false;
  }

  // Focus dies with the removed pill and drops to `<body>`, stranding a keyboard user at
  // the top of the document with no way back to the control they were operating. Move it
  // BEFORE emitting: every candidate below is a node that exists right now and survives
  // the update (the `{#each}` is keyed), so there is no re-render to wait on and no
  // ordering question. Next pill first, then the previous one — removing the LAST pill of
  // several has no "next", and jumping to the menu button while pills remain reads as
  // being thrown out of the row — and the menu button, which always exists, last.
  function focusAfterRemoval(button) {
    const pill = button?.closest?.('[data-modifier-pill]');
    const neighbour = pill?.nextElementSibling || pill?.previousElementSibling || null;
    const target = neighbour?.querySelector?.('[data-modifier-pill-remove]') || menuButton;
    target?.focus?.();
  }

  function remove(id, event) {
    focusAfterRemoval(event?.currentTarget);
    onToggle(id, false);
  }
</script>

<div
  class="manager-field manager-availability-multi"
  role="group"
  aria-labelledby={labelledBy || undefined}
  aria-describedby={describedBy || undefined}
  data-modifier-pill-select={testId || undefined}
>
  <div
    class="manager-availability-picker"
    use:dismissOnOutsideClick={{ enabled: open, onDismiss: () => (open = false) }}
  >
    <button
      type="button"
      class="manager-availability-menu-button"
      aria-haspopup="listbox"
      aria-expanded={open}
      {disabled}
      aria-disabled={addDisabled || undefined}
      bind:this={menuButton}
      data-modifier-pill-menu-button
      onclick={openMenu}
    >
      <span
        >{menuLabel ||
          text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAdd', 'Add modifier')}</span
      >
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
    {#if open}
      <div class="manager-availability-menu" role="listbox" aria-label={menuLabel}>
        {#each availableOptions as option (option.id)}
          <button
            type="button"
            class="manager-availability-option"
            role="option"
            aria-selected="false"
            data-modifier-pill-option={option.id}
            onclick={() => add(option.id)}
          >
            <i class={option.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
            <span>{optionLabel(option)}</span>
          </button>
        {:else}
          <p class="manager-availability-empty">
            {allSelectedLabel ||
              text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
                'All modifiers selected.'
              )}
          </p>
        {/each}
      </div>
    {/if}
  </div>
  <div class="manager-availability-pill-row" data-modifier-pill-row>
    {#each selectedOptions as option (option.id)}
      <span class="manager-availability-pill is-modifier" data-modifier-pill={option.id}>
        <i class={option.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
        <span>{optionLabel(option)}</span>
        <button
          type="button"
          class="manager-availability-remove"
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
  <!-- The pill row is the control's only feedback that a menu pick or a pill removal
       landed, and neither gesture moves focus into the row, so without this a
       screen-reader user is told nothing at all. The region is this summary ALONE, not
       the row: a live region wrapped around the pills announces each added pill's whole
       subtree (its remove button's label included) and nothing at all on a removal.
       `polite` announces after the current utterance rather than interrupting it.
       Visually hidden here rather than through the global `.sr-only` utility, which is
       scoped to the two app theme roots — this is a shared primitive and must not depend
       on which root it is dropped into. -->
  <span class="manager-modifier-pill-status" aria-live="polite" data-modifier-pill-status
    >{selectionSummary}</span
  >
</div>

<style>
  /* The at-cap menu button. It keeps its box and its focus ring — it is still a real tab
     stop, deliberately (see `openMenu`) — and only loses the affordance colour and the
     pointer, so it reads as "unavailable right now" rather than "gone". The global sheet
     gives `.manager-availability-menu-button` no disabled treatment at all, so this is
     the state's only visual, and it is scoped here rather than added to the global class
     because the cap is this call site's concept, not the widget's chrome. */
  .manager-availability-menu-button[aria-disabled='true'] {
    color: var(--fab-text-disabled);
    cursor: default;
    opacity: 0.55;
  }

  .manager-availability-menu-button[aria-disabled='true']:hover {
    border-color: var(--fab-mv2-border);
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

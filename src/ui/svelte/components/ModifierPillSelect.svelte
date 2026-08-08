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
  import { localize } from '../util/foundryBridge.js';

  let {
    options = [],
    selectedIds = [],
    disabled = false,
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
    onToggle = () => {},
  } = $props();

  let open = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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

  function add(id) {
    onToggle(id, true);
    open = false;
  }

  function remove(id) {
    onToggle(id, false);
  }
</script>

<div
  class="manager-field manager-availability-multi"
  role="group"
  aria-labelledby={labelledBy || undefined}
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
      data-modifier-pill-menu-button
      onclick={() => (open = !open)}
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
  <!-- The pill row is the control's only feedback that a menu pick or a pill removal
       landed, and neither gesture moves focus into the row, so a screen-reader user is
       otherwise told nothing at all. `polite` announces the changed row after the
       current utterance rather than interrupting it. -->
  <div class="manager-availability-pill-row" aria-live="polite" data-modifier-pill-row>
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
          onclick={() => remove(option.id)}
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
</div>

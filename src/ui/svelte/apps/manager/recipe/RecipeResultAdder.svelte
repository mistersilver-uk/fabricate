<!-- Svelte 5 runes mode -->
<!--
  A recipe result set's one adder: a dashed `Result` button over the shared `ActionMenu`, headed
  "Add a result" and listing the set's offered kinds, or appending directly when one kind is
  offered. Every row it adds carries its kind and no value, and focus then moves to that row's
  name field.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kinds` | result kinds | `['component']` | The set's offered kinds, in the kind table's order. |
  | `count` | number | `0` | The set's row count; the row it grows by is the one focused. |
  | `label` | localized string | `''` | The button's word; empty reads "Result". |

  Callbacks:
  - `onAdd(kind)` — append an empty row of `kind` as the set's last row.
-->
<script>
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import Button from '../../../components/Button.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { kindMenuItems } from './pickerRowKinds.js';

  let { kinds = ['component'], count = 0, label = '', onAdd = () => {} } = $props();

  let root = $state(null);
  let focusRowAt = -1;

  const word = $derived(
    label || localizeOr('FABRICATE.Admin.Manager.Recipe.ResultAdder', 'Result')
  );
  const items = $derived(kindMenuItems(kinds, localizeOr, 'result'));

  function add(kind) {
    focusRowAt = count;
    onAdd(kind);
  }

  // `count` is read first, so the effect tracks it while no focus is pending. The focus is a task,
  // not a microtask, so it lands after the menu hands focus back to its trigger in either order.
  $effect(() => {
    const rowCount = count;
    if (!root || focusRowAt < 0 || rowCount <= focusRowAt) return;
    const at = focusRowAt;
    focusRowAt = -1;
    setTimeout(() => {
      const rows = root
        ?.closest('[data-recipe-set]')
        ?.querySelectorAll('[data-recipe-result-item]');
      rows?.[at]?.querySelector('[data-recipe-option-search]')?.focus();
    }, 0);
  });
</script>

<span class="manager-recipe-result-adder" bind:this={root}>
  {#if items.length > 1}
    <ActionMenu
      {items}
      heading={localizeOr('FABRICATE.Admin.Manager.Recipe.AddAResult', 'Add a result')}
      menuClass="manager-recipe-or-menu manager-recipe-result-menu"
      onSelect={add}
    >
      {#snippet trigger({ attributes })}
        <!-- ratchet-exempt(design-system): the spread is the menu's own trigger contract (ARIA state, handlers, element attachment), never a caller's name -->
        <Button role="dashed" data-recipe-add="result-item" {...attributes}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{word}</span>
        </Button>
      {/snippet}
    </ActionMenu>
  {:else}
    <Button
      role="dashed"
      data-recipe-add="result-item"
      onclick={() => add(kinds[0] ?? 'component')}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{word}</span>
    </Button>
  {/if}
</span>

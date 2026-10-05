<!-- Svelte 5 runes mode -->
<!--
  A recipe result set's one adder: a dashed `Result` button over the shared `ActionMenu`, headed
  "Add a result" and listing the set's offered kinds from the button's start edge, or appending
  directly when one kind is offered. Every row it adds carries its kind and no value; the card
  moves focus to that row's name field.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kinds` | result kinds | `['component']` | The set's offered kinds, in the kind table's order. |
  | `label` | localized string | `''` | The button's word and its name; empty shows "Result", named "Add a result". |

  Callbacks:
  - `onAdd(kind)` — append an empty row of `kind` as the set's last row.
-->
<script>
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import Button from '../../../components/Button.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { kindMenuItems } from './pickerRowKinds.js';

  let { kinds = ['component'], label = '', onAdd = () => {} } = $props();

  const heading = $derived(localizeOr('FABRICATE.Admin.Manager.Recipe.AddAResult', 'Add a result'));
  const word = $derived(
    label || localizeOr('FABRICATE.Admin.Manager.Recipe.ResultAdder', 'Result')
  );
  // The visible word alone drops the verb, so the name is the menu's heading, which contains it.
  const name = $derived(label || heading);
  const items = $derived(kindMenuItems(kinds, localizeOr, 'result'));
</script>

<span class="manager-recipe-result-adder">
  {#if items.length > 1}
    <ActionMenu
      {items}
      {heading}
      align="start"
      menuClass="manager-recipe-or-menu manager-recipe-result-menu"
      onSelect={(kind) => onAdd(kind)}
    >
      {#snippet trigger({ attributes })}
        <!-- ratchet-exempt(design-system): the spread is the menu's own trigger contract (ARIA state, handlers, element attachment), never a caller's name -->
        <Button role="dashed" data-recipe-add="result-item" aria-label={name} {...attributes}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{word}</span>
        </Button>
      {/snippet}
    </ActionMenu>
  {:else}
    <Button
      role="dashed"
      data-recipe-add="result-item"
      aria-label={name}
      onclick={() => onAdd(kinds[0] ?? 'component')}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{word}</span>
    </Button>
  {/if}
</span>

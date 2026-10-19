<!-- Svelte 5 runes mode -->
<!--
  One dashed adder over the shared kind menu: a `Button role="dashed"` trigger over `ActionMenu`,
  headed by the caller and listing the offered kinds from the button's start edge, or appending
  directly when one kind is offered. A result set's `Result`, a choice group's `Alternative` and
  an ingredient set's `Ingredient` are its three callers.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kinds` | match types or result kinds | `[]` | The offered kinds, in the kind table's order. |
  | `label` / `ariaLabel` | localized strings | `''` | The visible word, and the accessible name, which contains it. |
  | `heading` | localized string | `''` | The menu's eyebrow. |
  | `hook` / `triggerHook` | hook tokens | `''` | The items' `data-recipe-add` prefix (`<hook>-<tone>`), and the trigger's own `data-recipe-add`. |
  | `menuClass` | class string | `''` | The portaled panel's classes. |
  | `size` | `''` \| `'28'` | `''` | `Button`'s control-height rung: a choice group's adder takes `'28'`. |

  Callbacks:
  - `onAdd(kind)` — append an empty entry of `kind`; the caller moves focus to its name field.
-->
<script>
  import ActionMenu from './ActionMenu.svelte';
  import Button from './Button.svelte';
  import { localizeOr } from '../util/localizeOr.js';
  import { kindMenuItems } from './pickerRowKinds.js';

  let {
    kinds = [],
    label = '',
    ariaLabel = '',
    heading = '',
    hook = '',
    triggerHook = '',
    menuClass = '',
    size = '',
    onAdd = () => {},
  } = $props();

  const items = $derived(kindMenuItems(kinds, localizeOr, hook));
</script>

<span class="manager-recipe-kind-adder">
  {#if items.length > 1}
    <ActionMenu {items} {heading} align="start" {menuClass} onSelect={(kind) => onAdd(kind)}>
      {#snippet trigger({ attributes })}
        <!-- ratchet-exempt(design-system): the spread is the menu's own trigger contract (ARIA state, handlers, element attachment), never a caller's name -->
        <Button
          icon="fas fa-plus"
          role="dashed"
          {size}
          data-recipe-add={triggerHook}
          aria-label={ariaLabel || undefined}
          {...attributes}
        >
          <span>{label}</span>
        </Button>
      {/snippet}
    </ActionMenu>
  {:else}
    <Button
      icon="fas fa-plus"
      role="dashed"
      {size}
      data-recipe-add={triggerHook}
      aria-label={ariaLabel || undefined}
      onclick={() => onAdd(kinds[0] ?? 'component')}
    >
      <span>{label}</span>
    </Button>
  {/if}
</span>

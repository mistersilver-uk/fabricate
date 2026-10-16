<!-- Svelte 5 runes mode -->
<!--
  The requirement row's `or…` control: a dashed trigger over the shared `ActionMenu`, headed by
  the caller's eyebrow and listing `kindMenuItems(kinds)`. A part of `PickerRow`, whose `allowAny`,
  `kinds`, `disabled` and `onSelect(kind)` it receives.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `heading` / `hint` | localized strings | `''` | The panel's eyebrow, which also names the trigger, and the trigger's tooltip; empty reads the ingredient side's "Accept instead" and its hint, and a result row passes "Add an alternative". |
-->
<script>
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { kindMenuItems } from './pickerRowKinds.js';

  let { kinds = [], disabled = false, heading = '', hint = '', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const eyebrow = $derived(
    heading || text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
  );
</script>

<ActionMenu
  items={kindMenuItems(kinds, text)}
  heading={eyebrow}
  menuClass="manager-recipe-or-menu"
  {disabled}
  {onSelect}
>
  {#snippet trigger({ attributes })}
    <button
      type="button"
      class="manager-recipe-or-trigger"
      data-keyboard-focus="true"
      aria-label={eyebrow}
      title={hint ||
        text(
          'FABRICATE.Admin.Manager.Recipe.OrTriggerHint',
          'Accept another kind of ingredient in place of this one.'
        )}
      {disabled}
      {...attributes}
      ><i class="fa-solid fa-code-branch" aria-hidden="true"></i><span
        >{text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}</span
      ></button
    >
  {/snippet}
</ActionMenu>

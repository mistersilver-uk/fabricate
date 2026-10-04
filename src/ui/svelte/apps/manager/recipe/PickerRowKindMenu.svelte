<!-- Svelte 5 runes mode -->
<!--
  The requirement row's `or…` control: a dashed trigger over the shared `ActionMenu`, headed
  `Accept instead` and listing `kindMenuItems(kinds)`. A part of `PickerRow`, whose `allowAny`,
  `kinds`, `disabled` and `onSelect(kind)` it receives.
-->
<script>
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { kindMenuItems } from './pickerRowKinds.js';

  let { kinds = [], disabled = false, onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const heading = $derived(text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead'));
</script>

<ActionMenu
  items={kindMenuItems(kinds, text)}
  {heading}
  menuClass="manager-recipe-or-menu"
  {disabled}
  {onSelect}
>
  {#snippet trigger({ attributes })}
    <button
      type="button"
      class="manager-recipe-or-trigger"
      data-keyboard-focus="true"
      aria-label={heading}
      title={text(
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

<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `ActionMenu`'s `trigger` snippet (issue 1516): its own button, named by
  itself, with the primitive's `attributes` spread last, as `PickerRowKindMenu.svelte` does. It
  lives under `tests/fixtures/` because a fixture is not a shipped call site. A plain button comes
  first, so focus can only return to the trigger through the element binding.
-->
<script>
  import ActionMenu from '../../../src/ui/svelte/components/ActionMenu.svelte';

  let { triggerLabel = 'Add an alternative', ...menu } = $props();
</script>

<ActionMenu {...menu}>
  {#snippet trigger({ attributes })}
    <button type="button" data-host-decoy data-keyboard-focus="true">Before</button>
    <button
      type="button"
      class="host-trigger"
      data-host-trigger
      data-keyboard-focus="true"
      aria-label={triggerLabel}
      {...attributes}>or…</button
    >
  {/snippet}
</ActionMenu>

<!--
  A test-only shared `Modal` whose body holds a control, an `IconPicker`, a `Select`, another control
  and a `SetPicker` over a list long enough to scroll, its last control, for the Tab and Escape
  proof (issues 2598, 2676, 2677, 2699); `trapFocus` is forwarded, `footerPicker` adds a search-free
  `SearchablePopover` with a footer as the last control (issue 2739), and `<body data-modal-closes>`
  counts `onClose`.
-->
<script>
  import IconPicker from '../../../src/ui/svelte/components/IconPicker.svelte';
  import Modal from '../../../src/ui/svelte/components/Modal.svelte';
  import SearchablePopover from '../../../src/ui/svelte/components/SearchablePopover.svelte';
  import Select from '../../../src/ui/svelte/components/Select.svelte';
  import SetPicker from '../../../src/ui/svelte/components/SetPicker.svelte';

  let { trapFocus = false, footerPicker = false } = $props();

  let icon = $state('fas fa-fire');
  let kind = $state('ore');
  let tags = $state([]);
  const TAGS = Array.from({ length: 40 }, (_unused, index) => ({
    id: `tag-${index}`,
    label: `Tag ${index}`,
  }));

  document.body.dataset.modalCloses = '0';

  function countClose() {
    document.body.dataset.modalCloses = String(Number(document.body.dataset.modalCloses) + 1);
  }
</script>

{#snippet pickerFooter()}
  <button type="button" data-picker-footer-done>Done</button>
{/snippet}

<Modal open title="Map folders" {trapFocus} onClose={countClose}>
  {#snippet body()}
    <button type="button" data-before>Before</button>
    <IconPicker value={icon} ariaLabel="Choose an icon" onChange={(next) => (icon = next)} />
    <Select
      options={[
        { value: 'ore', label: 'Ore' },
        { value: 'herb', label: 'Herb' },
      ]}
      value={kind}
      ariaLabel="Category"
      onChange={(next) => (kind = next)}
    />
    <button type="button" data-after>After</button>
    <SetPicker value={tags} options={TAGS} ariaLabel="Tags" onChange={(next) => (tags = next)} />
    {#if footerPicker}
      <SearchablePopover
        options={[
          { id: 'ore', label: 'Ore' },
          { id: 'herb', label: 'Herb' },
        ]}
        value="ore"
        showSearch={false}
        triggerHasPopup="listbox"
        triggerLabel="Ore"
        ariaLabel="Kind"
        pickerClass="fixture-footer-picker"
        footer={pickerFooter}
        onSelect={() => {}}
      />
    {/if}
  {/snippet}
</Modal>

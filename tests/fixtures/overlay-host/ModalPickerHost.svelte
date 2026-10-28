<!--
  A test-only shared `Modal` whose body holds a control, an `IconPicker`, a `Select`, another control
  and a `SetPicker` over a list long enough to scroll, for the Tab and Escape proof (issues 2598,
  2676, 2677); `<body data-modal-closes>` counts `onClose`.
-->
<script>
  import IconPicker from '../../../src/ui/svelte/components/IconPicker.svelte';
  import Modal from '../../../src/ui/svelte/components/Modal.svelte';
  import Select from '../../../src/ui/svelte/components/Select.svelte';
  import SetPicker from '../../../src/ui/svelte/components/SetPicker.svelte';

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

<Modal open title="Map folders" onClose={countClose}>
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
  {/snippet}
</Modal>

<!-- The essence bulk edit's Status axis, as `EssenceBulkEditPanel` stages it in the shell. -->
<script>
  import BulkEditSection from '../../../../src/ui/svelte/apps/manager/BulkEditSection.svelte';
  import SegmentedControl from '../../../../src/ui/svelte/components/SegmentedControl.svelte';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, labelKey, options = [], value, groupName } = $props();

  const label = $derived(localize(labelKey));
  const resolved = $derived(
    options.map(({ labelKey: optionKey, ...option }) => ({ ...option, label: localize(optionKey) }))
  );

  function ignore() {}
</script>

<Specimen {...props}>
  <BulkEditSection {label} />
  <SegmentedControl
    options={resolved}
    {value}
    fill={true}
    {groupName}
    ariaLabel={label}
    onChange={ignore}
  />
</Specimen>

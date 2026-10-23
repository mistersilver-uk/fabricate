<!--
  The grid form's portaled panel standing alone, as an icon search, opened from an anchor of its
  own. `SearchablePopover` hands its panel the layout pair and these three functions, so the
  fixture supplies them and the row passes the panel's own props; the anchor is a `Button` the row
  names and insets, standing where the parent's trigger would, and the panel positions against it
  as it does against a caller's anchor. The row's `activeIndex` puts the cursor on the selected
  tile with no act.
-->
<script>
  import { hostRelativePopoverLayout } from '../../../../src/ui/svelte/actions/anchoredPopover.js';
  import { computeIconPickerPopoverLayout } from '../../../../src/ui/svelte/util/iconPickerPopover.js';
  import Button from '../../../../src/ui/svelte/components/Button.svelte';

  let {
    component: Specimen,
    props = {},
    value = '',
    anchorIcon = '',
    anchorLabel = '',
    anchorHasPopup = '',
    anchorExpanded = '',
    anchorStyle = '',
  } = $props();

  let anchorElement = $state(null);

  const layout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  const selected = (option) => option.id === value;

  function choose() {}

  function close() {}
</script>

<Button
  bind:element={anchorElement}
  icon={anchorIcon}
  aria-label={anchorLabel}
  aria-haspopup={anchorHasPopup}
  aria-expanded={anchorExpanded}
  style={anchorStyle}
/>
<Specimen
  {...props}
  anchor={() => anchorElement}
  popoverLayout={layout}
  chooseOption={choose}
  optionIsSelected={selected}
  {close}
/>

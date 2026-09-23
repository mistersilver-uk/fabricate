<!--
  The manager's ONE bulk edit SELECT (issue 1504): the full-width `Select` a bulk panel stages a
  single-valued axis with. Options and `showTick` stay the CALLER'S, because a sentinel's meaning
  differs per studio and axis, and `...rest` routes to the TRIGGER through `Select`'s `triggerData`.
  The root class is load-bearing: `Select` has no trigger-box prop, so this rail's full-width field
  comes from a descendant rule on it in `styles/fabricate.css`.
-->
<script>
  import Select from '../../components/Select.svelte';

  let {
    value = '',
    disabled = false,
    ariaLabel = '',
    options = [],
    showTick = true,
    onChange = () => {},
    ...rest
  } = $props();

  const triggerData = $derived({ ...rest });
</script>

<Select
  size="form"
  {value}
  {options}
  {showTick}
  {disabled}
  {triggerData}
  {ariaLabel}
  {onChange}
  class="fab-bulk-edit-select"
/>

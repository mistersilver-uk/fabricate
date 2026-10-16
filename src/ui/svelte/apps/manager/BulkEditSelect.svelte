<!--
  The manager's ONE bulk edit SELECT (issue 1504): the full-width `Select` a bulk panel stages a
  single-valued axis with. Options and `showTick` stay the caller's, because a sentinel's meaning
  differs per studio and axis, and `...rest` routes to the trigger through `Select`'s `triggerProps`.
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

  const triggerProps = $derived({ ...rest });
</script>

<Select
  size="form"
  {value}
  {options}
  {showTick}
  {disabled}
  {triggerProps}
  {ariaLabel}
  {onChange}
  class="fab-bulk-edit-select"
/>

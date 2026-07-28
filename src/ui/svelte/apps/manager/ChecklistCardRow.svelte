<!-- Svelte 5 runes mode -->
<!--
  A selectable checklist card: box, optional icon tile, and a title/detail copy block.

  The check box itself is the shared `SelectionCheckbox` (issue 772). It used to be a
  hand-rolled `<input>` plus a `.manager-checklist-card-check` span styled from the global
  sheet, which is the same control the component browser's multi-select needs — so the leaf
  was extracted and this row was converted onto it in the same change rather than a second
  implementation being written beside it. Both retired names are ratcheted in
  `tests/components/manager-layout.test.js`.

  `wrapper="contents"` because THIS row's root is already a `<label>`: a nested label is
  invalid HTML and an ambiguous click target, and the row's grid places the box in its
  first column, so the input and the box have to be bare siblings here. The row keeps its
  own `:has(input:focus-visible)` ring and its `.is-selected` / `.is-disabled` treatment —
  layout and row context stay global, only the box's appearance moved.
-->
<script>
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';

  let {
    value = '',
    title = '',
    detail = '',
    icon = '',
    checked = false,
    disabled = false,
    onChange = () => {},
  } = $props();
</script>

<label class="manager-checklist-card-row" class:is-selected={checked} class:is-disabled={disabled} data-tool-prerequisite-row>
  <SelectionCheckbox size="sm" wrapper="contents" {checked} {disabled} {value} {onChange} />
  {#if icon}<span class="manager-checklist-card-icon" aria-hidden="true"><i class={icon}></i></span>{/if}
  <span class="manager-checklist-card-copy">
    <strong>{title}</strong>
    {#if detail}<small>{detail}</small>{/if}
  </span>
</label>

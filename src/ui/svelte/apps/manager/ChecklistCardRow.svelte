<!-- Svelte 5 runes mode -->
<script>
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
  <input
    type="checkbox"
    {value}
    {checked}
    {disabled}
    onchange={(event) => onChange(event.currentTarget.checked)}
  />
  <span class="manager-checklist-card-check" aria-hidden="true"><i class="fas fa-check"></i></span>
  {#if icon}<span class="manager-checklist-card-icon" aria-hidden="true"><i class={icon}></i></span>{/if}
  <span class="manager-checklist-card-copy">
    <strong>{title}</strong>
    {#if detail}<small>{detail}</small>{/if}
  </span>
</label>

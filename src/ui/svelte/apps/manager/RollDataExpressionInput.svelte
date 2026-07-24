<!-- Svelte 5 runes mode -->
<script>
  import {
    displayRollDataExpression,
    toStoredRollDataExpression,
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';

  let {
    value = '',
    placeholder = 'abilities.str.mod',
    disabled = false,
    dataField = '',
    inputAttrs = {},
    onChange = () => {},
  } = $props();

  const displayValue = $derived(displayRollDataExpression(value));
  const showSigil = $derived(String(value || '').trim() === '' || /^@?[A-Za-z_][\w.]*$/.test(String(value || '').trim()));
</script>

<div class="manager-prerequisite-path-input manager-roll-data-expression-input" class:is-formula={!showSigil}>
  {#if showSigil}<span class="manager-prerequisite-at" aria-hidden="true">@</span>{/if}
  <input
    type="text"
    value={displayValue}
    {placeholder}
    {disabled}
    data-roll-data-expression={dataField || undefined}
    {...inputAttrs}
    oninput={(event) => onChange(toStoredRollDataExpression(event.currentTarget.value))}
  />
</div>

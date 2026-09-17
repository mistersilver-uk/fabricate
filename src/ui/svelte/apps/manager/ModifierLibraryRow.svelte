<!--
  ONE ROW PER WORLD MODIFIER — the manager's shared presentation of an entry in
  `characterLibraries.modifiers[]` (issue 1373). It owns the ANATOMY (glyph, name, expression) and no
  appearance: the geometry is `styles/fabricate.css`'s joined block, stated on the ROW's own class so
  a fourth caller opts in with the prop, which `tests/components/manager-layout.test.js` asserts.
  `controlPlacement` and `textLayout` are the reference's two anatomies as declared props rather than
  a second component, per `openspec/specs/design-system/spec.md`, both defaulting to what shipped;
  the glyph follows the control rather than taking a third prop, since a row leading with one has an
  anchor already. `as` is `'div'` unless the control is an `<input>` (a `<label>` around a `<button>`
  is the nested-interaction trap), and each cell takes an attribute bag because the Checks Studio's
  selectors are pinned elsewhere. -->
<script>
  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  const NO_EXPRESSION = '—';

  let {
    as = 'div',
    icon = '',
    label = '',
    expression = '',
    controlPlacement = 'trailing',
    textLayout = 'inline',
    class: extraClass = '',
    rowAttributes = {},
    iconAttributes = {},
    labelAttributes = {},
    expressionAttributes = {},
    children = undefined,
  } = $props();

  const host = $derived(as === 'label' ? 'label' : 'div');
  const leading = $derived(controlPlacement === 'leading');
  const stacked = $derived(textLayout === 'stacked');
  const classes = $derived(
    [
      'manager-modifier-readonly-row',
      leading ? 'is-control-leading' : '',
      stacked ? 'is-text-stacked' : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- ONE DEFINITION OF THE TWO TEXT CELLS, drawn into the row or into the stacking block. -->
{#snippet cells()}
  <span class="manager-modifier-readonly-label" {...labelAttributes}>{label}</span>
  <code class="manager-modifier-readonly-expression" {...expressionAttributes}
    >{expression || NO_EXPRESSION}</code
  >
{/snippet}

<svelte:element this={host} class={classes} {...rowAttributes}>
  {#if leading}{@render children?.()}{/if}
  <span class="manager-modifier-readonly-glyph" aria-hidden="true">
    <i class={icon || DEFAULT_MODIFIER_ICON} {...iconAttributes}></i>
  </span>
  {#if stacked}
    <span class="manager-modifier-readonly-text">{@render cells()}</span>
  {:else}
    {@render cells()}
  {/if}
  {#if !leading}{@render children?.()}{/if}
</svelte:element>

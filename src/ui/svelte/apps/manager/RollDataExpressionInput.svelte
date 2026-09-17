<!--
  A roll-expression field, with or without the `@` affix. `sigil={false}` is a PLAIN input showing
  and writing the stored value byte for byte: a maintainer ruling (issue 1096), because an
  expression may now be `1d4` and a cap that prepends `@` would make that `@1d4`, so the surrounding
  copy teaches the leading `@` instead. It DROPS THE AFFIX WRAPPER, not just the glyph, which insets
  its content and strips the inner `<input>`'s border — kept, it rendered a visible seam, and
  hanging a class on it instead is how this comes back. `sigil` defaults to TRUE, so the Tool
  Studio's bonus-expression field keeps the behaviour its own hint documents.
-->
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
    sigil = true,
    onChange = () => {},
  } = $props();

  const displayValue = $derived(sigil ? displayRollDataExpression(value) : String(value ?? ''));
  const showSigil = $derived(
    sigil &&
      (String(value || '').trim() === '' || /^@?[A-Za-z_][\w.]*$/.test(String(value || '').trim()))
  );

  function write(raw) {
    onChange(sigil ? toStoredRollDataExpression(raw) : raw);
  }
</script>

<!-- ONE definition of the field, rendered into either tree, so the two cannot drift. -->
{#snippet field()}
  <input
    type="text"
    value={displayValue}
    {placeholder}
    {disabled}
    data-roll-data-expression={dataField || undefined}
    {...inputAttrs}
    oninput={(event) => write(event.currentTarget.value)}
  />
{/snippet}

{#if sigil}
  <div class="manager-prerequisite-path-input manager-roll-data-expression-input">
    {#if showSigil}<span class="manager-prerequisite-at" aria-hidden="true">@</span>{/if}
    {@render field()}
  </div>
{:else}
  {@render field()}
{/if}

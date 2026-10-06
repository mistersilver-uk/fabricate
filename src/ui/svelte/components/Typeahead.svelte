<!--
  The library's `<Typeahead>`: a trigger-less query field whose suggestion list the query drives,
  each choice committing at once into a slot, a filter or a short list the CALLER renders, so it
  owns no token run, bound or staging. Its field is `SearchField` with `density` passed through; the
  holder contract is `util/typeaheadCombobox.svelte.js`, whose field handlers reach the input
  through `inputProps` after the caller's attributes, and the list floats through `typeaheadPanel`.
-->
<script>
  import SearchField from './SearchField.svelte';
  import { typeaheadPanel } from '../actions/typeaheadPanel.js';
  import { createTypeaheadCombobox } from '../util/typeaheadCombobox.svelte.js';

  let {
    query = $bindable(''),
    source = () => [],
    onChoose,
    itemLabel,
    itemIcon = undefined,
    label = '',
    ariaLabel = '',
    ariaLabelledBy = '',
    placeholder = undefined,
    emptyLabel = '',
    density = 'default',
    icon = undefined,
    inputProps = undefined,
    listClass = '',
    listProps = undefined,
    listMaxHeight = 148,
    optionClass = '',
    optionHeight = 28,
    optionDataAttr = '',
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(['fabricate-typeahead', extraClass].filter(Boolean).join(' '));

  const items = $derived(source(query) ?? []);

  // A compact field's root is an inline label, so the input is its visual box; the shell otherwise.
  const combo = createTypeaheadCombobox({
    component: 'Typeahead',
    anchor: '.fabricate-search:not(.is-compact)',
    query: () => query,
    // The field's own handler wrote the typed query already, so only Escape's empty query lands.
    setQuery: (next) => {
      if (next !== query) query = next;
    },
    count: () => items.length,
    onChoose: (index) => onChoose(items[index], index),
    get maxHeightCap() {
      return listMaxHeight;
    },
    get rows() {
      return { pitch: optionHeight + 2, gap: 2, chrome: 10 };
    },
  });

  // The holder's handlers are spread after `inputProps`, so a caller's own never runs.
  const holderHandlers = Object.keys(combo.field).filter((key) => key.startsWith('on'));
  $effect(() => {
    const dropped = holderHandlers.filter((key) => inputProps?.[key] !== undefined);
    if (dropped.length === 0) return;
    console.warn(
      `Fabricate | Typeahead: ${dropped.join(', ')} in \`inputProps\` never runs, because the ` +
        "holder's own handler replaces it. Act on the query through `bind:query` or `onChoose`."
    );
  });

  // The list takes the field's name, by the same route.
  const listName = $derived(
    ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : { 'aria-label': label || ariaLabel }
  );

  function optionHook(item) {
    return optionDataAttr ? { [optionDataAttr]: String(item?.id ?? item) } : {};
  }
</script>

<!-- ratchet-exempt(design-system): the spread is this primitive's own rest, forwarded to the field it composes -->
<SearchField
  class={classes}
  bind:value={query}
  {placeholder}
  {label}
  {ariaLabel}
  {ariaLabelledBy}
  {density}
  {icon}
  inputProps={{ ...inputProps, ...combo.field }}
  {...rest}
/>
{#if combo.listed}
  <div
    class={`fabricate-typeahead-list ${listClass}`}
    {...listProps}
    {...listName}
    {...combo.list}
    use:typeaheadPanel={combo.panel}
  >
    {#each items as item, index (`${index}:${item?.id ?? item}`)}
      {@const glyph = itemIcon?.(item)}
      <button
        type="button"
        class={`fabricate-typeahead-option ${optionClass}`}
        data-keyboard-focus="true"
        {...optionHook(item)}
        {...combo.option(index)}
      >
        {#if glyph}<i class={glyph} aria-hidden="true"></i>{/if}
        <span>{itemLabel(item)}</span>
      </button>
    {/each}
  </div>
{:else if combo.open && emptyLabel}
  <div
    class={`fabricate-typeahead-list ${listClass}`}
    {...listProps}
    {...combo.note}
    use:typeaheadPanel={combo.panel}
  >
    <span class="fabricate-typeahead-note">{emptyLabel}</span>
  </div>
{/if}

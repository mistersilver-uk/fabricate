<!--
  The library's `<Typeahead>`: a trigger-less query field whose suggestion list the query drives,
  each choice committing at once into a slot, a filter or a short list the CALLER renders, so it
  owns no token run, bound or staging. Its field is `SearchField` with `density` passed through; the
  holder contract is `util/typeaheadCombobox.svelte.js`, whose field handlers reach the input
  through `inputProps` after the caller's attributes, and the list floats through `typeaheadPanel`.

  Props (the data form, drawn while `source` is absent, which the seam publishes; issue 2860):
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` | `[{ value, label, icon?, detail? }]` | `undefined` | In place of `source`, `itemLabel`, `itemIcon` and `onChoose`: the caller hands the list the rows its query yields; absent lists none. Not an array faults; an item without a string or number `value` and a non-blank `label` is not drawn. |
  | `value` / `onChange(value)` | string \| number \| null / function | `undefined` | The option matched by `===` carries a tick and `aria-checked="true"`; a choice reports the option's own `value`. |
  | `allowFree` / `onFreeText(text)` | truthy / function | `false` | Enter with no option active reports the trimmed, non-blank query. |
  | `error` | string | `''` | Non-blank: the invalid face, `aria-invalid` and this message beneath, naming the input's description; the list opens below the message. |
  | `countLabel` | snippet | `undefined` | Passed to the field's own count region. |

  Invariants:
  - The data form always draws a polite status region beside the field, which says `emptyLabel`
    while the panel shows it, so the no-match line is written into a region that already exists.
  - In the data form Escape first closes an open list and keeps the query, and the list closes
    when the field leaves its document; Fabricate's own typeaheads keep the holder's defaults.
-->
<script>
  import SearchField from './SearchField.svelte';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { typeaheadPanel } from '../actions/typeaheadPanel.js';
  import { createTypeaheadCombobox } from '../util/typeaheadCombobox.svelte.js';

  // The data form's list cap; it is floored to whole rows only while no option has a detail.
  const OPTIONS_MAX_HEIGHT = 228;

  let {
    query = $bindable(''),
    source = undefined,
    onChoose,
    itemLabel,
    itemIcon = undefined,
    options = undefined,
    value = undefined,
    onChange = undefined,
    allowFree = false,
    onFreeText = undefined,
    error = '',
    countLabel = undefined,
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

  const uid = $props.id();
  const errorId = `${uid}-error`;

  const offered = $derived(!source);
  const isText = (field) => typeof field === 'string' && field.trim() !== '';
  const errorText = $derived(isText(error) ? error : '');

  const classes = $derived(
    ['fabricate-typeahead', errorText ? 'is-invalid' : '', extraClass].filter(Boolean).join(' ')
  );

  function drawnOptions(list) {
    if (!Array.isArray(list)) throw new TypeError('Typeahead: `options` must be an array');
    return list.filter(
      (option) => ['string', 'number'].includes(typeof option?.value) && isText(option?.label)
    );
  }

  const drawn = $derived(offered ? drawnOptions(options === undefined ? [] : options) : []);
  const sourced = $derived(source?.(query) ?? []);
  const detailed = $derived(drawn.some((option) => isText(option.detail)));

  // The holder's config reads the props only through these declarations, called at event time, so
  // `combo` holds no published data; the published spread census reads a declaration as holding none.
  function readQuery() {
    return query;
  }

  // The field's own handler wrote the typed query already, so only Escape's empty query lands.
  function writeQuery(next) {
    if (next !== query) query = next;
  }

  function itemCount() {
    return offered ? drawn.length : sourced.length;
  }

  function choose(index) {
    if (offered) onChange?.(drawn[index].value);
    else onChoose(sourced[index], index);
  }

  // What Enter commits with no option active: the trimmed query, only where `allowFree` asks;
  // `false` leaves the key to the page.
  function commitFree() {
    if (!offered || !allowFree) return false;
    const typed = String(query ?? '').trim();
    if (typed) onFreeText?.(typed);
    return true;
  }

  function isDataForm() {
    return offered;
  }

  function showsNote() {
    return Boolean(emptyLabel);
  }

  // While an error shows, the list opens below its message rather than over it.
  function listAnchor() {
    return errorText ? '.fabricate-typeahead-control' : '.fabricate-search:not(.is-compact)';
  }

  function listCap() {
    return offered ? OPTIONS_MAX_HEIGHT : listMaxHeight;
  }

  function listRows() {
    return detailed ? undefined : { pitch: optionHeight + 2, gap: 2, chrome: 10 };
  }

  // A compact field's root is an inline label, so the input is its visual box; the shell otherwise.
  const combo = createTypeaheadCombobox({
    component: 'Typeahead',
    get anchor() {
      return listAnchor();
    },
    query: readQuery,
    setQuery: writeQuery,
    count: itemCount,
    onChoose: choose,
    onEnterUnchosen: commitFree,
    get escapeCloses() {
      return isDataForm();
    },
    get processKeyComposes() {
      return isDataForm();
    },
    get hasNote() {
      return showsNote();
    },
    get maxHeightCap() {
      return listCap();
    },
    get rows() {
      return listRows();
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

  const invalidAttributes = $derived(
    errorText ? { 'aria-invalid': 'true', 'aria-describedby': errorId } : {}
  );

  // The list takes the field's name, by the same route.
  const listName = $derived(
    ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : { 'aria-label': label || ariaLabel }
  );

  // The data form's note is not a region: the status beside the field says it instead.
  const noteAttributes = $derived({
    role: offered ? undefined : combo.note.role,
    onmousedown: combo.note.onmousedown,
  });
  // Read on every draw, so a non-array `options` faults at mount or update, not at a keystroke.
  const announced = $derived(drawn.length === 0 && combo.open && emptyLabel ? emptyLabel : '');

  // Each row's holder attributes and caller hook, derived so the cursor state stays live.
  const rows = $derived(offered ? drawn : sourced);
  const rowAttributes = $derived(
    Array.from({ length: itemCount() }, (_, index) => combo.option(index))
  );
  const sourceHooks = $derived(
    sourced.map((item) => (optionDataAttr ? { [optionDataAttr]: String(item?.id ?? item) } : {}))
  );
  function checked(option) {
    return value === undefined || value === null ? undefined : String(option.value === value);
  }
</script>

{#snippet count()}{@render countLabel?.()}{/snippet}

{#if source}
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
{:else}
  <div
    class="fabricate-typeahead-control"
    use:dismissOnOutsideClick={{ enabled: combo.open, onDetached: combo.close }}
  >
    <SearchField
      class={classes}
      bind:value={query}
      {placeholder}
      {label}
      {ariaLabel}
      {ariaLabelledBy}
      {density}
      {icon}
      countLabel={countLabel ? count : undefined}
      inputProps={{ ...inputProps, ...invalidAttributes, ...combo.field }}
    />
    {#if errorText}<span class="fabricate-typeahead-error" id={errorId}>{errorText}</span>{/if}
    <span class="visually-hidden" role="status">{announced}</span>
  </div>
{/if}
{#if combo.listed}
  <div
    class={`fabricate-typeahead-list${offered ? ' is-data-form' : ''} ${listClass}`}
    {...listProps}
    {...listName}
    {...combo.list}
    use:typeaheadPanel={combo.panel}
  >
    {#each rows as row, index (`${index}:${offered ? row.value : (row?.id ?? row)}`)}
      {@const glyph = offered ? (isText(row.icon) ? row.icon : '') : itemIcon?.(row)}
      <button
        type="button"
        role="option"
        class={`fabricate-typeahead-option ${offered ? 'fabricate-typeahead-option-rich' : optionClass}`}
        class:has-icon={offered && Boolean(glyph)}
        class:is-current={offered && row.value === value}
        data-keyboard-focus="true"
        {...sourceHooks[index]}
        {...rowAttributes[index]}
        aria-checked={offered ? checked(row) : undefined}
      >
        {#if glyph}<i class={glyph} aria-hidden="true"></i>{/if}
        {#if offered}
          <span class="fabricate-typeahead-option-lines">
            <span class="fabricate-typeahead-option-label">{row.label}</span>
            {#if isText(row.detail)}
              <span class="fabricate-typeahead-option-detail">{row.detail}</span>
            {/if}
          </span>
          {#if row.value === value}
            <i class="fas fa-check fabricate-typeahead-option-tick" aria-hidden="true"></i>
          {/if}
        {:else}
          <span>{itemLabel(row)}</span>
        {/if}
      </button>
    {/each}
  </div>
{:else if combo.open && emptyLabel}
  <div
    class={`fabricate-typeahead-list${offered ? ' is-data-form' : ''} ${listClass}`}
    {...listProps}
    {...noteAttributes}
    use:typeaheadPanel={combo.panel}
  >
    <span class="fabricate-typeahead-note">{emptyLabel}</span>
  </div>
{/if}

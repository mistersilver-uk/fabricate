<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): PickerRow is promoted to a manager-only primitive at target, because the recipe ingredient card and the result card now both draw it (issue 1516) -->
<!--
  The one requirement row: a kind plate, a kind select, a name field that is a search until it is
  named and a pill after, an amount, and the caller's trailing controls. Its anatomy is specified in
  `openspec/specs/ui-entity-editors/spec.md` under "The requirement row".

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | `{ kind, id, tags, tagMatch, quantity, quantityFormula }` | `{}` | `toValue(entry)` from `pickerRowKinds.js`. A `kind` the kind table does not name draws the misconfigured face. |
  | `kinds` | match types | all four | What the kind select offers; the row's own kind is always listed too. |
  | `catalogue` | `{ [kind]: [{ id, label, icon, img, offered }] }` | `{}` | Suggestions list the entries whose `offered` is not `false`; the named pill resolves `value.id` against all of them. `catalogue.tags` is the tag picker's vocabulary. |
  | `readonlyKinds` | match types | `[]` | Kinds drawn on the read-only face. Only `currency` has one, for a system whose currency feature is off. |
  | `disabled` | boolean | `false` | Forwarded to every control the row draws. The `convert` and `trailing` snippets are the caller's own. |
  | `invalid` | `{ amount?: string }` | `{}` | Marks the amount control invalid and describes it with the message. |
  | `amount` | `false` \| `{ min, max, unit, inputProps, ariaLabel, … }` | `{}` | `false` draws no amount; the object's keys, which carry the amount slot's localized copy, are stated in `PickerRowAmount.svelte`. |
  | `rollable` / `removable` | booleans | `false` / `true` | The Fixed \| Rolled toggle on a `component` row; and the remove button. |
  | `clearable` / `removeHook` | boolean / string | `true` / `'alternative'` | The named pill's clear; and the remove's `data-recipe-remove` value. The remove is `Remove {name}` and the kind select `Kind of {name}`, `{name}` being the subject's or, unnamed, the kind's. |
  | `nameProps` / `removeProps` | attribute objects | `{}` | A caller's own hooks on the name field and on the remove, spread before the row's own. |

  Snippets:
  - `convert` — the requirement's "or…" control, after the amount and a divider.
  - `trailing` — the caller's own controls, before the remove button.

  Callbacks:
  - `onChange(value)` — the whole next `value`; the caller merges it with `fromValue(entry, value)`.
  - `onRemove()` — the remove button was pressed.

  Rest spread:
  - `{...rest}` lands on the root `<div>`, written after `class={…}` and `data-recipe-option`.
  - `class` is a named prop, because a rest key would replace the row's classes instead of
    extending them.

  Invariants:
  - The row imports nothing from `src/ui/model/`: the caller filters, and says so through `offered`.
  - The typed query is local and never reaches `value`; Enter commits the top suggestion, never the
    raw string. Pinned by `tests/components/picker-row-matrix-mounted.test.js`.
  - The Fixed | Rolled state is per component instance, so a `rollable` caller keys its rows by
    stable entry identity.
-->
<script module>
  // Alternatives carry no id, so the tag-match radio group's `name` is minted per INSTANCE here:
  // two tag rows sharing one `name` are ONE radio group to the browser.
  let tagMatchGroupSeq = 0;
</script>

<script>
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Select from '../../../components/Select.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import PickerRowAmount from './PickerRowAmount.svelte';
  // The ONE kind table: the plate's glyph and tint and the kind select's four words are read from
  // it rather than restated here.
  import { KIND_ORDER, isKnownKind, kindMeta } from './pickerRowKinds.js';
  import { typeaheadPanel } from '../../../actions/typeaheadPanel.js';
  import { createTypeaheadCombobox } from '../../../util/typeaheadCombobox.svelte.js';

  tagMatchGroupSeq += 1;
  const tagMatchGroupId = tagMatchGroupSeq;

  // How many suggestions the list offers, and the height of that many rows with the panel's own
  // padding and border, so a full list never slices its last row.
  const MAX_SUGGESTIONS = 7;
  const SUGGESTIONS_HEIGHT = 232;

  let {
    value = {},
    kinds = KIND_ORDER,
    catalogue = {},
    readonlyKinds = [],
    disabled = false,
    invalid = {},
    amount = {},
    rollable = false,
    removable = true,
    clearable = true,
    removeHook = 'alternative',
    nameProps = {},
    removeProps = {},
    class: className = '',
    convert = null,
    trailing = null,
    onChange = () => {},
    onRemove = () => {},
    ...rest
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // What the GM has typed into this row's name field. It is local to the instance and never part
  // of the requirement: a query reaching the persisted shape would be a half-typed name saved.
  let query = $state('');

  const matchType = $derived(value?.kind ?? 'component');
  const misconfigured = $derived(!isKnownKind(matchType));
  const tags = $derived(Array.isArray(value?.tags) ? value.tags : []);
  const tagMatch = $derived(value?.tagMatch === 'all' ? 'all' : 'any');
  const readonly = $derived(matchType === 'currency' && readonlyKinds.includes('currency'));

  // Every entry of this row's kind, and the ones a GM may newly choose. `chosen` resolves against
  // all of them, so a requirement on a since-withheld subject still reads back by name.
  const entries = $derived(Array.isArray(catalogue?.[matchType]) ? catalogue[matchType] : []);
  const offered = $derived(entries.filter((entry) => entry.offered !== false));
  const chosen = $derived(
    value?.id ? entries.find((entry) => entry.id === value.id) || null : null
  );
  const named = $derived(Boolean(chosen));
  const subjectName = $derived(chosen?.label || kindWord(matchType));

  // The tag picker offers system tags not already on this option.
  const tagPickerOptions = $derived(
    entries
      .filter((entry) => !tags.includes(entry.id))
      .map(({ id, label, icon }) => ({ id, label, icon }))
  );

  const kindWord = (kind) =>
    isKnownKind(kind) ? text(kindMeta(kind).labelKey, kindMeta(kind).label) : String(kind);
  // The caller's kinds in table order, plus this row's own kind always.
  const kindOptions = $derived(
    [...KIND_ORDER, ...(misconfigured ? [matchType] : [])]
      .filter((kind) => kinds.includes(kind) || kind === matchType)
      .map((kind) => ({ value: kind, label: kindWord(kind) }))
  );

  const searchPlaceholder = $derived.by(() => {
    if (matchType === 'essence')
      return text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...');
    if (matchType === 'currency')
      return text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency');
    return text(
      'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
      'Search components...'
    );
  });
  const emptyCatalogueHint = $derived.by(() => {
    if (matchType === 'essence')
      return text('FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined');
    if (matchType === 'currency')
      return text('FABRICATE.Admin.Manager.Recipe.NoCurrencyDefined', 'No currencies defined');
    return text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined');
  });

  const normalizedQuery = $derived(query.trim().toLowerCase());
  const suggestions = $derived(
    offered
      .filter((entry) =>
        String(entry.label || '')
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, MAX_SUGGESTIONS)
  );

  function emit(next) {
    onChange({ ...value, ...next });
  }

  /**
   * Name this row, whichever kind it is, and drop the query that named it.
   *
   * @param {string} id the catalogue id the GM chose (or '' to clear the row)
   */
  function choose(id) {
    query = '';
    emit({ id: String(id || '') });
  }

  /** Take what the GM typed, on ENTER with no option active and on nothing else: the TOP
   *  SUGGESTION, never the raw string, and nothing at all when the query matches nothing. */
  function commitTyped() {
    if (normalizedQuery === '') return;
    const top = suggestions[0];
    if (!top) return;
    choose(top.id);
  }

  const combo = createTypeaheadCombobox({
    component: 'PickerRow',
    anchor: '.manager-recipe-option-name-field',
    query: () => query,
    count: () => suggestions.length,
    setQuery: (value) => (query = value),
    onChoose: (index) => choose(suggestions[index].id),
    onEnterUnchosen: commitTyped,
    maxHeightCap: SUGGESTIONS_HEIGHT,
  });

  // Retype this row. The subject and the tags leave with the old kind.
  function setKind(kind) {
    if (kind === matchType) return;
    query = '';
    emit({ kind, id: '', tags: [], tagMatch: 'any' });
  }

  function addTag(tag) {
    const next = String(tag || '').trim();
    if (!next || tags.includes(next)) return;
    emit({ tags: [...tags, next] });
  }

  function removeTag(tag) {
    emit({ tags: tags.filter((t) => t !== tag) });
  }

  // The kind's own tint, on the glyph and never the tile; a misconfigured row draws a warning
  // in no kind's tint.
  const leadTone = $derived(misconfigured ? 'unknown' : kindMeta(matchType).tone);
  const leadIcon = $derived(
    misconfigured ? 'fa-solid fa-triangle-exclamation' : kindMeta(matchType).icon
  );
  const extraClass = $derived(className ? ` ${className}` : '');

  const forSubject = (key, fallback) => text(key, fallback).replace('{name}', subjectName);
  const removeName = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.RemoveNamed', 'Remove {name}')
  );
  const clearName = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.ClearNamed', 'Clear {name}')
  );
  const unknownHint = $derived(
    text(
      'FABRICATE.Admin.Manager.Recipe.UnknownKindHint',
      'Fabricate does not recognise the kind "{kind}". Remove this row or correct the data.'
    ).replace('{kind}', matchType)
  );
  const tagPolicyWord = $derived(
    tagMatch === 'all'
      ? text('FABRICATE.Admin.Manager.Recipe.TagMatchAll', 'All of')
      : text('FABRICATE.Admin.Manager.Recipe.TagMatchAny', 'Any of')
  );
  const kindLabel = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.KindFor', 'Kind of {name}')
  );

  // The SAME two strings the policy word above reads, so the control and the sentence it writes
  // can never disagree.
  const TAG_MATCH_OPTIONS = [
    { value: 'any', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAny', fallback: 'Any of' },
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAll', fallback: 'All of' },
  ];
  const tagMatchOptions = $derived(
    disabled
      ? TAG_MATCH_OPTIONS.map((option) => ({ ...option, disabled: true }))
      : TAG_MATCH_OPTIONS
  );
</script>

{#snippet remove()}
  <button
    {...removeProps}
    type="button"
    class="manager-recipe-option-remove"
    data-recipe-remove={removeHook}
    data-keyboard-focus="true"
    aria-label={removeName}
    title={removeName}
    {disabled}
    onclick={() => onRemove()}><i class="fas fa-xmark" aria-hidden="true"></i></button
  >
{/snippet}

<!-- The hook is written empty and first: a bare attribute beside a spread serializes as "true". -->
<div
  data-recipe-option=""
  class={`manager-recipe-ingredient-option-row is-${leadTone}${extraClass}`}
  {...rest}
>
  <span class={`manager-recipe-option-lead is-${leadTone}`} aria-hidden="true">
    <i class={leadIcon}></i>
  </span>

  <!-- A one-of-N picker: four mutually exclusive values, no search, no imagery.
       The tooltip rides `triggerTitle`. -->
  <Select
    class="manager-recipe-option-kind"
    size="inline"
    value={matchType}
    options={kindOptions}
    ariaLabel={kindLabel}
    triggerTitle={kindLabel}
    triggerProps={{ 'data-recipe-option-kind': '' }}
    onChange={setKind}
    readonly={misconfigured}
    ariaDescribedBy={misconfigured ? `picker-row-unknown-${tagMatchGroupId}` : ''}
    {disabled}
  />

  {#if matchType === 'tags'}
    <!-- ONE LINE: the policy word, the chosen tags, `+ Tag`, and the Any of / All of control that
         sets the word. No empty state — an unfilled row already says `Any of` with nothing
         after it. -->
    <span class="manager-recipe-option-tags" data-recipe-option-tags>
      <span class="manager-recipe-tag-policy" data-recipe-tag-policy>{tagPolicyWord}</span>
      {#each tags as tag (tag)}
        <Chip tag="span" tone="tag" class="manager-recipe-tag-chip" data-recipe-tag={tag}>
          <span>{tag}</span>
          <button
            type="button"
            class="manager-recipe-tag-remove"
            data-recipe-remove="tag"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
            {disabled}
            onclick={() => removeTag(tag)}><i class="fas fa-times" aria-hidden="true"></i></button
          >
        </Chip>
      {/each}
      <SearchablePopover
        options={tagPickerOptions}
        pickerClass="manager-recipe-tag-picker"
        triggerClass="manager-recipe-tag-trigger"
        triggerIcon="fa-solid fa-plus"
        triggerLabel={text('FABRICATE.Admin.Manager.Recipe.TagTypeLabel', 'Tag')}
        triggerProps={{ 'data-recipe-add-tag': '' }}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        triggerTitle={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        panelLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder',
          'Search tags...'
        )}
        searchLabel={text('FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder', 'Search tags...')}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoTagsDefined', 'No tags defined')}
        showChevron={false}
        {disabled}
        onSelect={(tag) => addTag(tag)}
      />
    </span>
    <!-- `tone="tag"` and NO `density`: the tone carries this control's scale as well as its
         colour. It is the only thing a tag row carries that the other three kinds do not, so its
         size decides whether an empty tag row stands level with its siblings. -->
    <SegmentedControl
      options={tagMatchOptions}
      value={tagMatch}
      tone="tag"
      groupName={`tag-match-${tagMatchGroupId}`}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.TagMatch', 'Tag match')}
      optionDataAttr="data-recipe-tag-match"
      onChange={(mode) => emit({ tagMatch: mode === 'all' ? 'all' : 'any' })}
    />
  {:else if misconfigured}
    <!-- A kind the table does not name: stated, never drawn as a component. -->
    <span class="manager-recipe-option-name-field" data-recipe-option-misconfigured={matchType}>
      <span class="manager-recipe-req-tag is-disabled" title={unknownHint}
        >{text('FABRICATE.Admin.Manager.Recipe.UnknownKind', 'Unknown kind')}</span
      >
      <span id={`picker-row-unknown-${tagMatchGroupId}`} hidden>{unknownHint}</span>
    </span>
  {:else if readonly}
    <!-- Currency feature disabled: a static label rather than a searchable field, flagged inert,
         with the value still visible so nothing the recipe requires is hidden. -->
    <span class="manager-recipe-option-name-field" data-recipe-option-currency>
      <span
        class="manager-recipe-currency-unit is-readonly"
        data-recipe-currency-unit
        data-recipe-currency-readonly
        >{chosen?.label ||
          value?.id ||
          text('FABRICATE.Admin.Manager.Recipe.CurrencyDisabledUnitFallback', 'Currency')}</span
      >
      <span
        class="manager-recipe-req-tag is-disabled"
        data-recipe-currency-disabled
        title={text(
          'FABRICATE.Admin.Manager.Recipe.CurrencyDisabledHint',
          'Currency is disabled for this system; this cost is inactive until it is re-enabled.'
        )}>{text('FABRICATE.Admin.Manager.Recipe.CurrencyDisabledTag', 'Currency off')}</span
      >
    </span>
  {:else}
    <span
      {...nameProps}
      class="manager-recipe-option-name-field"
      data-recipe-option-currency={matchType === 'currency' ? '' : undefined}
      data-recipe-option-essence={matchType === 'essence' ? '' : undefined}
    >
      {#if named}
        <span class="manager-recipe-option-chosen" data-recipe-option-chosen title={chosen.label}>
          {#if chosen.img}
            <img src={chosen.img} alt="" class="manager-recipe-option-chosen-img" />
          {:else}
            <i class={`${chosen.icon} manager-recipe-option-mark is-${leadTone}`} aria-hidden="true"
            ></i>
          {/if}
          <span class="manager-recipe-option-chosen-name">{chosen.label}</span>
          <!-- A REAL BUTTON nested INSIDE the pill rather than made of it: the pill is a `<span>`,
               never a `role="button"` wrapper, which would be a nested interactive. -->
          {#if clearable}<button
              type="button"
              class="manager-recipe-option-clear"
              data-recipe-option-clear
              aria-label={clearName}
              title={text('FABRICATE.Admin.Manager.Recipe.ClearChoice', 'Clear and search again')}
              {disabled}
              onclick={() => choose('')}
              ><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
            >{/if}
        </span>
      {:else}
        <!-- The degraded face every world starts in is stated on the placeholder: a second
             element beside the field starved it of width on a row that must stay on one line. -->
        <span
          class="manager-recipe-option-search"
          class:is-typing={normalizedQuery !== ''}
          class:is-empty-catalogue={offered.length === 0}
          data-recipe-option-empty-catalogue={offered.length === 0 ? '' : undefined}
        >
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="text"
            data-recipe-option-search
            value={query}
            placeholder={offered.length === 0 ? emptyCatalogueHint : searchPlaceholder}
            aria-label={searchPlaceholder}
            {disabled}
            {...combo.field}
          />
        </span>
        {#if combo.listed}
          <span
            class="manager-recipe-option-suggestions"
            aria-label={searchPlaceholder}
            {...combo.list}
            use:typeaheadPanel={combo.panel}
          >
            <!-- Keyed on position plus the id: the rosters are injected with no uniqueness promise,
                 and a duplicate key throws in production and would blank the editor. -->
            {#each suggestions as suggestion, index (`${index}:${suggestion.id}`)}
              <button
                type="button"
                class="manager-recipe-option-suggestion"
                data-recipe-option-suggestion={suggestion.id}
                {...combo.option(index)}
              >
                {#if suggestion.img}
                  <img src={suggestion.img} alt="" class="manager-recipe-option-chosen-img" />
                {:else}
                  <i
                    class={`${suggestion.icon} manager-recipe-option-mark is-${leadTone}`}
                    aria-hidden="true"
                  ></i>
                {/if}
                <span>{suggestion.label}</span>
              </button>
            {/each}
          </span>
        {:else if combo.open}
          <span
            class="manager-recipe-option-suggestions"
            {...combo.note}
            use:typeaheadPanel={combo.panel}
          >
            <span class="manager-recipe-option-no-matches" data-recipe-option-no-matches
              >{text('FABRICATE.Admin.Manager.Recipe.NoMatches', 'No matches')}</span
            >
          </span>
        {/if}
      {/if}
    </span>
  {/if}

  <div class="manager-recipe-option-controls">
    {#if amount !== false && !misconfigured}
      <PickerRowAmount
        {value}
        {amount}
        name={subjectName}
        {rollable}
        {readonly}
        {disabled}
        invalid={invalid?.amount || ''}
        onChange={emit}
      />
    {/if}

    {#if convert}
      <span class="manager-recipe-option-divider" aria-hidden="true"></span>
      {@render convert()}
    {/if}

    <!-- One line, so a row with no `trailing` gains no text node. -->
    {@render trailing?.()}{#if removable}{@render remove()}{/if}
  </div>
</div>

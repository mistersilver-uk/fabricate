<!-- Svelte 5 runes mode -->
<!--
  The name field of a `PickerRow` naming one subject: the named pill, or until it is named an
  inline typeahead search over the kind's catalogue. A part of `PickerRow`, which keys it by kind.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kind` | a known kind | `'component'` | Picks the placeholder and empty hint, and the `data-recipe-option-<kind>` marker on a currency, essence or knowledge field. |
  | `chosen` | catalogue entry \| `null` | `null` | The named subject; `null` draws the search. |
  | `entries` | `[{ id, label, icon, img, offered }]` | `[]` | The kind's catalogue; suggestions list the entries whose `offered` is not `false`. |
  | `tone` | tone suffix | `'component'` | The `is-<tone>` tint on every mark. |
  | `clearable` / `disabled` | booleans | `true` / `false` | The named pill's clear; and every control off. |
  | `clearName` | string | `''` | The clear's accessible name. |
  | `nameProps` | attribute object | `{}` | The caller's hooks on the field, spread before its own. |
  | `describedBy` | element id | `''` | The search input's description, a help line the row draws. |

  Callbacks:
  - `onChoose(id)` — a suggestion was committed, or `''` when the pill is cleared.

  Invariants:
  - The typed query is local and never reaches the row's value; Enter commits the top suggestion,
    never the raw string. Pinned by `tests/components/picker-row-matrix-mounted.test.js`.
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  import { typeaheadPanel } from '../../../actions/typeaheadPanel.js';
  import { createTypeaheadCombobox } from '../../../util/typeaheadCombobox.svelte.js';

  // How many suggestions the list offers, and the height of that many rows with the panel's own
  // padding and border, so a full list never slices its last row.
  const MAX_SUGGESTIONS = 7;
  const SUGGESTIONS_HEIGHT = 232;

  let {
    kind = 'component',
    chosen = null,
    entries = [],
    tone = 'component',
    clearable = true,
    disabled = false,
    clearName = '',
    nameProps = {},
    describedBy = '',
    onChoose = () => {},
  } = $props();

  let query = $state('');

  const offered = $derived(entries.filter((entry) => entry.offered !== false));

  // The field's placeholder and empty hint per kind; any other kind reads the component pair.
  const SEARCH_COPY = {
    essence: [
      ['FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...'],
      ['FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined'],
    ],
    currency: [
      ['FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency'],
      ['FABRICATE.Admin.Manager.Recipe.NoCurrencyDefined', 'No currencies defined'],
    ],
    knowledge: [
      ['FABRICATE.Admin.Manager.Recipe.RecipeSearchPlaceholder', 'Search recipes...'],
      ['FABRICATE.Admin.Manager.Recipe.NoRecipesToTeach', 'No recipes to teach'],
    ],
    component: [
      ['FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...'],
      ['FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined'],
    ],
  };
  const searchCopy = $derived(
    Object.hasOwn(SEARCH_COPY, kind) ? SEARCH_COPY[kind] : SEARCH_COPY.component
  );
  const searchPlaceholder = $derived(localizeOr(...searchCopy[0]));
  const emptyCatalogueHint = $derived(localizeOr(...searchCopy[1]));

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

  function choose(id) {
    query = '';
    onChoose(String(id || ''));
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
</script>

<span
  {...nameProps}
  class="manager-recipe-option-name-field"
  data-recipe-option-currency={kind === 'currency' ? '' : undefined}
  data-recipe-option-essence={kind === 'essence' ? '' : undefined}
  data-recipe-option-knowledge={kind === 'knowledge' ? '' : undefined}
>
  {#if chosen}
    <span class="manager-recipe-option-chosen" data-recipe-option-chosen title={chosen.label}>
      {#if chosen.img}
        <img src={chosen.img} alt="" class="manager-recipe-option-chosen-img" />
      {:else}
        <i class={`${chosen.icon} manager-recipe-option-mark is-${tone}`} aria-hidden="true"></i>
      {/if}
      <span class="manager-recipe-option-chosen-name">{chosen.label}</span>
      <!-- A REAL BUTTON nested INSIDE the pill rather than made of it: the pill is a `<span>`,
           never a `role="button"` wrapper, which would be a nested interactive. -->
      {#if clearable}<button
          type="button"
          class="manager-recipe-option-clear"
          data-recipe-option-clear
          data-keyboard-focus="true"
          aria-label={clearName}
          title={localizeOr('FABRICATE.Admin.Manager.Recipe.ClearChoice', 'Clear and search again')}
          {disabled}
          onclick={() => choose('')}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
        >{/if}
    </span>
  {:else}
    <!-- The degraded face every world starts in is stated on the placeholder: a second element
         beside the field starved it of width on a row that must stay on one line. -->
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
        aria-describedby={describedBy || undefined}
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
            data-keyboard-focus="true"
            {...combo.option(index)}
          >
            {#if suggestion.img}
              <img src={suggestion.img} alt="" class="manager-recipe-option-chosen-img" />
            {:else}
              <i
                class={`${suggestion.icon} manager-recipe-option-mark is-${tone}`}
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
          >{localizeOr('FABRICATE.Admin.Manager.Recipe.NoMatches', 'No matches')}</span
        >
      </span>
    {/if}
  {/if}
</span>

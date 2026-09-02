<!-- Svelte 5 runes mode -->
<!--
  ONE REQUIREMENT ROW, FOR EVERY SURFACE THAT AUTHORS ONE (issue 1373, maintainer round 5).

  Three screens author the same persisted shape through this component: the recipe editor's
  ingredient list, the Tool Breakage tab's repair set (which mounts `RecipeIngredientSetCard`
  directly), and the world Tool entry's copy of that same set. `fabricate-premium`'s downtime
  rewards picker is the fourth instance of the idea, and this row is now the same shape it is —
  which is the point: a fourth row anatomy would be a fourth thing to keep in step.

  == KIND FIRST, THEN VALUE =================================================================
  The row USED to be created by a value. A set-level `Add component` opened a popover, the GM
  picked a component, and the row arrived with its kind already fixed and no way to change it;
  retyping a row meant deleting it and adding another. The design (`proto:2248`) and premium's
  `RewardRow` both create the row from its KIND alone:

    [plate] [kind select] [name field] [quantity] [or…] [×]

  and let the value be named, cleared and re-named inside the row. `proto:4660` is the write
  this mirrors: changing the kind clears `ref`, `tags` and `pol`, so a retyped row is an EMPTY
  row of the new kind rather than one carrying a stale id of the old one.

  == THE NAME FIELD HAS TWO FACES ===========================================================
  Chosen (`proto:2273`): an accent-bordered pill carrying the icon, the name and a clear `×`.
  Unchosen (`proto:2276`): an inline search field with the suggestions rendered BENEATH it
  (`proto:2279`), inside the row — not in a portaled popover. That is what makes the field
  typeable and the suggestion list a narrowing of what the GM typed rather than a second
  surface opened over the first.

  BLUR COMMITS NOTHING; ENTER COMMITS. Premium's `commitTyped` docblock records the defect this
  rule exists for: the DOM fires `change` on a text input when it LOSES FOCUS, not only on
  Enter, so clicking a suggestion committed the raw query first and unmounted the suggestion
  button before its own click could run. The GM's click never did anything. Tabbing to a
  suggestion broke identically, so suppressing the mouse path alone would have been half a fix.

  WHERE WE DEPART FROM PREMIUM, AND WHY. A premium reward stores a NAME, so a GM can type one
  the catalogue has never heard of and premium's field degrades to a plain text input. A
  Fabricate requirement stores an ID — `componentId`, `essenceId`, a currency `unit` — which is
  only meaningful against a catalogue entry, so Enter commits the TOP SUGGESTION rather than the
  raw string. When the catalogue is empty the field still renders and is still typeable, and its
  own placeholder says there is nothing to name yet (`data-recipe-option-empty-catalogue`) —
  degraded rather than blocked, and the state the maintainer's own world starts in.

  == THE TAG ROW IS ONE LINE ================================================================
  `proto:2251`-`2268` draws it as `[Tag ▾] All of [Rare ×] [Volatile ×] [+ Tag] … [Any of|All
  of]`, all on the row. It shipped as a second full-width line carrying an `Any|All` control, an
  `Add tag` dropdown and a large dashed `No tags set` box — three controls and an empty state
  for what the design says in one sentence the row already reads.

  A TAG IS A STRING, not an id, so this arm keeps the shipped `SearchablePopover` for `+ Tag`:
  the choice is over the world tag roster and there is nothing to type into the row.
-->
<script module>
  // Alternatives carry no id (the parent keys them by index), so the tag-match radio
  // group's `name` is minted per INSTANCE here. Two tag rows sharing one `name` would
  // be one radio group to the browser, and choosing Any in the second would silently
  // uncheck the first.
  let tagMatchGroupSeq = 0;
</script>

<script>
  import Chip from '../Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  // The add-new offer projection (issue 1036). It feeds the SUGGESTION list; `selectedEssence`
  // below deliberately resolves against the UNFILTERED prop, so an authored requirement on a
  // disabled essence still reads back by name instead of collapsing to an empty search field.
  import { visibleEssenceOptions } from '../../../../../utils/essenceValidation.js';
  import {
    currencyUnitLabel,
    currencyUnitIcon,
    findCurrencyUnit,
  } from '../../../util/recipeCurrency.js';
  import SearchablePopover from '../SearchablePopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';

  tagMatchGroupSeq += 1;
  const tagMatchGroupId = tagMatchGroupSeq;

  // How many suggestions the inline list offers. `proto:4652` takes seven; the field is inside
  // a row rather than in a dialog, so an unbounded list would cover the rows beneath it.
  const MAX_SUGGESTIONS = 7;

  let {
    option = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. A currency alternative persisted
    // while currency was on stays VISIBLE when it is later disabled, but renders read-only
    // (its unit + amount as static text, no pickers/stepper) so no authored data is hidden.
    currencyEnabled = true,
    // The system's essences ({ id, name, icon, enabled }), for an essence row's own search.
    // Empty when the system has no essences (the Essence kind is not offered).
    // UNFILTERED by contract (issue 1036): the suggestion list narrows to enabled essences
    // itself, but `selectedEssence` must resolve an already-authored disabled essence by name.
    essenceOptions = [],
    // Render the "REQUIRED" tag — set by the parent for a bare (single-alternative)
    // requirement; box alternatives (inside "ANY ONE OF") never carry it.
    showRequiredTag = false,
    // The requirement's single "or…" popover, passed by the parent for a bare
    // requirement so it renders inline at the row's right end.
    orControl = null,
    onChange = () => {},
    onRemove = () => {},
    canRemove = true,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // WHAT THE GM HAS TYPED INTO THIS ROW'S NAME FIELD, and nothing else. It is component-local
  // rather than lifted, because it is not part of the requirement: a query that survived into
  // the persisted shape would be a half-typed name saved as data. The parent keys its rows by
  // INDEX, so a row keeps its instance — and therefore this — across an edit to a sibling.
  let query = $state('');

  const matchType = $derived(
    option?.match?.type === 'tags' ||
      option?.match?.type === 'currency' ||
      option?.match?.type === 'essence'
      ? option.match.type
      : 'component'
  );
  const quantity = $derived(Number(option?.quantity) > 0 ? Number(option.quantity) : 1);
  const componentId = $derived(
    option?.match?.type === 'component' ? option.match.componentId || '' : ''
  );
  const tags = $derived(
    option?.match?.type === 'tags' && Array.isArray(option.match.tags) ? option.match.tags : []
  );
  const tagMatch = $derived(option?.match?.tagMatch === 'all' ? 'all' : 'any');

  const currencyUnitId = $derived(
    option?.match?.type === 'currency' ? option.match.unit || '' : ''
  );
  const currencyAmount = $derived(
    option?.match?.type === 'currency' && Number(option.match.amount) > 0
      ? Number(option.match.amount)
      : 1
  );
  const selectedCurrencyUnit = $derived(findCurrencyUnit(currencyUnits, currencyUnitId));
  // A currency alternative that outlived its feature: render it read-only rather than
  // drop it, so a GM who disables currency still sees what the recipe already requires.
  const currencyReadonly = $derived(matchType === 'currency' && !currencyEnabled);
  const currencyUnitReadonlyLabel = $derived(
    selectedCurrencyUnit
      ? currencyUnitLabel(currencyUnits, currencyUnitId)
      : currencyUnitId ||
          text('FABRICATE.Admin.Manager.Recipe.CurrencyDisabledUnitFallback', 'Currency')
  );

  const essenceId = $derived(option?.match?.type === 'essence' ? option.match.essenceId || '' : '');
  const essenceAmount = $derived(
    option?.match?.type === 'essence' && Number(option.match.amount) > 0
      ? Number(option.match.amount)
      : 1
  );
  const selectedEssence = $derived(
    essenceId ? (essenceOptions || []).find((essence) => essence.id === essenceId) || null : null
  );
  // Every ENABLED essence, plus whichever one this option already names. Keeping the
  // current choice in the list is what makes an authored requirement on a disabled essence
  // editable and clearable rather than stranded (issue 1036).
  const essenceCatalogue = $derived(
    visibleEssenceOptions(essenceOptions, (essence) => essence?.id === essenceId).map(
      (essence) => ({
        id: essence.id,
        label: essence.name,
        icon: essence.icon || 'fas fa-flask-vial',
      })
    )
  );

  const selectedComponent = $derived(
    componentId ? (componentOptions || []).find((item) => item.id === componentId) || null : null
  );

  const componentCatalogue = $derived(
    (componentOptions || []).map((item) => ({
      id: item.id,
      label: item.name,
      img: item.img,
      icon: 'fas fa-cube',
    }))
  );

  const currencyCatalogue = $derived(
    (currencyUnits || []).map((unit) => ({
      id: unit.id,
      label: currencyUnitLabel(currencyUnits, unit.id),
      icon: currencyUnitIcon(currencyUnits, unit.id),
    }))
  );

  // The tag picker offers system tags not already on this option.
  const tagPickerOptions = $derived(
    (itemTags || [])
      .filter((tag) => !tags.includes(tag))
      .map((tag) => ({ id: tag, label: tag, icon: 'fas fa-tag' }))
  );

  // ── WHICH KINDS THE SELECT OFFERS ───────────────────────────────────────────────────────
  // The chooser offers what the ADDERS offer, on premium's own argument: a chooser still
  // listing a type the set-level and alternative adders will not create would let a GM retype
  // a row into a requirement no control on the screen could have authored.
  //
  // PLUS THIS ROW'S OWN KIND, always. An authored currency row on a currency-off system, or an
  // essence row whose essence has since been disabled, must still read back as what it IS;
  // dropping its kind from the list would make the select display the wrong answer.
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);
  // The UNFILTERED roster, matching the adders: issue 1036/2 keeps the essence match type
  // available to a system whose essences are all disabled. What the disabled ones are withheld
  // from is the SUGGESTION list below, which is where an essence is actually chosen.
  const canAddEssence = $derived((essenceOptions || []).length > 0);
  const kindOptions = $derived(
    [
      {
        value: 'component',
        label: text('FABRICATE.Admin.Manager.Recipe.ComponentTypeLabel', 'Component'),
        offered: true,
      },
      {
        value: 'tags',
        label: text('FABRICATE.Admin.Manager.Recipe.TagTypeLabel', 'Tag'),
        offered: true,
      },
      {
        value: 'essence',
        label: text('FABRICATE.Admin.Manager.Recipe.EssenceTypeLabel', 'Essence'),
        offered: canAddEssence,
      },
      {
        value: 'currency',
        label: text('FABRICATE.Admin.Manager.Recipe.CurrencyTypeLabel', 'Currency'),
        offered: canAddCost,
      },
    ].filter((kind) => kind.offered || kind.value === matchType)
  );

  // ── THE NAME FIELD'S SUBJECT, PER KIND ──────────────────────────────────────────────────
  // One shape (`{ catalogue, chosen, placeholder, emptyHint }`) so the markup below reads the
  // same three branches whichever kind the row is; the differences are all data.
  const named = $derived.by(() => {
    if (matchType === 'essence') return Boolean(selectedEssence);
    if (matchType === 'currency') return Boolean(selectedCurrencyUnit);
    return Boolean(selectedComponent);
  });
  const catalogue = $derived.by(() => {
    if (matchType === 'essence') return essenceCatalogue;
    if (matchType === 'currency') return currencyCatalogue;
    return componentCatalogue;
  });
  const chosen = $derived.by(() => {
    if (!named) return null;
    if (matchType === 'essence') {
      return {
        label: selectedEssence.name,
        icon: selectedEssence.icon || 'fas fa-flask-vial',
        img: '',
      };
    }
    if (matchType === 'currency') {
      return {
        label: currencyUnitLabel(currencyUnits, currencyUnitId),
        icon: currencyUnitIcon(currencyUnits, currencyUnitId),
        img: '',
      };
    }
    return {
      label: selectedComponent.name,
      icon: 'fas fa-cube',
      img: selectedComponent.img || '',
    };
  });
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
    catalogue
      .filter((entry) =>
        String(entry.label || '')
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, MAX_SUGGESTIONS)
  );

  function emit(next) {
    onChange({ ...option, ...next });
  }

  // Quantities are capped at 9999 (four digits) — more of a single component is not
  // a meaningful recipe requirement, and it keeps the stepper narrow.
  function setQuantity(value) {
    const next = Number(value);
    emit({ quantity: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1 });
  }

  /**
   * Name this row, whichever kind it is, and drop the query that named it.
   *
   * @param {string} id the catalogue id the GM chose (or '' to clear the row)
   */
  function choose(id) {
    const value = String(id || '');
    query = '';
    if (matchType === 'essence') {
      emit({ match: { type: 'essence', essenceId: value, amount: essenceAmount } });
      return;
    }
    if (matchType === 'currency') {
      emit({ match: { type: 'currency', unit: value, amount: currencyAmount } });
      return;
    }
    emit({ match: { type: 'component', componentId: value || null } });
  }

  /**
   * Take what the GM typed, on ENTER and on nothing else.
   *
   * A Fabricate requirement names a catalogue ENTRY rather than carrying a free string, so
   * what Enter commits is the top suggestion — the same row the GM is looking at — and a query
   * that matches nothing commits nothing rather than authoring an unresolvable id.
   */
  function commitTyped() {
    if (normalizedQuery === '') return;
    const top = suggestions[0];
    if (!top) return;
    choose(top.id);
  }

  /**
   * Retype this row (`proto:4660`). The old value goes with the old kind: a component id means
   * nothing to an essence row, and leaving it behind would persist a field the new kind's own
   * editor cannot see or clear.
   *
   * @param {string} kind one of `component` / `tags` / `essence` / `currency`
   */
  function setKind(kind) {
    if (kind === matchType) return;
    query = '';
    if (kind === 'tags') {
      emit({ quantity, match: { type: 'tags', tags: [], tagMatch: 'any' } });
      return;
    }
    if (kind === 'essence') {
      emit({ quantity: 1, match: { type: 'essence', essenceId: '', amount: 1 } });
      return;
    }
    if (kind === 'currency') {
      emit({ quantity: 1, match: { type: 'currency', unit: '', amount: 1 } });
      return;
    }
    emit({ quantity, match: { type: 'component', componentId: null } });
  }

  function addTag(tag) {
    const value = String(tag || '').trim();
    if (!value || tags.includes(value)) return;
    emit({ match: { type: 'tags', tags: [...tags, value], tagMatch } });
  }

  function removeTag(tag) {
    emit({ match: { type: 'tags', tags: tags.filter((t) => t !== tag), tagMatch } });
  }

  function setTagMatch(mode) {
    emit({ match: { type: 'tags', tags: [...tags], tagMatch: mode === 'all' ? 'all' : 'any' } });
  }

  // Currency amounts share the four-digit cap with quantities and are stored on the
  // match (not the option quantity), which stays the default 1.
  function setCurrencyAmount(value) {
    const next = Number(value);
    emit({
      match: {
        type: 'currency',
        unit: currencyUnitId,
        amount: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1,
      },
    });
  }

  // Essence amounts share the four-digit cap with quantities and are stored on the
  // match (not the option quantity), which stays the default 1.
  function setEssenceAmount(value) {
    const next = Number(value);
    emit({
      match: {
        type: 'essence',
        essenceId,
        amount: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1,
      },
    });
  }

  // The plate that opens the row (`proto:2247`): a neutral tile carrying the kind's own tinted
  // glyph. The tint is on the GLYPH rather than on the tile, so four rows of different kinds
  // read as one list with four marks in it rather than as four differently-coloured cards.
  const leadTone = $derived(
    matchType === 'tags'
      ? 'tag'
      : matchType === 'currency'
        ? 'currency'
        : matchType === 'essence'
          ? 'essence'
          : 'component'
  );
  const leadIcon = $derived(
    matchType === 'tags'
      ? 'fas fa-tag'
      : matchType === 'currency'
        ? 'fa-solid fa-coins'
        : matchType === 'essence'
          ? 'fas fa-flask-vial'
          : 'fas fa-cubes'
  );

  const removeLabel = $derived(
    matchType === 'component'
      ? text('FABRICATE.Admin.Manager.Recipe.RemoveComponent', 'Remove component')
      : text('FABRICATE.Admin.Manager.Recipe.RemoveAlternative', 'Remove alternative')
  );
  const tagPolicyWord = $derived(
    tagMatch === 'all'
      ? text('FABRICATE.Admin.Manager.Recipe.TagMatchAll', 'All of')
      : text('FABRICATE.Admin.Manager.Recipe.TagMatchAny', 'Any of')
  );
  const kindLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.RequirementKind', 'Requirement kind')
  );

  // The SAME two strings the policy word above reads, so the control and the sentence it
  // writes can never disagree: `proto:2253` and `proto:2268` both render `Any of` / `All of`.
  const TAG_MATCH_OPTIONS = [
    { value: 'any', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAny', fallback: 'Any of' },
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAll', fallback: 'All of' },
  ];
</script>

<div class={`manager-recipe-ingredient-option-row is-${leadTone}`} data-recipe-option>
  <span class={`manager-recipe-option-lead is-${leadTone}`} aria-hidden="true">
    <i class={leadIcon}></i>
  </span>

  <!-- A REAL `<select>`, not a segmented control or a popover: four mutually exclusive values
       with no search and no imagery is exactly what a select is for, and the platform widget
       carries keyboard, screen-reader and touch behaviour a hand-rolled menu would have to
       reimplement. `proto:2248` draws one too. -->
  <select
    class="manager-recipe-option-kind"
    data-recipe-option-kind
    aria-label={kindLabel}
    title={kindLabel}
    value={matchType}
    onchange={(event) => setKind(event.currentTarget.value)}
  >
    {#each kindOptions as kind (kind.value)}
      <option value={kind.value}>{kind.label}</option>
    {/each}
  </select>

  {#if matchType === 'tags'}
    <!-- ONE LINE (`proto:2252`-`2268`): the policy word, the chosen tags, `+ Tag`, and the
         Any of / All of control that sets the word. No empty state — an unfilled tag row is
         its own empty state, and it already says `Any of` with nothing after it. -->
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
            onclick={() => removeTag(tag)}><i class="fas fa-times" aria-hidden="true"></i></button
          >
        </Chip>
      {/each}
      <SearchablePopover
        options={tagPickerOptions}
        pickerClass="manager-recipe-tag-picker"
        triggerChip
        triggerClass="manager-recipe-tag-trigger"
        triggerIcon="fas fa-plus"
        triggerLabel={text('FABRICATE.Admin.Manager.Recipe.TagTypeLabel', 'Tag')}
        triggerData={{ 'data-recipe-add-tag': '' }}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        triggerTitle={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder',
          'Search tags...'
        )}
        searchAriaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder',
          'Search tags...'
        )}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoTagsDefined', 'No tags defined')}
        showChevron={false}
        onChoose={(tag) => addTag(tag)}
      />
    </span>
    <SegmentedControl
      options={TAG_MATCH_OPTIONS}
      value={tagMatch}
      density="compact"
      groupName={`tag-match-${tagMatchGroupId}`}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.TagMatch', 'Tag match')}
      optionDataAttr="data-recipe-tag-match"
      onChange={(mode) => setTagMatch(mode)}
    />
  {:else if currencyReadonly}
    <!-- Currency feature disabled: the unit is a static label, not a searchable field, and a
         flag marks the requirement inert. The value stays visible so nothing the recipe
         already requires is silently hidden. -->
    <span class="manager-recipe-option-name-field" data-recipe-option-currency>
      <span
        class="manager-recipe-currency-unit is-readonly"
        data-recipe-currency-unit
        data-recipe-currency-readonly>{currencyUnitReadonlyLabel}</span
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
      class="manager-recipe-option-name-field"
      data-recipe-option-currency={matchType === 'currency' ? '' : undefined}
      data-recipe-option-essence={matchType === 'essence' ? '' : undefined}
    >
      {#if named}
        <span class="manager-recipe-option-chosen" data-recipe-option-chosen title={chosen.label}>
          {#if chosen.img}
            <img src={chosen.img} alt="" class="manager-recipe-option-chosen-img" />
          {:else}
            <i class={chosen.icon} aria-hidden="true"></i>
          {/if}
          <span class="manager-recipe-option-chosen-name">{chosen.label}</span>
          <!-- A REAL BUTTON, nested inside the pill rather than made of it. The pill is a
               `<span>`, so this is a button inside a non-interactive element — never a
               `role="button"` wrapper with a button inside it, which is the nested-button
               trap this row would otherwise walk into. -->
          <button
            type="button"
            class="manager-recipe-option-clear"
            data-recipe-option-clear
            aria-label={text(
              'FABRICATE.Admin.Manager.Recipe.ClearChoice',
              'Clear and search again'
            )}
            title={text('FABRICATE.Admin.Manager.Recipe.ClearChoice', 'Clear and search again')}
            onclick={() => choose('')}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
          >
        </span>
      {:else}
        <!-- THE DEGRADED FACE, and the one the maintainer's own world starts in: a world with
             no components and no essences. The field still renders and is still typeable; what
             changes is that its own placeholder says there is nothing to name yet, rather than
             inviting a search that can never return.

             STATED ON THE PLACEHOLDER RATHER THAN IN A SECOND ELEMENT BESIDE IT. A muted note
             was tried first and is a worse answer twice over: the row must stay on one line, so
             a `nowrap` sentence beside the field starved the field itself down to about thirty
             pixels, and the note repeated word for word what the placeholder inside it already
             said. -->
        <span
          class="manager-recipe-option-search"
          class:is-typing={normalizedQuery !== ''}
          class:is-empty-catalogue={catalogue.length === 0}
          data-recipe-option-empty-catalogue={catalogue.length === 0 ? '' : undefined}
        >
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="text"
            data-recipe-option-search
            value={query}
            placeholder={catalogue.length === 0 ? emptyCatalogueHint : searchPlaceholder}
            aria-label={searchPlaceholder}
            oninput={(event) => {
              query = event.currentTarget.value;
            }}
            onkeydown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commitTyped();
            }}
          />
        </span>
        {#if normalizedQuery !== ''}
          <span class="manager-recipe-option-suggestions">
            <!-- KEYED ON POSITION plus the id, never on the id alone. `componentOptions` and
                 `essenceOptions` are injected rosters this row cannot make a uniqueness promise
                 about, and Svelte throws `each_key_duplicate` on a repeated key in PRODUCTION
                 as well as in development — one repeat would blank the whole editor rather than
                 draw a row twice. The id rides along so a row whose contents changed under a
                 narrowing search is re-created rather than updated in place. -->
            {#each suggestions as suggestion, index (`${index}:${suggestion.id}`)}
              <button
                type="button"
                class="manager-recipe-option-suggestion"
                data-recipe-option-suggestion={suggestion.id}
                onclick={() => choose(suggestion.id)}
              >
                {#if suggestion.img}
                  <img src={suggestion.img} alt="" class="manager-recipe-option-chosen-img" />
                {:else}
                  <i class={suggestion.icon} aria-hidden="true"></i>
                {/if}
                <span>{suggestion.label}</span>
              </button>
            {/each}
            {#if suggestions.length === 0}
              <span class="manager-recipe-option-no-matches" data-recipe-option-no-matches
                >{text('FABRICATE.Admin.Manager.Recipe.NoMatches', 'No matches')}</span
              >
            {/if}
          </span>
        {/if}
      {/if}
    </span>
  {/if}

  <div class="manager-recipe-option-controls">
    {#if showRequiredTag}
      <span class="manager-recipe-req-tag is-required" data-recipe-req-tag="required"
        >{text('FABRICATE.Admin.Manager.Recipe.RequiredTag', 'Required')}</span
      >
    {/if}

    <!-- EVERY row type edits its count through the SAME Stepper in the SAME end-of-row
         position (issue 676). The MODEL differs even though the control does not: a
         component/tag row counts with `option.quantity`, while essence and currency carry
         their count on the MATCH (`match.amount`) with `option.quantity` pinned at 1. So the
         marker attribute stays per-kind (`data-recipe-essence-amount` /
         `data-recipe-currency-amount` / `data-recipe-option-quantity`) — a shared marker would
         claim these write the same field. -->
    {#if matchType === 'essence'}
      <Stepper
        value={essenceAmount}
        min={1}
        max={9999}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityDecrement',
          'Decrease quantity'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityIncrement',
          'Increase quantity'
        )}
        inputProps={{
          'data-recipe-essence-amount': '',
          class: 'fab-stepper-input manager-recipe-option-quantity',
        }}
        onChange={(value) => setEssenceAmount(value)}
      />
    {:else if matchType === 'currency' && currencyReadonly}
      <!-- Read-only amount: the value stays visible but is not editable while currency is
           disabled. Keeps the same marker so tests still locate the currency count. -->
      <span
        class="manager-recipe-option-quantity is-readonly"
        data-recipe-currency-amount
        data-recipe-currency-readonly-amount>{currencyAmount}</span
      >
    {:else if matchType === 'currency'}
      <Stepper
        value={currencyAmount}
        min={1}
        max={9999}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityDecrement',
          'Decrease quantity'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityIncrement',
          'Increase quantity'
        )}
        inputProps={{
          'data-recipe-currency-amount': '',
          class: 'fab-stepper-input manager-recipe-option-quantity',
        }}
        onChange={(value) => setCurrencyAmount(value)}
      />
    {:else}
      <Stepper
        value={quantity}
        min={1}
        max={9999}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityDecrement',
          'Decrease quantity'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityIncrement',
          'Increase quantity'
        )}
        inputProps={{
          'data-recipe-option-quantity': '',
          class: 'fab-stepper-input manager-recipe-option-quantity',
        }}
        onChange={(value) => setQuantity(value)}
      />
    {/if}

    {#if orControl}
      <span class="manager-recipe-option-divider" aria-hidden="true"></span>
      {@render orControl()}
    {/if}

    {#if canRemove}
      <button
        type="button"
        class="manager-recipe-option-remove"
        data-recipe-remove="alternative"
        aria-label={removeLabel}
        title={removeLabel}
        onclick={() => onRemove()}><i class="fas fa-xmark" aria-hidden="true"></i></button
      >
    {/if}
  </div>
</div>

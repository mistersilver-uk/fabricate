<!-- Svelte 5 runes mode -->
<!--
  ONE REQUIREMENT ROW, FOR EVERY SURFACE THAT AUTHORS ONE. Three screens mount it — the recipe
  editor's ingredient list, the Tool Breakage tab's repair set and the world Tool entry's copy of
  that same set — and `fabricate-premium`'s downtime rewards picker is a fourth instance of the
  same idea, which is the point: a fourth row anatomy would be a fourth thing to keep in step.

  Its anatomy (kind FIRST, value second), the name field's two faces, the commit rule, the
  degraded empty-catalogue face, the per-kind tint, the absence of a `REQUIRED` badge and the
  one-line tag arm are all stated in `openspec/specs/ui-integration/spec.md` → "Ingredients tab" →
  "The requirement row". This file implements that section and adds nothing to it.

  WHERE PREMIUM AND THE DESIGN DISAGREE, WE FOLLOW PREMIUM. Six values below follow the shipped
  `RewardRow` rather than the mockup, each deliberately, and they are recorded because an audit
  measuring this row against the mockup alone would read all six as drift and "correct" them back
  — putting this row out of step with the fourth instance of the same idea. The argument is the
  same in every case: the mockup is fixed-width with no running implementation, premium is a
  control a GM already uses, and where the two disagree on something a GM can SEE ACROSS BOTH
  PRODUCTS in one session the shipped one wins, because the mismatch is paid for at the seam.

    1. Control height 30px, not 28: 30 is Fabricate's shipped control-height rung, so 28 would
       make this the one row on the screen off the ladder.
    2. The resting search border is `--fab-border-strong`, accenting only WHILE TYPING, where an
       accent at rest reads as a field already holding a value.
    3. The plate glyph is 12px, not 11.  4. The suggestion panel is offset 33px.
    5. The kind select renders at 11px.  6. The tint is per KIND, not per entity — and that last
       one is NOT a departure from the design, whose own kind table tints per kind too.

  The seventh disagreement — what Enter commits — is forced by a Fabricate requirement being
  ID-valued rather than by taste, and is stated in the spec section named above.
-->
<script module>
  // Alternatives carry no id, so the tag-match radio group's `name` is minted per INSTANCE here:
  // two tag rows sharing one `name` are ONE radio group to the browser.
  let tagMatchGroupSeq = 0;
</script>

<script>
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  // The add-new offer projection, feeding the SUGGESTION list only; `selectedEssence` below
  // resolves against the UNFILTERED prop, so an authored requirement on a disabled essence still
  // reads back by name rather than collapsing to an empty search field.
  import { visibleEssenceOptions } from '../../../../../utils/essenceValidation.js';
  import {
    currencyUnitLabel,
    currencyUnitIcon,
    findCurrencyUnit,
  } from '../../../util/recipeCurrency.js';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  // The ONE kind table: the plate's glyph and tint and the kind select's four words are read from
  // it rather than restated here.
  import { INGREDIENT_KIND_ORDER, ingredientKindMeta } from './ingredientKindMeta.js';

  tagMatchGroupSeq += 1;
  const tagMatchGroupId = tagMatchGroupSeq;

  // How many suggestions the inline list offers: the field is inside a row rather than a dialog,
  // so an unbounded list would cover the rows beneath it.
  const MAX_SUGGESTIONS = 7;

  let {
    option = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. A currency alternative persisted while it
    // was on stays VISIBLE once it is disabled, read-only, so no authored data is hidden.
    currencyEnabled = true,
    // The system's essences ({ id, name, icon, enabled }), for an essence row's own search, and
    // UNFILTERED by contract: the suggestion list narrows to enabled essences itself, but
    // `selectedEssence` must resolve an already-authored disabled essence by name.
    essenceOptions = [],
    // The requirement's single "or…" popover, passed by the parent so it renders inline here.
    orControl = null,
    onChange = () => {},
    onRemove = () => {},
    canRemove = true,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // WHAT THE GM HAS TYPED INTO THIS ROW'S NAME FIELD, component-local rather than lifted because
  // it is not part of the requirement: a query reaching the persisted shape would be a half-typed
  // name saved as data. The parent keys rows by INDEX, so a row keeps this across a sibling edit.
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
  // A currency alternative that outlived its feature: read-only rather than dropped.
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
  // Every ENABLED essence, plus whichever one this option already names — which is what makes a
  // requirement on a since-disabled essence editable and clearable rather than stranded.
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

  // WHICH KINDS THE SELECT OFFERS: what the ADDERS offer, plus this row's OWN kind always, per
  // `openspec/specs/ui-integration/spec.md` → "The requirement row".
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);
  // The UNFILTERED roster, matching the adders: a system whose essences are all disabled keeps
  // the essence match type, and the withholding happens in the SUGGESTION list below.
  const canAddEssence = $derived((essenceOptions || []).length > 0);
  // The four words come from the shared kind table, which the `or…` menu also reads, so the two
  // name the same kinds with the same nouns. What stays HERE is the offer rule.
  const kindOffered = $derived({
    component: true,
    tags: true,
    essence: canAddEssence,
    currency: canAddCost,
  });
  const kindOptions = $derived(
    INGREDIENT_KIND_ORDER.filter((kind) => kindOffered[kind] || kind === matchType).map((kind) => ({
      value: kind,
      label: text(ingredientKindMeta(kind).labelKey, ingredientKindMeta(kind).label),
    }))
  );

  // THE NAME FIELD'S SUBJECT, PER KIND: one shape (`{ catalogue, chosen, placeholder, emptyHint }`)
  // so the markup below reads the same three branches whichever kind the row is.
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

  // Quantities are capped at four digits, which keeps the stepper narrow.
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

  /** Take what the GM typed, on ENTER and on nothing else: the TOP SUGGESTION, never the raw
   *  string, and nothing at all when the query matches nothing. */
  function commitTyped() {
    if (normalizedQuery === '') return;
    const top = suggestions[0];
    if (!top) return;
    choose(top.id);
  }

  /**
   * Retype this row. The old value goes with the old kind, because leaving it behind would
   * persist a field the new kind's own editor can neither see nor clear.
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

  // Currency amounts share the four-digit cap and live on the MATCH, not the option quantity.
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

  // Essence amounts share the four-digit cap and live on the MATCH, not the option quantity.
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

  // THE KIND'S OWN TINT, on the GLYPH and never the tile, reaching every glyph the row draws for
  // its subject. Glyph and tint come from ONE table because they were once a pair of ternaries
  // here and a DIFFERENTLY-SPELLED pair in the `or…` menu, so the glyph a GM pressed to add a
  // component was `fa-cube` while the row it produced drew `fa-cubes`.
  const leadTone = $derived(ingredientKindMeta(matchType).tone);
  const leadIcon = $derived(ingredientKindMeta(matchType).icon);

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

  // The SAME two strings the policy word above reads, so the control and the sentence it writes
  // can never disagree.
  const TAG_MATCH_OPTIONS = [
    { value: 'any', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAny', fallback: 'Any of' },
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAll', fallback: 'All of' },
  ];
</script>

<div class={`manager-recipe-ingredient-option-row is-${leadTone}`} data-recipe-option>
  <span class={`manager-recipe-option-lead is-${leadTone}`} aria-hidden="true">
    <i class={leadIcon}></i>
  </span>

  <!-- A REAL `<select>`: four mutually exclusive values with no search and no imagery is what a
       select is for, and the platform widget carries keyboard, screen-reader and touch behaviour
       a hand-rolled menu would reimplement. -->
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
    <!-- `tone="tag"` and NO `density`: the tone carries this control's scale as well as its
         colour. It is the only thing a tag row carries that the other three kinds do not, so its
         size decides whether an empty tag row stands level with its siblings. -->
    <SegmentedControl
      options={TAG_MATCH_OPTIONS}
      value={tagMatch}
      tone="tag"
      groupName={`tag-match-${tagMatchGroupId}`}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.TagMatch', 'Tag match')}
      optionDataAttr="data-recipe-tag-match"
      onChange={(mode) => setTagMatch(mode)}
    />
  {:else if currencyReadonly}
    <!-- Currency feature disabled: a static label rather than a searchable field, flagged inert,
         with the value still visible so nothing the recipe requires is hidden. -->
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
            <i class={`${chosen.icon} manager-recipe-option-mark is-${leadTone}`} aria-hidden="true"
            ></i>
          {/if}
          <span class="manager-recipe-option-chosen-name">{chosen.label}</span>
          <!-- A REAL BUTTON nested INSIDE the pill rather than made of it: the pill is a `<span>`,
               never a `role="button"` wrapper, which would be a nested interactive. -->
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
        <!-- THE DEGRADED FACE, the one every world starts in. STATED ON THE PLACEHOLDER RATHER
             THAN IN A SECOND ELEMENT BESIDE IT: the row must stay on one line, so a `nowrap`
             sentence beside the field starved the field down to about thirty pixels, and it
             repeated word for word what the placeholder inside it already said. -->
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
            <!-- KEYED ON POSITION plus the id, never the id alone: the rosters are injected and this
                 row can make no uniqueness promise about them, while Svelte throws
                 `each_key_duplicate` in PRODUCTION as well as development, so one repeat would
                 blank the editor. The id rides along so a narrowed row is re-created. -->
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
                  <i
                    class={`${suggestion.icon} manager-recipe-option-mark is-${leadTone}`}
                    aria-hidden="true"
                  ></i>
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
    <!-- EVERY row type edits its count through the SAME Stepper in the SAME end-of-row position,
         but the MODEL differs: a component/tag row counts with `option.quantity` while essence
         and currency carry theirs on the MATCH (`match.amount`). So the marker attribute stays
         per-kind — a shared one would claim these write the same field. -->
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
      <!-- Read-only amount, on the same marker so the currency count stays locatable. -->
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

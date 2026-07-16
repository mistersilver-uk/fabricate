<!-- Svelte 5 runes mode -->
<!--
  One alternative (an `Ingredient`) inside a requirement. Alternatives have no id,
  so the parent keys them by index and owns the option list; this component renders
  the requirement ROW to the prototype anatomy (issue 643 §B1):

    [lead chip] [icon medallion / name] … [REQUIRED tag] [qty stepper] | [or…] [× remove]

  The lead chip is a small type-tinted square (component → cubes, tag → tag, currency
  → coins). A component alternative additionally shows the component's image as the
  clickable picker medallion (swap the component) with its name beside it; a tag
  alternative shows a summary "any #tag" name + a TAG pill, with the any/all control
  and chip list as an editing detail below; a currency alternative shows an amount +
  unit picker.

  The quantity is the shared `Stepper` (horizontal) rather than a raw number input
  (§B1); the remove control is a subtle `×` (`fa-xmark`), never a loud `fa-minus`
  (§B1). The requirement-level "or…" popover is passed in as the `orControl` snippet
  by the parent for a BARE (single-alternative) requirement, so it sits INLINE at the
  row's right end; a multi-alternative box renders it at the box bottom instead.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    currencyUnitLabel,
    currencyUnitIcon,
    findCurrencyUnit
  } from '../../../util/recipeCurrency.js';
  import SearchablePopover from '../SearchablePopover.svelte';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    option = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // The system's essences ({ id, name, icon }), for an essence OR alternative's
    // picker. Empty when the system has no essences (the essence arm never appears).
    essenceOptions = [],
    // Render the "REQUIRED" tag — set by the parent for a bare (single-alternative)
    // requirement; box alternatives (inside "ANY ONE OF") never carry it.
    showRequiredTag = false,
    // The requirement's single "or…" popover, passed by the parent for a bare
    // requirement so it renders inline at the row's right end.
    orControl = null,
    onChange = () => {},
    onRemove = () => {},
    canRemove = true
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const matchType = $derived(
    option?.match?.type === 'tags' ||
    option?.match?.type === 'currency' ||
    option?.match?.type === 'essence'
      ? option.match.type
      : 'component'
  );
  const quantity = $derived(Number(option?.quantity) > 0 ? Number(option.quantity) : 1);
  const componentId = $derived(option?.match?.type === 'component' ? option.match.componentId || '' : '');
  const tags = $derived(
    option?.match?.type === 'tags' && Array.isArray(option.match.tags) ? option.match.tags : []
  );
  const tagMatch = $derived(option?.match?.tagMatch === 'all' ? 'all' : 'any');

  // The single-line tag summary shown beside the medallion: "any #reagent #rare".
  const tagSummary = $derived.by(() => {
    const word =
      tagMatch === 'all'
        ? text('FABRICATE.Admin.Manager.Recipe.TagMatchAllWord', 'all')
        : text('FABRICATE.Admin.Manager.Recipe.TagMatchAnyWord', 'any');
    if (tags.length === 0) return text('FABRICATE.Admin.Manager.Recipe.TagRowEmptyName', 'any tagged item');
    return `${word} ${tags.map((tag) => `#${tag}`).join(' ')}`;
  });

  const currencyUnitId = $derived(option?.match?.type === 'currency' ? option.match.unit || '' : '');
  const currencyAmount = $derived(
    option?.match?.type === 'currency' && Number(option.match.amount) > 0
      ? Number(option.match.amount)
      : 1
  );
  const selectedCurrencyUnit = $derived(findCurrencyUnit(currencyUnits, currencyUnitId));
  const currencyPickerOptions = $derived(
    (currencyUnits || []).map((unit) => ({
      id: unit.id,
      label: currencyUnitLabel(currencyUnits, unit.id),
      icon: currencyUnitIcon(currencyUnits, unit.id)
    }))
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
  const essencePickerOptions = $derived(
    (essenceOptions || []).map((essence) => ({
      id: essence.id,
      label: essence.name,
      icon: essence.icon || 'fas fa-flask-vial'
    }))
  );

  const selectedComponent = $derived(
    componentId ? (componentOptions || []).find(item => item.id === componentId) || null : null
  );

  // The picker lists every system component; the trigger resolves the current id
  // to its name/image so a chosen component reads back clearly.
  const componentPickerOptions = $derived(
    (componentOptions || []).map(item => ({ id: item.id, label: item.name, img: item.img }))
  );

  // The tag picker offers system tags not already on this option.
  const tagPickerOptions = $derived(
    (itemTags || [])
      .filter(tag => !tags.includes(tag))
      .map(tag => ({ id: tag, label: tag, icon: 'fas fa-tag' }))
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

  function chooseComponent(id) {
    emit({ match: { type: 'component', componentId: id } });
  }

  function addTag(tag) {
    const value = String(tag || '').trim();
    if (!value || tags.includes(value)) return;
    emit({ match: { type: 'tags', tags: [...tags, value], tagMatch } });
  }

  function removeTag(tag) {
    emit({ match: { type: 'tags', tags: tags.filter(t => t !== tag), tagMatch } });
  }

  function setTagMatch(mode) {
    emit({ match: { type: 'tags', tags: [...tags], tagMatch: mode === 'all' ? 'all' : 'any' } });
  }

  function chooseCurrencyUnit(unitId) {
    emit({ match: { type: 'currency', unit: String(unitId || ''), amount: currencyAmount } });
  }

  // Currency amounts share the four-digit cap with quantities and are stored on the
  // match (not the option quantity), which stays the default 1.
  function setCurrencyAmount(value) {
    const next = Number(value);
    emit({
      match: {
        type: 'currency',
        unit: currencyUnitId,
        amount: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1
      }
    });
  }

  function chooseEssence(id) {
    emit({ match: { type: 'essence', essenceId: String(id || ''), amount: essenceAmount } });
  }

  // Essence amounts share the four-digit cap with quantities and are stored on the
  // match (not the option quantity), which stays the default 1.
  function setEssenceAmount(value) {
    const next = Number(value);
    emit({
      match: {
        type: 'essence',
        essenceId,
        amount: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1
      }
    });
  }

  // Lead-chip tone + icon per match type (the small type-tinted square that opens
  // the row, matching the prototype). Essence reuses the existing `is-essence` tone.
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
</script>

<div class={`manager-recipe-ingredient-option-row is-${leadTone}`} data-recipe-option>
  <span class={`manager-recipe-option-lead is-${leadTone}`} aria-hidden="true">
    <i class={leadIcon}></i>
  </span>

  <div class="manager-recipe-option-target">
    {#if matchType === 'component'}
      <div class="manager-recipe-option-component">
        <SearchablePopover
          options={componentPickerOptions}
          value={componentId}
          pickerClass="manager-recipe-component-picker"
          triggerClass="manager-button manager-recipe-component-trigger"
          triggerImg={selectedComponent?.img || ''}
          triggerIcon={selectedComponent ? '' : 'fas fa-cube'}
          triggerLabel={selectedComponent ? '' : text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
          triggerTitle={selectedComponent?.name || ''}
          triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
          dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
          searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
          searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
          emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
          onChoose={(id) => chooseComponent(id)}
        />
        {#if selectedComponent}
          <span class="manager-recipe-component-name">{selectedComponent.name}</span>
        {/if}
      </div>
    {:else if matchType === 'tags'}
      <span class="manager-recipe-option-tag-name" data-recipe-tag-summary>{tagSummary}</span>
      <span class="manager-recipe-req-tag is-tag" data-recipe-req-tag="tag">{text('FABRICATE.Admin.Manager.Recipe.TagTypeLabel', 'Tag')}</span>
    {:else if matchType === 'essence'}
      <div class="manager-recipe-option-essence" data-recipe-option-essence>
        <input
          type="number"
          min="1"
          max="9999"
          class="manager-recipe-essence-amount"
          data-recipe-essence-amount
          aria-label={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
          value={essenceAmount}
          onchange={(e) => setEssenceAmount(e.target.value)}
        />
        <span class="manager-recipe-essence-picker-wrap" data-recipe-essence-picker>
          <SearchablePopover
            options={essencePickerOptions}
            value={essenceId}
            pickerClass="manager-recipe-essence-picker"
            triggerClass="manager-button is-subtle manager-recipe-essence-trigger"
            triggerIcon={selectedEssence?.icon || 'fas fa-flask-vial'}
            triggerLabel={selectedEssence
              ? selectedEssence.name
              : text('FABRICATE.Admin.Manager.Recipe.PickEssence', 'Pick essence')}
            triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickEssence', 'Pick essence')}
            triggerTitle={text('FABRICATE.Admin.Manager.Recipe.PickEssence', 'Pick essence')}
            dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickEssence', 'Pick essence')}
            searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
            searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
            emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined')}
            onChoose={(id) => chooseEssence(id)}
          />
        </span>
        <span class="manager-recipe-req-tag is-essence" data-recipe-req-tag="essence">{text('FABRICATE.Admin.Manager.Recipe.EssenceTypeLabel', 'Essence')}</span>
      </div>
    {:else}
      <div class="manager-recipe-option-currency" data-recipe-option-currency>
        <input
          type="number"
          min="1"
          max="9999"
          class="manager-recipe-currency-amount"
          data-recipe-currency-amount
          aria-label={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
          value={currencyAmount}
          onchange={(e) => setCurrencyAmount(e.target.value)}
        />
        <span class="manager-recipe-currency-unit" data-recipe-currency-unit>
          <SearchablePopover
            options={currencyPickerOptions}
            value={currencyUnitId}
            pickerClass="manager-recipe-currency-picker"
            triggerClass="manager-button is-subtle manager-recipe-currency-trigger"
            triggerIcon={currencyUnitIcon(currencyUnits, currencyUnitId)}
            triggerLabel={selectedCurrencyUnit
              ? currencyUnitLabel(currencyUnits, currencyUnitId)
              : text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            triggerTitle={text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickCurrency', 'Pick currency')}
            emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoCurrencyDefined', 'No currencies defined')}
            onChoose={(unitId) => chooseCurrencyUnit(unitId)}
          />
        </span>
      </div>
    {/if}
  </div>

  <div class="manager-recipe-option-controls">
    {#if showRequiredTag}
      <span class="manager-recipe-req-tag is-required" data-recipe-req-tag="required">{text('FABRICATE.Admin.Manager.Recipe.RequiredTag', 'Required')}</span>
    {/if}

    {#if matchType !== 'currency' && matchType !== 'essence'}
      <Stepper
        value={quantity}
        min={1}
        max={9999}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        decrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityDecrement', 'Decrease quantity')}
        incrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityIncrement', 'Increase quantity')}
        inputProps={{ 'data-recipe-option-quantity': '', class: 'fab-stepper-input manager-recipe-option-quantity' }}
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
        onclick={() => onRemove()}
      ><i class="fas fa-xmark" aria-hidden="true"></i></button>
    {/if}
  </div>

  {#if matchType === 'tags'}
    <!-- The tag editing detail: the any/all segmented control + Add tag picker, then
         the chosen tags in a full-width bordered area (chips or "No tags set"). -->
    <div class="manager-recipe-option-tags-detail">
      <div class="manager-recipe-option-tags-controls">
        <div class="manager-recipe-tag-match-toggle" role="group" aria-label={text('FABRICATE.Admin.Manager.Recipe.TagMatch', 'Tag match')}>
          <button
            type="button"
            class="manager-recipe-tag-match-option"
            class:is-selected={tagMatch === 'any'}
            data-recipe-tag-match="any"
            aria-pressed={tagMatch === 'any'}
            onclick={() => setTagMatch('any')}
          >{text('FABRICATE.Admin.Manager.Recipe.TagMatchAny', 'Any')}</button>
          <button
            type="button"
            class="manager-recipe-tag-match-option"
            class:is-selected={tagMatch === 'all'}
            data-recipe-tag-match="all"
            aria-pressed={tagMatch === 'all'}
            onclick={() => setTagMatch('all')}
          >{text('FABRICATE.Admin.Manager.Recipe.TagMatchAll', 'All')}</button>
        </div>
        <SearchablePopover
          options={tagPickerOptions}
          pickerClass="manager-recipe-tag-picker"
          triggerClass="manager-button is-subtle manager-recipe-tag-trigger"
          triggerIcon="fas fa-tag"
          triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
          triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
          dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
          searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder', 'Search tags...')}
          searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder', 'Search tags...')}
          emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoTagsDefined', 'No tags defined')}
          onChoose={(tag) => addTag(tag)}
        />
      </div>
      <div class="manager-recipe-option-tags-list" data-recipe-tags-list>
        {#if tags.length > 0}
          <ul class="manager-recipe-tag-chips">
            {#each tags as tag (tag)}
              <li class="manager-chip manager-recipe-tag-chip" data-recipe-tag={tag}>
                <span>{tag}</span>
                <button
                  type="button"
                  class="manager-recipe-tag-remove"
                  data-recipe-remove="tag"
                  aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
                  title={text('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
                  onclick={() => removeTag(tag)}
                ><i class="fas fa-times" aria-hidden="true"></i></button>
              </li>
            {/each}
          </ul>
        {:else}
          <span class="manager-recipe-tags-empty manager-muted" data-recipe-tags-empty>{text('FABRICATE.Admin.Manager.Recipe.NoTagsSet', 'No tags set')}</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if matchType === 'essence'}
    <!-- The essence sub-line: met by any components carrying this essence (parallel to
         the currency cost hint). A full-width muted line under the row. -->
    <div class="manager-recipe-option-essence-detail">
      <span class="manager-recipe-essence-subline manager-muted" data-recipe-essence-subline>{text('FABRICATE.Admin.Manager.Recipe.EssenceMetBy', 'met by any components carrying this essence')}</span>
    </div>
  {/if}
</div>

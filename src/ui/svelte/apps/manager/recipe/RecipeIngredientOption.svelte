<!-- Svelte 5 runes mode -->
<!--
  One alternative (an `Ingredient`) inside a requirement. Alternatives have no
  id, so the parent keys them by index and owns the option list; this component
  renders the matching control, the quantity, and the per-row controls that
  append a new alternative (component or tag) to the requirement, emitting the
  whole updated option via `onChange(nextOption)`.

  Each alternative reads its match type from `option.match.type` — a component
  alternative shows the component's image + name as the picker trigger (click to
  swap the component); a tag alternative shows tag chips + an "Add tag" picker +
  an any/all toggle. The row-end control cluster ("Add component" /
  "Add tag requirement" / remove) adds or removes ALTERNATIVES on the
  requirement, which is distinct from the within-option tag editor's "Add tag"
  (which edits THIS alternative's tags).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    currencyUnitLabel,
    currencyUnitIcon,
    findCurrencyUnit
  } from '../../../util/recipeCurrency.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    option = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    onChange = () => {},
    onRemove = () => {},
    onAddComponentAlternative = () => {},
    onAddTagAlternative = () => {},
    onAddCurrencyAlternative = () => {},
    canRemove = true,
    showRowAdds = true
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const matchType = $derived(
    option?.match?.type === 'tags' || option?.match?.type === 'currency'
      ? option.match.type
      : 'component'
  );
  const quantity = $derived(Number(option?.quantity) > 0 ? Number(option.quantity) : 1);
  const componentId = $derived(option?.match?.type === 'component' ? option.match.componentId || '' : '');
  const tags = $derived(
    option?.match?.type === 'tags' && Array.isArray(option.match.tags) ? option.match.tags : []
  );
  const tagMatch = $derived(option?.match?.tagMatch === 'all' ? 'all' : 'any');

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

  // Quantities are capped at 9999 (four digits) — more of a single component is
  // not a meaningful recipe requirement, and it keeps the input narrow.
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

  // Currency amounts share the four-digit cap with quantities and are stored on
  // the match (not the option quantity), which stays the default 1.
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
</script>

<div class="manager-recipe-ingredient-option-row" data-recipe-option>
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
      <div class="manager-recipe-option-tags">
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
    {#if matchType !== 'currency'}
      <input
        type="number"
        min="1"
        max="9999"
        class="manager-recipe-option-quantity"
        data-recipe-option-quantity
        aria-label={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        value={quantity}
        onchange={(e) => setQuantity(e.target.value)}
      />
    {/if}

    {#if showRowAdds}
      <div class="manager-recipe-option-alternative-adds">
        <SearchablePopover
          options={componentPickerOptions}
          pickerClass="manager-recipe-component-picker manager-recipe-add-alternative"
          triggerClass="manager-button is-subtle manager-recipe-add-alternative-trigger"
          triggerIcon="fas fa-cube"
          triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeComponent', 'Add alternative component')}
          triggerTitle={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeComponent', 'Add alternative component')}
          triggerAddMarker="alternative-component"
          dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeComponent', 'Add alternative component')}
          searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
          searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
          emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
          showChevron={false}
          onChoose={(id) => onAddComponentAlternative(id)}
        />
        <button
          type="button"
          class="manager-button is-subtle manager-recipe-add-alternative-trigger"
          data-recipe-add="alternative-tag"
          aria-label={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeTagRequirement', 'Add alternative tag requirement')}
          title={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeTagRequirement', 'Add alternative tag requirement')}
          onclick={() => onAddTagAlternative()}
        ><i class="fas fa-tags" aria-hidden="true"></i></button>
        {#if (currencyUnits || []).length > 0}
          <button
            type="button"
            class="manager-button is-subtle manager-recipe-add-alternative-trigger"
            data-recipe-add="alternative-cost"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeCost', 'Add alternative cost')}
            title={text('FABRICATE.Admin.Manager.Recipe.AddAlternativeCost', 'Add alternative cost')}
            onclick={() => onAddCurrencyAlternative()}
          ><i class="fa-solid fa-coins" aria-hidden="true"></i></button>
        {/if}
      </div>
    {/if}

    {#if canRemove}
      <button
        type="button"
        class="manager-icon-button is-danger manager-recipe-option-remove"
        data-recipe-remove="alternative"
        aria-label={matchType === 'component'
          ? text('FABRICATE.Admin.Manager.Recipe.RemoveComponent', 'Remove component')
          : text('FABRICATE.Admin.Manager.Recipe.RemoveAlternative', 'Remove alternative')}
        title={matchType === 'component'
          ? text('FABRICATE.Admin.Manager.Recipe.RemoveComponent', 'Remove component')
          : text('FABRICATE.Admin.Manager.Recipe.RemoveAlternative', 'Remove alternative')}
        onclick={() => onRemove()}
      ><i class="fas fa-minus" aria-hidden="true"></i></button>
    {/if}
  </div>
</div>

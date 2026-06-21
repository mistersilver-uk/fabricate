<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so the alternatives render linked by a "— or —" separator and read as one
  bracketed unit. The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The requirement's TYPE is fixed by its first alternative's match
  (`options[0].match.type`): a tag requirement adds empty tag alternatives, a
  component requirement opens a component picker for each new alternative. There
  is no group-name field — a requirement is identified by its component image +
  name. New alternatives are appended id-less; the store normalizes them.
  Removing the last alternative removes the whole requirement.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientOption from './RecipeIngredientOption.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    group = {},
    componentOptions = [],
    itemTags = [],
    onChange = () => {},
    onRemove = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const options = $derived(Array.isArray(group?.options) ? group.options : []);
  const requirementType = $derived(options[0]?.match?.type === 'tags' ? 'tags' : 'component');

  const componentPickerOptions = $derived(
    (componentOptions || []).map(item => ({ id: item.id, label: item.name, img: item.img }))
  );

  function updateOption(index, nextOption) {
    onChange({ ...group, options: options.map((option, i) => (i === index ? nextOption : option)) });
  }

  // Removing an alternative removes that option; removing the LAST alternative
  // drops the whole requirement.
  function removeOption(index) {
    if (options.length <= 1) {
      onRemove();
      return;
    }
    onChange({ ...group, options: options.filter((_, i) => i !== index) });
  }

  function addComponentAlternative(id) {
    onChange({ ...group, options: [...options, { quantity: 1, match: { type: 'component', componentId: id } }] });
  }

  function addTagAlternative() {
    onChange({ ...group, options: [...options, { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }] });
  }
</script>

<div class="manager-recipe-ingredient-requirement" data-recipe-group data-recipe-group-id={group?.id || ''}>
  <div class="manager-recipe-ingredient-requirement-options">
    {#each options as option, index (index)}
      {#if index > 0}
        <div class="manager-recipe-ingredient-or-separator" aria-hidden="true">
          <span>{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
        </div>
      {/if}
      <RecipeIngredientOption
        {option}
        {componentOptions}
        {itemTags}
        canRemove={true}
        onChange={(nextOption) => updateOption(index, nextOption)}
        onRemove={() => removeOption(index)}
      />
    {/each}
  </div>

  {#if requirementType === 'component'}
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-alternative"
      triggerClass="manager-button is-subtle manager-recipe-add-alternative-trigger"
      triggerIcon="fas fa-plus"
      triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddAlternative', 'Add alternative')}
      triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddAlternative', 'Add alternative')}
      triggerAddMarker="alternative"
      dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
      searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
      showChevron={false}
      onChoose={(id) => addComponentAlternative(id)}
    />
  {:else}
    <button
      type="button"
      class="manager-button is-subtle manager-recipe-add-alternative-trigger"
      data-recipe-add="alternative"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.AddAlternative', 'Add alternative')}
      onclick={() => addTagAlternative()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddAlternative', 'Add alternative')}</span>
    </button>
  {/if}
</div>

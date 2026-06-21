<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so when it has two or more alternatives they render linked by a "— or —"
  separator inside a bracketed box; a single-alternative requirement renders as a
  bare row (no box). The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  Alternatives can now mix match types within one requirement: each
  alternative's row ends with a component-add popover and a tag-requirement add
  button, so adding from any row appends an alternative of that type to this
  requirement (e.g. "Iron OR anything tagged hardwood"). New alternatives are
  appended id-less; the store normalizes them. Removing the last alternative
  removes the whole requirement.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientOption from './RecipeIngredientOption.svelte';

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
  const hasAlternatives = $derived(options.length >= 2);

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

<div
  class="manager-recipe-ingredient-requirement"
  class:has-alternatives={hasAlternatives}
  data-recipe-group
  data-recipe-group-id={group?.id || ''}
>
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
        onAddComponentAlternative={(id) => addComponentAlternative(id)}
        onAddTagAlternative={() => addTagAlternative()}
      />
    {/each}
  </div>
</div>

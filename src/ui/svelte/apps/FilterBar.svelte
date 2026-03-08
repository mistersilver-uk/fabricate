<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    showCraftableOnly = false,
    onToggleCraftable,
    categories = [], // Pre-localized display strings (not i18n keys)
    selectedCategory = '',
    onCategoryChange
  } = $props();

  function handleToggle() {
    onToggleCraftable?.();
  }

  function handleCategoryChange(event) {
    onCategoryChange?.(event.target.value);
  }
</script>

<div class="fabricate-filters">
  <button
    type="button"
    class="fabricate-filter-btn"
    class:active={showCraftableOnly}
    onclick={handleToggle}
    title={localize('FABRICATE.Filter.CraftableOnly')}
  >
    <i class="fas fa-check-circle"></i>
    {localize('FABRICATE.Filter.CraftableOnly')}
  </button>

  <select
    name="category"
    class="fabricate-category-select"
    value={selectedCategory}
    onchange={handleCategoryChange}
  >
    <option value="">{localize('FABRICATE.Filter.AllCategories')}</option>
    {#each categories as cat}
      <option value={cat}>{cat}</option>
    {/each}
  </select>
</div>

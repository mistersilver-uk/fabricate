<!-- Svelte 5 runes mode -->
<!--
  The Knowledge surface's two inner tabs (issue 785), mirroring
  `tools/ToolEditorTabs.svelte` — including its roving-tabindex arrow-key focus
  move — so the surface introduces no new tab vocabulary. `aria-controls` targets
  the real `role="tabpanel"` ids KnowledgeView renders.

  Props:
   - activeTab: 'recipeItems' | 'learnedRecipes'.
   - itemCount / learnedCount: per-tab badge counts.
   - onChange(tabId).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    KNOWLEDGE_TAB_LEARNED_RECIPES,
    KNOWLEDGE_TAB_RECIPE_ITEMS,
  } from './knowledgeStudio.js';

  let {
    activeTab = KNOWLEDGE_TAB_RECIPE_ITEMS,
    itemCount = 0,
    learnedCount = 0,
    onChange = () => {},
  } = $props();

  const tabs = [
    [KNOWLEDGE_TAB_RECIPE_ITEMS, 'fas fa-book'],
    // `fa-graduation-cap` is the prototype's glyph for this tab, and it also keeps the
    // inner tab distinct from the rail entry, which now carries `fa-brain`.
    [KNOWLEDGE_TAB_LEARNED_RECIPES, 'fas fa-graduation-cap'],
  ];

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Both keys are STATIC literals at their call site. A template-interpolated key
  // is invisible to `ui-lang-keys-resolve` and `lang-keys-no-orphans` alike, so a
  // missing label would ship as a raw key with no gate catching it.
  function tabLabel(tabId) {
    if (tabId === KNOWLEDGE_TAB_RECIPE_ITEMS) {
      return text('FABRICATE.Admin.Manager.Knowledge.Tabs.RecipeItems', 'Recipe items');
    }
    return text('FABRICATE.Admin.Manager.Knowledge.Tabs.LearnedRecipes', 'Learned recipes');
  }

  function badgeFor(tabId) {
    return tabId === KNOWLEDGE_TAB_RECIPE_ITEMS ? itemCount : learnedCount;
  }

  function handleKeydown(event, index) {
    const lastIndex = tabs.length - 1;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex][0];
    onChange(nextTab);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector(`#knowledge-tab-${nextTab}`)
      ?.focus();
  }
</script>

<div
  class="manager-editor-tabs manager-knowledge-tabs"
  role="tablist"
  aria-label={text('FABRICATE.Admin.Manager.Knowledge.Tabs.Label', 'Knowledge sections')}
>
  {#each tabs as tab, index (tab[0])}
    <button
      type="button"
      role="tab"
      id={`knowledge-tab-${tab[0]}`}
      class="manager-editor-tab-button"
      class:is-active={activeTab === tab[0]}
      aria-selected={activeTab === tab[0]}
      aria-controls={`knowledge-panel-${tab[0]}`}
      tabindex={activeTab === tab[0] ? 0 : -1}
      data-knowledge-tab={tab[0]}
      onclick={() => onChange(tab[0])}
      onkeydown={(event) => handleKeydown(event, index)}
    >
      <i class={tab[1]} aria-hidden="true"></i>
      <span>{tabLabel(tab[0])}</span>
      <span class="manager-chip is-neutral manager-editor-tab-badge">{badgeFor(tab[0])}</span>
    </button>
  {/each}
</div>

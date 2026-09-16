<!--
  The Knowledge surface's two inner tabs, a THIN CALLER of the `EditorTabs` primitive. `badgeFor`
  returns a RECORD COUNT, so it draws as a bare mono tabular numeral rather than a `Chip`: the Rail
  Marker Family in `DOMAIN.md` and `openspec/specs/design-system/spec.md`'s "Near-neighbour
  primitives are routed by a stated rule" both forbid substituting one mark for another.

  THE ZERO IS AN OPEN PRODUCT QUESTION, deliberately left as it was. This strip states its count
  unconditionally while the Checks section strip suppresses a zero, and the canonical text does not
  settle which is right for a record count — the rail, the closest precedent, states its own zero —
  so `suppressZero: false` keeps the number the surface has always shown rather than letting a
  refactor drop it.

  Props: activeTab ('recipeItems' | 'learnedRecipes'), itemCount, learnedCount, onChange(tabId).
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import { KNOWLEDGE_TAB_LEARNED_RECIPES, KNOWLEDGE_TAB_RECIPE_ITEMS } from './knowledgeStudio.js';

  let {
    activeTab = KNOWLEDGE_TAB_RECIPE_ITEMS,
    itemCount = 0,
    learnedCount = 0,
    onChange = () => {},
  } = $props();

  // STATIC literals: an interpolated key is invisible to both lang gates, so a missing label would
  // ship as a raw key with nothing catching it.
  const TABS = [
    {
      id: KNOWLEDGE_TAB_RECIPE_ITEMS,
      icon: 'fas fa-book',
      labelKey: 'FABRICATE.Admin.Manager.Knowledge.Tabs.RecipeItems',
      label: 'Recipe items',
    },
    {
      // The prototype's glyph, and distinct from the rail entry's `fa-brain`.
      id: KNOWLEDGE_TAB_LEARNED_RECIPES,
      icon: 'fas fa-graduation-cap',
      labelKey: 'FABRICATE.Admin.Manager.Knowledge.Tabs.LearnedRecipes',
      label: 'Learned recipes',
    },
  ];

  const marks = $derived({
    [KNOWLEDGE_TAB_RECIPE_ITEMS]: { vehicle: 'count', label: itemCount, suppressZero: false },
    [KNOWLEDGE_TAB_LEARNED_RECIPES]: {
      vehicle: 'count',
      label: learnedCount,
      suppressZero: false,
    },
  });
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  badges={marks}
  onSelect={onChange}
  ariaLabelKey="FABRICATE.Admin.Manager.Knowledge.Tabs.Label"
  ariaLabel="Knowledge sections"
  idStem="knowledge"
  hookAttribute="data-knowledge-tab"
  countAttribute="data-knowledge-tab-count"
  containerClass="manager-editor-tabs manager-knowledge-tabs"
/>

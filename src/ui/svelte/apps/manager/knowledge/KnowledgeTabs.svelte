<!-- Svelte 5 runes mode -->
<!--
  The Knowledge surface's two inner tabs (issue 785).

  A THIN CALLER of the promoted `EditorTabs` primitive since issue 1429, which also
  CORRECTED the vehicle its marks use. `badgeFor` returns a RECORD COUNT — how many recipe
  items this character holds, how many recipes they have learned — and this strip drew it
  through `<Chip tone="neutral">`, the ISSUE-SUMMARY vehicle. The Rail Marker Family in
  `DOMAIN.md` and design-system spec.md requirement "Near-neighbour primitives are routed by
  a stated rule" both say the four marks MUST NOT be substituted for one another, so that
  was a live violation and not a local styling choice: `library.html:1008`'s own `<TabBar>`
  specimen draws its two record counts as bare numerals and reserves the filled badge for
  Validation. The count is a bare mono tabular numeral now.

  ── THE ZERO IS DELIBERATELY LEFT AS IT WAS, AND IS AN OPEN QUESTION ────────────────────

  This strip renders its count UNCONDITIONALLY, so a character with nothing shows a literal
  `0`, while the Checks section strip suppresses a zero and `EditorTabs` suppresses a falsy
  mark by default. The canonical text does not settle which is right for a record count:
  `ui-integration/spec.md` repeats "a figure of zero is omitted rather than stated as zero"
  for delete-impact cards and for the Downtime rollup — but each of those is scoped to its
  own surface, two of them carry an explicit CARVE-OUT where the number's presence is the
  point, and the RECORD-COUNT vehicle's own canonical home contradicts them: the rail renders
  `<span class="manager-nav-count">{selectedCounts.components}</span>` unconditionally, so a
  system with no components shows a rail count of `0`. Since a knowledge tab count is, in
  `DOMAIN.md`'s words, "the direct sibling of every other rail record count", the rail is the
  closer precedent — so this keeps its zero through `suppressZero: false` rather than having
  the conversion silently drop a number the surface has always stated. Settle it as a
  product decision, not as a side effect of a refactor.

  Props:
   - activeTab: 'recipeItems' | 'learnedRecipes'.
   - itemCount / learnedCount: per-tab record counts.
   - onChange(tabId).
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';
  import { KNOWLEDGE_TAB_LEARNED_RECIPES, KNOWLEDGE_TAB_RECIPE_ITEMS } from './knowledgeStudio.js';

  let {
    activeTab = KNOWLEDGE_TAB_RECIPE_ITEMS,
    itemCount = 0,
    learnedCount = 0,
    onChange = () => {},
  } = $props();

  // Both keys stay STATIC literals. A template-interpolated key is invisible to
  // `ui-lang-keys-resolve` and `lang-keys-no-orphans` alike, so a missing label would ship
  // as a raw key with no gate catching it.
  const TABS = [
    {
      id: KNOWLEDGE_TAB_RECIPE_ITEMS,
      icon: 'fas fa-book',
      labelKey: 'FABRICATE.Admin.Manager.Knowledge.Tabs.RecipeItems',
      label: 'Recipe items',
    },
    {
      // `fa-graduation-cap` is the prototype's glyph for this tab, and it also keeps the
      // inner tab distinct from the rail entry, which now carries `fa-brain`.
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

<!-- Svelte 5 runes mode -->
<!--
  Tab strip for the recipe editor (Overview / Ingredients / Results / Tools / Access /
  Books & Scrolls / Validation).

  A thin caller of the promoted `EditorTabs` primitive (issue 1038): this file owns the TAB
  LIST — including the mode gate below — and this site's DOM contract: the
  `data-recipe-tab-button` hook, the `recipe-tab-*` / `recipe-panel-*` id stem whose panels
  `RecipeEditView.svelte` renders, and the strip's own aria-label. Every class it used to
  render by hand is the primitive's default, so it passes no class override at all, and no
  rendered id, `aria-controls`, `data-*` attribute or class changed in the conversion.

  Access and Books & Scrolls are MODE-CONDITIONAL (issue 676), driven by the system's
  canonical `visibilityMode` through `craftingEffect(mode)` — the same single source of
  truth the nav, Crafting Settings and the deleted context rail used:

    restricted     (showAccess)       -> Access: who this recipe is granted to
    item/knowledge (showBooksScrolls) -> Books & Scrolls: the books teaching it
    global         (neither)          -> neither tab: a globally-visible system grants
                                         no per-recipe access and uses no books.

  The gate lives HERE rather than in the panels so the tab BUTTON disappears with its
  content — a tab that opens an empty panel is worse than no tab. `TAB_IDS` in
  RecipeEditView is derived from the same `visibilityEffect`, so a deep-link cannot
  select a tab that does not exist.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';

  let {
    activeTab = 'overview',
    badges = {},
    // The system's craftingEffect matrix row ({ showAccess, showBooksScrolls, ... }).
    // NOT named `effect`: a variable of that name makes the compiler read `$effect(...)`
    // as a store subscription (`$` + `effect`).
    visibilityEffect = { showAccess: false, showBooksScrolls: true },
    onSelect = () => {},
  } = $props();

  // The label keys are written out as LITERALS rather than interpolated from a tab key,
  // because `ui-lang-keys-resolve` and `lang-keys-no-orphans` both read the source: an
  // interpolated key is invisible to either, so a missing label would ship as a raw key
  // with no gate catching it. Before the conversion these were built as
  // `FABRICATE.Admin.Manager.Recipe.Tabs.${tab.key}` and were unreachable to both gates.
  const TABS = $derived([
    {
      id: 'overview',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Overview',
      label: 'Overview',
    },
    {
      id: 'ingredients',
      icon: 'fas fa-flask',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Ingredients',
      label: 'Ingredients',
    },
    {
      id: 'results',
      icon: 'fas fa-box-open',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Results',
      label: 'Results',
    },
    {
      id: 'tools',
      icon: 'fas fa-screwdriver-wrench',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Tools',
      label: 'Tools',
    },
    ...(visibilityEffect?.showAccess
      ? [
          {
            id: 'access',
            icon: 'fas fa-user-shield',
            labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Access',
            label: 'Access',
          },
        ]
      : []),
    ...(visibilityEffect?.showBooksScrolls
      ? [
          {
            id: 'books-scrolls',
            icon: 'fas fa-book',
            labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.BooksScrolls',
            label: 'Books & Scrolls',
          },
        ]
      : []),
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Tabs.Validation',
      label: 'Validation',
    },
  ]);
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.Recipe.Tabs.Label"
  ariaLabel="Recipe editor sections"
  idStem="recipe"
  hookAttribute="data-recipe-tab-button"
/>

<!-- Svelte 5 runes mode -->
<!--
  Tab strip for the recipe editor (Overview / Ingredients / Results / Tools / Access / Books &
  Scrolls / Validation), a thin caller of the promoted `EditorTabs` primitive. This file owns the
  TAB LIST — including the mode gate below — and this site's DOM contract: the
  `data-recipe-tab-button` hook, the `recipe-tab-*` / `recipe-panel-*` id stem whose panels
  `RecipeEditView.svelte` renders, and the strip's own aria-label. Every class it used to render
  by hand is the primitive's default, so it passes no class override.

  Access and Books & Scrolls are MODE-CONDITIONAL, driven by the system's canonical
  `visibilityMode` through `craftingEffect(mode)`:

    restricted     (showAccess)       -> Access: who this recipe is granted to
    item/knowledge (showBooksScrolls) -> Books & Scrolls: the books teaching it
    global         (neither)          -> neither tab

  The gate lives HERE rather than in the panels so the tab BUTTON disappears with its content, and
  `TAB_IDS` in RecipeEditView derives from the same `visibilityEffect`, so a deep link cannot
  select a tab that does not exist.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';

  let {
    activeTab = 'overview',
    badges = {},
    // The system's craftingEffect matrix row. NOT named `effect`: the compiler would read
    // `$effect(...)` as a store subscription.
    visibilityEffect = { showAccess: false, showBooksScrolls: true },
    onSelect = () => {},
  } = $props();

  // The label keys are written out as LITERALS rather than interpolated, because
  // `ui-lang-keys-resolve` and `lang-keys-no-orphans` read the SOURCE: an interpolated key is
  // invisible to both, so a missing label would ship as a raw key with no gate catching it.
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

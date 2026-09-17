<!--
  The Tags & Categories screen's vocabulary tab strip (issue 1429): a THIN CALLER of `EditorTabs`,
  extracted from the 468-line `TagsCategoriesView` where it was an inlined `role="tablist"` with its
  own roving tabindex. The host is still a `<div>` and not a `<nav>`, because `role="tablist"` on a
  `<nav>` overrides its implicit landmark. THE MARKS ARE RECORD COUNTS, so they ride the count
  vehicle rather than the ISSUE-SUMMARY one: the design-system spec's "Near-neighbour primitives
  are routed by a stated rule" forbids substituting one for another.
  `suppressZero: false` on every mark, because this strip has always rendered its count
  UNCONDITIONALLY and whether a zero should be stated is an open PRODUCT question. -->
<script>
  import EditorTabs from '../../components/EditorTabs.svelte';

  let {
    activeTab = 'recipe',
    recipeCategoryCount = 0,
    componentCategoryCount = 0,
    tagCount = 0,
    onSelect = () => {},
  } = $props();

  // Every key stays a STATIC literal: an interpolated one is invisible to `ui-lang-keys-resolve`
  // and `lang-keys-no-orphans` alike.
  const TABS = [
    {
      id: 'recipe',
      icon: 'fas fa-scroll',
      labelKey: 'FABRICATE.Admin.Manager.TagsCategories.Categories',
      label: 'Recipe categories',
    },
    {
      id: 'component',
      icon: 'fas fa-cubes',
      labelKey: 'FABRICATE.Admin.Manager.TagsCategories.ComponentCategories',
      label: 'Component categories',
    },
    {
      id: 'tag',
      icon: 'fas fa-tag',
      labelKey: 'FABRICATE.Admin.Manager.TagsCategories.ItemTags',
      label: 'Component tags',
    },
  ];

  const marks = $derived({
    recipe: { vehicle: 'count', label: recipeCategoryCount, suppressZero: false },
    component: { vehicle: 'count', label: componentCategoryCount, suppressZero: false },
    tag: { vehicle: 'count', label: tagCount, suppressZero: false },
  });
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  badges={marks}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.TagsCategories.TabList"
  ariaLabel="Vocabulary tabs"
  idStem="vocabulary"
  hookAttribute="data-vocabulary-tab"
  containerClass="manager-editor-tabs manager-vocabulary-tabs"
/>

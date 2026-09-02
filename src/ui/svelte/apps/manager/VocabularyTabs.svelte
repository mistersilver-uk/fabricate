<!-- Svelte 5 runes mode -->
<!--
  The Tags & Categories screen's vocabulary tab strip (issue 1429).

  A THIN CALLER of the promoted `EditorTabs` primitive, and the LAST hand-rolled manager tab
  strip to convert. It was the ninth strip nobody had counted, because it is not a file named
  `*Tabs.svelte` at all: it was a `role="tablist"` inlined in the 468-line
  `TagsCategoriesView`, with its own roving tabindex and its own Arrow/Home/End handler. So
  converting it meant EXTRACTING it first, which is why it outlived the three strips issue 1038
  converted — each of those was already a standalone component. Size was the reason, and size is
  a scheduling reason rather than a divergence claim, so nothing here is an exemption.

  ── THE HOST IS STILL A `<div>`, AND THAT REASONING SURVIVES THE MOVE ────────────────────

  The view carried a note explaining why the strip was a `<div>` and not a `<nav>`:
  `role="tablist"` on a `<nav>` overrides its implicit `navigation` landmark, which the compiler
  reports, while a `<div>` has no implicit role to conflict with. That reasoning is PRESERVED
  rather than dropped, because `EditorTabs` renders exactly the same host — a `<div>` carrying
  `role="tablist"` — so the converted strip keeps both the element and the role it had.

  What did NOT survive is the mechanism the old note named alongside it. The view's
  `handleTabKeydown` resolved the strip with `.closest('[role="tablist"]')`; `EditorTabs` reaches
  its siblings through `event.currentTarget.parentElement` and a `[role="tab"]` query instead.
  The rendered role is unchanged either way, and the keyboard CONTRACT is unchanged — Arrow
  wrapping in both directions, Home, End, a roving `tabindex` and `data-keyboard-focus="true"` —
  but the traversal is the primitive's now, so a reader looking for `.closest` here will not find
  it. That is a fact about this file, not a licence: `tests/components/tags-categories-view-mounted.test.js`
  still dispatches real `KeyboardEvent`s against the mounted strip rather than reading source.

  ── THE MARKS ARE RECORD COUNTS, SO THEY RIDE THE COUNT VEHICLE ──────────────────────────

  These are whole-vocabulary counts — how many recipe categories, component categories and
  component tags this system holds, General included — which is a RECORD COUNT in the Rail
  Marker Family's terms. The strip drew them through `<Chip tone="neutral">`, which is the
  ISSUE-SUMMARY vehicle. `DOMAIN.md` and design-system spec.md requirement "Near-neighbour
  primitives are routed by a stated rule" both say the four marks MUST NOT be substituted for
  one another, so that was a live violation rather than a local styling choice, and it is the
  same one `knowledge/KnowledgeTabs` carried until issue 1429 corrected it. The count is a bare
  mono tabular numeral now. That is the ONE intentional rendered-output change in this
  conversion; everything else is markup-identical.

  `suppressZero: false` on every mark, for the reason `KnowledgeTabs` records at length: this
  strip has always rendered its count UNCONDITIONALLY — `counts.recipeCategories || 0` renders a
  literal `0` for a system with no custom categories — and `EditorTabs` suppresses a falsy mark
  by default. Taking the zero away would be a second rendered change, made silently, inside a
  refactor. Whether a record count of zero should be stated or omitted is an open PRODUCT
  question that canon points both ways on; it is not this change's to settle as a side effect.

  Props:
   - activeTab: 'recipe' | 'component' | 'tag'.
   - recipeCategoryCount / componentCategoryCount / tagCount: the three record counts.
   - onSelect(tabId).
-->
<script>
  import EditorTabs from './EditorTabs.svelte';

  let {
    activeTab = 'recipe',
    recipeCategoryCount = 0,
    componentCategoryCount = 0,
    tagCount = 0,
    onSelect = () => {},
  } = $props();

  // Every key stays a STATIC literal. A template-interpolated key is invisible to
  // `ui-lang-keys-resolve` and `lang-keys-no-orphans` alike, so a missing label would ship as a
  // raw key with no gate catching it.
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

<!-- Svelte 5 runes mode -->
<!--
  Tab strip for the recipe-item editor (Overview / Contents / Limits / Validation).

  A thin caller of the promoted `EditorTabs` primitive (issue 1362): this file owns the tab
  list and this site's DOM contract — the `data-recipe-item-tab-button` hook, the
  `data-recipe-item-tab-badge` badge hook with its `data-badge-tone`, the `recipe-item-tab-*`
  / `recipe-item-panel-*` id stem whose panels `RecipeItemEditor.svelte` renders, and the
  strip's own aria-label. It is the site that needs the primitive's `danger` capability: the
  Validation tab's button turns danger when its badge is a failing count.

  The Contents tab carries a neutral count badge (linked recipe count). The Validation tab
  always carries a badge: a success `✓` chip when valid, or a danger count chip when there
  are failing checks.

  Props:
   - activeTab: the selected tab id.
   - badges: `{ contents?: count|badge|badge[], validation?: badge|badge[] }` where a
     badge is a plain value or `{ label, tone }` (`tone` ∈ neutral/success/warning/danger).
   - onSelect(tabId): called when a tab is chosen (click or arrow-key).
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  const TABS = [
    {
      id: 'overview',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Overview',
      label: 'Overview',
    },
    {
      id: 'contents',
      icon: 'fas fa-scroll',
      labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Contents',
      label: 'Contents',
    },
    {
      id: 'limits',
      icon: 'fas fa-sliders',
      labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Limits',
      label: 'Limits',
    },
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Tabs.Validation',
      label: 'Validation',
    },
  ];
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.RecipeItem.Tabs.Label"
  ariaLabel="Recipe item editor sections"
  idStem="recipe-item"
  hookAttribute="data-recipe-item-tab-button"
  badgeAttribute="data-recipe-item-tab-badge"
  containerClass="manager-editor-tabs"
  buttonClass="manager-editor-tab-button"
  badgeClass="manager-editor-tab-badge"
  danger
/>

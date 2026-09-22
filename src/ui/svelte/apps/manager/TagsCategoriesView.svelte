<!-- Svelte 5 runes mode -->
<!--
  The system Tags & Categories screen (issue 689, converged onto the shared vocabulary shell at
  issue 1915): the three vocabularies of one crafting system — recipe categories, component
  categories and component tags — rendered SIMULTANEOUSLY rather than one tab at a time. The
  layout, each panel's card and every cascade repair belong to `VocabularyShell` and
  `VocabularyShellPanel`, which the world screen renders too; all the copy and the hint machines
  belong to `systemVocabularyStudio.js`. What is left here is the wiring.

  The three panels are literal call sites because the browser-view-state contract pins the three
  `bind:` props by name.

  The system scope's two differences are data in the panel descriptors: the locked General row and
  the per-row persisted icon.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { partitionVocabularyPanels } from './vocabularyShell.js';
  import VocabularyShell from './VocabularyShell.svelte';
  import VocabularyShellPanel from './VocabularyShellPanel.svelte';
  import { SYSTEM_VOCABULARY_PANELS, systemPanelProps } from './systemVocabularyStudio.js';

  let {
    categoryRows = [],
    componentCategoryRows = [],
    tagRows = [],
    onAddCategory = () => {},
    onRemoveCategory = () => {},
    onAddComponentCategory = () => {},
    onRemoveComponentCategory = () => {},
    onAddTag = () => {},
    onRemoveTag = () => {},
    onSetCategoryIcon = () => {},
    onSetComponentCategoryIcon = () => {},
    // The three vocabulary panels' lifted search and sort slots (issues 1438, 1915), owned by the
    // root: the whole view unmounts on a route change, so a slot held here would die with it.
    recipeCategoryBrowserState = $bindable(null),
    componentCategoryBrowserState = $bindable(null),
    componentTagBrowserState = $bindable(null),
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Each vocabulary's placement is the descriptor's answer, not this file's, so the two screens
  // cannot drift into drawing the same vocabulary in two different places.
  const placements = partitionVocabularyPanels(SYSTEM_VOCABULARY_PANELS);
  const [recipeCategories, componentCategories] = placements.grid;
  const [componentTags] = placements.full;

  /** The row set, add, remove and icon writer for one vocabulary, by panel kind. */
  const WIRING = {
    recipeCategories: () => ({
      rows: categoryRows,
      onAdd: (panel, value, icon) => onAddCategory(value, icon),
      onRemove: (panel, row) => onRemoveCategory(row.name),
      onSetIcon: (panel, name, icon) => onSetCategoryIcon(name, icon),
    }),
    componentCategories: () => ({
      rows: componentCategoryRows,
      onAdd: (panel, value, icon) => onAddComponentCategory(value, icon),
      onRemove: (panel, row) => onRemoveComponentCategory(row.name),
      onSetIcon: (panel, name, icon) => onSetComponentCategoryIcon(name, icon),
    }),
    componentTags: () => ({
      rows: tagRows,
      onAdd: (panel, value) => onAddTag(value),
      onRemove: (panel, row) => onRemoveTag(row.name),
      onSetIcon: () => {},
    }),
  };

  function propsFor(panel) {
    return systemPanelProps(panel, { text, ...WIRING[panel.kind]() });
  }
</script>

<main
  class="manager-main manager-tags-categories"
  aria-label={text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories')}
>
  <!-- `statusMessage` is left at its empty default: the failure line exists on this route too, so
       both screens are one shell, and the system write paths report through Foundry's own error. -->
  <VocabularyShell>
    {#snippet grid()}
      <VocabularyShellPanel
        {...propsFor(recipeCategories)}
        bind:browserState={recipeCategoryBrowserState}
      />
      <VocabularyShellPanel
        {...propsFor(componentCategories)}
        bind:browserState={componentCategoryBrowserState}
      />
    {/snippet}
    {#snippet full()}
      <VocabularyShellPanel
        {...propsFor(componentTags)}
        bind:browserState={componentTagBrowserState}
      />
    {/snippet}
  </VocabularyShell>
</main>

<!-- Svelte 5 runes mode -->
<!--
  Tab strip for the recipe editor (Overview / Ingredients / Results / Tools / Access /
  Books & Scrolls / Validation),
  mirroring EnvironmentEditorTabs: roving tabindex, arrow-key navigation, and
  per-tab badge chips. Uses the shared generic `.manager-editor-tabs*` classes so
  it does not duplicate the environment editor's tab CSS.

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
  import { localize } from '../../../util/foundryBridge.js';

  let {
    activeTab = 'overview',
    badges = {},
    // The system's craftingEffect matrix row ({ showAccess, showBooksScrolls, ... }).
    // NOT named `effect`: a variable of that name makes the compiler read `$effect(...)`
    // as a store subscription (`$` + `effect`).
    visibilityEffect = { showAccess: false, showBooksScrolls: true },
    onSelect = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = $derived([
    { id: 'overview', icon: 'fas fa-circle-info', key: 'Overview', fallback: 'Overview' },
    { id: 'ingredients', icon: 'fas fa-flask', key: 'Ingredients', fallback: 'Ingredients' },
    { id: 'results', icon: 'fas fa-box-open', key: 'Results', fallback: 'Results' },
    { id: 'tools', icon: 'fas fa-screwdriver-wrench', key: 'Tools', fallback: 'Tools' },
    ...(visibilityEffect?.showAccess
      ? [{ id: 'access', icon: 'fas fa-user-shield', key: 'Access', fallback: 'Access' }]
      : []),
    ...(visibilityEffect?.showBooksScrolls
      ? [{ id: 'books-scrolls', icon: 'fas fa-book', key: 'BooksScrolls', fallback: 'Books & Scrolls' }]
      : []),
    { id: 'validation', icon: 'fas fa-clipboard-check', key: 'Validation', fallback: 'Validation' }
  ]);

  function badgeList(tab) {
    const value = badges?.[tab.id];
    const values = Array.isArray(value) ? value : (value ? [value] : []);
    return values
      .map(badge => {
        if (badge && typeof badge === 'object') {
          return {
            label: badge.label ?? badge.value ?? '',
            tone: badge.tone || (tab.id === 'validation' ? 'danger' : 'neutral')
          };
        }
        return {
          label: badge,
          tone: tab.id === 'validation' ? 'danger' : 'neutral'
        };
      })
      .filter(badge => badge.label !== '' && badge.label !== 0);
  }

  function badgeClass(tone) {
    if (tone === 'danger') return 'is-danger';
    if (tone === 'warning') return 'is-warning';
    return 'is-neutral';
  }

  function onKeydown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + TABS.length) % TABS.length;
    onSelect(TABS[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div class="manager-editor-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Label', 'Recipe editor sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`recipe-tab-${tab.id}`}
      class={`manager-editor-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`recipe-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-recipe-tab-button={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.Recipe.Tabs.${tab.key}`, tab.fallback)}</span>
      {#each badgeList(tab) as badge, badgeIndex (`${tab.id}-${badgeIndex}`)}
        <span class={`manager-chip ${badgeClass(badge.tone)} manager-editor-tab-badge`}>{badge.label}</span>
      {/each}
    </button>
  {/each}
</div>

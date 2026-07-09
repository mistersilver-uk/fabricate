<!-- Svelte 5 runes mode -->
<!--
  Tab strip for the recipe-item editor (Overview / Contents / Limits / Validation),
  mirroring recipe/RecipeEditorTabs: roving tabindex, arrow-key navigation, and
  per-tab badge chips. Reuses the shared generic `.manager-editor-tabs*` classes so
  it does not duplicate any tab CSS.

  The Contents tab carries a neutral count badge (linked recipe count). The
  Validation tab always carries a badge: a success `✓` chip when valid, or a danger
  count chip when there are failing checks.

  Props:
   - activeTab: the selected tab id.
   - badges: `{ contents?: count|badge|badge[], validation?: badge|badge[] }` where a
     badge is a plain value or `{ label, tone }` (`tone` ∈ neutral/success/warning/danger).
   - onSelect(tabId): called when a tab is chosen (click or arrow-key).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = [
    { id: 'overview', icon: 'fas fa-circle-info', key: 'Overview', fallback: 'Overview' },
    { id: 'contents', icon: 'fas fa-scroll', key: 'Contents', fallback: 'Contents' },
    { id: 'limits', icon: 'fas fa-sliders', key: 'Limits', fallback: 'Limits' },
    { id: 'validation', icon: 'fas fa-clipboard-check', key: 'Validation', fallback: 'Validation' }
  ];

  function badgeList(tab) {
    const value = badges?.[tab.id];
    const values = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
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
    if (tone === 'success') return 'is-active';
    return 'is-neutral';
  }

  function isDangerTab(tab) {
    return badgeList(tab).some(badge => badge.tone === 'danger');
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

<div class="manager-editor-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Tabs.Label', 'Recipe item editor sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`recipe-item-tab-${tab.id}`}
      class={`manager-editor-tab-button ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`recipe-item-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-recipe-item-tab-button={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.RecipeItem.Tabs.${tab.key}`, tab.fallback)}</span>
      {#each badgeList(tab) as badge, badgeIndex (`${tab.id}-${badgeIndex}`)}
        <span class={`manager-chip ${badgeClass(badge.tone)} manager-editor-tab-badge`} data-recipe-item-tab-badge={tab.id} data-badge-tone={badge.tone}>{badge.label}</span>
      {/each}
    </button>
  {/each}
</div>

<style>
  /* The validation tab turns danger when its badge is a failing count (design
     §7.5): the label and its underline follow the danger colour. */
  .manager-editor-tab-button.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-editor-tab-button.is-danger.is-active {
    border-bottom-color: var(--fab-danger-border);
  }
</style>

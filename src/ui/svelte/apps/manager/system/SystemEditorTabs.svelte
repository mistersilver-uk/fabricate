<!-- Svelte 5 runes mode -->
<!--
  Full-width tab bar for the System Overview page, mirroring
  EnvironmentEditorTabs.svelte (same markup, classes, ARIA roles, and badge
  support). Two tabs: Settings (the system settings form) and Validation (the
  kind-grouped validation issue list). The Validation tab carries a danger/warning
  badge of open issues.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'settings', badges = {}, onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = [
    { id: 'settings', icon: 'fas fa-sliders', key: 'Settings', fallback: 'Settings' },
    { id: 'validation', icon: 'fas fa-clipboard-check', key: 'Validation', fallback: 'Validation' }
  ];

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

<div class="manager-environment-tabs manager-system-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Tabs.Label', 'System overview sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`system-tab-${tab.id}`}
      class={`manager-environment-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`system-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-system-tab={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.SystemEdit.Tabs.${tab.key}`, tab.fallback)}</span>
      {#each badgeList(tab) as badge, badgeIndex (`${tab.id}-${badgeIndex}`)}
        <span class={`manager-chip ${badgeClass(badge.tone)} manager-environment-tab-badge`}>{badge.label}</span>
      {/each}
    </button>
  {/each}
</div>

<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { activeTab = 'parties', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = [
    { id: 'parties', icon: 'fas fa-people-group', key: 'Parties', fallback: 'Parties' },
    { id: 'regions', icon: 'fas fa-map-location-dot', key: 'Regions', fallback: 'Regions' },
    { id: 'map', icon: 'fas fa-diagram-project', key: 'MapLinks', fallback: 'Map Region Links' }
  ];

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

<div class="manager-environment-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.Travel.Tabs.Label', 'Travel sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`travel-tab-${tab.id}`}
      class={`manager-environment-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`travel-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-travel-tab-button={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.Travel.Tabs.${tab.key}`, tab.fallback)}</span>
    </button>
  {/each}
</div>

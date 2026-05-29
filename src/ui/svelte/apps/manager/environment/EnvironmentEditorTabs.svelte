<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = [
    { id: 'overview', icon: 'fas fa-circle-info', key: 'Overview', fallback: 'Overview' },
    { id: 'tasks', icon: 'fas fa-hand-holding', key: 'Tasks', fallback: 'Tasks' },
    { id: 'hazards', icon: 'fas fa-triangle-exclamation', key: 'Hazards', fallback: 'Hazards' },
    { id: 'validation', icon: 'fas fa-clipboard-check', key: 'Validation', fallback: 'Validation' }
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

<div class="manager-environment-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.Environment.Tabs.Label', 'Environment editor sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`environment-tab-${tab.id}`}
      class={`manager-environment-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`environment-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-environment-tab-button={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.Environment.Tabs.${tab.key}`, tab.fallback)}</span>
      {#if badges[tab.id]}
        <span class={`manager-chip ${tab.id === 'validation' ? 'is-danger' : 'is-neutral'} manager-environment-tab-badge`}>{badges[tab.id]}</span>
      {/if}
    </button>
  {/each}
</div>

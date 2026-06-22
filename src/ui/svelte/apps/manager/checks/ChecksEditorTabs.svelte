<!-- Svelte 5 runes mode -->
<!--
  Horizontal tab strip for the Checks view. Mirrors the gathering environment
  editor's tab bar so the two surfaces read the same: the tabs span the full
  width above the central column and its right context menu.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'crafting', onSelect = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const TABS = [
    { id: 'crafting', icon: 'fas fa-hammer', key: 'Crafting', fallback: 'Crafting' },
    { id: 'salvage', icon: 'fas fa-recycle', key: 'Salvage', fallback: 'Salvage' },
    { id: 'gathering', icon: 'fas fa-seedling', key: 'Gathering', fallback: 'Gathering' },
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

<div class="manager-environment-tabs" role="tablist" aria-label={text('FABRICATE.Admin.Manager.Checks.Tabs.Label', 'Checks sections')}>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`checks-tab-${tab.id}`}
      class={`manager-environment-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`checks-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-checks-tab-button={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(`FABRICATE.Admin.Manager.Checks.Tabs.${tab.key}`, tab.fallback)}</span>
    </button>
  {/each}
</div>

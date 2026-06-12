<!-- Svelte 5 runes mode -->
<!--
  GatheringDetailTabs is the tab strip for the player gathering center column,
  sitting under the header/economy strip. It mirrors the GM environment editor's
  tab pattern (EnvironmentEditorTabs) — role=tablist/tab, aria-selected, roving
  tabindex, and Arrow-key navigation — but re-themed with the base --fab-* tokens
  so it renders correctly outside the .fabricate-manager scope (the same porting
  the player columns do for Pagination).

  Two tabs: Tasks (default) and Events. Props: { activeTab, onSelect }.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { activeTab = 'tasks', onSelect = () => {} } = $props();

  const TABS = [
    { id: 'tasks', icon: 'fas fa-clipboard-list', key: 'FABRICATE.App.Gathering.Detail.Tabs.Tasks' },
    { id: 'events', icon: 'fas fa-masks-theater', key: 'FABRICATE.App.Gathering.Detail.Tabs.Events' }
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

<div
  class="gathering-detail-tabs"
  role="tablist"
  aria-label={localize('FABRICATE.App.Gathering.Detail.Tabs.Label')}
>
  {#each TABS as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`gathering-detail-tab-${tab.id}`}
      class={`gathering-detail-tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`gathering-detail-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-gathering-detail-tab={tab.id}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{localize(tab.key)}</span>
    </button>
  {/each}
</div>

<style>
  /* Bottom-border underline tabs, ported from the manager editor with base
     --fab-* tokens so they theme correctly in the player app. */
  .gathering-detail-tabs {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
    border-bottom: 1px solid var(--fab-border);
  }

  .gathering-detail-tab-button {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    border-radius: 0;
    color: var(--fab-text-muted);
    background: none;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .gathering-detail-tab-button:hover {
    color: var(--fab-text);
  }

  .gathering-detail-tab-button.is-active {
    color: var(--fab-text);
    border-bottom-color: var(--fab-accent);
  }

  .gathering-detail-tab-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }
</style>

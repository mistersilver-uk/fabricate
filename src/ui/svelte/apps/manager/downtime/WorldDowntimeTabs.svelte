<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorTabs from '../../../components/EditorTabs.svelte';

  // CORE-FALLBACK ONLY: a registered provider's tabs are the rail's Downtime sub-items, so provider
  // mode renders no strip. Hence no `coreFallback` prop, Core's four fields read as lang keys (a
  // provider's final text never reaches here) and every tab tier-gated.
  let { tabs = [], activeTabId = 'tracking', onSelect = () => {} } = $props();

  const TABLIST_KEY = 'FABRICATE.Admin.Manager.World.Downtime.Tablist';

  // Each key is also its own fallback, so an untranslated key renders as the key, as `localize` does.
  const stripTabs = $derived(
    tabs.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey: tab.label,
      label: tab.label,
      ariaLabelKey: tab.accessibleName,
      ariaLabel: tab.accessibleName,
      tooltipKey: tab.tooltip,
      tooltip: tab.tooltip,
      tierGated: true,
    }))
  );
</script>

<div class="downtime-tab-card">
  <div class="downtime-connected-studio" data-downtime-connected-studio>
    <span class="downtime-connected-icon" aria-hidden="true">
      <i class="fas fa-diagram-project"></i>
    </span>
    <div>
      <strong>{localize('FABRICATE.Admin.Manager.World.Downtime.ConnectedTitle')}</strong>
      <p>{localize('FABRICATE.Admin.Manager.World.Downtime.ConnectedDescription')}</p>
    </div>
  </div>
  <EditorTabs
    tabs={stripTabs}
    activeTab={activeTabId}
    {onSelect}
    idStem="world-downtime"
    tabDataAttr="data-downtime-tab"
    tooltipDataAttr="data-downtime-tooltip"
    ariaLabelKey={TABLIST_KEY}
    ariaLabel={TABLIST_KEY}
    data-downtime-tablist=""
  />
</div>

<style>
  /* The host states no inset, so each row carries its own; this card is the last row and needs a
     bottom gutter. `position: relative` makes the card the containing block of the strip's
     descriptions, which is what bounds each one to the pane. The card is a row — identity left,
     strip at the right end — which is why the parity spec measures `display`/`flex-direction` here. */
  .downtime-tab-card {
    position: relative;
    display: flex;
    container-type: inline-size;
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 14px;
    min-width: 0;
    margin: 14px 20px 20px;
    padding: 13px 14px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    background: var(--fab-bg-2);
  }

  /* `1 1 240px` rather than `1`: it carries the strip onto its own line when the card runs out of
     room, the narrow fallback a fixed canvas never needed and an ApplicationV2 window does. */
  .downtime-connected-studio {
    display: flex;
    min-width: 0;
    flex: 1 1 240px;
    align-items: center;
    gap: 12px;
  }

  .downtime-connected-studio strong {
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .downtime-connected-studio p {
    margin: 2px 0 0;
    color: var(--fab-text-subtle);
    font-size: 9.5px;
    line-height: 1.4;
  }

  .downtime-connected-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }
</style>

<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { tabs = [], activeTabId = 'tracking', onSelect = () => {}, coreFallback = false } = $props();

  const tabText = (tab, field) => (coreFallback ? localize(tab[field]) : tab[field]);

  function activate(tab, button) {
    onSelect(tab.id);
    button?.focus?.();
  }

  function onKeydown(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[next];
    onSelect(nextTab.id);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector(`#world-downtime-tab-${nextTab.id}`)
      ?.focus();
  }
</script>

<div class:core-fallback={coreFallback} class="downtime-tab-card">
  {#if coreFallback}
    <div class="downtime-connected-studio" data-downtime-connected-studio>
      <span class="downtime-connected-icon" aria-hidden="true">
        <i class="fas fa-diagram-project"></i>
      </span>
      <div>
        <strong>{localize('FABRICATE.Admin.Manager.World.Downtime.ConnectedTitle')}</strong>
        <p>{localize('FABRICATE.Admin.Manager.World.Downtime.ConnectedDescription')}</p>
      </div>
    </div>
  {/if}
  <div
    class="downtime-tabs"
    role="tablist"
    aria-label={localize('FABRICATE.Admin.Manager.World.Downtime.Tablist')}
    data-downtime-tablist
  >
    {#each tabs as tab, index (tab.id)}
      <div class="downtime-tab-wrap">
        <button
          type="button"
          role="tab"
          id={`world-downtime-tab-${tab.id}`}
          class:is-active={activeTabId === tab.id}
          aria-selected={activeTabId === tab.id}
          aria-controls={`world-downtime-panel-${tab.id}`}
          aria-label={tabText(tab, 'accessibleName')}
          aria-describedby={`world-downtime-tooltip-${tab.id}`}
          tabindex={activeTabId === tab.id ? 0 : -1}
          data-downtime-tab={tab.id}
          onclick={(event) => activate(tab, event.currentTarget)}
          onkeydown={(event) => onKeydown(event, index)}
        >
          <i class={tab.icon} aria-hidden="true"></i>
          <span>{tabText(tab, 'label')}</span>
          {#if coreFallback}
            <i class="fas fa-lock downtime-tab-lock" aria-hidden="true"></i>
          {/if}
        </button>
        <span
          id={`world-downtime-tooltip-${tab.id}`}
          class="downtime-tab-tooltip"
          role="tooltip"
          data-downtime-tooltip={tab.id}>{tabText(tab, 'tooltip')}</span
        >
      </div>
    {/each}
  </div>
</div>

<style>
  .downtime-tab-card {
    min-width: 0;
  }

  .downtime-tab-card.core-fallback {
    display: flex;
    container-type: inline-size;
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
    margin: 14px 18px 0;
    padding: 13px 14px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    background: var(--fab-bg-2);
  }

  .downtime-connected-studio {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 12px;
  }

  .downtime-connected-studio strong {
    color: var(--fab-text);
  }

  .downtime-connected-studio p {
    margin: 2px 0 0;
    color: var(--fab-text-subtle);
    font-size: 0.76rem;
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

  .downtime-tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }

  .downtime-tab-wrap {
    position: relative;
  }

  button {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-muted);
    font-size: 9.5px;
    font-weight: 600;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible,
  button.is-active {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .downtime-tab-lock {
    font-size: 0.72em;
    color: var(--fab-accent);
  }

  .downtime-tab-tooltip {
    position: absolute;
    z-index: 2;
    bottom: calc(100% + 7px);
    left: 50%;
    width: max-content;
    max-width: min(260px, 70vw);
    padding: 6px 8px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 6px;
    background: var(--fab-bg-0);
    color: var(--fab-text);
    font-size: 0.72rem;
    line-height: 1.3;
    opacity: 0;
    pointer-events: none;
    translate: -50% 3px;
  }

  .downtime-tab-wrap:hover .downtime-tab-tooltip,
  .downtime-tab-wrap:focus-within .downtime-tab-tooltip {
    opacity: 1;
    translate: -50% 0;
  }

  @container (max-width: 720px) {
    button span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    button {
      width: 38px;
      justify-content: center;
      padding-inline: 0;
    }

    .downtime-tab-lock {
      display: none;
    }

    .downtime-tab-tooltip {
      max-width: min(220px, 80vw);
    }
  }
</style>

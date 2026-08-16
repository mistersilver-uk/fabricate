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
  /* The host states no inset of its own, so each of its two rows carries its own — see the
     note in `WorldDowntimeExtensionHost`. A companion's strip is the FIRST row and needs no
     bottom gutter; Core's connected card is the LAST and does.

     `position: relative` makes the CARD the tooltip's containing block rather than the tab
     it belongs to, which is what bounds a tooltip to the pane. See the tooltip note below. */
  .downtime-tab-card {
    position: relative;
    min-width: 0;
    margin: 14px 20px 0;
  }

  /*
    The connected-studio card is a ROW: identity on the left, the tab strip at the right end,
    both centred against each other. It reads completely differently as a column — every
    padding, radius and colour can match while the card says something else — which is why
    the parity spec measures `display`/`flex-direction`/`align-items` here at all.
  */
  .downtime-tab-card.core-fallback {
    display: flex;
    container-type: inline-size;
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 14px;
    margin: 14px 20px 20px;
    padding: 13px 14px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    background: var(--fab-bg-2);
  }

  /* `1 1 240px` rather than `1`: it is what carries the strip onto its own line when the
     card runs out of room, which is the narrow fallback the design's fixed canvas never
     needed and an ApplicationV2 window does. */
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

  /* No `justify-content`: the identity block beside it takes `flex: 1`, which is what puts
     the strip at the card's right end the way the design draws it. */
  .downtime-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
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

  /*
    Lock colour tracks CURRENCY, not lockedness: the design paints the current tab's padlock
    with the accent and drops the other three to subtle, so a locked idle tab stops shouting
    as loudly as the selected one. This padlock is deliberately self-coloured — it is one of
    the twelve glyphs the design colours on the `<i>` — so it does NOT follow the button's
    hover, which is why there is no hover rule here even though the label has one.
  */
  .downtime-tab-lock {
    font-size: 7px;
    color: var(--fab-text-subtle);
  }

  button.is-active .downtime-tab-lock {
    color: var(--fab-accent);
  }

  /*
    THE TOOLTIP IS BOUNDED BY THE CARD, not centred on its own tab.

    A tab-centred tooltip overhangs its tab by half its own width, and the design puts this
    strip at the card's RIGHT end — so the last tab's tooltip hung past the pane and the View
    Lab's own layout assertion failed the whole route with `[data-world-downtime-host]
    overflows horizontally`. Anchoring to the card's right edge with `max-width: 100%` makes
    overflow unrepresentable rather than merely unlikely at the width somebody measured.

    It sits ABOVE the card in Core's fallback, where the card is the pane's last row, and
    BELOW it when a companion owns the surface and the strip is the first row instead.
  */
  .downtime-tab-tooltip {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: calc(100% + 7px);
    width: max-content;
    max-width: min(260px, 100%);
    padding: 6px 8px;
    border: 1px solid var(--fab-border-strong);
    border-radius: 6px;
    background: var(--fab-bg-0);
    color: var(--fab-text);
    font-size: 0.72rem;
    line-height: 1.3;
    opacity: 0;
    pointer-events: none;
    translate: 0 3px;
  }

  .downtime-tab-card:not(.core-fallback) .downtime-tab-tooltip {
    top: calc(100% + 7px);
    bottom: auto;
    translate: 0 -3px;
  }

  .downtime-tab-wrap:hover .downtime-tab-tooltip,
  .downtime-tab-wrap:focus-within .downtime-tab-tooltip {
    opacity: 1;
    translate: 0 0;
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
      max-width: min(220px, 100%);
    }
  }
</style>

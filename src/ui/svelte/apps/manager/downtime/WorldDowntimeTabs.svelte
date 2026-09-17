<script>
  import { localize } from '../../../util/foundryBridge.js';

  // CORE-FALLBACK ONLY: a registered provider's tabs are the rail's Downtime sub-items, so provider
  // mode renders no strip. Hence no `coreFallback` prop, unconditional `localize` (Core's four are
  // lang keys; a provider's final text never reaches here) and unconditional padlocks.
  let { tabs = [], activeTabId = 'tracking', onSelect = () => {} } = $props();

  // The roving `tabindex` needs a tab stop that always EXISTS: bound to `activeTabId` alone every
  // button goes `-1` when that id names no rendered tab. `aria-selected` STAYS bound to it, because
  // the APG's fallback governs the tab stop, never which tab reports as selected.
  const focusableTabId = $derived(
    tabs.some((tab) => tab.id === activeTabId) ? activeTabId : (tabs[0]?.id ?? null)
  );

  // Which tab's tooltip is showing. They are emitted OUTSIDE the tablist, so `:focus-within` on a
  // shared wrapper cannot drive them and the association is carried explicitly.
  let describedTabId = $state(null);

  function describe(tabId) {
    describedTabId = tabId;
  }

  function undescribe(tabId) {
    if (describedTabId === tabId) describedTabId = null;
  }

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
  <div
    class="downtime-tabs"
    role="tablist"
    aria-label={localize('FABRICATE.Admin.Manager.World.Downtime.Tablist')}
    data-downtime-tablist
  >
    {#each tabs as tab, index (tab.id)}
      <button
        type="button"
        role="tab"
        id={`world-downtime-tab-${tab.id}`}
        class:is-active={activeTabId === tab.id}
        aria-selected={activeTabId === tab.id}
        aria-controls={`world-downtime-panel-${tab.id}`}
        aria-label={localize(tab.accessibleName)}
        aria-describedby={`world-downtime-tooltip-${tab.id}`}
        tabindex={tab.id === focusableTabId ? 0 : -1}
        data-keyboard-focus="true"
        data-downtime-tab={tab.id}
        onclick={(event) => activate(tab, event.currentTarget)}
        onkeydown={(event) => onKeydown(event, index)}
        onmouseenter={() => describe(tab.id)}
        onmouseleave={() => undescribe(tab.id)}
        onfocus={() => describe(tab.id)}
        onblur={() => undescribe(tab.id)}
      >
        <i class={tab.icon} aria-hidden="true"></i>
        <span>{localize(tab.label)}</span>
        <i class="fas fa-lock downtime-tab-lock" aria-hidden="true"></i>
      </button>
    {/each}
  </div>

  <!-- The `aria-describedby` targets, emitted as SIBLINGS of the tablist: a `tablist`'s only
       permitted owned role is `tab`, so a `tooltip` child is unallowed content that
       `aria-required-children` reports and a "tab N of M" count can include. An IDREF resolves
       document-wide, so each button's declared association is unchanged, and position is unchanged
       too — these were already laid out against the card. Only `:focus-within` on the old per-tab
       wrapper breaks, which `describedTabId` now carries explicitly. -->
  {#each tabs as tab (tab.id)}
    <span
      id={`world-downtime-tooltip-${tab.id}`}
      class="downtime-tab-tooltip"
      class:is-described={describedTabId === tab.id}
      role="tooltip"
      data-downtime-tooltip={tab.id}>{localize(tab.tooltip)}</span
    >
  {/each}
</div>

<style>
  /* The host states no inset, so each row carries its own; this card is the LAST row and needs a
     bottom gutter. `position: relative` makes the CARD the tooltip's containing block rather than
     the tab, which is what bounds a tooltip to the pane. The card is a ROW — identity left, strip
     at the right end — which is why the parity spec measures `display`/`flex-direction` here. */
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

  /* No `justify-content`: the identity block's `flex: 1` is what puts the strip at the right end. */
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
    Lock colour tracks CURRENCY, not lockedness: the current tab's padlock takes the accent and the
    rest drop to subtle. Self-coloured on the `<i>`, so it does NOT follow the button's hover —
    which is why there is no hover rule here even though the label has one.
  */
  .downtime-tab-lock {
    font-size: 7px;
    color: var(--fab-text-subtle);
  }

  button.is-active .downtime-tab-lock {
    color: var(--fab-accent);
  }

  /*
    THE TOOLTIP IS BOUNDED BY THE CARD, not centred on its own tab: a tab-centred tooltip overhangs
    by half its width, and the strip sits at the card's RIGHT end, so the last tab's tooltip hung
    past the pane and failed the View Lab's layout assertion. Anchoring to the card's right edge
    with `max-width: 100%` makes overflow unrepresentable. It sits ABOVE the card, the pane's last row.
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

  .downtime-tab-tooltip.is-described {
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

<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import WorldDowntimePreview from './WorldDowntimePreview.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './worldDowntimePreviewProvider.js';
  import WorldDowntimeTabs from './WorldDowntimeTabs.svelte';
  import { MANAGER_HOOKS } from '../../../../../config/hooks.js';
  import { emitManagerHook, WORLD_DOWNTIME_SURFACE_ID } from '../../../../managerExtensions.js';

  // `activeTabId` is bindable because the selected preview is no longer private to this
  // host: the route's title, subtitle and breadcrumb leaf all name it, and the rail's
  // Downtime sub-items are a second trigger for the same navigation as the tab strip. One
  // owner, two triggers — binding keeps the shell authoritative while letting the host read
  // and drive it. Unbound (the direct-mount tests), it is ordinary local state.
  //
  // `provider` is a PROP rather than a subscription of this host's own. The rail renders the
  // active tab set while this host is unmounted, and a mount fault has to move the rail as
  // well as the panel, so exactly one component may own "which provider is live" — and it
  // has to be the shell. This host owns the mount lifecycle and nothing else.
  let {
    provider = null,
    tabs = WORLD_DOWNTIME_PREVIEW_PROVIDER.tabs,
    context = Object.freeze({}),
    reportError = console.error,
    emitHook = emitManagerHook,
    surfaceId = WORLD_DOWNTIME_SURFACE_ID,
    route = 'world-downtime',
    onProviderFault = () => {},
    // The rail sub-item that NAMES each companion screen (issue 1213). In provider mode the
    // panel is a `role="region"` labelled by its rail item, and Root owns that id — so Root
    // passes the very function it stamps the rail with rather than this host re-deriving the
    // string, which would be a hand-maintained mirror of an id in another component.
    //
    // Two dependencies of that name, both invisible and neither gated: `manager-downtime-nav-<id>`
    // only exists inside `{#if railGroupExpanded.worldDowntime}`, so the name depends on the
    // group lock; and the rail lock is what keeps the sub-items reachable at all.
    navItemId = (tabId) => `manager-downtime-nav-${tabId}`,
    activeTabId = $bindable('tracking'),
  } = $props();
  const coreFallback = $derived(provider == null);
  let extensionTarget = $state(null);
  let shell = $state(null);
  let activeMount = null;
  // Plain locals, deliberately not `$state`: they record what has already been OBSERVED so
  // an effect can tell a real change from a re-run, and making them reactive would make
  // each effect its own dependency.
  let observedProvider;
  let providerObserved = false;
  let recoverFocus = false;
  let announcedTabId = null;

  function surfacePayload(extra = {}) {
    return Object.freeze({
      schemaVersion: 1,
      surfaceId,
      route,
      tabId: activeTabId,
      providerId: provider?.id ?? null,
      coreFallback,
      ...extra,
    });
  }

  function disposeActiveMount() {
    const mountedProvider = activeMount;
    if (!mountedProvider) return;
    activeMount = null;
    try {
      mountedProvider.cleanup?.();
    } catch (error) {
      reportError('Fabricate | Downtime provider cleanup failed:', error);
    } finally {
      mountedProvider.target.replaceChildren();
    }
  }

  export function disposeBeforeRemoval() {
    disposeActiveMount();
  }

  function selectTab(tabId) {
    if (tabId === activeTabId) return;
    disposeActiveMount();
    activeTabId = tabId;
  }

  // `$effect.pre` runs BEFORE the DOM is updated, which is the only moment at which
  // `document.activeElement` still names the node the provider swap is about to remove.
  $effect.pre(() => {
    const nextProvider = provider;
    if (providerObserved && nextProvider === observedProvider) return;
    const hadProvider = providerObserved;
    providerObserved = true;
    observedProvider = nextProvider;
    recoverFocus = hadProvider && shell?.contains?.(document.activeElement) === true;
  });

  // The landing place is MODE-AWARE, not one selector (issue 1213). Provider mode renders no
  // tab strip, so `#world-downtime-tab-<id>` resolves to nothing there and optional chaining
  // drops focus to `<body>` in silence — the register direction, which no test covered.
  //
  // A single combined `#world-downtime-panel-<id>, #world-downtime-tab-<id>` selector looks
  // like it covers both and does not: `querySelector` returns the first match in DOCUMENT
  // order, and in core-fallback the preview panels carry that same panel id AND sit before the
  // strip, so the combined query would silently move Core's landing place off its tab button.
  // Ask which mode is live instead.
  $effect(() => {
    // Track the swap this recovery belongs to.
    void provider;
    const fallbackNow = coreFallback;
    if (!recoverFocus) return;
    recoverFocus = false;
    const selector = fallbackNow
      ? `#world-downtime-tab-${activeTabId}`
      : `#world-downtime-panel-${activeTabId}`;
    tick().then(() => shell?.querySelector?.(selector)?.focus?.());
  });

  $effect(() => {
    const tabId = activeTabId;
    if (announcedTabId === tabId) return;
    const previousTabId = announcedTabId;
    announcedTabId = tabId;
    // The first observation is the route's own mount, which `SURFACE_MOUNTED` reports.
    if (previousTabId === null) return;
    emitHook(MANAGER_HOOKS.SURFACE_TAB_CHANGED, surfacePayload({ previousTabId }));
  });

  $effect(() => {
    const target = extensionTarget;
    const activeProvider = provider;
    const tabId = activeTabId;
    const mountContext = context;
    if (!target || !activeProvider) return;
    // The shell normalizes `activeTabId` onto the new tab set, so for one render the id and
    // the provider can disagree. Never ask a companion to mount a tab it does not declare.
    if (!activeProvider.tabs.some((tab) => tab.id === tabId)) return;

    target.replaceChildren();
    try {
      const result = activeProvider.mount({ target, tabId, context: mountContext });
      if (result !== undefined && typeof result !== 'function') {
        throw new TypeError(
          'World navigation provider mount must return a cleanup function or nothing'
        );
      }
      activeMount = { target, cleanup: result ?? null };
    } catch (error) {
      target.replaceChildren();
      reportError('Fabricate | Downtime provider mount failed:', error);
      onProviderFault(activeProvider);
    }

    return disposeActiveMount;
  });

  onMount(() => emitHook(MANAGER_HOOKS.SURFACE_MOUNTED, surfacePayload()));

  onDestroy(() => {
    const payload = surfacePayload();
    disposeActiveMount();
    emitHook(MANAGER_HOOKS.SURFACE_UNMOUNTED, payload);
  });
</script>

<section
  class={`downtime-host ${coreFallback ? 'core-fallback' : ''}`}
  bind:this={shell}
  data-world-downtime-host
>
  {#if coreFallback}
    <div class="downtime-preview-scroll">
      {#each tabs as tab (tab.id)}
        <WorldDowntimePreview tabId={tab.id} hidden={tab.id !== activeTabId} />
      {/each}
    </div>
    <WorldDowntimeTabs {tabs} {activeTabId} onSelect={selectTab} />
  {:else}
    <!--
      NO TAB STRIP HERE (issue 1213). A provider's tabs are the Manager rail's Downtime
      sub-items and nothing else, so a strip would render the same list twice and cost the
      companion 44px of its board. Those sub-items stay plain `button.manager-nav-subitem`
      with `aria-current` — they are not a tablist, and with no tablist a `role="tabpanel"`
      would be an orphan, so each panel is a NAMED REGION labelled by the rail item instead.

      `tabindex="-1"`, deliberately not `0`: the focus stop existed to scroll this panel, and
      the panel no longer owns the scrolling for a companion that takes its own. What is left
      is programmatic focusability, which is what the provider-swap recovery above needs.
    -->
    <div class="downtime-extension-panels">
      {#each tabs as tab (tab.id)}
        <div
          id={`world-downtime-panel-${tab.id}`}
          class="downtime-extension-panel"
          role="region"
          tabindex="-1"
          aria-labelledby={navItemId(tab.id)}
          hidden={tab.id !== activeTabId}
        >
          {#if tab.id === activeTabId}
            <div
              class="downtime-extension-target"
              bind:this={extensionTarget}
              data-downtime-extension-panel={tab.id}
            ></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  /*
    The workspace surface is a step DARKER than a card, not lighter. The design's ladder runs
    backdrop -> frame (`--fab-bg-1`) -> cards (`--fab-bg-2`), and the Manager's default main
    pane paints `--fab-bg-2` — which inverts it, leaving this route's cards reading as wells
    cut into a lighter pane instead of panels raised off a darker one. The host states its own
    surface so the preview's cards, the board's rows and a companion's panel all sit on the
    one the design draws.

    ONE TRACK IN PROVIDER MODE, and this is ONE DECISION WITH THE MARKUP ABOVE — not tidiness
    left over from deleting the strip. Grid auto-placement puts the single remaining child in
    the FIRST track; it does not skip into a vacated `1fr`. Left at `auto minmax(0, 1fr)` the
    panels landed in the `auto` track beside an empty 700px second track, collapsed to bare
    content height, and every percentage height below them resolved against an indefinite
    ancestor and silently became content height too. `target.clientHeight ===
    panels.clientHeight` still READ true throughout, because both sides collapsed together.

    Do not restore a second track here without restoring a second child above it.
  */
  .downtime-host {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: var(--fab-bg-1);
    overflow: hidden;
  }

  .downtime-host.core-fallback {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  /*
    THE FALLBACK SCROLLER, and what does and does not switch it off.

    Core's panel scroller keeps working for any companion whose content overflows its root
    VISIBLY — including one that takes the full height. It stops rescuing a companion the
    moment that companion absorbs its own content: by giving its root a non-`visible`
    overflow, or by letting a definite-height flex or grid root shrink its children, which
    squashes them rather than scrolling them. Height alone does not remove the fallback.

    Measured, at panel client height 707: an auto-height root with a tall child scrolls
    (2550); a definite-height flex-column root with a SHRINKABLE tall child does not (707 —
    the child was squashed to 671, not scrolled); the same root with a non-shrinking child
    does (2526); a definite `display: block` root does (2526); a root with its own
    `overflow: auto` does not (707). A probe that appends one tall child to a flex column and
    concludes "full height kills the scroller" has measured `flex-shrink: 1`, not height.
  */
  .downtime-preview-scroll,
  .downtime-extension-panels {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  /*
    THE COMPANION PANEL IS A BARE BOX (issue 1213), matching the player seam's target: full
    height, and no padding, background, scroller or containment of its own. Core's old
    `12px 20px 24px` inset is gone — the companion supplies its own, exactly as it does in the
    player window, and a shipped companion that relied on Core's inset must add it back.

    `height: 100%` at BOTH links is what makes the panel's content box reachable. Neither the
    wrapper nor the target carried a height, so a companion root asking for `height: 100%`
    resolved against an auto-height ancestor and got CONTENT height — which is not a collapse,
    it just quietly stops being the box the companion asked for. `.downtime-host` is already
    `height: 100%` and `.downtime-extension-panels` is its `minmax(0, 1fr)` row, so the chain
    is definite from the host down once these two state it.

    It stays OPT-IN: the height is reachable, never forced. A companion that sets no height of
    its own still renders at content height with the scroller below as its fallback.
  */
  .downtime-extension-panel {
    height: 100%;
    min-height: 0;
  }

  .downtime-extension-target {
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>

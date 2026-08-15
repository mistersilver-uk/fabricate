<script>
  import { onDestroy, tick } from 'svelte';
  import WorldDowntimePreview from './WorldDowntimePreview.svelte';
  import WorldDowntimeTabs from './WorldDowntimeTabs.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './worldDowntimePreviewProvider.js';

  let {
    managerExtensions = null,
    context = Object.freeze({}),
    reportError = console.error,
  } = $props();
  let provider = $state(WORLD_DOWNTIME_PREVIEW_PROVIDER);
  let coreFallback = $state(true);
  let activeTabId = $state('tracking');
  let extensionTarget = $state(null);
  let shell = $state(null);
  let activeMount = null;

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

  function adoptProvider(nextProvider) {
    const recoverFocus = shell?.contains?.(document.activeElement) === true;
    const adopted = nextProvider ?? WORLD_DOWNTIME_PREVIEW_PROVIDER;
    disposeActiveMount();
    coreFallback = nextProvider == null;
    provider = adopted;
    if (!adopted.tabs.some((tab) => tab.id === activeTabId)) activeTabId = 'tracking';
    if (recoverFocus) {
      tick().then(() => shell?.querySelector?.(`#world-downtime-tab-${activeTabId}`)?.focus?.());
    }
  }

  $effect(() => {
    if (!managerExtensions?.subscribe) return;
    let initialSnapshot = true;
    return managerExtensions.subscribe((nextProvider) => {
      if (initialSnapshot) {
        initialSnapshot = false;
        if (nextProvider == null) return;
      }
      queueMicrotask(() => adoptProvider(nextProvider));
    });
  });

  $effect(() => {
    const target = extensionTarget;
    const activeProvider = provider;
    const tabId = activeTabId;
    if (!target || coreFallback) return;

    target.replaceChildren();
    try {
      const result = activeProvider.mount({ target, tabId, context });
      if (result !== undefined && typeof result !== 'function') {
        throw new TypeError(
          'World navigation provider mount must return a cleanup function or nothing'
        );
      }
      activeMount = { target, cleanup: result ?? null };
    } catch (error) {
      target.replaceChildren();
      reportError('Fabricate | Downtime provider mount failed:', error);
      queueMicrotask(() => {
        if (provider === activeProvider) adoptProvider(null);
      });
    }

    return disposeActiveMount;
  });

  onDestroy(disposeActiveMount);
</script>

<section
  class={`downtime-host ${coreFallback ? 'core-fallback' : ''}`}
  bind:this={shell}
  data-world-downtime-host
>
  {#if coreFallback}
    <div class="downtime-preview-scroll">
      {#each provider.tabs as tab (tab.id)}
        <WorldDowntimePreview tabId={tab.id} hidden={tab.id !== activeTabId} />
      {/each}
    </div>
    <WorldDowntimeTabs tabs={provider.tabs} {activeTabId} onSelect={selectTab} coreFallback />
  {:else}
    <WorldDowntimeTabs tabs={provider.tabs} {activeTabId} onSelect={selectTab} />
    <div class="downtime-extension-panels">
      {#each provider.tabs as tab (tab.id)}
        <div
          id={`world-downtime-panel-${tab.id}`}
          role="tabpanel"
          tabindex="0"
          aria-labelledby={`world-downtime-tab-${tab.id}`}
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
  .downtime-host {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    height: 100%;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }

  .downtime-host.core-fallback {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .downtime-preview-scroll,
  .downtime-extension-panels {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .downtime-extension-target {
    min-width: 0;
    min-height: 0;
  }
</style>

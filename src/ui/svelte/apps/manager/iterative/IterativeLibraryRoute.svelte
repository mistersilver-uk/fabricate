<!-- Svelte 5 runes mode -->
<!--
  The iterative library's route root: one `<main>` the Counters, Actions and Crafting Action
  editor screens mount into, so the route scrolls inside the manager's one `minmax(0, 1fr)` row
  instead of growing it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `route` | the `iterativeRouteModel` instance | — | state and handlers for the screens |
  | `currentView` | `iterative-counters`, `iterative-actions` or `iterative-action-edit` | `''` | written as `data-iterative-view` |
  | `text` | the shell's localizer | — | `(key, fallback)` |
-->
<script>
  import ActionEditorView from './ActionEditorView.svelte';
  import ActionsBrowserView from './ActionsBrowserView.svelte';
  import CountersView from './CountersView.svelte';

  let { route, currentView = '', text = () => '' } = $props();

  const LABELS = {
    'iterative-counters': ['FABRICATE.Admin.Manager.Iterative.CountersTitle', 'Counters'],
    'iterative-actions': ['FABRICATE.Admin.Manager.Iterative.ActionsTitle', 'Actions'],
    'iterative-action-edit': ['FABRICATE.Admin.Manager.Iterative.ActionEditTitle', 'Edit action'],
  };
  const label = $derived(text(...(LABELS[currentView] ?? LABELS['iterative-counters'])));
</script>

<main
  class="manager-main"
  aria-label={label}
  data-iterative-route
  data-iterative-view={currentView}
  data-iterative-unsupported={route.unsupported ? '' : undefined}
>
  {#if currentView === 'iterative-counters'}
    <CountersView
      counters={route.counters}
      actions={route.actions}
      recipes={route.recipes}
      systemName={route.systemName}
      selectedSystemId={route.systemId}
      unsupported={route.unsupported}
      expandedId={route.expandedCounterId}
      focusNameId={route.focusNameId}
      browserState={route.countersBrowse}
      {text}
      onAdd={route.addCounter}
      onUpdate={route.updateCounter}
      onReorder={route.reorderCounters}
      onDelete={route.deleteCounter}
      onExpand={route.expandCounter}
      onNameFocused={route.clearNameFocus}
    />
  {:else if currentView === 'iterative-actions'}
    <ActionsBrowserView
      actions={route.actions}
      counters={route.counters}
      blocking={route.actionBlocking}
      issues={route.actionIssueTotals}
      selectedSystemId={route.systemId}
      unsupported={route.unsupported}
      browserState={route.actionsBrowse}
      {text}
      onOpen={route.openAction}
      onNew={route.startNewAction}
    />
  {:else if currentView === 'iterative-action-edit'}
    <ActionEditorView {route} {text} />
  {/if}
</main>

<style>
  /* Every screen's one scrolling column; the Actions browser lays out its own rows over it. */
  main > :global(.manager-iterative-screen) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
    overflow-y: auto;
  }
</style>

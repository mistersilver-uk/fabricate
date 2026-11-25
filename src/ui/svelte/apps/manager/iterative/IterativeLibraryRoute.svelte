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
></main>

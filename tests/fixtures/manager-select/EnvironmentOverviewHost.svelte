<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `EnvironmentOverviewTab` that applies each report to the environment it
  passes, as the environment editor does: `onUpdate`'s patch and `onSetCompositionMode`'s mode move
  the drawn environment synchronously, so the next key starts from the mode just chosen.
-->
<script>
  import EnvironmentOverviewTab from '../../../src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte';

  let {
    environment: initial,
    onUpdate = () => {},
    onSetCompositionMode = () => {},
    ...rest
  } = $props();

  // svelte-ignore state_referenced_locally
  let environment = $state({ ...initial });

  function update(patch) {
    onUpdate(patch);
    environment = { ...environment, ...patch };
  }

  function setCompositionMode(mode) {
    onSetCompositionMode(mode);
    environment = { ...environment, compositionMode: mode };
  }
</script>

<EnvironmentOverviewTab
  {...rest}
  {environment}
  onUpdate={update}
  onSetCompositionMode={setCompositionMode}
/>

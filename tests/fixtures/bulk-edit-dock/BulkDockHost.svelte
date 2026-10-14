<!-- The bulk edit shell over focusable staged axes, with the real set delete in its dock. The delete
     never disarms, so a focus walk after arming measures the armed dock. -->
<script>
  import BulkDeleteCard from '../../../src/ui/svelte/apps/manager/BulkDeleteCard.svelte';
  import BulkEditPanelShell from '../../../src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';

  let { axes = 18, armed: initialArmed = false, card = {} } = $props();
  // svelte-ignore state_referenced_locally
  let armed = $state(initialArmed);
</script>

<BulkEditPanelShell heading="3 selected" canApply>
  {#each Array.from({ length: axes }, (_, index) => index) as index (index)}
    <button type="button" class="probe-axis">Staged axis {index + 1}</button>
  {/each}
  {#snippet dockFoot()}
    <BulkDeleteCard {...card} {armed} onArm={() => (armed = true)} />
  {/snippet}
</BulkEditPanelShell>

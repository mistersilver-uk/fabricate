<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `SetCard` (issue 2512): a `data-set-card-scope` list whose Remove takes the
  card out unless `refuse` is set, closed by an adder stamped `data-set-card-remove-fallback`, with
  each card's bound root reported on the host.
-->
<script>
  import { untrack } from 'svelte';
  import SetCard from '../../../src/ui/svelte/components/SetCard.svelte';

  let { names = [], refuse = false, reservedAt = -1 } = $props();

  let sets = $state(
    untrack(() => names.map((name, index) => ({ id: `s${index}`, name, element: null })))
  );

  const actions = [
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'remove', label: 'Remove', danger: true },
  ];

  function act(id, setId) {
    if (id === 'remove' && !refuse) sets = sets.filter((set) => set.id !== setId);
  }
</script>

<div data-set-card-scope>
  {#each sets as set, index (set.id)}
    <SetCard
      bind:element={set.element}
      variant={index === reservedAt ? 'reserved' : 'default'}
      name={set.name}
      nameLabel="Set name"
      {actions}
      onAction={(id) => act(id, set.id)}
      data-host-set={set.id}
    />
  {/each}
  <button type="button" data-set-card-remove-fallback data-keyboard-focus="true">Add a set</button>
</div>
<output data-host-bound
  >{sets.filter((set) => set.element?.classList.contains('fabricate-set-card')).length}</output
>

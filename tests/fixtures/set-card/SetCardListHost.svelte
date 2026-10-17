<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `SetCard` (issue 2512): a `data-set-card-scope` list whose Remove takes the
  card out unless `refuse` is set, closed by an adder stamped `data-set-card-remove-fallback`, with
  each card's bound root reported on the host. Under `collapse` a lone set re-renders bare, as a
  recipe's single set does, closed by a stamped Add (`'fallback'`) or only its own adder (`'adder'`).
-->
<script>
  import { untrack } from 'svelte';
  import SetCard from '../../../src/ui/svelte/components/SetCard.svelte';

  let { names = [], refuse = false, reservedAt = -1, collapse = '' } = $props();

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

{#snippet bareAdder()}
  <button type="button" data-recipe-add="item" data-keyboard-focus="true">Add an item</button>
{/snippet}

<div data-set-card-scope>
  {#if collapse && sets.length === 1}
    <SetCard variant="bare" name={sets[0].name} adder={bareAdder} data-host-set={sets[0].id} />
    {#if collapse === 'fallback'}
      <button
        type="button"
        data-set-card-remove-fallback
        data-host-bare-add
        data-keyboard-focus="true">Add a set</button
      >
    {/if}
  {:else}
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
    <button type="button" data-set-card-remove-fallback data-keyboard-focus="true">Add a set</button
    >
  {/if}
</div>
<output data-host-bound
  >{sets.filter((set) => set.element?.classList.contains('fabricate-set-card')).length}</output
>

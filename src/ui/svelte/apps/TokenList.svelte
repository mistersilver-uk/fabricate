<!-- Svelte 5 runes mode -->
<script>
  let { items = [], placeholder = '', emptyText = '', onAdd, onRemove, children } = $props();

  let newValue = $state('');

  function handleAdd() {
    if (!newValue.trim()) return;
    onAdd(newValue.trim());
    newValue = '';
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }
</script>

<div class="panel-toolbar compact">
  <input type="text" bind:value={newValue} {placeholder} onkeydown={handleKeydown} />
  <button type="button" onclick={handleAdd} aria-label="Add"><i class="fas fa-plus"></i></button>
</div>
<div class="token-list">
  {@render children?.()}
  {#if items.length}
    {#each items as item}
      <span class="token">
        {item}
        <button type="button" onclick={() => onRemove(item)} aria-label="Remove {item}"><i class="fas fa-times"></i></button>
      </span>
    {/each}
  {:else if !children}
    <p class="hint">{emptyText}</p>
  {/if}
</div>

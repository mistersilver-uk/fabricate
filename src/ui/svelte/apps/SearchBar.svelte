<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    value = '',
    onSearch,
    placeholder = '',
    debounceMs = 300,
    showClearButton = false
  } = $props();

  // svelte-ignore state_referenced_locally
  let internalValue = $state(value);
  let timer = null;
  // svelte-ignore state_referenced_locally
  let lastExternalValue = value;
  let searchInput = null;

  // Sync from parent when value prop changes externally (guard against overwriting buffered input)
  $effect(() => {
    if (value !== lastExternalValue) {
      lastExternalValue = value;
      internalValue = value;
    }
  });

  // Cleanup timer on destroy
  $effect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  function handleInput(event) {
    internalValue = event.target.value;
    if (timer) clearTimeout(timer);
    if (debounceMs <= 0) {
      onSearch?.(internalValue);
      return;
    }
    timer = setTimeout(() => {
      onSearch?.(internalValue);
      timer = null;
    }, debounceMs);
  }

  function handleClear() {
    if (!internalValue) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    internalValue = '';
    onSearch?.('');
    searchInput?.focus();
  }
</script>

<div class="fabricate-search" class:has-clear-button={showClearButton}>
  <input
    bind:this={searchInput}
    type="text"
    name="search"
    value={internalValue}
    placeholder={placeholder || localize('FABRICATE.Search.Placeholder')}
    oninput={handleInput}
    aria-label={localize('FABRICATE.Search.Label')}
  />
  {#if showClearButton}
    <button
      type="button"
      class="fabricate-search-clear"
      class:is-empty={!internalValue}
      onclick={handleClear}
      aria-label={localize('FABRICATE.Search.ClearLabel')}
      aria-disabled={!internalValue}
      tabindex={internalValue ? 0 : -1}
    >
      <i class="fas fa-times"></i>
    </button>
  {/if}
  <span class="fabricate-search-icon" aria-hidden="true">
    <i class="fas fa-search"></i>
  </span>
</div>

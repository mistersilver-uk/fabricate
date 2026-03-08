<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { value = '', onSearch, placeholder = '', debounceMs = 300 } = $props();

  let internalValue = $state(value);
  let timer = null;
  let lastExternalValue = value;

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
</script>

<div class="fabricate-search">
  <input
    type="text"
    name="search"
    value={internalValue}
    placeholder={placeholder || localize('FABRICATE.Search.Placeholder')}
    oninput={handleInput}
    aria-label={localize('FABRICATE.Search.Label')}
  />
  <i class="fas fa-search"></i>
</div>

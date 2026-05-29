<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { state = 'unavailable' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isAvailable = $derived(state === 'available');
  const label = $derived(isAvailable
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Available', 'Available')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Unavailable', 'Unavailable'));
</script>

<span
  class={`manager-chip ${isAvailable ? 'is-positive' : 'is-warning'} manager-environment-runtime-pill`}
  data-runtime-state={state}
>
  <i class={isAvailable ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'} aria-hidden="true"></i>
  <span>{label}</span>
</span>

<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';

  let { state = 'unavailable' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isAvailable = $derived(state === 'available');
  const isConditionsBlocked = $derived(state === 'conditionsBlocked');
  const tone = $derived(isAvailable ? 'positive' : 'warning');
  const icon = $derived(
    isAvailable
      ? 'fas fa-circle-check'
      : isConditionsBlocked
        ? 'fas fa-hourglass-half'
        : 'fas fa-circle-exclamation'
  );
  const label = $derived(
    isAvailable
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Available', 'Available')
      : isConditionsBlocked
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.ConditionsBlocked', 'Waiting')
        : text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Unavailable', 'Unavailable')
  );
</script>

<Chip {tone} {icon} class="manager-environment-runtime-pill" data-runtime-state={state}>
  <span>{label}</span>
</Chip>

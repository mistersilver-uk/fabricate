<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { state = 'unavailable' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isAvailable = $derived(state === 'available');
  const isConditionsBlocked = $derived(state === 'conditionsBlocked');
  const tone = $derived(isAvailable ? 'is-positive' : 'is-warning');
  const icon = $derived(isAvailable
    ? 'fas fa-circle-check'
    : isConditionsBlocked
      ? 'fas fa-cloud-sun'
      : 'fas fa-circle-exclamation');
  const label = $derived(isAvailable
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Available', 'Available')
    : isConditionsBlocked
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.ConditionsBlocked', 'Conditions blocked')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Runtime.Unavailable', 'Unavailable'));
</script>

<span
  class={`manager-chip ${tone} manager-environment-runtime-pill`}
  data-runtime-state={state}
>
  <i class={icon} aria-hidden="true"></i>
  <span>{label}</span>
</span>

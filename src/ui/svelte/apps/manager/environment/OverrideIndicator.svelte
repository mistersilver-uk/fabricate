<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { compositionState = '', mode = 'automatic' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const META = {
    forceIncluded: { tone: 'is-warning', icon: 'fas fa-bolt' },
    explicitlyIncluded: { tone: 'is-active', icon: 'fas fa-check' },
    excluded: { tone: 'is-danger', icon: 'fas fa-ban' }
  };

  const meta = $derived.by(() => {
    if (compositionState === 'explicitlyIncluded' && mode !== 'manual') return null;
    return META[compositionState] || null;
  });
  const label = $derived(text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOn', 'Override on'));
</script>

{#if meta}
  <span class={`manager-chip ${meta.tone} manager-environment-override-indicator`} data-composition-state={compositionState} title={label}>
    <i class={meta.icon} aria-hidden="true"></i>
    <span>{label}</span>
  </span>
{:else}
  <span class="manager-environment-comp-none" aria-hidden="true">—</span>
{/if}

<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { active = false } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const label = $derived(active
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOn', 'On')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOff', 'Off'));
  const title = $derived(active
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOnTitle', 'Drop rate adjustment on')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOffTitle', 'Drop rate adjustment off'));
</script>

<span class={`manager-chip ${active ? 'is-active' : 'is-muted'} manager-environment-override-indicator`} data-drop-rate-override={active ? 'on' : 'off'} title={title}>
  <span>{label}</span>
</span>

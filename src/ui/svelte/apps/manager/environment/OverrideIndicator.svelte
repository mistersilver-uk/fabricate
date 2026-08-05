<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';

  let { active = false } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const label = $derived(
    active
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOn', 'On')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOff', 'Off')
  );
  const title = $derived(
    active
      ? text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOnTitle',
          'Drop rate adjustment on'
        )
      : text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OverrideOffTitle',
          'Drop rate adjustment off'
        )
  );
</script>

<!-- The OFF state carries no tone. It used to carry `is-muted`, which matched no rule
     anywhere in the sheet, so it already rendered as the default chip; naming a tone here
     would be a visual change, not a faithful conversion (issue 883). -->
<Chip
  tone={active ? 'active' : ''}
  class="manager-environment-override-indicator"
  data-drop-rate-override={active ? 'on' : 'off'}
  {title}
>
  <span>{label}</span>
</Chip>

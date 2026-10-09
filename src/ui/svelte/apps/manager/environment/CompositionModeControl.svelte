<!-- Svelte 5 runes mode -->
<script>
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { mode = 'automatic', onChange = () => {} } = $props();

  const groupName = $props.id();
  const hintId = `${groupName}-hint`;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const OPTIONS = [
    {
      value: 'automatic',
      icon: 'fas fa-wand-magic-sparkles',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic',
      fallback: 'Automatic',
      descKey: 'AutomaticHint',
      descFallback:
        'All matching enabled tasks and events are available; exclude any of them here, or force add a non-matching one.',
    },
    {
      value: 'manual',
      icon: 'fas fa-hand-pointer',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual',
      fallback: 'Manual',
      descKey: 'ManualHint',
      descFallback:
        'Only the tasks and events you add are available, whether or not they match this environment.',
    },
  ];

  const current = $derived(mode === 'manual' ? 'manual' : 'automatic');
  const selected = $derived(OPTIONS.find((option) => option.value === current) || OPTIONS[0]);
</script>

<SegmentedControl
  options={OPTIONS}
  value={current}
  {onChange}
  {groupName}
  ariaLabel={text(
    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ModeLabel',
    'Composition mode'
  )}
  optionDataAttr="data-composition-mode-option"
  fill
  aria-describedby={hintId}
/>
<p id={hintId} class="manager-muted manager-environment-mode-hint">
  {text(
    `FABRICATE.Admin.Manager.EnvironmentEditor.Composition.${selected.descKey}`,
    selected.descFallback
  )}
</p>

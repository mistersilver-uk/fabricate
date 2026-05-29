<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { mode = 'automatic', onChange = () => {}, idPrefix = 'composition-mode' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const OPTIONS = [
    { value: 'automatic', icon: 'fas fa-wand-magic-sparkles', key: 'Automatic', fallback: 'Automatic', descKey: 'AutomaticHint', descFallback: 'All matching enabled records are available unless locally excluded.' },
    { value: 'manual', icon: 'fas fa-hand-pointer', key: 'Manual', fallback: 'Manual', descKey: 'ManualHint', descFallback: 'Only explicitly included matching records are available.' }
  ];

  const current = $derived(mode === 'manual' ? 'manual' : 'automatic');
  const selected = $derived(OPTIONS.find(option => option.value === current) || OPTIONS[0]);
</script>

<div class="manager-environment-mode-control" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Environment.Composition.ModeLabel', 'Composition mode')}>
  {#each OPTIONS as option (option.value)}
    <button
      type="button"
      role="radio"
      id={`${idPrefix}-${option.value}`}
      class={`manager-environment-mode-option ${current === option.value ? 'is-selected' : ''}`}
      aria-checked={current === option.value}
      data-composition-mode-option={option.value}
      onclick={() => onChange(option.value)}
    >
      <span class="manager-environment-mode-head">
        <i class={option.icon} aria-hidden="true"></i>
        <span>{text(`FABRICATE.Admin.Manager.Environment.Composition.${option.key}`, option.fallback)}</span>
      </span>
    </button>
  {/each}
</div>
<p class="manager-muted manager-environment-mode-hint">{text(`FABRICATE.Admin.Manager.Environment.Composition.${selected.descKey}`, selected.descFallback)}</p>

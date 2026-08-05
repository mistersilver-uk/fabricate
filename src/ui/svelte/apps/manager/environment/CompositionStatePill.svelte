<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';

  let { state = 'candidate' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const META = {
    includedByMatch: {
      tone: 'active',
      icon: 'fas fa-link',
      key: 'IncludedByMatch',
      fallback: 'Included by match',
    },
    explicitlyIncluded: {
      tone: 'active',
      icon: 'fas fa-check',
      key: 'Included',
      fallback: 'Included',
    },
    forceIncluded: {
      tone: 'warning',
      icon: 'fas fa-bolt',
      key: 'ForceIncluded',
      fallback: 'Force included',
    },
    candidate: {
      tone: 'neutral',
      icon: 'fas fa-circle-question',
      key: 'Candidate',
      fallback: 'Matching candidate',
    },
    excluded: { tone: 'danger', icon: 'fas fa-ban', key: 'Excluded', fallback: 'Excluded' },
    includedButUnavailable: {
      tone: 'warning',
      icon: 'fas fa-triangle-exclamation',
      key: 'IncludedButUnavailable',
      fallback: 'Included but unavailable',
    },
    notMatching: {
      tone: 'disabled',
      icon: 'fas fa-circle-minus',
      key: 'NotMatching',
      fallback: 'Not matching',
    },
    libraryDisabled: {
      tone: 'disabled',
      icon: 'fas fa-power-off',
      key: 'LibraryDisabled',
      fallback: 'Library disabled',
    },
  };

  const meta = $derived(META[state] || META.candidate);
  const label = $derived(
    text(`FABRICATE.Admin.Manager.EnvironmentEditor.Composition.${meta.key}`, meta.fallback)
  );
</script>

<Chip
  tone={meta.tone}
  icon={meta.icon}
  class="manager-environment-composition-pill"
  data-composition-state={state}
>
  <span>{label}</span>
</Chip>

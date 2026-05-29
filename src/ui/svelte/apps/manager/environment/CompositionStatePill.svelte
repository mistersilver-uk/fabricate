<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { state = 'candidate' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const META = {
    includedByMatch: { tone: 'is-active', icon: 'fas fa-link', key: 'IncludedByMatch', fallback: 'Included by match' },
    explicitlyIncluded: { tone: 'is-active', icon: 'fas fa-check', key: 'Included', fallback: 'Included' },
    candidate: { tone: 'is-neutral', icon: 'fas fa-plus', key: 'Candidate', fallback: 'Matching candidate' },
    excluded: { tone: 'is-danger', icon: 'fas fa-ban', key: 'Excluded', fallback: 'Excluded' },
    includedButUnavailable: { tone: 'is-warning', icon: 'fas fa-triangle-exclamation', key: 'IncludedButUnavailable', fallback: 'Included but unavailable' },
    notMatching: { tone: 'is-disabled', icon: 'fas fa-circle-minus', key: 'NotMatching', fallback: 'Not matching' },
    libraryDisabled: { tone: 'is-disabled', icon: 'fas fa-power-off', key: 'LibraryDisabled', fallback: 'Library disabled' }
  };

  const meta = $derived(META[state] || META.candidate);
  const label = $derived(text(`FABRICATE.Admin.Manager.Environment.Composition.${meta.key}`, meta.fallback));
</script>

<span class={`manager-chip ${meta.tone} manager-environment-composition-pill`} data-composition-state={state}>
  <i class={meta.icon} aria-hidden="true"></i>
  <span>{label}</span>
</span>

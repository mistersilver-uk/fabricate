<!-- Svelte 5 runes mode -->
<!--
  The chip that names one library record's composition state within one environment.

  The per-state tone/glyph/copy map lives in `./compositionStateMeta.js` rather than
  here: a compiled Svelte component exposes only `<script module>` exports, so a
  `<script>` local could not be asserted key-for-key against the vocabulary in
  `src/systems/gatheringComposition.js` that it mirrors (issue 1321). This component
  renders that map; it does not own it.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import { resolveCompositionStateMeta } from './compositionStateMeta.js';

  let { state = 'candidate' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const meta = $derived(resolveCompositionStateMeta(state));
  const label = $derived(
    text(`FABRICATE.Admin.Manager.EnvironmentEditor.Composition.${meta.key}`, meta.fallback)
  );
  // The raw state id is developer text and never becomes the chip's label. On an
  // unrecognised state it goes in `title` (it is already on `data-composition-state`),
  // so whoever added the state can see which one arrived without a GM reading it.
  const unknownStateTitle = $derived(meta.unknown ? String(state) : undefined);
</script>

<Chip
  tone={meta.tone}
  icon={meta.icon}
  class="manager-environment-composition-pill"
  data-composition-state={state}
  title={unknownStateTitle}
>
  <span>{label}</span>
</Chip>

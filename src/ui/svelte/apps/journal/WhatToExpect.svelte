<!-- Svelte 5 runes mode -->
<!--
  WhatToExpect is the right-column explainer: a short, run-type-specific prose
  line telling the player how the selected run progresses (crafting is manually
  triggered; gathering and salvage auto-resolve as world time advances). Card
  chrome comes from the shared JournalCard.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import JournalCard from './JournalCard.svelte';

  let { runType = 'crafting' } = $props();

  const COPY_KEYS = {
    crafting: 'FABRICATE.App.Journal.WhatToExpect.Crafting',
    gathering: 'FABRICATE.App.Journal.WhatToExpect.Gathering',
    salvage: 'FABRICATE.App.Journal.WhatToExpect.Salvage'
  };
  const copyKey = $derived(COPY_KEYS[runType] ?? COPY_KEYS.crafting);
</script>

<JournalCard kind="expect" title={localize('FABRICATE.App.Journal.WhatToExpect.Title')}>
  <p class="journal-expect-copy" data-run-type={runType}>{localize(copyKey)}</p>
</JournalCard>

<style>
  .journal-expect-copy {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text);
  }
</style>

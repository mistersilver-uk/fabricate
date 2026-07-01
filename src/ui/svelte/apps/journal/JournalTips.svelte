<!-- Svelte 5 runes mode -->
<!--
  JournalTips is a small static right-column card with a few orientation tips for
  the player (how time gates work, where results land, how to advance crafting).
  Card chrome comes from the shared JournalCard. All copy is localized.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import JournalCard from './JournalCard.svelte';

  const TIP_KEYS = [
    'FABRICATE.App.Journal.Tips.WorldTime',
    'FABRICATE.App.Journal.Tips.Trigger',
    'FABRICATE.App.Journal.Tips.History'
  ];
</script>

<JournalCard kind="tips" title={localize('FABRICATE.App.Journal.Tips.Title')}>
  <ul class="journal-tips-list">
    {#each TIP_KEYS as key (key)}
      <li>{localize(key)}</li>
    {/each}
  </ul>
</JournalCard>

<style>
  .journal-tips-list {
    margin: 0;
    padding-left: var(--fab-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }
</style>

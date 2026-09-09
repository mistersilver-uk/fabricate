<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';

  let { label = '', value = '', icon = 'fas fa-clock' } = $props();
</script>

<Chip class="fab-world-clock-chip" tone="info" data-world-clock>
  <i class={icon} aria-hidden="true"></i>
  <span class="fab-world-clock-label">{label}</span>
  <span class="fab-world-clock-value">{value}</span>
</Chip>

<style>
  :global(.fab-world-clock-chip) {
    box-sizing: border-box;
    height: 28px;
    min-height: 28px;
    padding: 0 var(--fab-space-2);
    border-radius: 7px;
    gap: var(--fab-space-2);
  }

  .fab-world-clock-label {
    color: var(--fab-info-text);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-world-clock-value {
    color: var(--fab-info-text);
    font-family: var(--fab-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>

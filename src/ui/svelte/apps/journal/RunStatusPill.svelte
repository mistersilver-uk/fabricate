<!-- Svelte 5 runes mode -->
<!--
  RunStatusPill renders the tone/icon/label chip for a run's derived status. It
  is a pure presenter: the tone+icon+labelKey vocabulary lives in the shared,
  unit-testable journalRunStatus.js map. State is conveyed by text + a
  data-run-status hook, never colour alone. Tones reuse the base status palette.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { runStatusPresentation } from './journalRunStatus.js';

  let { status = 'inProgress' } = $props();

  const presentation = $derived(runStatusPresentation(status));
</script>

<span class={`journal-status-pill tone-${presentation.tone}`} data-run-status={status}>
  <i class={`fas ${presentation.icon}`} aria-hidden="true"></i>
  <span class="journal-status-pill-label">{localize(presentation.labelKey)}</span>
</span>

<style>
  .journal-status-pill {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    /* Neutral default: no --fab-neutral token exists, so use surface-raised. */
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }

  .journal-status-pill i {
    font-size: 10px;
  }

  .journal-status-pill.tone-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .journal-status-pill.tone-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .journal-status-pill.tone-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .journal-status-pill.tone-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }
</style>

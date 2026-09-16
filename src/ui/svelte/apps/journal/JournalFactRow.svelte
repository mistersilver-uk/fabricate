<!-- Svelte 5 runes mode -->
<!--
  JournalFactRow is the shared "fact row" idiom (mirrors the gathering detail's
  icon + muted label + value layout). Factored into one component so StepDetails
  and AboutThisRun reuse the same markup + CSS rather than pasting it (keeping new
  code under the SonarCloud duplication budget). A `danger` flag tints the value
  with the danger token (used for a step's failure copy).
-->
<script>
  let {
    icon = 'fa-circle-info',
    label = '',
    value = '',
    danger = false,
    inline = false,
  } = $props();
</script>

<div class="journal-fact-row" class:is-danger={danger} class:is-inline={inline} data-journal-fact>
  <i class={`fas ${icon} journal-fact-icon`} aria-hidden="true"></i>
  <span class="journal-fact-label">{label}</span>
  <span class="journal-fact-value">{value}</span>
</div>

<style>
  .journal-fact-row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    font-size: 10.5px;
    min-width: 0;
  }

  .journal-fact-icon {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .journal-fact-label {
    color: var(--fab-text-muted);
  }

  .journal-fact-value {
    font-family: var(--fab-font-mono);
    font-weight: 500;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fab-text);
    text-align: right;
  }

  .journal-fact-row.is-danger .journal-fact-value {
    color: var(--fab-danger-text);
  }
  .journal-fact-row.is-inline {
    display: inline-flex;
    gap: var(--fab-space-1);
    font-size: 10.5px;
  }
  .journal-fact-row.is-inline .journal-fact-value {
    margin-left: var(--fab-space-1);
    font-family: var(--fab-font-mono);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }
</style>

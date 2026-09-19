<!-- Svelte 5 runes mode -->
<!--
  The progressive stage's read-only complication band (issue 1286): full-bleed, so it is what
  `SortableList` renders as the row's body rather than part of the row's content (issue 1512).
  The caller hands the already-filtered `complications`, because the same filter decides whether
  the row carries `has-band` at all. Read-only end to end.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // The one complication summary row (issue 1286), shared with the salvage strip, not copied.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../model/complicationSummary.js';

  let { complications = [], componentId = '' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const stageComplications = $derived(Array.isArray(complications) ? complications : []);

  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.Admin.Manager.Component.Complications.Severity.minor', 'Minor'],
    major: ['FABRICATE.Admin.Manager.Component.Complications.Severity.major', 'Major'],
    severe: ['FABRICATE.Admin.Manager.Component.Complications.Severity.severe', 'Severe'],
  });

  // Full key literals per severity: `ui-lang-keys-resolve.test.js` admits a composed
  // `${BASE}.${severity}` as a namespace base without resolving the leaf.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  // No `macroName` / `triggerName`: those vocabularies are system-scoped and this band has neither,
  // so the builder degrades to the shape of the effect.
  function stripSummary(complication) {
    return complicationSummary(complication, { translate: text });
  }
</script>

{#if stageComplications.length > 0}
  <div class="manager-recipe-stage-complications" data-recipe-result-complications={componentId}>
    {#each stageComplications as complication (complication.id)}
      <ComplicationSummaryRow
        variant="readonly-gm"
        nameEmphasis="inline"
        name={complication.name}
        severity={complication.severity}
        severityLabel={severityLabel(complication.severity)}
        visibility={complication.visibility}
        playerLabel={text('FABRICATE.Admin.Manager.Component.Complications.PlayerPill', 'Player')}
        playerTitle={text(
          'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
          'Shown to the player when it fires.'
        )}
        triggerSentence={stripSummary(complication)}
        dataAttr="data-recipe-result-complication"
        dataValue={complication.id}
      />
    {/each}
  </div>
{/if}

<style>
  /* Component-scoped, never `styles/fabricate.css`: the strip adds no shared rule. No
     `margin-top` — the band's `border-top` is the divider between it and the line above, and it
     only reads as one while the two surfaces meet. */
  .manager-recipe-stage-complications {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 11px 11px;
    border-top: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>

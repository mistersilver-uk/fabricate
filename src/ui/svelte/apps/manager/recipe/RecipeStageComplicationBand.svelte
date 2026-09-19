<!-- Svelte 5 runes mode -->
<!--
  The progressive stage's read-only complication band (issue 1286), extracted from
  `RecipeResultItemRow.svelte` at issue 1512 because the band is full-bleed and the stage row is
  `SortableList`'s now: the list draws the grip, the badge and the rocker around the caller's
  content, so a band inside that content would be indented past the whole leading cluster. The
  list's row is a column whose line carries the padding, so the band is what the list renders as
  the row's body and the sheet gives such a body its padding back.

  A component authoring no crafting complication renders nothing here. Read-only end to end: every
  complication on the band belongs to the one component the row already names and links to.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // The one complication summary row (issue 1286), in its `readonly-gm` variant, shared with the
  // Component Studio's salvage strip rather than copied.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../model/complicationSummary.js';

  let { componentOptions = [], componentId = '' } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const selectedComponent = $derived(
    componentId
      ? (componentOptions || []).find((option) => option.id === componentId) || null
      : null
  );

  // The unredacted authored list off the same `componentOptions` projection the difficulty badge
  // reads: `forecastComplications` filters to the player's projection and the authored default is
  // `gmOnly`, so a GM strip fed from it would be empty. Filtered to the crafting activity, because
  // a salvage-only complication says nothing about a recipe stage.
  const stageComplications = $derived(
    Array.isArray(selectedComponent?.complications)
      ? selectedComponent.complications.filter(
          (complication) => complication?.activities?.crafting === true
        )
      : []
  );

  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.Admin.Manager.Component.Complications.Severity.minor', 'Minor'],
    major: ['FABRICATE.Admin.Manager.Component.Complications.Severity.major', 'Major'],
    severe: ['FABRICATE.Admin.Manager.Component.Complications.Severity.severe', 'Severe'],
  });

  // Full key literals per severity rather than a composed `${BASE}.${severity}`, which
  // `tests/ui-lang-keys-resolve.test.js` admits as a namespace base without resolving the leaf.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  // No `macroName` / `triggerName`: those vocabularies are system-scoped and this band is handed
  // neither, so the builder degrades to the shape of the effect and the deep link carries the names.
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

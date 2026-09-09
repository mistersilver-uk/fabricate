<!-- Svelte 5 runes mode -->
<!--
  THE PROGRESSIVE STAGE'S READ-ONLY COMPLICATION BAND (issue 1286), extracted from
  `RecipeResultItemRow.svelte` at issue 1512.

  It moved because the band is FULL-BLEED and the stage row is `SortableList`'s row now.
  The list draws the grip, the ordinal badge and the rocker around the caller's content, so
  a band rendered inside that content would be indented past the whole leading cluster and
  its `border-top` would draw as a short line floating inside the card — which is exactly
  the defect issue 1286 fixed by moving the grip and the ordinal INTO the row's own line.

  The list already owns the shape that answers it: the row is a column, its LINE carries the
  padding and its BODY is the line's sibling. So the band is what the list renders as the
  row's body, and the sheet gives a body whose content is a band its padding back.

  A row whose component authors no crafting complication renders NOTHING here, and the
  list's body is empty and invisible — which is every non-progressive row and most
  progressive ones.

  Read-only end to end: there is no per-complication Edit link, because in this build every
  complication on the band belongs to the ONE component the row already names and already
  links to (issue 1287 is what gives the band complications from other components, and the
  `eyebrow` prop on the shared row is what will name their source then).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // The ONE complication summary row (issue 1286), in its `readonly-gm` variant — shared
  // with the Component Studio's salvage strip rather than copied, because SonarCloud's
  // copy-paste detector reads `.svelte` and this shape has six call sites.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../../utils/complicationSummary.js';

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

  // The complications this stage carries, read off the SAME `componentOptions` projection
  // the difficulty badge reads. It is the UNREDACTED authored list: `forecastComplications`
  // filters to `visibility: 'visible'`, which is the player's projection, and the authored
  // default is `gmOnly` — a GM strip fed from it would be empty for exactly the
  // complications a GM authors by default.
  //
  // Filtered to the CRAFTING activity, matching the prototype's `compsFor(component, mode)`:
  // a complication enabled only for salvage says nothing about a recipe stage, and listing
  // it here would tell the GM this result carries a consequence it does not.
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

  // FULL key literals per severity rather than a composed `${BASE}.${severity}`:
  // `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down, and
  // a composed one is a namespace base it admits without ever resolving the leaf.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  // No `macroName` / `triggerName`: those vocabularies are system-scoped and this band is
  // handed neither. The builder degrades to "runs a macro" and "a check trigger fires",
  // which states the SHAPE of the effect correctly; the deep-link is one click from the
  // names.
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
  /* Component-SCOPED, never `styles/fabricate.css`: the strip's whole point is that it adds
     no shared rule. Theme-ROOT tokens only, on `Chip.svelte`'s note.

     NO `margin-top`. The band's `border-top` IS the divider between it and the line above,
     which only reads as one when the two surfaces meet — a gap in the row's own fill turns
     that rule into a short line floating above a detached panel. */
  .manager-recipe-stage-complications {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 11px 11px;
    border-top: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>

<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): ProgressiveStageBand is a new shared member at target, because the crafting and salvage progressive bodies both render it as SortableList's body (issue 2381) -->
<!--
  The per-stage complication strip (issue 1286), drawn as the full-bleed band in `SortableList`'s
  `body` beneath a player progressive stage row. Both progressive bodies mount it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `stage` | stage row | `null` | `stage.complications` is published by the builders in fire order, already filtered to what a player may see and marked for the resolved tense; nothing here re-derives it. |
  | `tense` | `'forecast'` \| `'resolved'` | `'forecast'` | The one thing the row data cannot say: an un-fired entry reads the same before a roll and after one that spared it. |

  Invariants:
  - `stageHasBand` is the one render gate, read by the band and by `stageRowClass`'s `has-band`.
  - It draws the first entry in fire order plus "+N more", and no control of any kind: a
    complication belongs to the component the row names, and exclusion is never built
    (`ui-crafting-app` § Progressive Stage List).
  - The tense rides on the band's fill and badge, never on the severity tile.
-->
<script module>
  /** The player-visible complications a stage row carries, in fire order. */
  function entriesOf(stage) {
    return Array.isArray(stage?.complications) ? stage.complications : [];
  }

  /** Whether the stage draws a band at all; a stage with none renders no body. */
  export function stageHasBand(stage) {
    return entriesOf(stage).length > 0;
  }
</script>

<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ComplicationSummaryRow from '../../manager/ComplicationSummaryRow.svelte';

  let { stage = null, tense = 'forecast' } = $props();

  // ratchet-exempt(text-helper): moved verbatim from the deleted ProgressiveStageList; the architecture doc cites it as the text(key, fallback) example
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Full key literals per severity, so `tests/ui-lang-keys-resolve.test.js` can resolve each leaf.
  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.App.Complications.SeverityMinor', 'Minor'],
    major: ['FABRICATE.App.Complications.SeverityMajor', 'Major'],
    severe: ['FABRICATE.App.Complications.SeveritySevere', 'Severe'],
  });

  const TENSE_BADGES = Object.freeze({
    forecast: ['FABRICATE.App.Complications.Forecast', 'This can go wrong', 'neutral'],
    fired: ['FABRICATE.App.Complications.Fired', 'This happened', 'warning'],
    resolved: ['FABRICATE.App.Complications.NotFired', "This didn't happen", 'muted'],
  });

  const entries = $derived(entriesOf(stage));
  const lead = $derived(entries[0] ?? null);
  const resolved = $derived(tense === 'resolved');
  // The band answers "did anything happen here?" over every entry; the badge answers for the lead.
  const bandTense = $derived(
    resolved ? (entries.some((entry) => entry?.fired === true) ? 'fired' : 'resolved') : 'forecast'
  );
  const badge = $derived(
    TENSE_BADGES[resolved ? (lead?.fired === true ? 'fired' : 'resolved') : 'forecast']
  );

  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  /** The names behind the `+N more` count, so the count is not a dead end. */
  const overflowTitle = $derived(
    entries
      .slice(1)
      .map((entry) => entry?.name || '')
      .filter(Boolean)
      .join(', ')
  );
</script>

{#if stageHasBand(stage) && lead}
  <div
    class="crafting-stage-complications"
    class:is-fired={bandTense === 'fired'}
    data-progressive-stage-complications
    data-progressive-stage-complication-tense={bandTense}
  >
    <ComplicationSummaryRow
      variant="player"
      nameEmphasis="inline"
      name={lead.name}
      severity={lead.severity}
      severityLabel={severityLabel(lead.severity)}
      description={lead.description}
      statusLabel={text(badge[0], badge[1])}
      statusTone={badge[2]}
      bodyClamp={3}
      data-progressive-stage-complication={lead.id || true}
    />
    {#if entries.length > 1}
      <span
        class="crafting-stage-complications-more"
        data-progressive-stage-complication-more={String(entries.length - 1)}
        title={overflowTitle || undefined}
        >{text('FABRICATE.App.Complications.More', '+{count} more').replace(
          '{count}',
          String(entries.length - 1)
        )}</span
      >
    {/if}
  </div>
{/if}

<style>
  /* Theme-root tokens only: this band renders under `.fabricate-app`, where no area-scoped
     `--fab-manager-*` property is in scope. The inset is the line's own, so the band's content
     starts on the row's leading edge, and its top rule meets the line above. */
  .crafting-stage-complications {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-overlay-light-06);
  }

  .crafting-stage-complications.is-fired {
    border-top-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .crafting-stage-complications-more {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    font-weight: 600;
  }
</style>

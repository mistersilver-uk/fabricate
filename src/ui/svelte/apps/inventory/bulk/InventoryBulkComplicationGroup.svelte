<!-- Svelte 5 runes mode -->
<!--
  ONE group card in the bulk panel's "What could go wrong" block (issue 1286): the
  queued row it belongs to, and that row's player-visible complication forecast.

  ## The grouping unit is the QUEUED ENTRY

  One card per queued entry — the component the player selected and the run will act on
  — and never one per complication-bearing RESULT component. The queue sits directly
  below this block, so a block grouped any other way could not be read against it: the
  player would be shown a list of consequences with no way back to the row that carries
  them. `openspec/specs/ui-integration/spec.md` § Player Salvage Surface rules it.

  ## IT RE-DERIVES NOTHING, and that is a contract rather than a preference

  Every field is published on the entry by `inventoryStore`'s `bulkRunProjection`:
  `complications` is `[{ resultId, position, resultName, resultDifficulty, id, name,
  description, severity }]`, already filtered to `visibility: 'visible'`, already
  stripped of `when` / `rollCondition` / `effectRoll` / `macroUuid`, and already
  excluding a stage no roll can reach. A panel calling `forecastComplications`, or
  reading `component.complications`, would be a second copy of the redaction rule — and
  a second copy is how the two drift into showing a player a GM-only consequence.

  `position` IS RENDERED, NEVER RECOMPUTED. It is the 1-based index over ALL of that
  row's stages in the player's own order, so a stage authoring no complication leaves a
  GAP in the numbering. The gaps are the point: they make the number readable against
  the ordered stage list on the single-item panel, which a dense 1..N would not be. An
  `{#each}` index here would silently produce that dense sequence and nothing on screen
  would say it was wrong.

  `orderIsPlayers` decides the order note, and it is NOT the reorder permission. A
  player who MAY reorder and has not is looking at the GM's authored order, so a note
  claiming the order is theirs would be a false statement about their own arrangement.
  The store derives it by comparing the rendered order against the authored one.

  ## The metadata is an EYEBROW, not a second tile

  "Result 3 · Ground Reagent · DC 4" goes through `ComplicationSummaryRow`'s existing
  `eyebrow` prop, so it sits above the name inside the row's copy column. A separate
  ordinal tile beside the severity tile would put three leading boxes in a 300px
  column, which is the failure the stage row's `stacked` treatment exists to prevent.
  One metadata slot, not two.

  ## What this card deliberately does NOT grow

  No per-stage exclude toggle, no excluded-results list and no "N more excluded from
  your list" note. The design prototype draws all three; exclusion contradicts the
  reconciliation guarantee that a result is never dropped, so the whole vocabulary is
  not built rather than built and disabled (§ Progressive Salvage Deltas).

  Props:
   - img / name: the queued entry's artwork and authored name.
   - orderIsPlayers: whether the order these positions are numbered against is the
     player's own. From the projection only — see above.
   - complications: that entry's published forecast rows, in the player's order.
   - attrs: extra attributes for the `<li>` (the card's `data-` hook).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../../crafting/CraftingThumb.svelte';
  // The ONE complication summary row, in its `player` variant — the same component and
  // the same variant the per-stage band renders. They are one meaning on two screens,
  // and the shared scaffold is what makes the second call site cost props rather than a
  // component (SonarCloud's copy-paste detector reads `.svelte`).
  import ComplicationSummaryRow from '../../manager/ComplicationSummaryRow.svelte';

  let { img = '', name = '', orderIsPlayers = false, complications = [], attrs = {} } = $props();

  // FULL key literals per severity rather than a composed `${BASE}.${severity}`:
  // `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down,
  // and a composed one is a namespace base it admits without ever resolving the leaf.
  // The per-stage band and the GM strip state the same rule for the same reason.
  const SEVERITY_LABEL_KEYS = Object.freeze({
    minor: 'FABRICATE.App.Complications.SeverityMinor',
    major: 'FABRICATE.App.Complications.SeverityMajor',
    severe: 'FABRICATE.App.Complications.SeveritySevere',
  });

  function severityLabel(severity) {
    const key = SEVERITY_LABEL_KEYS[severity];
    return key ? localize(key) : String(severity ?? '');
  }

  /**
   * One row's metadata line: where in the player's order the result sits, which result
   * it is, and that result's DC.
   *
   * The DC falls back to a dash rather than printing `null`. By construction it cannot:
   * the projection omits every stage whose threshold is null, and a threshold is null
   * exactly when the difficulty is not a finite number of at least 1. The fallback is
   * there so a future projection change degrades to a missing number rather than to a
   * sentence that reads "DC null".
   */
  function resultEyebrow(row) {
    const difficulty = Number(row?.resultDifficulty);
    return localize('FABRICATE.App.Complications.ResultEyebrow', {
      position: row?.position ?? '',
      name: row?.resultName ?? '',
      difficulty: Number.isFinite(difficulty) ? difficulty : '—',
    });
  }

  /**
   * A key over the STAGE OCCURRENCE and the complication, never the complication alone:
   * a component staged twice is two rows at two positions carrying the same
   * complication id, and a key that ignored the occurrence would collide.
   */
  function rowKey(row) {
    return `${row?.resultId ?? row?.position}:${row?.id ?? row?.name}`;
  }
</script>

<li class="bulk-complication-group" {...attrs}>
  <!-- The head names the queued row this forecast belongs to. `.inventory-detail-row-name`
       is the shell's shared leaf, so the name reads exactly like the queue row's own name
       directly below the block. -->
  <div class="bulk-complication-head">
    <CraftingThumb src={img} alt="" size={24} />
    <span class="bulk-complication-head-text">
      <span class="inventory-detail-row-name">{name}</span>
      {#if orderIsPlayers}
        <!-- Only when the projection says the rendered order IS the player's. It is the
             one sentence that makes the position numbers mean anything: the roll walks
             the list in this order, so where a result sits decides whether the roll ever
             reaches it. -->
        <span class="bulk-complication-order-note" data-inventory-bulk-complication-order>
          {localize('FABRICATE.App.Complications.OrderNote')}
        </span>
      {/if}
    </span>
  </div>

  <ul class="bulk-complication-rows">
    {#each complications as row (rowKey(row))}
      <li class="bulk-complication-row" data-inventory-bulk-complication-position={row.position}>
        <ComplicationSummaryRow
          variant="player"
          nameEmphasis="inline"
          name={row.name}
          severity={row.severity}
          severityLabel={severityLabel(row.severity)}
          description={row.description}
          eyebrow={resultEyebrow(row)}
          statusLabel={localize('FABRICATE.App.Complications.Forecast')}
          statusTone="neutral"
          bodyClamp={3}
          dataAttr="data-inventory-bulk-complication"
          dataValue={row.id}
        />
      </li>
    {/each}
  </ul>
</li>

<style>
  /* Theme-ROOT tokens only, on `Chip.svelte`'s recorded rule: this card renders under
     `.fabricate-app`, where the manager's `--fab-mv2-*` aliases are not in scope and a
     declaration referencing one silently falls back to inheritance. */

  /* A WARNING card, which the queue rows below it deliberately are not. The prototype
     draws the block that way and it is right: every row here is a consequence the run
     could produce, and the block exists to be noticed before the player commits a
     gesture that rolls the whole batch. The gravity is carried by the card's edge and
     its head band only — the prose sits on the same quiet fill the per-stage forecast
     band uses, because a full warning wash behind three paragraphs of authored text in
     a 300px column costs legibility for emphasis already made twice over. */
  .bulk-complication-group {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border: 1px solid var(--fab-warning-border);
    border-radius: 9px;
    background: var(--fab-overlay-light-06);
    overflow: hidden;
  }

  .bulk-complication-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    /* NO `margin` and NO gap below it: the head's own edge IS the divider between it and
       the rows, and a rule only reads as a divider when the two surfaces meet. */
    border-bottom: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .bulk-complication-head-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* WRAPS rather than clipping. It is a whole sentence in a 300px column, and one
     clipped line of it says nothing at all. */
  .bulk-complication-order-note {
    font-size: 10px;
    font-weight: 400;
    line-height: 1.35;
    color: var(--fab-text-muted);
  }

  .bulk-complication-rows {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    /* The inset the shared row deliberately does not carry: `ComplicationSummaryRow`'s
       player variant draws no shell and no padding precisely so the container it sits in
       pays for it once, rather than a 300px column paying twice. */
    padding: var(--fab-space-2);
  }

  /* A hairline between consecutive complications on the SAME row, so two authored
     descriptions do not read as one paragraph. Not a border on every item: the first one
     meets the head's rule and would draw two lines a gap apart. */
  .bulk-complication-row + .bulk-complication-row {
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }
</style>

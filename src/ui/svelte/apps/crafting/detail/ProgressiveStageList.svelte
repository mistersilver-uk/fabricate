<!-- Svelte 5 runes mode -->
<!--
  The player's ordered progressive stage list (issue 651).

  Progressive resolution spends ONE roll down this list — each stage consumes its
  difficulty before the next is produced — so the order decides what the player actually
  gets. This replaces the generic IoTable in ProgressiveBody's `results` snippet, which
  could only ever render a flat, unordered output set.

  Each row shows its ordinal, name, image, read-only difficulty and the CUMULATIVE
  threshold ("reached at >=N"). The cumulative number is the decision input: per-stage
  difficulty alone makes the player do the arithmetic and redo it after every move. Both
  numbers are computed builder-side, by the same helper an oracle test pins against the
  award loop — presentation never re-derives that arithmetic.

  The a11y triad mirrors the GM's RecipeResultGroupCard (drag + keyboard + live region),
  reproducing its STRUCTURE rather than importing it, since the two live under different
  theme roots. Two of its subtleties are load-bearing and preserved:

    1. the moved stage's name is read BEFORE the move (after it, `stages[index]` is the
       row that swapped in, so the announcement would name the wrong stage);
    2. ONE i18n key carries {name}/{position}/{total} — word order is not universal, so a
       sentence assembled from fragments cannot be translated. This uses its OWN player
       key rather than re-pointing at the GM's: the two surfaces' copy must be free to
       diverge.

  When `canReorder` is false the row is not merely inert — the drag handlers are NOT
  ATTACHED, the grip glyph is dropped (the grip IS the affordance signal), and a muted
  line explains why. Identical rows minus working affordances is the worst outcome: a
  player grabs a row and nothing happens.

  That explanation is a PROP, not a constant, because `canReorder: false` has more than
  one cause and only the caller knows which one applies. Crafting has exactly one (the
  GM pinned the order) and is the default; salvage adds a second (the roll has already
  been spent down the list). Hardcoding the GM string would tell a player who ordered
  the list themselves that someone else did.

  SHARED WITH PLAYER SALVAGE (issue 675). Progressive salvage spends its roll down an
  ordered list under exactly these rules, so it reuses this component rather than
  growing a twin. Two OPTIONAL, DEFAULT-OFF extensions exist for it:

    `stateChip`     a snippet, rendered per stage, for a per-row state (salvage's
                    Recovered / Roll fell short / Not reached / Awaiting roll).
    `stacked`       the player Inventory's row shape: the stage's identity is a
                    flexible COLUMN — the name, then its numbers beneath — so the name
                    wraps instead of being crushed.

  Both default to today's rendering, so the Crafting tab — which passes neither — is
  unchanged. A required prop or an always-on chip would have re-skinned crafting as a
  side effect of a salvage feature.

  THE PER-STAGE COMPLICATION BAND (issue 1286) is the FOURTH extension, and it is
  default-off for the same reason. `complications` is a TENSE token rather than a
  boolean, because the copy on a resolved row is not the copy on an un-rolled one and
  the row data cannot say which it is: an un-fired entry looks identical before a roll
  and after one that spared it. Salvage passes `resolved` once its run has resolved;
  crafting passes `forecast` always, because the fired record lives on the salvage run
  record and the immediate crafting path writes none.

  The band's DATA is published on the stage row by the two builders, through the one
  shared `attachStageComplications`: `stage.complications` is `[{ id, name, description,
  severity, visibility, fired }]` in authored fire order, already filtered to what a
  player may see and already marked for the resolved tense. THIS COMPONENT RE-DERIVES
  NONE OF IT — no `forecastComplications` call, no reading of `component.complications`,
  and above all no inferring `fired` from a stage's missed state, which `match` and the
  condition roll make untrue. `InventoryListingBuilder._buildSalvage`'s "the panel is
  presentational" contract covers this band exactly as it covers mode, DC and thresholds.

  The band renders the FIRST complication in fire order plus a `+N more` count. The
  inspector column is 300px — the documented reason `stacked` exists — and an unbounded
  list turns one row into several prose paragraphs.

  The ROW-STRUCTURE FLIP is gated on the band having CONTENT for that stage, never on the
  extension being passed. Both shipped bodies pass it, so a presence gate would re-skin
  every progressive stage row in every world — including the overwhelming majority whose
  components author no complications at all — which is exactly the failure the opt-in rule
  above exists to prevent.

  It is NOT a snippet, and that is a departure from the plan's `stageDetail` spelling with
  a reason: a snippet is defined in the caller, so two callers passing "the same" band is
  two copies of its markup, which is the sixth call site's duplication arriving by another
  route. Nothing about the band varies per caller except the tense, which is a token.

  NO STAGE RENDERS A QUANTITY, on either surface. A `showQuantity` opt-in existed for
  one round and the salvage caller passed it, printing a count the engine does not
  honour: the player read "Balehound Teeth ×2" and was awarded one. Progressive results
  are a QUANTITY-LESS ordered list — the award loop charges one entry's difficulty and
  grants that entry ONCE, so "more of X" is expressed by listing X again, and any
  authored quantity is normalized to 1 at award time on both paths
  (`ResolutionModeService._resolveProgressive`, `CraftingEngine._resolveSalvageResultGroups`;
  `openspec/specs/resolution-modes/spec.md`, Progressive Mode). The opt-in was DELETED
  rather than defaulted off: it had exactly one caller, that caller must not use it, and
  a prop nothing sets is an invitation to opt back into the lie.

  THE REORDER CHEVRONS END THE ROW, on both surfaces — one position everywhere, no
  divergence prop. That matches the GM's component salvage editor, whose progressive
  rows run handle, index, picker, DC, Edit, chevrons, ×.

  WHY `stacked` EXISTS AT ALL. The inline row lays every part on one line and lets only
  the name flex, so it is the name that pays for every other part. In the player
  inspector — a 300px COLUMN, not the crafting tab's wide panel — grip + ordinal + art
  + difficulty + "Reached at ≥N" + a state chip + two chevrons leave the name a MEASURED
  ZERO pixels: it does not truncate to a word, it disappears. Adding a chip to a row that
  was already full is what did it, so the fix belongs with the extension that caused it,
  not in the crafting tab.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // The ONE complication summary row, in its `player` variant — shared with the GM strips
  // and the bulk block rather than copied. SonarCloud's copy-paste detector reads
  // `.svelte`, and this shape has six call sites across the feature's two PRs.
  import ComplicationSummaryRow from '../../manager/ComplicationSummaryRow.svelte';

  let {
    stages = [],
    canReorder = true,
    announcement = '',
    onReorder = () => {},
    // Commit any debounced order write now. A drag has already settled by the time it
    // drops, so there is nothing left to coalesce.
    onReorderSettled = () => {},
    // Issue 675, both opt-in: omitted, this renders exactly as it did for crafting.
    stateChip = null,
    stacked = false,
    // WHY the rows are fixed. `canReorder: false` has MORE THAN ONE CAUSE and only the
    // caller knows which applies: the GM pinned the order, or (salvage) the roll has
    // already been spent down the list. Defaulting to the GM string keeps the crafting
    // tab — where that is the only cause — byte-unchanged.
    fixedNoteKey = 'FABRICATE.App.Crafting.Detail.StageOrderFixed',
    fixedNoteFallback = 'Order set by the GM',
    // Issue 1286, the fourth extension: `off` (default), `forecast` or `resolved`.
    complications = 'off',
  } = $props();

  let dragIndex = $state(-1);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Mirrors RecipeResultGroupCard's local formatter: `localize` here is the thin bridge,
  // not Foundry's `format`, so token substitution happens against the resolved string.
  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  function stageName(stage) {
    return stage?.name || text('FABRICATE.App.Crafting.Detail.UnnamedStage', 'this result');
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    // Read the name BEFORE the move — see subtlety (1) above.
    const name = stageName(stages[index]);
    const total = stages.length;
    onReorder(
      index,
      target,
      format(
        'FABRICATE.App.Crafting.Detail.StageMoveAnnouncement',
        '{name} moved to position {position} of {total}',
        { name, position: target + 1, total }
      )
    );
  }

  // ── The complication band (issue 1286) ────────────────────────────────────────────

  // FULL key literals per severity rather than a composed `${BASE}.${severity}`:
  // `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down, and
  // a composed one is a namespace base it admits without ever resolving the leaf. The GM
  // strip states the same rule for the same reason.
  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.App.Complications.SeverityMinor', 'Minor'],
    major: ['FABRICATE.App.Complications.SeverityMajor', 'Major'],
    severe: ['FABRICATE.App.Complications.SeveritySevere', 'Severe'],
  });

  // The TENSE chip, keyed on what is actually known rather than on the stage's outcome.
  // The prototype keeps "This can go wrong" on a stage the roll has already passed — its
  // own `fired` flag is derived from the stage being short — and that is a tense error
  // rather than a design: once the roll is spent, nothing can go wrong any more. `Chip`
  // tones, so the tense reads in colour as well as in words.
  const TENSE_BADGES = Object.freeze({
    forecast: ['FABRICATE.App.Complications.Forecast', 'This can go wrong', 'neutral'],
    fired: ['FABRICATE.App.Complications.Fired', 'This happened', 'warning'],
    resolved: ['FABRICATE.App.Complications.NotFired', "This didn't happen", 'muted'],
  });

  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  /** The player-visible complications published on this row, or none when opted out. */
  function bandEntries(stage) {
    if (complications === 'off') return [];
    return Array.isArray(stage?.complications) ? stage.complications : [];
  }

  /** One ENTRY's tense: what the badge says. `forecast` until a resolution has happened. */
  function entryTense(entry) {
    if (complications !== 'resolved') return 'forecast';
    return entry?.fired === true ? 'fired' : 'resolved';
  }

  /**
   * The BAND's tense: what its fill and top rule say.
   *
   * Read over every entry rather than off the one rendered row, so a stage that fired
   * something reads as a stage that fired something even when the firing sits behind the
   * `+N more` count. The band answers "did anything happen here?" and the badge answers
   * "did THIS one?"; the two coincide wherever a stage carries one complication, which is
   * every stage any shipped fixture draws.
   */
  function bandTense(entries) {
    if (complications !== 'resolved') return 'forecast';
    return entries.some((entry) => entry?.fired === true) ? 'fired' : 'resolved';
  }

  /** The names behind the `+N more` count, so the count is not a dead end. */
  function overflowTitle(entries) {
    return entries
      .slice(1)
      .map((entry) => entry?.name || '')
      .filter(Boolean)
      .join(', ');
  }

  function handleDrop(index) {
    if (dragIndex === -1 || dragIndex === index) return;
    const name = stageName(stages[dragIndex]);
    const total = stages.length;
    const from = dragIndex;
    dragIndex = -1;
    onReorder(
      from,
      index,
      format(
        'FABRICATE.App.Crafting.Detail.StageMoveAnnouncement',
        '{name} moved to position {position} of {total}',
        { name, position: index + 1, total }
      )
    );
    onReorderSettled();
  }
</script>

<!--
  The row's parts as snippets, so the reorderable and fixed branches SHARE them rather
  than carrying two copies that drift (and count twice against the duplication gate).
-->
{#snippet numbers(stage)}
  <!--
    TWO numbers on BOTH surfaces (issue 675 ruling): the component's progressive DC, then
    the cumulative threshold.

    They are DIFFERENT numbers, not the same fact printed twice:

      - `stage.difficulty` IS the component's own **progressive DC** — `component.difficulty`,
        the field the GM editor labels verbatim "This component's Progressive DC". It is
        stable authored data on the component.
      - `stage.threshold` is the CUMULATIVE budget to REACH this stage — the running sum of
        the DCs before it plus this one — which answers "what do I need to roll to get here?".

    An earlier round showed only the threshold on the stacked (salvage) row, in the belief
    that "DC" was a concept progressive lacked. That conflated the progressive CHECK (which
    genuinely has no DC — its roll is a budget, not a pass/fail against a target) with the
    COMPONENT, which does carry a progressive DC. The maintainer's ruling: progressive checks
    have no DC, but components do — so both surfaces show the component DC alongside the reach.
  -->
  {#if stage.difficulty !== null && stage.difficulty !== undefined}
    <!-- The DC glyph differs by surface (issue 675): salvage (stacked) uses the medal, the
         maintainer's chosen mark for a component's progressive DC in the player app; crafting
         (inline) keeps the gauge. Keyed off the existing `stacked` layout flag, so no new
         prop exists solely to hold this cosmetic difference. -->
    <span
      class="crafting-stage-difficulty"
      data-progressive-stage-difficulty={String(stage.difficulty)}
    >
      <i class="fas {stacked ? 'fa-medal' : 'fa-gauge-high'}" aria-hidden="true"></i>{format(
        'FABRICATE.App.Crafting.Detail.StageDifficultyDc',
        'DC {difficulty}',
        { difficulty: stage.difficulty }
      )}
    </span>
  {/if}
  <!-- Omitted (not zeroed) when the threshold is undefined: a stage the award loop
       skips is reached at NO budget, so any number here would be a lie. -->
  {#if stage.threshold !== null && stage.threshold !== undefined}
    <span
      class="crafting-stage-threshold"
      data-progressive-stage-threshold={String(stage.threshold)}
    >
      {#if stacked}
        <!-- The SHORT form of the same phrase — stacked, this reads "DC N · Reach ≥N" (the
             DC chip above, then this). This is the COMPONENT's progressive DC (`component.difficulty`,
             GM-labelled "This component's Progressive DC"), NOT the progressive check DC: the
             check has no DC (`InventoryListingBuilder._salvageDc` returns null for progressive,
             and `dcOverride` is a check-DC knob progressive never reads). Those check-DC facts
             do not argue against showing the component's own DC, which is stable authored data. -->
        {format('FABRICATE.App.Crafting.Detail.StageThresholdShort', 'Reach ≥{threshold}', {
          threshold: stage.threshold,
        })}
      {:else}
        {format('FABRICATE.App.Crafting.Detail.StageThreshold', 'Reached at ≥{threshold}', {
          threshold: stage.threshold,
        })}
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet identity(stage)}
  {#if stacked}
    <!-- The prototype's shape: ONE flexible column. The name wraps inside it and the
         numbers sit beneath, so nothing on the row competes with the name for width. -->
    <span class="crafting-stage-identity">
      <span class="crafting-stage-name">{stage.name}</span>
      <span class="crafting-stage-meta is-stacked">{@render numbers(stage)}</span>
    </span>
    {#if stateChip}{@render stateChip(stage)}{/if}
  {:else}
    <span class="crafting-stage-name">{stage.name}</span>
    <span class="crafting-stage-meta">
      {@render numbers(stage)}
      {#if stateChip}{@render stateChip(stage)}{/if}
    </span>
  {/if}
{/snippet}

<!--
  The full-bleed band inside the stage row (issue 1286).

  `draggable="false"` is REQUIRED, not decorative: pre-roll — the forecast state the band
  exists for — the salvage list is reorderable and the row above carries
  `draggable="true"`, so a mousedown-drag inside the prose would start a row drag instead
  of a text selection. This component already fought the same fight for its artwork.

  It carries no link and no control of any kind. A complication belongs to the component
  the row already names, so a player has nowhere to be sent; and per
  `openspec/specs/ui-integration/spec.md` no player progressive surface builds any part of
  the exclusion vocabulary — no per-stage exclude toggle, no excluded-results list, no
  hidden-result note — because exclusion would contradict the reconciliation guarantee
  that a result is never dropped. The prototype draws one; it is not built.
-->
{#snippet complicationBand(stage)}
  {@const entries = bandEntries(stage)}
  {#if entries.length > 0}
    {@const lead = entries[0]}
    {@const tense = bandTense(entries)}
    {@const badge = TENSE_BADGES[entryTense(lead)]}
    <div
      class="crafting-stage-complications"
      class:is-fired={tense === 'fired'}
      data-progressive-stage-complications
      data-progressive-stage-complication-tense={tense}
      draggable="false"
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
        dataAttr="data-progressive-stage-complication"
        dataValue={lead.id}
      />
      <!-- The FIRST in fire order plus a count, never the whole list: the inspector column
           is 300px and an unbounded list turns one row into several prose paragraphs. The
           remaining names are the `title`, so the count is a pointer rather than a wall. -->
      {#if entries.length > 1}
        <span
          class="crafting-stage-complications-more"
          data-progressive-stage-complication-more={String(entries.length - 1)}
          title={overflowTitle(entries) || undefined}
          >{format('FABRICATE.App.Complications.More', '+{count} more', {
            count: entries.length - 1,
          })}</span
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet moveButtons(stage, index)}
  <span class="crafting-stage-move" class:is-stacked={stacked} data-progressive-stage-move>
    <button
      type="button"
      class="crafting-stage-move-button"
      data-progressive-stage-move-up
      aria-label={`${text('FABRICATE.App.Crafting.Detail.MoveStageUp', 'Move up')} — ${stageName(stage)}`}
      title={text('FABRICATE.App.Crafting.Detail.MoveStageUp', 'Move up')}
      disabled={index === 0}
      onclick={() => move(index, -1)}><i class="fas fa-chevron-up" aria-hidden="true"></i></button
    >
    <button
      type="button"
      class="crafting-stage-move-button"
      data-progressive-stage-move-down
      aria-label={`${text('FABRICATE.App.Crafting.Detail.MoveStageDown', 'Move down')} — ${stageName(stage)}`}
      title={text('FABRICATE.App.Crafting.Detail.MoveStageDown', 'Move down')}
      disabled={index === stages.length - 1}
      onclick={() => move(index, 1)}><i class="fas fa-chevron-down" aria-hidden="true"></i></button
    >
  </span>
{/snippet}

<div class="crafting-stage-list" data-recipe-section="progressive-stages">
  {#each stages as stage, index (stage.id)}
    {#if canReorder}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="crafting-stage-row is-reorderable"
        class:is-stacked={stacked}
        class:has-complications={bandEntries(stage).length > 0}
        data-progressive-stage={stage.id}
        data-progressive-stage-reorderable
        draggable="true"
        ondragstart={() => {
          dragIndex = index;
        }}
        ondragend={() => {
          dragIndex = -1;
        }}
        ondragover={(event) => event.preventDefault()}
        ondrop={(event) => {
          event.preventDefault();
          handleDrop(index);
        }}
      >
        <!-- The stage's own LINE. `display: contents` unless a band is drawn, so a row
             without one is the card's flex items exactly as it was before this component
             ever took a band. With one, the line becomes the real row and carries the
             padding the CARD used to, which is what lets the band below run edge to edge:
             a band inset by the row's padding draws its top rule as a short line floating
             in the middle of the card rather than as a divider. -->
        <div class="crafting-stage-line">
          <!--
            Wholly decorative on BOTH surfaces, so `aria-hidden` sits on the cluster
            itself: the chevrons — the list's only keyboard-reachable reorder control —
            end the row rather than living in here, and the ordinal restates the position
            the live region already announces.
          -->
          <span
            class="crafting-stage-handle"
            class:is-stacked={stacked}
            aria-hidden="true"
            title={text('FABRICATE.App.Crafting.Detail.DragStage', 'Drag to reorder')}
          >
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
            <span class="crafting-stage-ordinal" data-progressive-stage-ordinal={String(index + 1)}
              >{index + 1}</span
            >
          </span>
          {#if stage.img}
            <!-- draggable="false" is REQUIRED, not decorative: an <img> is natively
                 draggable, so a drag started on the artwork becomes an image drag with the
                 wrong ghost, and dropping it outside the app can navigate away. This is the
                 first drag row in the repo to contain an image — the GM's row has none. -->
            <img
              class="crafting-stage-img"
              src={stage.img}
              alt=""
              aria-hidden="true"
              draggable="false"
            />
          {/if}
          <!-- The chevrons END the row on both surfaces (stacked, that is after the state
               chip): one arrow position everywhere, matching the GM's component salvage
               editor rather than diverging per caller. -->
          {@render identity(stage)}
          {@render moveButtons(stage, index)}
        </div>
        {@render complicationBand(stage)}
      </div>
    {:else}
      <!-- D13: no drag handlers attached at all, and no grip glyph. The ordinal and the
           difficulty stay — the order is still information, it is just not the player's
           to change. -->
      <div
        class="crafting-stage-row is-fixed"
        class:is-stacked={stacked}
        class:has-complications={bandEntries(stage).length > 0}
        data-progressive-stage={stage.id}
        data-progressive-stage-fixed
      >
        <div class="crafting-stage-line">
          <span
            class="crafting-stage-ordinal"
            aria-hidden="true"
            data-progressive-stage-ordinal={String(index + 1)}>{index + 1}</span
          >
          {#if stage.img}
            <!-- Also non-draggable in the fixed state: the row is not a drag source, but a
                 bare <img> still is, and dragging it out of the app can navigate away. -->
            <img
              class="crafting-stage-img"
              src={stage.img}
              alt=""
              aria-hidden="true"
              draggable="false"
            />
          {/if}
          {@render identity(stage)}
        </div>
        {@render complicationBand(stage)}
      </div>
    {/if}
  {/each}

  <!-- The note explains WHY the rows are fixed, so it must track the actual reason.
       `canReorder: false` has more than one cause, and the caller is the only thing that
       knows which one applies here. -->
  {#if !canReorder && stages.length > 0}
    <p class="crafting-stage-fixed-note" data-progressive-stage-fixed-note>
      {text(fixedNoteKey, fixedNoteFallback)}
    </p>
  {/if}

  <!-- No live region in the fixed state: nothing can change, so nothing is announced. -->
  {#if canReorder}
    <p class="sr-only" aria-live="polite" data-progressive-stage-status>{announcement}</p>
  {/if}
</div>

<style>
  .crafting-stage-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .crafting-stage-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .crafting-stage-row.is-reorderable {
    cursor: grab;
  }

  /* ── The full-bleed complication band (issue 1286) ────────────────────────────────
     Scoped to this component, never `styles/fabricate.css`: the band's whole point is
     that it adds no shared rule, which is also what keeps a change here mapped to the
     views that draw it rather than to the broad `theme-or-global-ui` screenshot recipe.
     Theme-ROOT tokens only, on `Chip.svelte`'s note — this row renders under
     `.fabricate-app`, where the manager's `--fab-mv2-*` aliases are not in scope. */

  /* `display: contents` in the common case, so a row with no band is the flex container
     it has always been and every rule keyed on its children still matches. */
  .crafting-stage-line {
    display: contents;
  }

  /* With a band the ROW becomes a column and sheds its own padding onto the line, so the
     band can run edge to edge. `align-items: stretch` is load-bearing: the row's default
     `center` would shrink both children to their content width in column direction, and
     the band would stop being full-bleed while every value measured on it stayed right. */
  .crafting-stage-row.has-complications {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  .crafting-stage-row.has-complications .crafting-stage-line {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2);
  }

  /* NO `margin-top`. The band's `border-top` IS the divider between it and the line above,
     and a rule only reads as a divider when the two surfaces meet — a gap in the row's own
     fill turns it into a short line floating above a detached panel. This is the structure
     `RecipeResultItemRow` already ships, and the player prototype draws the same one. */
  .crafting-stage-complications {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    /* The SAME inset the line above carries, so the band's content column starts on the
       line's left edge rather than two pixels inside it. Nothing measured on either box
       can see that: the two boxes align on their borders whatever their padding is, and
       the drift would only ever show up as prose that does not line up with the row it
       belongs to. */
    padding: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-overlay-light-06);
  }

  /* The TENSE lives on the band's fill and top rule, and on the row's badge — never on
     the severity tile, which is one vocabulary across all six complication call sites. A
     tile recoloured by tense would make one control say two things, and a `severe`
     complication that has not fired would be indistinguishable from a `minor` one that
     has. The un-fired resolved tense keeps the quiet fill on purpose: nothing happened,
     so nothing should shout; its badge is what says so in words. */
  .crafting-stage-complications.is-fired {
    border-top-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .crafting-stage-complications-more {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    font-weight: 600;
  }

  /* D13: the grip is gone, so the cursor must not promise a drag either. */
  .crafting-stage-row.is-fixed {
    cursor: default;
  }

  .crafting-stage-handle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--fab-text-muted);
  }

  .crafting-stage-ordinal {
    min-width: 1.1em;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
    text-align: right;
  }

  .crafting-stage-img {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 4px;
    object-fit: cover;
  }

  .crafting-stage-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ============================================================
     `stacked` (issue 675) — the player Inventory's row shape.
     Every rule below is gated on .is-stacked, which only the salvage caller sets, so
     the crafting tab renders from the block above exactly as before.
     ============================================================ */

  /* The identity column is the ONLY thing on the row that flexes, and it is allowed to
     grow TALL instead of thin. That inversion is the whole fix: the inline row let the
     name absorb every other part's width and it measured 0px in a 300px column. */
  .crafting-stage-identity {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .crafting-stage-row.is-stacked .crafting-stage-name {
    overflow: visible;
    white-space: normal;
    /* `anywhere`, not `break-word`: a single unbroken token longer than the column
       (an id-like or agglutinative name) still has to break rather than push the row
       wide again. */
    overflow-wrap: anywhere;
    font-weight: 600;
    line-height: 1.25;
  }

  /* Wraps rather than overflowing: every child here is `nowrap`, so an inline-flex that
     cannot wrap paints its numbers straight out of the identity column and under the
     state chip. Nothing clips it — an overflow this quiet is exactly the class of bug
     that reads fine in a mounted test. */
  .crafting-stage-meta.is-stacked {
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    font-size: 11px;
  }

  .crafting-stage-handle.is-stacked {
    gap: 6px;
  }

  .crafting-stage-row.is-stacked .crafting-stage-ordinal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    text-align: center;
  }

  .crafting-stage-row.is-stacked .crafting-stage-img {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 6px;
  }

  /* Stacked, the chevrons are a VERTICAL pair ENDING the row — the same stack the GM's
     component salvage editor uses, and the shape that costs a 300px column the least
     width at the edge it sits on. Each keeps a 22px touch
     target rather than the prototype's ~17px: HTML5 drag never fires on touch, so these
     buttons are the only touch path to reordering and cannot shrink below usable. */
  .crafting-stage-move.is-stacked {
    flex-direction: column;
    gap: 2px;
  }

  .crafting-stage-move.is-stacked .crafting-stage-move-button {
    width: 24px;
    min-height: 22px;
  }

  .crafting-stage-meta {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .crafting-stage-difficulty {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .crafting-stage-threshold {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .crafting-stage-move {
    display: inline-flex;
    gap: 4px;
    flex: 0 0 auto;
  }

  /*
    D11: the crafting app has NO icon-button primitive, and this is its first drag
    surface. A bare `<button>` inside `.app` inherits Foundry core's FIXED button height
    and centered content, which crops the chevron. Reset the inherited box and put an
    explicit min-height on the 34px rhythm — which doubles as the touch target, and touch
    is the only path here that matters: HTML5 drag never fires on touch, so these buttons
    are the sole touch affordance. Focus rings need no work: `.fabricate-app` already ships
    paired :focus / :focus-visible blocks.
  */
  .crafting-stage-move-button {
    appearance: none;
    /* Both of these complete the house reset (EnvironmentCard.svelte). `margin: 0` is the
       load-bearing one: Foundry's `.app button` carries a margin that would space the
       chevrons apart and can push them past the row edge. Mounted tests cannot see it. */
    -webkit-appearance: none;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: auto;
    min-height: 34px;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .crafting-stage-move-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .crafting-stage-fixed-note {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>

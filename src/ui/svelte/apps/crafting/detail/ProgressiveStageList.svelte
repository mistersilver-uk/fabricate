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
  growing a twin. Three OPTIONAL, DEFAULT-OFF extensions exist for it:

    `showQuantity`  render each stage's `×N`.
    `stateChip`     a snippet, rendered per stage, for a per-row state (salvage's
                    Recovered / Roll fell short / Not reached / Awaiting roll).
    `stacked`       the player Inventory's row shape (the prototype's): the reorder
                    controls LEAD the row, and the stage's identity is a flexible
                    COLUMN — name + `×N`, then its numbers beneath — so the name wraps
                    instead of being crushed.

  All three default to today's rendering, so the Crafting tab — which passes none — is
  byte-unchanged. A required prop or an always-on chip would have re-skinned crafting
  as a side effect of a salvage feature.

  WHY `stacked` EXISTS AT ALL. The inline row lays every part on one line and lets only
  the name flex, so it is the name that pays for every other part. In the player
  inspector — a 300px COLUMN, not the crafting tab's wide panel — grip + ordinal + art
  + `×N` + difficulty + "Reached at ≥N" + a state chip + two chevrons leave the name a
  MEASURED ZERO pixels: it does not truncate to a word, it disappears, and the chevrons
  overflow the panel. Adding a chip to a row that was already full is what did it, so
  the fix belongs with the extension that caused it, not in the crafting tab.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    stages = [],
    canReorder = true,
    announcement = '',
    onReorder = () => {},
    // Commit any debounced order write now. A drag has already settled by the time it
    // drops, so there is nothing left to coalesce.
    onReorderSettled = () => {},
    // Issue 675, all opt-in: omitted, this renders exactly as it did for crafting.
    showQuantity = false,
    stateChip = null,
    stacked = false,
    // WHY the rows are fixed. `canReorder: false` has MORE THAN ONE CAUSE and only the
    // caller knows which applies: the GM pinned the order, or (salvage) the roll has
    // already been spent down the list. Defaulting to the GM string keeps the crafting
    // tab — where that is the only cause — byte-unchanged.
    fixedNoteKey = 'FABRICATE.App.Crafting.Detail.StageOrderFixed',
    fixedNoteFallback = 'Order set by the GM'
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
{#snippet quantity(stage)}
  {#if showQuantity && stage.quantity !== null && stage.quantity !== undefined}
    <span class="crafting-stage-quantity" data-progressive-stage-quantity={String(stage.quantity)}>×{stage.quantity}</span>
  {/if}
{/snippet}

{#snippet numbers(stage)}
  <!--
    ONE number when stacked, TWO inline.

    They are not independent facts: `progressiveStageThresholds` DERIVES the threshold
    as the running sum of the difficulties before it, so a list that prints both prints
    the same information twice, and the threshold is the one that answers the player's
    actual question ("what do I need to roll to reach this?"). Inline, on the crafting
    tab's wide panel, the pair is affordable and the difficulty is a useful cross-check.
    Stacked, in a 300px column, it is not: the two together measure wider than the whole
    identity column, and the redundant one is what pushes the useful one out of the box.
    The prototype prints the threshold alone for exactly this reason.
  -->
  {#if !stacked && stage.difficulty !== null && stage.difficulty !== undefined}
    <span class="crafting-stage-difficulty" data-progressive-stage-difficulty={String(stage.difficulty)}>
      <i class="fas fa-gauge-high" aria-hidden="true"></i>{stage.difficulty}
    </span>
  {/if}
  <!-- Omitted (not zeroed) when the threshold is undefined: a stage the award loop
       skips is reached at NO budget, so any number here would be a lie. -->
  {#if stage.threshold !== null && stage.threshold !== undefined}
    <span class="crafting-stage-threshold" data-progressive-stage-threshold={String(stage.threshold)}>
      {#if stacked}
        <!-- The SHORT form of the same phrase, not a new term. The prototype labels this
             "DC n", but "DC" is a defined concept here that progressive genuinely does
             NOT have: `InventoryListingBuilder._salvageDc` returns null for progressive,
             and a component's `dcOverride` does not shift these thresholds. Borrowing
             the prototype's loose wording would contradict the projection and the docs. -->
        {format('FABRICATE.App.Crafting.Detail.StageThresholdShort', 'Reach ≥{threshold}', { threshold: stage.threshold })}
      {:else}
        {format('FABRICATE.App.Crafting.Detail.StageThreshold', 'Reached at ≥{threshold}', { threshold: stage.threshold })}
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet identity(stage)}
  {#if stacked}
    <!-- The prototype's shape: ONE flexible column. The name wraps inside it and the
         numbers sit beneath, so nothing on the row competes with the name for width. -->
    <span class="crafting-stage-identity">
      <span class="crafting-stage-name">{stage.name}{@render quantity(stage)}</span>
      <span class="crafting-stage-meta is-stacked">{@render numbers(stage)}</span>
    </span>
    {#if stateChip}{@render stateChip(stage)}{/if}
  {:else}
    <span class="crafting-stage-name">{stage.name}</span>
    <span class="crafting-stage-meta">
      {@render quantity(stage)}
      {@render numbers(stage)}
      {#if stateChip}{@render stateChip(stage)}{/if}
    </span>
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
      onclick={() => move(index, -1)}
    ><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
    <button
      type="button"
      class="crafting-stage-move-button"
      data-progressive-stage-move-down
      aria-label={`${text('FABRICATE.App.Crafting.Detail.MoveStageDown', 'Move down')} — ${stageName(stage)}`}
      title={text('FABRICATE.App.Crafting.Detail.MoveStageDown', 'Move down')}
      disabled={index === stages.length - 1}
      onclick={() => move(index, 1)}
    ><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
  </span>
{/snippet}

<div class="crafting-stage-list" data-recipe-section="progressive-stages">
  {#each stages as stage, index (stage.id)}
    {#if canReorder}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="crafting-stage-row is-reorderable"
        class:is-stacked={stacked}
        data-progressive-stage={stage.id}
        data-progressive-stage-reorderable
        draggable="true"
        ondragstart={() => { dragIndex = index; }}
        ondragend={() => { dragIndex = -1; }}
        ondragover={(event) => event.preventDefault()}
        ondrop={(event) => { event.preventDefault(); handleDrop(index); }}
      >
        <!--
          `aria-hidden` moves DOWN a level when stacked, and that is load-bearing: the
          chevrons live inside this cluster there, and an aria-hidden ancestor would take
          the list's only keyboard-reachable reorder control away from assistive tech.
          Unstacked, the attribute stays exactly where it was — the crafting tab's DOM is
          unchanged.
        -->
        <span
          class="crafting-stage-handle"
          class:is-stacked={stacked}
          aria-hidden={stacked ? undefined : 'true'}
          title={text('FABRICATE.App.Crafting.Detail.DragStage', 'Drag to reorder')}
        >
          <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          <!-- Stacked, the reorder controls LEAD the row (the prototype's shape): the
               grip and the chevrons are one affordance, so they sit together, and the
               ordinal reads after them as the row's identity rather than its handle. -->
          {#if stacked}{@render moveButtons(stage, index)}{/if}
          <span
            class="crafting-stage-ordinal"
            aria-hidden={stacked ? 'true' : undefined}
            data-progressive-stage-ordinal={String(index + 1)}
          >{index + 1}</span>
        </span>
        {#if stage.img}
          <!-- draggable="false" is REQUIRED, not decorative: an <img> is natively
               draggable, so a drag started on the artwork becomes an image drag with the
               wrong ghost, and dropping it outside the app can navigate away. This is the
               first drag row in the repo to contain an image — the GM's row has none. -->
          <img class="crafting-stage-img" src={stage.img} alt="" aria-hidden="true" draggable="false" />
        {/if}
        {@render identity(stage)}
        {#if !stacked}{@render moveButtons(stage, index)}{/if}
      </div>
    {:else}
      <!-- D13: no drag handlers attached at all, and no grip glyph. The ordinal and the
           difficulty stay — the order is still information, it is just not the player's
           to change. -->
      <div class="crafting-stage-row is-fixed" class:is-stacked={stacked} data-progressive-stage={stage.id} data-progressive-stage-fixed>
        <span class="crafting-stage-ordinal" aria-hidden="true" data-progressive-stage-ordinal={String(index + 1)}>{index + 1}</span>
        {#if stage.img}
          <!-- Also non-draggable in the fixed state: the row is not a drag source, but a
               bare <img> still is, and dragging it out of the app can navigate away. -->
          <img class="crafting-stage-img" src={stage.img} alt="" aria-hidden="true" draggable="false" />
        {/if}
        {@render identity(stage)}
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

  /* `×N` reads as part of the name, so it sits in the same wrapping text flow — not in
     a rigid box that would re-introduce a fixed cost on the row. */
  .crafting-stage-row.is-stacked .crafting-stage-quantity {
    margin-left: 5px;
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

  /* Stacked, the chevrons are a VERTICAL pair leading the row. Each keeps a 22px touch
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

  /* Opt-in (issue 675): only rendered when a caller passes `showQuantity`. */
  .crafting-stage-quantity {
    white-space: nowrap;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-secondary);
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

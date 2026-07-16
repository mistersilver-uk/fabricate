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
  line says the GM set the order. Identical rows minus working affordances is the worst
  outcome: a player grabs a row and nothing happens.

  SHARED WITH PLAYER SALVAGE (issue 675). Progressive salvage spends its roll down an
  ordered list under exactly these rules, so it reuses this component rather than
  growing a twin. Two OPTIONAL, DEFAULT-OFF extensions exist for it:

    `showQuantity`  render each stage's `×N`.
    `stateChip`     a snippet, rendered per stage, for a per-row state (salvage's
                    Recovered / Roll fell short / Not reached / Awaiting roll).

  Both default to today's rendering, so the Crafting tab — which passes neither — is
  byte-unchanged. A required prop or an always-on chip would have re-skinned crafting
  as a side effect of a salvage feature.
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
    // Issue 675, both opt-in: omitted, this renders exactly as it did for crafting.
    showQuantity = false,
    stateChip = null
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

<div class="crafting-stage-list" data-recipe-section="progressive-stages">
  {#each stages as stage, index (stage.id)}
    {#if canReorder}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="crafting-stage-row is-reorderable"
        data-progressive-stage={stage.id}
        data-progressive-stage-reorderable
        draggable="true"
        ondragstart={() => { dragIndex = index; }}
        ondragend={() => { dragIndex = -1; }}
        ondragover={(event) => event.preventDefault()}
        ondrop={(event) => { event.preventDefault(); handleDrop(index); }}
      >
        <span class="crafting-stage-handle" aria-hidden="true" title={text('FABRICATE.App.Crafting.Detail.DragStage', 'Drag to reorder')}>
          <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          <span class="crafting-stage-ordinal" data-progressive-stage-ordinal={String(index + 1)}>{index + 1}</span>
        </span>
        {#if stage.img}
          <!-- draggable="false" is REQUIRED, not decorative: an <img> is natively
               draggable, so a drag started on the artwork becomes an image drag with the
               wrong ghost, and dropping it outside the app can navigate away. This is the
               first drag row in the repo to contain an image — the GM's row has none. -->
          <img class="crafting-stage-img" src={stage.img} alt="" aria-hidden="true" draggable="false" />
        {/if}
        <span class="crafting-stage-name">{stage.name}</span>
        <span class="crafting-stage-meta">
          {#if showQuantity && stage.quantity !== null && stage.quantity !== undefined}
            <span class="crafting-stage-quantity" data-progressive-stage-quantity={String(stage.quantity)}>×{stage.quantity}</span>
          {/if}
          {#if stage.difficulty !== null && stage.difficulty !== undefined}
            <span class="crafting-stage-difficulty" data-progressive-stage-difficulty={String(stage.difficulty)}>
              <i class="fas fa-gauge-high" aria-hidden="true"></i>{stage.difficulty}
            </span>
          {/if}
          <!-- Omitted (not zeroed) when the threshold is undefined: a stage the award
               loop skips is reached at NO budget, so any number here would be a lie. -->
          {#if stage.threshold !== null && stage.threshold !== undefined}
            <span class="crafting-stage-threshold" data-progressive-stage-threshold={String(stage.threshold)}>
              {format('FABRICATE.App.Crafting.Detail.StageThreshold', 'Reached at ≥{threshold}', { threshold: stage.threshold })}
            </span>
          {/if}
          {#if stateChip}{@render stateChip(stage)}{/if}
        </span>
        <span class="crafting-stage-move" data-progressive-stage-move>
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
      </div>
    {:else}
      <!-- D13: no drag handlers attached at all, and no grip glyph. The ordinal and the
           difficulty stay — the order is still information, it is just not the player's
           to change. -->
      <div class="crafting-stage-row is-fixed" data-progressive-stage={stage.id} data-progressive-stage-fixed>
        <span class="crafting-stage-ordinal" aria-hidden="true" data-progressive-stage-ordinal={String(index + 1)}>{index + 1}</span>
        {#if stage.img}
          <!-- Also non-draggable in the fixed state: the row is not a drag source, but a
               bare <img> still is, and dragging it out of the app can navigate away. -->
          <img class="crafting-stage-img" src={stage.img} alt="" aria-hidden="true" draggable="false" />
        {/if}
        <span class="crafting-stage-name">{stage.name}</span>
        <span class="crafting-stage-meta">
          {#if showQuantity && stage.quantity !== null && stage.quantity !== undefined}
            <span class="crafting-stage-quantity" data-progressive-stage-quantity={String(stage.quantity)}>×{stage.quantity}</span>
          {/if}
          {#if stage.difficulty !== null && stage.difficulty !== undefined}
            <span class="crafting-stage-difficulty" data-progressive-stage-difficulty={String(stage.difficulty)}>
              <i class="fas fa-gauge-high" aria-hidden="true"></i>{stage.difficulty}
            </span>
          {/if}
          {#if stage.threshold !== null && stage.threshold !== undefined}
            <span class="crafting-stage-threshold" data-progressive-stage-threshold={String(stage.threshold)}>
              {format('FABRICATE.App.Crafting.Detail.StageThreshold', 'Reached at ≥{threshold}', { threshold: stage.threshold })}
            </span>
          {/if}
          {#if stateChip}{@render stateChip(stage)}{/if}
        </span>
      </div>
    {/if}
  {/each}

  {#if !canReorder && stages.length > 0}
    <p class="crafting-stage-fixed-note" data-progressive-stage-fixed-note>
      {text('FABRICATE.App.Crafting.Detail.StageOrderFixed', 'Order set by the GM')}
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

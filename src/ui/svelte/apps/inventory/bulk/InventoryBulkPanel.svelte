<!-- Svelte 5 runes mode -->
<!--
  The bulk salvage / bulk destroy panel (issue 859): what the player gets instead of
  the single-item inspector once they have shift-clicked more than nothing.

  ## It renders INSIDE the inspector shell, and that is the point

  `InventoryDetailHeader` is not a header, it is the inspector shell — the scrolling
  `.inventory-detail` column, the identity block, and the shared body leaves
  (`.inventory-detail-section`, `-section-title`, `-row-name`, `-empty-note`)
  published as ancestor-guarded globals. Adopting it means this panel's sections,
  eyebrows, row names and empty note ARE the inspector's, and cannot drift from them
  the way the two detail bodies once did. It also inherits the scroll contract for
  free: `.inventory-view-column-right` is `overflow: hidden` and `.inventory-detail`
  is the scroller, so a 25-row queue scrolls rather than clipping.

  `role="region"` + `aria-label` go on the SHELL ROOT through its `attrs` spread
  rather than on an inner div, or the title, the count line and Clear would sit
  OUTSIDE the labelled region and a screen-reader user would skip exactly the
  material the live region was added for. `detailKey` is `bulk` — visibly not a card
  key (those are `system:component`) — because the smoke harness locates
  `[data-inventory-detail]` UNVALUED.

  ## Four states, one of which is not a spinner

  `preview | empty | running | report`. `running` is designed rather than "disable
  the button and spin": execution is strictly sequential, so progress is genuinely
  knowable, and the panel shows a determinate "Salvaging n of m" in a `role="status"`
  region while marking each row waiting / in progress / done. Destroy reuses it —
  against `entries`, because that (click order) is the order the store snapshots for
  destroy, whereas salvage runs the name-sorted queue.

  ## The forecast block is READ, never derived

  Pre-commit, the panel draws a "What could go wrong" block above the queue: one group
  card per queued entry carrying player-visible complications (issue 1286). Every field
  it renders — the ordered rows, their positions, whose order those positions are
  numbered against — is already published on the entry by the store. This panel calls no
  forecast builder and reads no component's authored complications: the audience rule
  that decides what a player may be shown has exactly one owner.

  ## Brokenness does not block

  A broken tool is still salvageable — `_isBrokenTool`'s own docblock and the spec
  both say brokenness is about USABILITY, not salvageability. So a broken row stays
  in the QUEUE and gains a second, danger-toned chip beside its certainty chip. It is
  never moved to the blocked list, and it never names a "repair it first" remedy,
  which Fabricate has no action for.

  ## Controls

  Clear, Done, the commit and the destroy trigger are shared `Button`s: the
  commit and Done are the pane's one primary, Destroy the plain danger role, since its
  confirmation is the dialog upstream. The per-row remove stays a 20px hand-rolled
  button, because a 34px icon button would grow every queue row.

  Props:
   - counts / entries / salvageable / blocked / yieldRows: the store's already
     partitioned bulk state. Pure data carrying no i18n; this component localizes it.
   - running / destroying / progress / report: the run state.
   - destroyLabel: the ALREADY-localized destroy trigger, naming BOTH the component
     count and the unit count. It arrives composed because the confirmation dialog
     must name the same two numbers in the same words, and `InventoryView` owns the
     dialog copy — so the fragments have one author, not two. Same reason the shell
     takes an already-localized `total`.
   - onClear / onRemove / onSalvage / onDestroy / onDone: store actions.
-->
<script>
  import { localize, formatList } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Button from '../../../components/Button.svelte';
  import InventoryDetailHeader from '../detail/InventoryDetailHeader.svelte';
  import InventoryBulkSection from './InventoryBulkSection.svelte';
  import InventoryBulkRow from './InventoryBulkRow.svelte';
  import InventoryBulkComplicationGroup from './InventoryBulkComplicationGroup.svelte';
  import InventoryBulkReport from './InventoryBulkReport.svelte';

  let {
    counts = null,
    entries = [],
    salvageable = [],
    blocked = [],
    yieldRows = [],
    running = false,
    destroying = false,
    progress = null,
    report = null,
    destroyLabel = '',
    onClear = null,
    onRemove = null,
    onSalvage = null,
    onDestroy = null,
    onDone = null,
  } = $props();

  // The ONE blocked-reason vocabulary, in the store's own first-match order. Each
  // value is an object with a `labelKey` rather than a bare string so the narrow lang
  // guard — which requires a STRING and so catches a namespace-shadowing object —
  // covers these keys too.
  const BLOCKED_REASONS = Object.freeze({
    essence: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedEssence' },
    recipeItem: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedRecipeItem' },
    salvageDisabled: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedSalvageDisabled' },
    simpleMultiGroup: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedSimpleMultiGroup' },
    routedNoFormula: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedRoutedNoFormula' },
    progressiveNoFormula: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedProgressiveNoFormula' },
    toolsUnavailable: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedToolsUnavailable' },
    depleted: { labelKey: 'FABRICATE.App.Inventory.Bulk.BlockedDepleted' },
  });

  const RUN_STATES = Object.freeze({
    pending: {
      tone: 'subtle',
      icon: 'fas fa-hourglass',
      labelKey: 'FABRICATE.App.Inventory.Bulk.RunPending',
    },
    active: {
      tone: 'accent',
      icon: 'fas fa-spinner fa-spin',
      labelKey: 'FABRICATE.App.Inventory.Bulk.RunActive',
    },
    done: {
      tone: 'success',
      icon: 'fas fa-check',
      labelKey: 'FABRICATE.App.Inventory.Bulk.RunDone',
    },
  });

  const busy = $derived(running === true || destroying === true);
  const hasReport = $derived(report != null);
  // How many QUEUED rows honour the player's own stage order. Only progressive rows
  // whose component permits player reorder qualify; a GM who pinned the authored order
  // sets `allowPlayerResultReorder: false` and must not be told otherwise.
  const reorderedCount = $derived(salvageable.filter((entry) => entry.allowsReorder).length);

  // ── The "What could go wrong" block (issue 1286) ──────────────────────────────────
  //
  // The QUEUED entries carrying a player-visible complication forecast, in queue order,
  // and the count of the warnings they hold between them.
  //
  // Both READ the projection the store publishes on each entry. This panel never calls
  // `forecastComplications` and never reads `component.complications`: the redaction
  // rule that decides what a player may be shown has ONE owner, and a panel deriving any
  // part of it a second time is how a `gmOnly` consequence eventually reaches a player.
  //
  // The count is a count of the rows the block actually draws, not a deduplicated tally.
  // A number in a section eyebrow that disagrees with the rows beneath it is worse than
  // no number at all, and each queued row is its own resolution — the same complication
  // on two rows can genuinely fire twice.
  const complicationGroups = $derived(
    salvageable
      .map((entry) => ({
        entry,
        complications: Array.isArray(entry.complications) ? entry.complications : [],
      }))
      .filter((group) => group.complications.length > 0)
  );
  const complicationCount = $derived(
    complicationGroups.reduce((total, group) => total + group.complications.length, 0)
  );

  const state = $derived.by(() => {
    if (hasReport) return 'report';
    if (busy) return 'running';
    return salvageable.length === 0 ? 'empty' : 'preview';
  });

  const separator = $derived(localize('FABRICATE.App.Inventory.Bulk.CountSeparator'));

  // The count line is also the panel's polite live region. At the cap it SAYS so, so
  // the limit is announced on the click that reaches 25 rather than only on the
  // refused click after it — which changes nothing on screen and would be silent.
  //
  // IT IS WITHHELD ENTIRELY IN THE `report` STATE. The run consumed its rows, so they
  // no longer resolve in the listing and every count collapses to zero — leaving a
  // live region to announce "2 selected · 0 salvageable · 0 skipped" directly above
  // "Batch complete · 2 recovered" at the moment the run SUCCEEDED. Both readings are
  // literally true and together they are a contradiction, and the one a screen-reader
  // user hears is the wrong one. The report's own banner is the summary in that state,
  // so the header line stands down rather than competing with it.
  const countLine = $derived(
    [
      localize(
        counts?.atMax === true
          ? 'FABRICATE.App.Inventory.Bulk.CountSelectedAtMax'
          : 'FABRICATE.App.Inventory.Bulk.CountSelected',
        { count: counts?.selected ?? 0 }
      ),
      localize('FABRICATE.App.Inventory.Bulk.CountSalvageable', {
        count: counts?.salvageable ?? 0,
      }),
      localize('FABRICATE.App.Inventory.Bulk.CountBlocked', { count: counts?.blocked ?? 0 }),
    ].join(separator)
  );

  /**
   * A queue row's certainty, derived from the row's OWN best-case yield rather than
   * claimed. It is guaranteed only when the row previews at least one result AND
   * every previewed result is fully guaranteed — which is exactly the no-check
   * `simple` case. A checked simple row, any routed row that can land on a failure
   * tier, and every progressive row all fall to Possible, correctly.
   */
  function isGuaranteed(entry) {
    const rows = Array.isArray(entry?.yieldRows) ? entry.yieldRows : [];
    return (
      rows.length > 0 &&
      rows.every((row) => {
        const quantity = Number(row?.quantity) || 0;
        return quantity > 0 && (Number(row?.guaranteedQuantity) || 0) === quantity;
      })
    );
  }

  /** The muted second line of a queue row: which system is acting, and any caveat. */
  function queueNote(entry) {
    const parts = [];
    // Only when the CARD carries several participations — otherwise naming the system
    // is noise on every row.
    if ((entry?.systemsCount ?? 0) > 1 && entry?.systemName) {
      parts.push(
        localize('FABRICATE.App.Inventory.Salvage.ActingSystem', { system: entry.systemName })
      );
    }
    // A progressive component every stage of which is unreachable is salvageable but
    // previews nothing; saying so beats an unexplained absence from the yield list.
    if ((entry?.yieldRows?.length ?? 0) === 0) {
      parts.push(localize('FABRICATE.App.Inventory.Bulk.NoPreview'));
    }
    return parts.join(separator);
  }

  function blockedLabel(entry) {
    const reason = BLOCKED_REASONS[entry?.blockedReason];
    if (!reason) return localize('FABRICATE.App.Inventory.Bulk.BlockedUnknown');
    if (entry.blockedReason === 'toolsUnavailable') {
      // A locale-correct "x, y and z", never a hand-joined comma list.
      return localize(reason.labelKey, { tools: formatList(entry.missingTools ?? []) });
    }
    return localize(reason.labelKey);
  }

  /**
   * The three yield row shapes. `guaranteed === quantity > 0` is the commonest
   * configuration by far (simple, no check) and takes NO "up to" affix — an affix
   * there would imply a variability the row does not have.
   */
  function yieldShape(row) {
    const quantity = Number(row?.quantity) || 0;
    const guaranteed = Number(row?.guaranteedQuantity) || 0;
    if (guaranteed === 0) return { count: quantity, guaranteed: false, upTo: null };
    if (quantity > guaranteed) return { count: guaranteed, guaranteed: true, upTo: quantity };
    return { count: quantity, guaranteed: true, upTo: null };
  }

  // Destroy runs the whole selection in CLICK order; salvage runs the name-sorted
  // queue. Marking rows against the wrong list would mark the wrong row done.
  const runRows = $derived(destroying === true ? entries : salvageable);
  const progressCurrent = $derived(Number(progress?.current ?? 0));
  const progressTotal = $derived(Number(progress?.total ?? runRows.length) || 0);
  const progressPercent = $derived(
    progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0
  );
  const progressLabel = $derived(
    localize(
      destroying === true
        ? 'FABRICATE.App.Inventory.Bulk.ProgressDestroying'
        : 'FABRICATE.App.Inventory.Bulk.ProgressSalvaging',
      {
        // `current` counts COMPLETED rows, so the row being worked on is the next one.
        current: Math.min(progressCurrent + 1, Math.max(progressTotal, 1)),
        total: progressTotal,
      }
    )
  );

  /**
   * Which of waiting / in progress / done one row is at, from the completed count.
   *
   * A SALVAGE run claims NO row in progress until its first `onProgress` tick has
   * landed. `salvageComponents` opens the one batch roll prompt BEFORE it touches the
   * first target, so `current: 0` means "waiting on the player", not "row 1 running" —
   * and a dismissed prompt ends the run having called the engine zero times, which
   * would have left a row wearing "In progress" for work that never started.
   * Destroy has no such gap (its confirmation is answered before the store raises the
   * busy flag at all), so it keeps its first row marked active from tick zero.
   */
  function runStateOf(index) {
    if (index < progressCurrent) return RUN_STATES.done;
    if (index !== progressCurrent) return RUN_STATES.pending;
    return destroying === true || progressCurrent > 0 ? RUN_STATES.active : RUN_STATES.pending;
  }
</script>

{#snippet clearAction()}
  <Button role="ghost" data-inventory-bulk-clear="" disabled={busy} onclick={() => onClear?.()}>
    <i class="fas fa-xmark" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Bulk.Clear')}</span>
  </Button>
{/snippet}

{#snippet complicationCountLabel()}
  <span data-inventory-bulk-complication-count={complicationCount}>
    {localize('FABRICATE.App.Complications.Count', { count: complicationCount })}
  </span>
{/snippet}

{#snippet removeControl(entry)}
  <button
    type="button"
    class="bulk-remove fab-hit-area"
    data-inventory-bulk-remove={entry.key}
    aria-label={localize('FABRICATE.App.Inventory.Bulk.Remove', { name: entry.name })}
    onclick={() => onRemove?.(entry.key)}
  >
    <i class="fas fa-xmark" aria-hidden="true"></i>
  </button>
{/snippet}

<InventoryDetailHeader
  detailKey="bulk"
  attrs={{
    role: 'region',
    'aria-label': localize('FABRICATE.App.Inventory.Bulk.RegionLabel'),
    'data-inventory-bulk-panel': state,
  }}
  icon="fas fa-layer-group"
  name={localize('FABRICATE.App.Inventory.Bulk.Title')}
  total={state === 'report' ? '' : countLine}
  totalAttrs={state === 'report' ? {} : { 'aria-live': 'polite', 'aria-atomic': 'true' }}
  headerAction={state === 'report' ? null : clearAction}
>
  <div class="bulk-body">
    {#if state === 'report'}
      <InventoryBulkReport {report} />
    {:else}
      {#if state === 'running'}
        <div class="bulk-progress" role="status" data-inventory-bulk-progress={progressPercent}>
          <p class="bulk-progress-label">{progressLabel}</p>
          <div class="bulk-progress-track" aria-hidden="true">
            <div class="bulk-progress-fill" style={`width:${progressPercent}%`}></div>
          </div>
        </div>

        <InventoryBulkSection
          title={localize('FABRICATE.App.Inventory.Bulk.QueueTitle')}
          attrs={{ 'data-inventory-bulk-queue': 'running' }}
        >
          {#each runRows as entry, index (entry.key)}
            {@const runState = runStateOf(index)}
            <InventoryBulkRow
              img={entry.img}
              name={entry.name}
              note={queueNote(entry)}
              attrs={{ 'data-inventory-bulk-run-row': entry.key }}
            >
              {#snippet trailing()}
                <Chip tone={statusChipTone(runState.tone)} icon={runState.icon}
                  >{localize(runState.labelKey)}</Chip
                >
              {/snippet}
            </InventoryBulkRow>
          {/each}
        </InventoryBulkSection>
      {:else if state === 'empty'}
        <EmptyState
          note
          hint={localize('FABRICATE.App.Inventory.Bulk.NothingToSalvage')}
          data-inventory-bulk-empty
        />
      {:else}
        <!-- ABOVE the queue, and PRE-COMMIT only. The forecast is what the player weighs
             before spending the one gesture that rolls the whole batch, so it has to be
             read before the commit control rather than found under it. It is absent in
             the `running` and `report` states entirely: once the run commits, the fired
             record is reported on the aggregate chat card, and a stale forecast standing
             beside a committed outcome reads as a second, contradicting report. -->
        {#if complicationGroups.length > 0}
          <InventoryBulkSection
            title={localize('FABRICATE.App.Complications.Title')}
            titleTrailing={complicationCountLabel}
            attrs={{ 'data-inventory-bulk-complications': '' }}
          >
            <!-- One card per QUEUED ENTRY, keyed on the entry, so the block reads against
                 the queue directly below it. -->
            {#each complicationGroups as group (group.entry.key)}
              <InventoryBulkComplicationGroup
                img={group.entry.img}
                name={group.entry.name}
                orderProvenance={group.entry.orderProvenance ?? null}
                complications={group.complications}
                attrs={{ 'data-inventory-bulk-complication-group': group.entry.key }}
              />
            {/each}
          </InventoryBulkSection>
        {/if}

        <InventoryBulkSection
          title={localize('FABRICATE.App.Inventory.Bulk.QueueTitle')}
          attrs={{ 'data-inventory-bulk-queue': 'preview' }}
        >
          {#each salvageable as entry (entry.key)}
            <InventoryBulkRow
              img={entry.img}
              name={entry.name}
              note={queueNote(entry)}
              attrs={{ 'data-inventory-bulk-queue-row': entry.key }}
            >
              {#snippet trailing()}
                {#if isGuaranteed(entry)}
                  <Chip tone="positive" icon="fas fa-circle-check"
                    >{localize('FABRICATE.App.Inventory.Salvage.Guaranteed')}</Chip
                  >
                {:else}
                  <Chip tone="accent" icon="fas fa-dice-d20"
                    >{localize('FABRICATE.App.Inventory.Bulk.Possible')}</Chip
                  >
                {/if}
                {#if entry.broken}
                  <!-- Beside the certainty chip, never instead of the queue: brokenness
                       is about usability, and it does NOT gate salvageability. -->
                  <Chip tone="danger" icon="fas fa-heart-crack"
                    >{localize('FABRICATE.App.Inventory.Card.Broken')}</Chip
                  >
                {/if}
                {@render removeControl(entry)}
              {/snippet}
            </InventoryBulkRow>
          {/each}
        </InventoryBulkSection>

        {#if yieldRows.length > 0}
          <InventoryBulkSection
            title={localize('FABRICATE.App.Inventory.Bulk.YieldTitle')}
            attrs={{ 'data-inventory-bulk-yield': '' }}
          >
            <!-- Keyed on component IDENTITY, not display name: two distinct components
                 can share a name, and a name key both collides here and merged them
                 upstream, hiding real components from the preview (issue 859). -->
            {#each yieldRows as row (row.componentId ?? `name:${row.name}`)}
              {@const shape = yieldShape(row)}
              <InventoryBulkRow
                img={row.img}
                name={row.name}
                attrs={{ 'data-inventory-bulk-yield-row': row.name }}
              >
                {#snippet trailing()}
                  <span class="bulk-quantity">×{shape.count}</span>
                  {#if shape.upTo !== null}
                    <span class="bulk-up-to" data-inventory-bulk-up-to={shape.upTo}>
                      {localize('FABRICATE.App.Inventory.Bulk.YieldUpTo', { count: shape.upTo })}
                    </span>
                  {/if}
                  {#if shape.guaranteed}
                    <Chip tone="positive" icon="fas fa-circle-check"
                      >{localize('FABRICATE.App.Inventory.Salvage.Guaranteed')}</Chip
                    >
                  {:else}
                    <Chip tone="accent" icon="fas fa-dice-d20"
                      >{localize('FABRICATE.App.Inventory.Bulk.Possible')}</Chip
                    >
                  {/if}
                {/snippet}
              </InventoryBulkRow>
            {/each}
          </InventoryBulkSection>
        {/if}
      {/if}

      {#if state !== 'running' && blocked.length > 0}
        <InventoryBulkSection
          title={localize('FABRICATE.App.Inventory.Bulk.BlockedTitle')}
          note={localize('FABRICATE.App.Inventory.Bulk.BlockedNote')}
          attrs={{ 'data-inventory-bulk-blocked': '' }}
        >
          {#each blocked as entry (entry.key)}
            <InventoryBulkRow
              img={entry.img}
              name={entry.name}
              attrs={{ 'data-inventory-bulk-blocked-row': entry.blockedReason }}
            >
              {#snippet trailing()}
                <span class="bulk-blocked-reason">{blockedLabel(entry)}</span>
                {@render removeControl(entry)}
              {/snippet}
            </InventoryBulkRow>
          {/each}
        </InventoryBulkSection>
      {/if}
    {/if}

    <!-- The pre-commit footer is the ONLY place the player is told, BEFORE
         committing, that one gesture rolls the whole batch — the dialog's own note
         arrives too late to change their mind about the selection. It is hidden
         entirely once a report stands, leaving only Done. -->
    <div class="bulk-footer" data-inventory-bulk-footer={state}>
      {#if state === 'report'}
        <Button role="primary" fullWidth data-inventory-bulk-done="" onclick={() => onDone?.()}>
          <i class="fas fa-check" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Inventory.Bulk.Done')}</span>
        </Button>
      {:else}
        <p class="bulk-footer-note" data-inventory-bulk-footer-note>
          {localize('FABRICATE.App.Inventory.Bulk.FooterNote')}
          <!-- Progressive rows spend the roll down a stage list the player may have
               reordered on the single-item panel. That order is stored per player and
               per component, and the engine re-reads it for EACH queued row at run
               start — so a bulk run already honours it. Nothing else on this screen
               says so, which is the only reason this sentence exists (issue 859). -->
          {#if reorderedCount > 0}
            <span data-inventory-bulk-reorder-note>
              {localize('FABRICATE.App.Inventory.Bulk.ReorderNote')}
            </span>
          {/if}
        </p>
        <div class="bulk-footer-actions">
          <Button
            role="danger"
            fullWidth
            data-inventory-bulk-destroy=""
            disabled={busy || entries.length === 0}
            aria-busy={destroying === true}
            onclick={() => onDestroy?.()}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            <span>{destroyLabel}</span>
          </Button>
          <Button
            role="primary"
            fullWidth
            data-inventory-bulk-salvage=""
            disabled={busy || salvageable.length === 0}
            aria-busy={running === true}
            onclick={(event) => onSalvage?.(event)}
          >
            <i
              class="fas"
              class:fa-spinner={running}
              class:fa-spin={running}
              class:fa-recycle={!running}
              aria-hidden="true"
            ></i>
            <span>{localize('FABRICATE.App.Inventory.Bulk.SalvageAction')}</span>
          </Button>
        </div>
      {/if}
    </div>
  </div>
</InventoryDetailHeader>

<style>
  .bulk-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    /* The salvage panel's recorded Chromium trap, hit identically here: the scroll
       container (`.inventory-detail`) is a flex column with `overflow-y: auto`, and
       Chromium DROPS such a container's own `padding-bottom` at the scroll end. The
       footer is a scrolled-to-bottom action row, so without padding on THIS block —
       a normal flow box, where it IS honoured — a 25-row queue ends flush against
       the window edge. */
    padding-bottom: var(--fab-space-6);
  }

  .bulk-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bulk-progress-label {
    margin: 0;
    font-size: 11.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-family: var(--fab-font-mono);
    color: var(--fab-text-secondary);
  }

  /* HAND-ROLLED, AND DEFERRED (issue 1514). `FillBar` is the product's one horizontal fill
     bar and this is one, but the bar publishes two rungs — `sm` at 6px and `md` at 8px — and
     4px is neither. Converting would grow the running-batch track by half again, which is a
     size move rather than a frame move (issue 2294). */
  .bulk-progress-track {
    height: 4px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    overflow: hidden;
  }

  /* Flat fill, no gradient: the style contract bans them across the UI. */
  .bulk-progress-fill {
    height: 100%;
    background: var(--fab-accent);
  }

  /* The reason is BOUNDED, and that bound is the whole point of this rule.
     `InventoryBulkRow`'s trailing group is `flex: 0 0 auto` and must stay that way — it
     is what keeps a chip and the remove control from being squeezed — so the row's name
     is the side that shrinks, and the only lever here that protects it is to cap the
     reason itself. Uncapped, a long reason such as the unfinished-results one wins the
     entire row at the 1024 floor and renders "Bent Clasp" as "B..". A reason attached to
     a row the player cannot identify is worth nothing, so the name keeps a usable
     minimum and the reason wraps into two or three short right-aligned lines instead —
     which loses nothing, unlike an ellipsis. */
  .bulk-blocked-reason {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 13em;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.4;
    text-align: right;
    overflow-wrap: break-word;
    color: var(--fab-text-muted);
  }

  .bulk-quantity {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 500;
    color: var(--fab-text-secondary);
  }

  .bulk-up-to {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    font-weight: 500;
    color: var(--fab-text-subtle);
  }

  /* Sticky, so the commit stays reachable below a long queue (issue 859). Its fill is the column's
     composite, an opaque `--fab-surface` that hides scrolled rows under the `::before`'s 5% soft
     layer (no gradient: `flat-ui-style-contract`). `.bulk-body`'s padding keeps it off the edge. */
  .bulk-footer {
    position: sticky;
    bottom: 0;
    display: flex;
    /* Stacked, not a row: the actions are full-width so the commit control is the
       widest thing on the panel, matching the reference prototype. */
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-3);
    /* A section DIVIDER, not a card. The footer must read as a continuation of the
       panel with a rule above it — never as a boxed tray. */
    border-top: 1px solid var(--fab-border);
    padding-top: var(--fab-space-3);
    padding-bottom: var(--fab-space-2);
    background-color: var(--fab-surface);
  }

  .bulk-footer::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--fab-surface-soft);
  }

  .bulk-footer-note {
    /* MUST stay `auto`-basis. The footer is a COLUMN, so flex-basis is a HEIGHT here —
       a row-style `flex: 1 1 22em` inflates the note to a ~22em-tall box, and because
       the footer is `position: sticky` it then paints over the yield rows behind it,
       hiding every row but the first (issue 859). Sized by its own text, nothing more. */
    flex: 0 0 auto;
    margin: 0;
    min-width: 0;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--fab-text-subtle);
  }

  .bulk-footer-actions {
    /* Full-width stacked actions, matching the reference prototype: the commit control
       is the widest thing on the panel rather than a right-aligned pair. This also
       removes the 1024 wrap case entirely — there is nothing left to wrap. */
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
  }

  /* Foundry's global `.app button` pins a fixed height and centres content, so a button that sets
     only `min-height` is cropped; this reproduces only in real Foundry, not in a mounted test. */
  .bulk-remove {
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--fab-text-subtle);
    font-size: 11px;
  }

  .bulk-remove:hover {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }
</style>

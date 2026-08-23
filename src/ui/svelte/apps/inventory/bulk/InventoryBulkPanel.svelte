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

  ## Every control is a real <button>

  Clear, Done, the per-row remove, the commit and the destroy trigger. Each carries
  the Foundry reset, because the global `.app button` rule pins a fixed height and a
  button that only sets `min-height` gets CROPPED in real Foundry — a class of defect
  mounted tests cannot see.

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
  import StatusPill from '../../../components/StatusPill.svelte';
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
  <button
    type="button"
    class="bulk-text-button"
    data-inventory-bulk-clear
    disabled={busy}
    onclick={() => onClear?.()}
  >
    <i class="fas fa-xmark" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Bulk.Clear')}</span>
  </button>
{/snippet}

{#snippet complicationCountLabel()}
  <span data-inventory-bulk-complication-count={complicationCount}>
    {localize('FABRICATE.App.Complications.Count', { count: complicationCount })}
  </span>
{/snippet}

{#snippet removeControl(entry)}
  <button
    type="button"
    class="bulk-remove"
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
                <StatusPill
                  tone={runState.tone}
                  icon={runState.icon}
                  label={localize(runState.labelKey)}
                />
              {/snippet}
            </InventoryBulkRow>
          {/each}
        </InventoryBulkSection>
      {:else if state === 'empty'}
        <p class="inventory-detail-empty-note" data-inventory-bulk-empty>
          {localize('FABRICATE.App.Inventory.Bulk.NothingToSalvage')}
        </p>
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
                orderIsPlayers={group.entry.orderIsPlayers === true}
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
                  <StatusPill
                    tone="success"
                    icon="fas fa-circle-check"
                    label={localize('FABRICATE.App.Inventory.Salvage.Guaranteed')}
                  />
                {:else}
                  <StatusPill
                    tone="accent"
                    icon="fas fa-dice-d20"
                    label={localize('FABRICATE.App.Inventory.Bulk.Possible')}
                  />
                {/if}
                {#if entry.broken}
                  <!-- Beside the certainty chip, never instead of the queue: brokenness
                       is about usability, and it does NOT gate salvageability. -->
                  <StatusPill
                    tone="danger"
                    icon="fas fa-heart-crack"
                    label={localize('FABRICATE.App.Inventory.Card.Broken')}
                  />
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
                    <StatusPill
                      tone="success"
                      icon="fas fa-circle-check"
                      label={localize('FABRICATE.App.Inventory.Salvage.Guaranteed')}
                    />
                  {:else}
                    <StatusPill
                      tone="accent"
                      icon="fas fa-dice-d20"
                      label={localize('FABRICATE.App.Inventory.Bulk.Possible')}
                    />
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
        <button
          type="button"
          class="bulk-action"
          data-inventory-bulk-done
          onclick={() => onDone?.()}
        >
          <i class="fas fa-check" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Inventory.Bulk.Done')}</span>
        </button>
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
          <button
            type="button"
            class="bulk-destroy"
            data-inventory-bulk-destroy
            disabled={busy || entries.length === 0}
            aria-busy={destroying === true}
            onclick={() => onDestroy?.()}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            <span>{destroyLabel}</span>
          </button>
          <button
            type="button"
            class="bulk-action"
            data-inventory-bulk-salvage
            disabled={busy || salvageable.length === 0}
            aria-busy={running === true}
            onclick={() => onSalvage?.()}
          >
            <i
              class="fas"
              class:fa-spinner={running}
              class:fa-spin={running}
              class:fa-recycle={!running}
              aria-hidden="true"
            ></i>
            <span>{localize('FABRICATE.App.Inventory.Bulk.SalvageAction')}</span>
          </button>
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
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: var(--fab-font-mono);
    color: var(--fab-text-secondary);
  }

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
    font-weight: 700;
    color: var(--fab-text-secondary);
  }

  .bulk-up-to {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    font-weight: 600;
    color: var(--fab-text-subtle);
  }

  /* `.salvage-footer`'s shape — a ruled row, the note explaining the gesture's cost on
     the left, the actions at their own width on the right — with the one divergence it
     has to have. That footer carries a SINGLE short button; this one carries two, and
     the destroy button's label names both a component count and a unit count, so the
     pair is about as wide as the whole inspector column. Taken literally, the shape
     therefore left the note a ~70px ribbon eight lines tall at the default window — and
     this note is the only place the player is told, before committing, that one gesture
     rolls the whole batch, so unreadable is the same as absent.
     The row WRAPS instead. The note carries a real flex basis, and flex decides wrapping
     from base sizes BEFORE it shrinks anything, so the line breaks rather than the note
     collapsing; the note then owns a full-width line. `margin-left: auto` rather than
     `justify-content: space-between` keeps the actions right in BOTH layouts —
     space-between left-aligns a wrapped line that holds only one item. */
  /* STICKY, and that is a correctness fix rather than polish. The panel only grows —
     the queue is capped at 25 rows and carries a yield preview and a blocked list under
     it — so the commit pair sat below the scroll fold with as few as FOUR rows selected
     at the default window width. A commit control the player has to hunt for past the
     material it acts on is, for the population this feature exists for, effectively not
     there. Pinned to the bottom of `.inventory-detail`'s scrollport, it is reachable in
     every selection size.
     It needs an OPAQUE fill, not `.inventory-view-column-right`'s own
     `--fab-surface-soft` (issue 859) — that token is a 5%-alpha overlay, not a fill,
     so a `--fab-surface-soft` footer let scrolled rows show straight through it. The
     column's true backdrop is that overlay painted once over `.inventory-view-grid`'s
     `--fab-surface`, so `--fab-surface` — the opaque base of that composite, and the
     one token every theme block defines it from — is what the footer paints instead:
     solid enough to block the scrolled queue, and close enough in tone (the overlay
     it omits is a bare 5% tint) to still read as part of the panel rather than a
     foreign bar dropped on top of it.
     `.bulk-body`'s `padding-bottom` STAYS: it is the Chromium flex-overflow trap
     recorded above, and it is also what keeps this footer's natural (fully scrolled)
     resting place off the window edge — sticky can only pull an element UP to the
     scrollport, never past its own containing block's content edge. */
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
    /* Sticky needs an opaque fill or scrolled rows show through (issue 859). The fill
       must reproduce the panel's own composite EXACTLY, or the 5% difference reads as
       a box: the column paints `--fab-surface-soft` over the grid's `--fab-surface`,
       so both layers are restated here. The inset shadow is that second layer — a
       gradient would be the obvious way and `flat-ui-style-contract` bans them. */
    background-color: var(--fab-surface);
    box-shadow: inset 0 0 0 100vmax var(--fab-surface-soft);
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

  /* `0 1 auto`, not `0 0 auto`: at the narrow floor the two buttons together are wider
     than the inspector column, and a group that cannot shrink overflows it instead of
     letting its own `flex-wrap` act — the column clips horizontally, so the salvage
     button loses its right edge with nothing on screen to say so. Shrinkable, the group
     takes the line's width and the buttons stack, still right-aligned. */
  .bulk-footer-actions {
    /* Full-width stacked actions, matching the reference prototype: the commit control
       is the widest thing on the panel rather than a right-aligned pair. This also
       removes the 1024 wrap case entirely — there is nothing left to wrap. */
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
  }

  .bulk-footer-actions > :global(button) {
    width: 100%;
    justify-content: center;
  }

  /* Foundry's global `.app button` pins a fixed height and centres content, so a
     button that sets only `min-height` is CROPPED — its content spills past its own
     border. Reset the inherited box on EVERY control here. This reproduces only in
     real Foundry; a mounted test cannot see it. */
  .bulk-action,
  .bulk-destroy,
  .bulk-text-button,
  .bulk-remove {
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    height: auto;
    margin: 0;
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  /* CraftButton's spec — the house action primitive — rather than a private fourth
     one: radius 8, an --accent border, 600/14, sized to its content in a row. */
  .bulk-action {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    min-height: 30px;
    padding: 6px 14px;
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .bulk-action:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  /* Destroy is deliberately NOT the primary: it is outlined in the danger ramp and
     sits left of the action the player is far more likely to want, so the destructive
     control never wins the eye or the muscle memory. */
  .bulk-destroy {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    min-height: 30px;
    padding: 6px 12px;
    border: 1px solid var(--fab-danger-border);
    border-radius: 8px;
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .bulk-destroy:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .bulk-action:disabled,
  .bulk-destroy:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    border-color: var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    filter: none;
  }

  /* An inline text control with no box of its own — the `.salvage-again` treatment. */
  .bulk-text-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 600;
  }

  .bulk-text-button:hover:not(:disabled) {
    color: var(--fab-text);
  }

  .bulk-text-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .bulk-remove {
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

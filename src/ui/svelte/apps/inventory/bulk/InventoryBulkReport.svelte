<!-- Svelte 5 runes mode -->
<!--
  What a finished bulk run did (issue 859): a banner rolling the whole batch up, a
  per-item list carrying each item's own outcome and its own rolled total, and the
  two aggregate lists the player actually cares about — what arrived in their pack
  and what did not.

  ## Row copy is derived from what was AWARDED, not from the success flag alone

  A routed salvage returns `success: true` for a success tier that has no
  `outcomeRouting` entry, and such a tier awards NOTHING. Reading the flag alone
  would print "Recovered" beside an empty "Added to your pack" — a visible lie, and
  one that would land in a published screenshot. So a succeeded item that awarded
  zero items takes its own copy ("Succeeded — nothing to recover") on the SAME
  success tone: the outcome table below stays the spine, this is one extra branch
  off it.

  ## Why `info` and `warning` are not folded into `danger`

  `waiting` (a time-gated salvage that has STARTED and finishes when the clock
  advances) and `misconfigured` (something only the GM can fix) are not failures,
  and the whole reason the engine grew explicit flags for them is so the player is
  not told they lost the item. Where two outcomes do share a tone they differ on
  BOTH icon and word, never on colour alone.

  ## Destroy reuses this

  A destroy run has no rolls and no awards, so the same three sections read
  "Destroyed" and "Still in your pack" — the second being the rows a `preDeleteItem`
  hook vetoed, which are still in the player's pack and are the ones they need to
  see.

  Props:
   - report: the store's `bulkReport` — plain data, already document-free.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import StatusPill from '../../../components/StatusPill.svelte';
  import InventoryBulkSection from './InventoryBulkSection.svelte';
  import InventoryBulkRow from './InventoryBulkRow.svelte';

  let { report = null } = $props();

  // outcome -> tone + glyph + copy. Eight outcomes over six tones, so tones are
  // shared; every sharing pair differs on icon AND word. `labelKey` is a whole
  // literal rather than a suffix on a shared prefix so the lang guards can see it:
  // the narrow one only requires a STRING (and so only catches a namespace-shadowing
  // sibling object) for a key spelled out in full.
  const OUTCOME_VISUALS = Object.freeze({
    succeeded: {
      tone: 'success',
      icon: 'fas fa-circle-check',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeSucceeded',
    },
    succeededEmpty: {
      tone: 'success',
      icon: 'fas fa-circle-check',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeSucceededEmpty',
    },
    failed: {
      tone: 'danger',
      icon: 'fas fa-circle-xmark',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeFailed',
    },
    waiting: {
      tone: 'info',
      icon: 'fas fa-hourglass-half',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeWaiting',
    },
    misconfigured: {
      tone: 'warning',
      icon: 'fas fa-triangle-exclamation',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeMisconfigured',
    },
    skipped: {
      tone: 'subtle',
      icon: 'fas fa-minus',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeSkipped',
    },
    // Not an ownership claim: the facade also lands here for a compendium-backed or
    // unlinked-token actor, neither of which is in `game.actors` at all.
    notPermitted: {
      tone: 'warning',
      icon: 'fas fa-lock',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeNotPermitted',
    },
    cancelled: {
      tone: 'subtle',
      icon: 'fas fa-ban',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeCancelled',
    },
    error: {
      tone: 'danger',
      icon: 'fas fa-bug',
      labelKey: 'FABRICATE.App.Inventory.Bulk.OutcomeError',
    },
  });

  const isDestroy = $derived(report?.mode === 'destroy');
  const items = $derived(Array.isArray(report?.items) ? report.items : []);
  const cancelled = $derived(report?.cancelled === true);
  const runError = $derived(report?.error ?? null);

  /** Everything one salvage row put in the player's pack. */
  function awardedOf(item) {
    return Array.isArray(item?.results) ? item.results : [];
  }

  /**
   * Sum like-named entries and order them by name, for both aggregate lists.
   *
   * A local array rather than a `Map`: `svelte/prefer-svelte-reactivity` flags any
   * mutated built-in `Map` in a component, and a `SvelteMap` here would be a
   * reactive container built and thrown away inside a pure derivation. The lists are
   * at most a few dozen rows, so the linear lookup costs nothing. The sort carries an
   * explicit comparator — never a bare `.sort()`.
   */
  function aggregate(entries) {
    const rows = [];
    for (const entry of entries || []) {
      const name = String(entry?.name ?? '');
      const existing = rows.find((row) => row.name === name);
      if (existing) {
        existing.quantity += Number(entry?.quantity) || 0;
        if (!existing.img && entry?.img) existing.img = entry.img;
        continue;
      }
      rows.push({ name, img: entry?.img ?? '', quantity: Number(entry?.quantity) || 0 });
    }
    return rows.sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * The visual key for one row. A null outcome means the row never reached the
   * engine, which is a cancellation when the batch was cancelled and a skip
   * otherwise; an outcome the vocabulary does not define is reported as an error
   * rather than silently rendered without a chip.
   */
  function visualKeyOf(item) {
    const outcome = item?.outcome ?? (cancelled ? 'cancelled' : 'skipped');
    if (!isDestroy && outcome === 'succeeded' && awardedOf(item).length === 0) {
      return 'succeededEmpty';
    }
    return OUTCOME_VISUALS[outcome] ? outcome : 'error';
  }

  // The banner counts read off the VISUAL key, not off `outcome`, for the same reason
  // the row copy does: a `succeeded` row that awarded nothing must not be counted as
  // "recovered" in a summary sitting directly above an "Added to your pack" list that
  // does not contain it. It counts as resolved-but-empty-handed instead.
  const recoveredCount = $derived(items.filter((item) => visualKeyOf(item) === 'succeeded').length);
  const emptyHandedCount = $derived(
    items.filter((item) => ['failed', 'error', 'succeededEmpty'].includes(visualKeyOf(item))).length
  );
  // Everything that did not resolve either way: waiting, misconfigured, skipped,
  // cancelled, notPermitted.
  const unresolvedCount = $derived(Math.max(0, items.length - recoveredCount - emptyHandedCount));

  const status = $derived.by(() => {
    if (items.length > 0 && recoveredCount === items.length) return 'succeeded';
    // Only an all-empty-handed batch is a failure. A batch that is entirely `waiting`
    // recovered nothing YET, and painting it danger would tell the player they lost
    // items a timer is still holding.
    if (items.length > 0 && emptyHandedCount === items.length) return 'failed';
    return 'mixed';
  });

  const bannerTone = $derived.by(() => {
    if (isDestroy) return 'accent';
    if (status === 'succeeded') return 'success';
    return status === 'failed' ? 'danger' : 'accent';
  });

  const bannerIcon = $derived.by(() => {
    if (isDestroy) return 'fas fa-trash';
    if (status === 'succeeded') return 'fas fa-circle-check';
    return status === 'failed' ? 'fas fa-circle-xmark' : 'fas fa-scale-balanced';
  });

  const bannerTitle = $derived.by(() => {
    if (isDestroy) return localize('FABRICATE.App.Inventory.Bulk.ReportDestroyTitle');
    if (status === 'succeeded')
      return localize('FABRICATE.App.Inventory.Bulk.ReportSucceededTitle');
    return localize(
      status === 'failed'
        ? 'FABRICATE.App.Inventory.Bulk.ReportFailedTitle'
        : 'FABRICATE.App.Inventory.Bulk.ReportMixedTitle'
    );
  });

  // Kept units are the ones a `preDeleteItem` hook refused: still in the pack, so
  // reported rather than counted as destroyed.
  const keptEntries = $derived(items.flatMap((item) => item?.vetoed ?? []));

  const bannerSummary = $derived.by(() => {
    if (isDestroy) {
      return localize('FABRICATE.App.Inventory.Bulk.ReportDestroySummary', {
        destroyed: Number(report?.unitsDeleted) || 0,
        kept: keptEntries.reduce((sum, entry) => sum + (Number(entry?.quantity) || 0), 0),
        skipped: items.filter((item) => item?.outcome === 'skipped').length,
      });
    }
    return localize('FABRICATE.App.Inventory.Bulk.ReportSummary', {
      succeeded: recoveredCount,
      failed: emptyHandedCount,
      other: unresolvedCount,
    });
  });

  // Destroy's "added" list is what actually left the pack; salvage's is what
  // arrived in it. One aggregate, two readings.
  const added = $derived(
    aggregate(items.flatMap((item) => (isDestroy ? (item?.items ?? []) : awardedOf(item))))
  );
  const addedTitle = $derived(
    localize(
      isDestroy
        ? 'FABRICATE.App.Inventory.Bulk.ReportDestroyedTitle'
        : 'FABRICATE.App.Inventory.Bulk.ReportAddedTitle'
    )
  );

  // Salvage's counterpart is the SOURCE rows that produced nothing — including a
  // `succeeded` row that awarded zero, which is why this reads off the visual key
  // rather than off `outcome`.
  const lost = $derived.by(() => {
    if (isDestroy) return aggregate(keptEntries);
    return items
      .filter((item) => ['failed', 'error', 'succeededEmpty'].includes(visualKeyOf(item)))
      .map((item) => ({ name: item?.name ?? '', img: item?.img ?? '', quantity: null }));
  });
  const lostTitle = $derived(
    localize(
      isDestroy
        ? 'FABRICATE.App.Inventory.Bulk.ReportKeptTitle'
        : 'FABRICATE.App.Inventory.Bulk.ReportNotRecoveredTitle'
    )
  );
</script>

<div class="bulk-report" data-inventory-bulk-report={isDestroy ? 'destroy' : 'salvage'}>
  <p class={`bulk-banner is-${bannerTone}`} data-inventory-bulk-banner={status}>
    <i class={bannerIcon} aria-hidden="true"></i>
    <span class="bulk-banner-text">
      <span class="bulk-banner-title">{bannerTitle}</span>
      <span class="bulk-banner-summary">{bannerSummary}</span>
    </span>
  </p>

  {#if cancelled}
    <p class="inventory-detail-empty-note" data-inventory-bulk-cancelled>
      {localize('FABRICATE.App.Inventory.Bulk.ReportCancelled')}
    </p>
  {/if}
  {#if runError}
    <p class="bulk-report-error" data-inventory-bulk-error>
      <i class="fas fa-bug" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Inventory.Bulk.ReportError', { message: runError })}</span>
    </p>
  {/if}

  {#if items.length > 0}
    <InventoryBulkSection
      title={localize('FABRICATE.App.Inventory.Bulk.ReportSubjectsTitle')}
      attrs={{ 'data-inventory-bulk-subjects': '' }}
    >
      {#each items as item, index (item.key ?? `${item.componentId ?? ''}:${index}`)}
        {@const visual = OUTCOME_VISUALS[visualKeyOf(item)]}
        <InventoryBulkRow
          img={item.img}
          name={item.name}
          note={item.message ?? ''}
          attrs={{ 'data-inventory-bulk-subject': visualKeyOf(item) }}
        >
          {#snippet trailing()}
            {#if Number.isFinite(item.rollValue)}
              <span class="bulk-roll">
                <span class="bulk-roll-label"
                  >{localize('FABRICATE.App.Inventory.Bulk.ReportRoll')}</span
                >
                <span class="bulk-roll-value">{item.rollValue}</span>
              </span>
            {/if}
            <StatusPill tone={visual.tone} icon={visual.icon} label={localize(visual.labelKey)} />
          {/snippet}
        </InventoryBulkRow>
      {/each}
    </InventoryBulkSection>
  {/if}

  {#if added.length > 0}
    <InventoryBulkSection title={addedTitle} attrs={{ 'data-inventory-bulk-added': '' }}>
      {#each added as entry (entry.name)}
        <InventoryBulkRow img={entry.img} name={entry.name}>
          {#snippet trailing()}
            <span class="bulk-quantity">×{entry.quantity}</span>
          {/snippet}
        </InventoryBulkRow>
      {/each}
    </InventoryBulkSection>
  {:else if !isDestroy}
    <p class="inventory-detail-empty-note" data-inventory-bulk-nothing-added>
      {localize('FABRICATE.App.Inventory.Bulk.ReportNothingAdded')}
    </p>
  {/if}

  {#if lost.length > 0}
    <InventoryBulkSection title={lostTitle} attrs={{ 'data-inventory-bulk-lost': '' }}>
      {#each lost as entry, index (`${entry.name}:${index}`)}
        <InventoryBulkRow img={entry.img} name={entry.name}>
          {#snippet trailing()}
            {#if entry.quantity !== null}
              <span class="bulk-quantity">×{entry.quantity}</span>
            {/if}
          {/snippet}
        </InventoryBulkRow>
      {/each}
    </InventoryBulkSection>
  {/if}
</div>

<style>
  .bulk-report {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
  }

  /* The salvage panel's banner shape (icon + title over a quiet rule), carrying a
     COUNT roll-up rather than a single outcome — which is why the one-outcome
     `.salvage-ribbon` was not extracted for it. */
  .bulk-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .bulk-banner.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  /* "Mixed" is neither of the other two, so it takes the neutral accent rather than a
     third colour ramp invented for "some of each" — the same call the aggregate chat
     card makes for its own mixed state. Destroy shares it: a completed destroy is
     what the player asked for, not a success or a failure. */
  .bulk-banner.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .bulk-banner.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  .bulk-banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .bulk-banner-title {
    font-size: 11.5px;
    font-weight: 700;
  }

  .bulk-banner-summary {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--fab-text-muted);
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* Two signals, never colour alone: the danger ramp AND a glyph. */
  .bulk-report-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--fab-danger-text);
  }

  /* A rolled total reads as DATA, so it takes the mono numeric treatment; the word
     beside it is prose and stays in the body face. */
  .bulk-roll {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }

  .bulk-roll-label {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fab-text-subtle);
  }

  .bulk-roll-value {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 700;
    color: var(--fab-text);
  }

  .bulk-quantity {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 700;
    color: var(--fab-text-secondary);
  }
</style>

<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskDrops renders the right-column "What you might find" section for
  the selected task: the reward-selection and event hints, the drops as one shared
  `YieldScale` in authored row order (issue 1644), and one `RowDisclosure` beneath
  the scale that opens every drop's modifier breakdown, each headed by its drop.

  Reward selection takes rows by authored rank, so the list never re-sorts by chance.

  Data comes from `services.getGatheringDropBreakdown` (resolved lazily by the
  parent for the selected task); `breakdown` is
  `{ drops, awardMode, awardLimit, eventPolicy }`. The section renders nothing
  when there are no drops, not loading and not in error.

  THE FOURTH STATE IS THE FETCH FAILING (issue 1514). The parent's `.catch` used to
  clear the breakdown and lower the loading flag, which renders exactly what "this
  task has no drops" renders — so a broken services call and an empty drop table were
  the same picture, and a player had no way to tell that anything had gone wrong. The
  parent now passes `error` and this section says so, at `data-gathering-drops-state="error"`.
-->
<script>
  import Kicker from '../../components/Kicker.svelte';
  import Notice from '../../components/Notice.svelte';
  import RowDisclosure from '../../components/RowDisclosure.svelte';
  import YieldScale from '../../components/YieldScale.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent as pct } from '../../util/gatheringFormat.js';
  import GatheringDropModifiers from './GatheringDropModifiers.svelte';

  let { breakdown = null, loading = false, error = false } = $props();

  /** The drop tile's stand-in when a drop record carries no artwork of its own. */
  const DEFAULT_DROP_IMG = 'icons/svg/item-bag.svg';
  /** A drop the world left nameless still has to be named, so the row names the kind. */
  const NAMELESS_DROP = 'FABRICATE.Labels.UnknownComponent';

  const drops = $derived(Array.isArray(breakdown?.drops) ? breakdown.drops : []);
  const hasDrops = $derived(drops.length > 0);
  const entries = $derived(
    drops.map((drop, index) => ({
      id: String(drop.id ?? index),
      name: drop.name || localize(NAMELESS_DROP),
      art: drop.img || DEFAULT_DROP_IMG,
      qty: Number(drop.quantity) || 1,
      chance: pct(drop.finalChance),
      drop,
    }))
  );
  // No threshold sentence: the dense row draws it inline, which in this column wraps every name.
  const scaleLabels = {
    quantity: (entry) => localize('FABRICATE.App.Gathering.Detail.DropQuantity', { x: entry.qty }),
    chance: (entry) => `${entry.chance}%`,
  };

  const awardHint = $derived.by(() => {
    switch (breakdown?.awardMode) {
      case 'allDrops':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeAll');
      case 'limitedDrops':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeLimited', {
          x: Number(breakdown?.awardLimit ?? 1),
        });
      case 'highestRankedDrop':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeHighest');
      default:
        return '';
    }
  });
  const eventHint = $derived(
    breakdown?.eventPolicy === 'failureWithEvent'
      ? localize('FABRICATE.App.Gathering.Detail.EventImpactFailure')
      : breakdown?.eventPolicy
        ? localize('FABRICATE.App.Gathering.Detail.EventImpactSuccess')
        : ''
  );

  const breakdownLabel = localize('FABRICATE.App.Gathering.Detail.ChanceBreakdown');
  const instanceId = $props.id();
  const regionId = `fab-drop-breakdown-${instanceId}`;
  const labelId = `${regionId}-label`;
  let breakdownOpen = $state(false);
</script>

{#if loading}
  <div class="gathering-task-drops" data-gathering-drops data-gathering-drops-state="loading">
    <Kicker as="p">{localize('FABRICATE.App.Gathering.Detail.WhatYouMightFind')}</Kicker>
    <p class="gathering-task-drops-loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {localize('FABRICATE.App.Gathering.Detail.DropsLoading')}
    </p>
  </div>
{:else if error}
  <div class="gathering-task-drops" data-gathering-drops data-gathering-drops-state="error">
    <Kicker as="p">{localize('FABRICATE.App.Gathering.Detail.WhatYouMightFind')}</Kicker>
    <!-- TITLE AND DETAIL, not one string in `title` (issue 1514). `Notice`'s title is
         12px/600 in the tone's ink with no declared `line-height`, which is a HEADING slot;
         the whole 120-character two-sentence string handed to it rendered as a three-line
         shouty heading. The sentences already split at the seam the primitive draws — what
         went wrong, then what to do next — which is exactly `detail`'s stated job, and
         `FabricateAppRoot`'s companion fault strip splits its own copy the same way. -->
    <Notice
      tone="danger"
      title={localize('FABRICATE.App.Gathering.Detail.DropsError')}
      detail={localize('FABRICATE.App.Gathering.Detail.DropsErrorDetail')}
      data-gathering-drops-error=""
    />
  </div>
{:else if hasDrops}
  <div class="gathering-task-drops" data-gathering-drops data-gathering-drops-state="ready">
    <Kicker as="p">{localize('FABRICATE.App.Gathering.Detail.WhatYouMightFind')}</Kicker>

    {#if awardHint !== '' || eventHint !== ''}
      <ul class="gathering-task-drops-hints" data-gathering-drops-hints>
        {#if awardHint !== ''}
          <li><i class="fas fa-gift" aria-hidden="true"></i><span>{awardHint}</span></li>
        {/if}
        {#if eventHint !== ''}
          <li><i class="fas fa-skull" aria-hidden="true"></i><span>{eventHint}</span></li>
        {/if}
      </ul>
    {/if}

    <YieldScale {entries} order="authored" labels={scaleLabels} />

    <!-- One labelled row, its chevron beside the label rather than inside a button. -->
    <div class="gathering-task-drops-breakdown" data-gathering-drops-breakdown>
      <span
        class="gathering-task-drops-breakdown-label"
        id={labelId}
        data-gathering-drops-breakdown-label>{breakdownLabel}</span
      >
      <RowDisclosure
        expanded={breakdownOpen}
        controls={breakdownOpen ? regionId : ''}
        ariaLabel={breakdownLabel}
        data-gathering-drops-disclosure=""
        onToggle={(next) => (breakdownOpen = next)}
      />
    </div>
    {#if breakdownOpen}
      <div
        class="gathering-task-drops-breakdown-region"
        id={regionId}
        role="group"
        aria-labelledby={labelId}
      >
        {#each entries as entry (entry.id)}
          <GatheringDropModifiers drop={entry.drop} name={entry.name} />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .gathering-task-drops {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-surface);
  }

  .gathering-task-drops-loading {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drops-hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drops-hints li {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .gathering-task-drops-hints i {
    font-size: 10px;
  }

  .gathering-task-drops-breakdown {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .gathering-task-drops-breakdown-label {
    color: var(--fab-text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .gathering-task-drops-breakdown-region {
    display: flex;
    flex-direction: column;
  }
</style>

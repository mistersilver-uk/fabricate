<!-- Svelte 5 runes mode -->
<!--
  OutcomeTierTable adapts a routed-by-check recipe's tiers onto the shared `OutcomeLadder`: one row
  per distinct result, its merged tier names joined and each award a list row. The builder collapses
  tiers that award the same, so a row's `ids` may hold several, and `reachedId`, a successful
  roll's recorded outcome, marks the row it was merged into. Crafting tiers carry no band.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import Kicker from '../../../components/Kicker.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import OutcomeLadder from '../../../components/OutcomeLadder.svelte';

  let { tiers = [], reachedId = null } = $props();

  /** One award as a row: an item's count, a reward's own amount, a choice group's members. */
  function awardRow(item) {
    const group = item?.kind === 'group';
    return {
      name: item?.name,
      ...resolveCraftingArt(item?.img, item?.glyph),
      quantity: group ? null : (item?.amountText ?? `×${item?.qty ?? 1}`),
      detail: group ? (item.members ?? []).map((member) => member.name).join(' · ') : '',
      props: { 'data-award-kind': item?.kind ?? 'component' },
    };
  }

  const rows = $derived(
    (Array.isArray(tiers) ? tiers : []).map((tier) => ({
      id: tier.id,
      ids: tier.ids,
      name: (tier.names ?? []).join(', '),
      fail: !tier.success,
      props: { 'data-tier-success': tier.success ? 'true' : 'false' },
      yields: (tier.awardedResults ?? []).map(awardRow),
    }))
  );
</script>

<section class="crafting-tiers" data-recipe-section="outcome-tiers">
  <Kicker as="p">
    {localize('FABRICATE.App.Crafting.Detail.OutcomesTitle')}
  </Kicker>
  {#if rows.length > 0}
    <OutcomeLadder
      tiers={rows}
      emptyTierText={localize('FABRICATE.App.Crafting.Detail.TierNoAward')}
      {reachedId}
      reachedLabel={localize('FABRICATE.App.Crafting.Detail.YourRoll')}
    />
  {:else}
    <EmptyState note hint={localize('FABRICATE.App.Crafting.Detail.NoOutcomes')} />
  {/if}
</section>

<style>
  .crafting-tiers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>

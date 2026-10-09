<!-- Svelte 5 runes mode -->
<!--
  EssencePoolPanel adapts `craftability.essencePool` onto the shared `EssencePool` (issue 1644): one
  allocation funds every essence requirement in the set, one bar per essence and one carrier list.
  A carrier's stepper maxes at `ownedUnits` (`capAtHeld`), the units left after the set's
  non-essence plan has claimed, so the player can over-fund deliberately but never infeasibly.
  The adapter owns the empty-carrier note and the "Your selection" recap beneath the pool.
-->
<script>
  import { SvelteMap } from 'svelte/reactivity';
  import Medallion from '../../../components/Medallion.svelte';
  import EssencePool from '../../../components/EssencePool.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { essenceTintToken } from '../../../util/essenceTint.js';
  import EssenceContribution from './EssenceContribution.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';

  let {
    // `craftability.essencePool` — requirements, carriers, allocation, suggested.
    pool = null,
    readOnly = false,
    onAllocate = null,
  } = $props();

  const requirements = $derived(Array.isArray(pool?.requirements) ? pool.requirements : []);
  const allCarriers = $derived(Array.isArray(pool?.carriers) ? pool.carriers : []);
  // A listed carrier must contribute an essence the set needs; one that funds nothing here would
  // read only "You own N" and leave the player unable to tell what it does.
  const carriers = $derived(
    allCarriers.filter((carrier) =>
      requirements.some((requirement) => Number(carrier?.perUnit?.[requirement.essenceId]) > 0)
    )
  );
  const allocated = $derived(
    allCarriers.filter((carrier) => Number(carrier?.allocatedUnits ?? 0) > 0)
  );
  const title = $derived(
    requirements.length === 1
      ? localize('FABRICATE.App.Crafting.Pool.Title')
      : localize('FABRICATE.App.Crafting.Pool.SharedTitle', { count: requirements.length })
  );

  const byEssenceId = $derived(
    new Map(requirements.map((requirement) => [requirement.essenceId, requirement]))
  );
  const byItemKey = $derived(new Map(carriers.map((carrier) => [carrier.itemKey, carrier])));
  const allocation = $derived(
    Object.fromEntries(
      carriers.map((carrier) => [carrier.itemKey, Number(carrier.allocatedUnits) || 0])
    )
  );

  const sources = $derived(
    carriers.map((carrier) => ({
      id: carrier.itemKey,
      label: carrier.name,
      ...resolveCraftingArt(carrier.img, 'fa-solid fa-cube'),
      props: { 'data-essence-carrier': carrier.itemKey },
      inputProps: { 'data-essence-allocation': carrier.itemKey },
    }))
  );

  // Twelve significant digits absorb binary drift, matching the pool's own sums.
  function exact(value) {
    return Number(value.toPrecision(12));
  }

  function meterState(delivered, need) {
    if (need <= 0 || delivered >= need) return 'met';
    return delivered > 0 ? 'partial' : 'short';
  }

  // One threshold per essence: requirements naming the same essence draw on one budget, so their
  // needs and deliveries sum here and the met/partial/short hook describes the bar actually drawn.
  const thresholds = $derived.by(() => {
    const byEssence = new SvelteMap();
    for (const requirement of requirements) {
      const entry = byEssence.get(requirement.essenceId) ?? { requirement, need: 0, delivered: 0 };
      entry.need = exact(entry.need + (Number(requirement.need) || 0));
      entry.delivered = exact(entry.delivered + (Number(requirement.delivered) || 0));
      byEssence.set(requirement.essenceId, entry);
    }
    return [...byEssence.values()].map(({ requirement, need, delivered }) => {
      const tint = essenceTintToken(requirement.colorToken);
      return {
        essence: requirement.essenceId,
        amount: need,
        icon: normalizeEssenceIcon(requirement.icon),
        tint,
        sources,
        props: {
          'data-essence-meter': requirement.essenceId,
          'data-essence-meter-state': meterState(delivered, need),
          'data-essence-meter-tint': tint || undefined,
        },
      };
    });
  });

  function ownedUnits(itemKey) {
    return Number(byItemKey.get(itemKey)?.ownedUnits) || 0;
  }

  function carrierReading(_source, contributions, held) {
    return [
      ...contributions.map(
        (entry) =>
          `+${localize('FABRICATE.App.Crafting.Pool.Contribution', { amount: entry.amount, name: entry.label })}`
      ),
      localize('FABRICATE.App.Crafting.Pool.Owned', { count: held }),
    ].join(' · ');
  }

  // Every essence one recap row's units yield; an essence the set does not need stays muted.
  function contributionsOf(carrier) {
    const perUnit = carrier?.perUnit && typeof carrier.perUnit === 'object' ? carrier.perUnit : {};
    const units = Number(carrier?.allocatedUnits) || 0;
    return Object.keys(perUnit).map((essenceId) => {
      const requirement = byEssenceId.get(essenceId) ?? null;
      return {
        essenceId,
        name: requirement?.name || essenceId,
        icon: requirement?.icon ?? null,
        colorToken: requirement?.colorToken ?? null,
        amount: Number(perUnit[essenceId] ?? 0) * units,
        required: Boolean(requirement),
      };
    });
  }
</script>

{#if requirements.length > 0}
  <section class="essence-pool-panel" data-recipe-section="essence-pool">
    <EssencePool
      {thresholds}
      {allocation}
      capAtHeld
      locked={readOnly}
      onStep={(itemKey, _delta, units) => onAllocate?.(itemKey, units)}
      yield={(itemKey, essenceId) => Number(byItemKey.get(itemKey)?.perUnit?.[essenceId]) || 0}
      held={ownedUnits}
      spare={(itemKey) => Math.max(0, ownedUnits(itemKey) - (Number(allocation[itemKey]) || 0))}
      essenceLabel={(essenceId) => byEssenceId.get(essenceId)?.name || essenceId}
      sourceReading={carrierReading}
      overshootLabel={(essence, amount) =>
        localize('FABRICATE.App.Crafting.Pool.Overshoot', { essence, amount })}
      meterValueLabel={(delivered, need) =>
        localize('FABRICATE.App.Crafting.Pool.MeterValue', { delivered, need })}
      allocationLabel={(source) =>
        localize('FABRICATE.App.Crafting.Pool.Allocate', { name: source.label })}
      decrementLabel={(source) =>
        localize('FABRICATE.App.Crafting.Pool.AllocateLess', { name: source.label })}
      incrementLabel={(source) =>
        localize('FABRICATE.App.Crafting.Pool.AllocateMore', { name: source.label })}
      label={title}
      hint={localize('FABRICATE.App.Crafting.Pool.AddComponents')}
    />
    {#if carriers.length === 0}
      <EmptyState note hint={localize('FABRICATE.App.Crafting.Pool.NoCarriers')} />
    {/if}

    {#if allocated.length > 0}
      <Kicker as="p">{localize('FABRICATE.App.Crafting.Pool.YourSelection')}</Kicker>
      <ul class="essence-pool-picked">
        {#each allocated as carrier (carrier.itemKey)}
          <li class="essence-pool-picked-row" data-essence-picked={carrier.itemKey}>
            <Medallion
              {...resolveCraftingArt(carrier.img, 'fa-solid fa-cube')}
              alt=""
              size={22}
              glyph={10}
            />
            <span class="essence-pool-picked-name">{carrier.name}</span>
            <span class="essence-pool-picked-count">×{carrier.allocatedUnits}</span>
            <span class="essence-pool-picked-contributions">
              {#each contributionsOf(carrier) as contribution (contribution.essenceId)}
                <EssenceContribution
                  icon={contribution.icon}
                  name={contribution.name}
                  amount={contribution.amount}
                  required={contribution.required}
                  colorToken={contribution.colorToken}
                />
              {/each}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .essence-pool-panel {
    display: grid;
    gap: var(--fab-space-2);
  }

  .essence-pool-picked {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .essence-pool-picked-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .essence-pool-picked-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .essence-pool-picked-count {
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
  }

  .essence-pool-picked-contributions {
    display: inline-flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--fab-space-2);
  }
</style>

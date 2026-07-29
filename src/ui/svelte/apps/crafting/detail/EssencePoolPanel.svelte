<!-- Svelte 5 runes mode -->
<!--
  EssencePoolPanel is the chooser an essence slot opens (issue 917): the ONE shared,
  player-editable pool that funds every essence requirement in an ingredient set on
  one step — the granularity at which the engine actually consumes.

  Three regions: a have/need meter per requirement, a stepper row per carrier the
  player can spend units of, and a recap of what those steppers currently commit.

  The meter is built HERE rather than reusing the gathering ChanceBar: that is a 0–1
  percentage meter which hard-codes `aria-valuemax="100"`, prints a percentage and
  has one flat fill, whereas a `2 / 4` ratio needs `aria-valuemax = need`, a
  caller-supplied readout and a met/partial/short tone. Importing it would also drag
  a gathering util into the crafting harnesses and invert the app layering.

  A carrier's stepper maxes at `ownedUnits` — the units left AFTER the set's
  non-essence plan has claimed — never the raw stack quantity, so the player cannot
  step themselves into an infeasible allocation.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import CraftingThumb from '../CraftingThumb.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import EssenceContribution from './EssenceContribution.svelte';

  let {
    // `craftability.essencePool` — requirements, carriers, allocation, suggested.
    pool = null,
    readOnly = false,
    panelId = null,
    labelledBy = null,
    onAllocate = null
  } = $props();

  const requirements = $derived(Array.isArray(pool?.requirements) ? pool.requirements : []);
  const carriers = $derived(Array.isArray(pool?.carriers) ? pool.carriers : []);
  const allocated = $derived(carriers.filter((carrier) => Number(carrier?.allocatedUnits ?? 0) > 0));
  const title = $derived(
    requirements.length === 1
      ? localize('FABRICATE.App.Crafting.Pool.Title')
      : localize('FABRICATE.App.Crafting.Pool.SharedTitle', { count: requirements.length })
  );

  const byEssenceId = $derived(
    new Map(requirements.map((requirement) => [requirement.essenceId, requirement]))
  );

  function tintOf(requirement) {
    return requirement?.colorToken ? `--fab-chip-color: var(--fab-tag-${requirement.colorToken})` : '';
  }

  function meterState(requirement) {
    const delivered = Number(requirement?.delivered ?? 0);
    const need = Number(requirement?.need ?? 0);
    if (need <= 0 || delivered >= need) return 'met';
    return delivered > 0 ? 'partial' : 'short';
  }

  function meterWidth(requirement) {
    const need = Number(requirement?.need ?? 0);
    if (need <= 0) return '100%';
    const pct = Math.min(100, Math.round((Number(requirement?.delivered ?? 0) / need) * 100));
    return `${pct}%`;
  }

  // Per-unit essence yields of one carrier, multiplied by the units currently
  // allocated. Presentation (icon normalization, tint, copy) belongs to
  // EssenceContribution; this only says WHICH essence and HOW MUCH.
  function contributionsOf(carrier, units) {
    const perUnit = carrier?.perUnit && typeof carrier.perUnit === 'object' ? carrier.perUnit : {};
    return Object.keys(perUnit).map((essenceId) => {
      const requirement = byEssenceId.get(essenceId) ?? null;
      return {
        essenceId,
        name: requirement?.name || essenceId,
        icon: requirement?.icon ?? null,
        colorToken: requirement?.colorToken ?? null,
        amount: Number(perUnit[essenceId] ?? 0) * units,
        required: Boolean(requirement)
      };
    });
  }
</script>

{#if requirements.length > 0}
  <section
    class="essence-pool"
    id={panelId ?? undefined}
    aria-labelledby={labelledBy ?? undefined}
    data-recipe-section="essence-pool"
  >
    <p class="crafting-detail-section-title">{title}</p>

    <div class="essence-pool-meters">
      {#each requirements as requirement (requirement.groupId ?? requirement.essenceId)}
        {@const state = meterState(requirement)}
        <div
          class={`essence-pool-meter is-${state}`}
          style={tintOf(requirement)}
          data-essence-meter={requirement.essenceId}
          data-essence-meter-state={state}
        >
          <div class="essence-pool-meter-head">
            <span class="essence-pool-meter-badge">
              <i class={normalizeEssenceIcon(requirement.icon)} aria-hidden="true"></i>
            </span>
            <span class="essence-pool-meter-name">{requirement.name}</span>
            <span class="essence-pool-meter-ratio"
              >{requirement.delivered ?? 0}/{requirement.need ?? 0}</span
            >
          </div>
          <div
            class="essence-pool-bar"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax={requirement.need ?? 0}
            aria-valuenow={requirement.delivered ?? 0}
            aria-label={localize('FABRICATE.App.Crafting.Pool.Meter', {
              name: requirement.name,
              delivered: requirement.delivered ?? 0,
              need: requirement.need ?? 0
            })}
          >
            <span class="essence-pool-bar-fill" style={`width:${meterWidth(requirement)}`}></span>
          </div>
        </div>
      {/each}
    </div>

    <p class="essence-pool-subtitle">{localize('FABRICATE.App.Crafting.Pool.AddComponents')}</p>
    {#if carriers.length === 0}
      <p class="essence-pool-empty">{localize('FABRICATE.App.Crafting.Pool.NoCarriers')}</p>
    {:else}
      <ul class="essence-pool-carriers">
        {#each carriers as carrier (carrier.itemKey)}
          <li class="essence-pool-carrier" data-essence-carrier={carrier.itemKey}>
            <CraftingThumb src={carrier.img} alt="" size={30} glyph="fa-solid fa-cube" />
            <span class="essence-pool-carrier-body">
              <span class="essence-pool-carrier-name">{carrier.name}</span>
              <span class="essence-pool-carrier-facts">
                {#each contributionsOf(carrier, 1) as contribution (contribution.essenceId)}
                  <EssenceContribution
                    icon={contribution.icon}
                    name={contribution.name}
                    amount={contribution.amount}
                    required={contribution.required}
                    colorToken={contribution.colorToken}
                  />
                {/each}
                <span class="essence-pool-owned"
                  >{localize('FABRICATE.App.Crafting.Pool.Owned', {
                    count: carrier.ownedUnits ?? 0
                  })}</span
                >
              </span>
            </span>
            <Stepper
              value={carrier.allocatedUnits ?? 0}
              min={0}
              max={carrier.ownedUnits ?? 0}
              density="comfortable"
              disabled={readOnly}
              ariaLabel={localize('FABRICATE.App.Crafting.Pool.Allocate', { name: carrier.name })}
              decrementLabel={localize('FABRICATE.App.Crafting.Pool.AllocateLess', {
                name: carrier.name
              })}
              incrementLabel={localize('FABRICATE.App.Crafting.Pool.AllocateMore', {
                name: carrier.name
              })}
              inputProps={{ 'data-essence-allocation': carrier.itemKey }}
              onChange={(units) => onAllocate?.(carrier.itemKey, units)}
            />
          </li>
        {/each}
      </ul>
    {/if}

    {#if allocated.length > 0}
      <p class="essence-pool-subtitle">{localize('FABRICATE.App.Crafting.Pool.YourSelection')}</p>
      <ul class="essence-pool-picked">
        {#each allocated as carrier (carrier.itemKey)}
          <li class="essence-pool-picked-row" data-essence-picked={carrier.itemKey}>
            <CraftingThumb src={carrier.img} alt="" size={24} glyph="fa-solid fa-cube" />
            <span class="essence-pool-picked-name">{carrier.name}</span>
            <span class="essence-pool-picked-count">×{carrier.allocatedUnits}</span>
            <span class="essence-pool-picked-contributions">
              {#each contributionsOf(carrier, carrier.allocatedUnits) as contribution (contribution.essenceId)}
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
  .essence-pool {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-accent-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  /* Reflow rather than crush: three or more requirements wrap onto further rows
     instead of squeezing every bar below its readable width. */
  .essence-pool-meters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  /* The one shipped tinted-surface idiom (EnvironmentCard / GatheringDetail /
     GatheringEventDetail / Chip): 16% fill over the surface the card sits on, 50%
     border, tint on the GLYPH only. The rail renders inside .fabricate-app cards, so
     it mixes against --fab-surface-raised rather than theme root. */
  .essence-pool-meter {
    flex: 1 1 180px;
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--fab-chip-color, var(--fab-accent)) 50%, transparent);
    border-radius: 9px;
    background: color-mix(
      in srgb,
      var(--fab-chip-color, var(--fab-accent)) 16%,
      var(--fab-surface-raised)
    );
  }

  /* All three states of the published slot-state matrix are declared, so none of them
     is an implicit default a later edit can silently retune. `partial` is the authored
     tint of the base rule above; `met` and `short` replace it with the success and
     danger families, so zero-delivered reads as an error rather than as a short bar. */
  .essence-pool-meter.is-met {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .essence-pool-meter.is-short {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .essence-pool-meter-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: var(--fab-space-2);
  }

  .essence-pool-meter-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: var(--fab-surface-raised);
    color: var(--fab-chip-color, var(--fab-accent));
    font-size: 11px;
  }

  .essence-pool-meter-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .essence-pool-meter-ratio {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .essence-pool-bar {
    height: 6px;
    border-radius: 999px;
    background: var(--fab-surface-active);
    overflow: hidden;
  }

  .essence-pool-bar-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-chip-color, var(--fab-accent));
    transition: width 0.2s ease;
  }

  .essence-pool-meter.is-met .essence-pool-bar-fill {
    background: var(--fab-success);
  }

  /* `partial` restates the tint the base rule already paints, so the three states of the
     matrix are declared together rather than one of them being an implicit default. */
  .essence-pool-meter.is-partial .essence-pool-bar-fill {
    background: var(--fab-chip-color, var(--fab-accent));
  }

  .essence-pool-meter.is-short .essence-pool-bar-fill {
    background: var(--fab-danger);
  }

  @media (prefers-reduced-motion: reduce) {
    .essence-pool-bar-fill {
      transition: none;
    }
  }

  .essence-pool-subtitle {
    margin: var(--fab-space-1) 0 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--fab-text-subtle);
  }

  .essence-pool-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .essence-pool-carriers,
  .essence-pool-picked {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .essence-pool-carrier {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: 6px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-raised);
  }

  .essence-pool-carrier-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .essence-pool-carrier-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .essence-pool-carrier-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .essence-pool-owned {
    font-size: 10px;
    color: var(--fab-text-subtle);
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
    font-weight: 700;
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

  /* Matches the sibling IO section headers (the IngredientOptionSelector precedent:
     Svelte scopes CSS per component, so the rule is redefined rather than shared). */
  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>

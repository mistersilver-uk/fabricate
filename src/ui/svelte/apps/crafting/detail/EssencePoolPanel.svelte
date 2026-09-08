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
  import Medallion from '../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { essenceTintToken } from '../../../util/essenceTint.js';
  import Stepper from '../../../components/Stepper.svelte';
  import EssenceContribution from './EssenceContribution.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import FillBar from '../../../components/FillBar.svelte';
  import EmptyState from '../../manager/EmptyState.svelte';

  let {
    // `craftability.essencePool` — requirements, carriers, allocation, suggested.
    pool = null,
    readOnly = false,
    panelId = null,
    labelledBy = null,
    onAllocate = null,
  } = $props();

  const requirements = $derived(Array.isArray(pool?.requirements) ? pool.requirements : []);
  const carriers = $derived(Array.isArray(pool?.carriers) ? pool.carriers : []);
  const allocated = $derived(
    carriers.filter((carrier) => Number(carrier?.allocatedUnits ?? 0) > 0)
  );
  const title = $derived(
    requirements.length === 1
      ? localize('FABRICATE.App.Crafting.Pool.Title')
      : localize('FABRICATE.App.Crafting.Pool.SharedTitle', { count: requirements.length })
  );

  const byEssenceId = $derived(
    new Map(requirements.map((requirement) => [requirement.essenceId, requirement]))
  );

  // The essence's own colour, folded through the shared sanitiser rather than interpolated
  // raw: `colorToken` reaches here from world data, and it is being spliced into a `style`
  // string. Everything else in the player app already spends the colour through this fold.
  function tintTokenOf(requirement) {
    return essenceTintToken(requirement?.colorToken);
  }

  function tintOf(requirement) {
    const token = tintTokenOf(requirement);
    return token ? `--fab-chip-color: var(--fab-tag-${token})` : '';
  }

  function meterState(requirement) {
    const delivered = Number(requirement?.delivered ?? 0);
    const need = Number(requirement?.need ?? 0);
    if (need <= 0 || delivered >= need) return 'met';
    return delivered > 0 ? 'partial' : 'short';
  }

  function meterPercent(requirement) {
    const need = Number(requirement?.need ?? 0);
    if (need <= 0) return 100;
    return Math.min(100, Math.round((Number(requirement?.delivered ?? 0) / need) * 100));
  }

  /**
   * The bar's SEMANTIC tone, for a requirement whose essence declares no colour.
   *
   * These are the three fills the deleted `.essence-pool-bar-fill` state rules painted, moved
   * from CSS onto the prop `FillBar` publishes for exactly this: a scoped block in this file
   * cannot reach a child component's element, so the state that used to be a descendant
   * selector has to arrive as data. `short` is `delivered === 0`, so its danger fill renders at
   * 0% width and was never visible — it is stated anyway, because the three states of the
   * matrix are declared together here as they were there.
   *
   * @param {object} requirement one pool requirement
   * @returns {string} a `FillBar` tone
   */
  function meterTone(requirement) {
    const state = meterState(requirement);
    if (state === 'met') return 'success';
    return state === 'short' ? 'danger' : 'accent';
  }

  /**
   * A COLOURED essence keeps its own colour in every state, so the bar you fill reads as the
   * same essence as the pip you filled it from — which is what the deleted `has-tint` triple
   * said in CSS. `--fab-chip-color` is declared by `tintOf` on the meter this bar sits in and
   * INHERITS into the bar, so the caller hands the primitive a reference rather than a value
   * and no colour literal reaches this file.
   *
   * Losing the green does not lose the STATE: the ratio beside the name reads `5/5`, the fill
   * reaches full width, and `data-essence-meter-state` still says `met`.
   *
   * @param {object} requirement one pool requirement
   * @returns {string} a CSS colour reference, or '' to leave the tone in charge
   */
  function meterColor(requirement) {
    return tintTokenOf(requirement) ? 'var(--fab-chip-color)' : '';
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
        required: Boolean(requirement),
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
    <Kicker as="p">{title}</Kicker>

    <div class="essence-pool-meters">
      {#each requirements as requirement (requirement.groupId ?? requirement.essenceId)}
        {@const state = meterState(requirement)}
        <div
          class={`essence-pool-meter is-${state}`}
          class:has-tint={Boolean(tintTokenOf(requirement))}
          style={tintOf(requirement)}
          data-essence-meter={requirement.essenceId}
          data-essence-meter-state={state}
          data-essence-meter-tint={tintTokenOf(requirement) || undefined}
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
          <!-- THE SHARED `FillBar` (issue 1514), inside the wrapper that keeps the ARIA. The
               primitive is a LEAF by contract — no caption, no readout, no `role`, no `aria-*`
               — so the `progressbar` role and all three `aria-value*` attributes stay on this
               caller's own element, which is the only thing that element still does. -->
          <div
            class="essence-pool-bar"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax={requirement.need ?? 0}
            aria-valuenow={requirement.delivered ?? 0}
            aria-label={localize('FABRICATE.App.Crafting.Pool.Meter', {
              name: requirement.name,
              delivered: requirement.delivered ?? 0,
              need: requirement.need ?? 0,
            })}
          >
            <FillBar
              size="sm"
              value={meterPercent(requirement)}
              tone={meterTone(requirement)}
              color={meterColor(requirement)}
            />
          </div>
        </div>
      {/each}
    </div>

    <p class="essence-pool-subtitle">
      <Kicker as="span">{localize('FABRICATE.App.Crafting.Pool.AddComponents')}</Kicker>
    </p>
    {#if carriers.length === 0}
      <EmptyState note hint={localize('FABRICATE.App.Crafting.Pool.NoCarriers')} />
    {:else}
      <ul class="essence-pool-carriers">
        {#each carriers as carrier (carrier.itemKey)}
          <li class="essence-pool-carrier" data-essence-carrier={carrier.itemKey}>
            <Medallion
              {...resolveCraftingArt(carrier.img, 'fa-solid fa-cube')}
              alt=""
              size={30}
              glyph={13.5}
            />
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
                    count: carrier.ownedUnits ?? 0,
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
                name: carrier.name,
              })}
              incrementLabel={localize('FABRICATE.App.Crafting.Pool.AllocateMore', {
                name: carrier.name,
              })}
              inputProps={{ 'data-essence-allocation': carrier.itemKey }}
              onChange={(units) => onAllocate?.(carrier.itemKey, units)}
            />
          </li>
        {/each}
      </ul>
    {/if}

    {#if allocated.length > 0}
      <p class="essence-pool-subtitle">
        <Kicker as="span">{localize('FABRICATE.App.Crafting.Pool.YourSelection')}</Kicker>
      </p>
      <ul class="essence-pool-picked">
        {#each allocated as carrier (carrier.itemKey)}
          <li class="essence-pool-picked-row" data-essence-picked={carrier.itemKey}>
            <Medallion
              {...resolveCraftingArt(carrier.img, 'fa-solid fa-cube')}
              alt=""
              size={24}
              glyph={10.8}
            />
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

  /* The meter box is NEUTRAL by default and carries the ESSENCE's colour when it has one.
     It never carries state.

     It used to: `met` painted the box in the success family and `short` in the danger
     family. That made the box a second, louder answer to a question the head already
     answers precisely — the `6/6` ratio beside the name, and the colour-coded requirement
     tiles above the panel, both state exactly where each requirement stands. A green box
     only restated it, and it cost the box the one thing it alone could say: WHICH essence
     this meter is. With two requirements in a shared pool, both boxes went green together
     and became indistinguishable at a glance. */
  .essence-pool-meter {
    flex: 1 1 180px;
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-raised);
  }

  /* The shipped tinted-surface idiom (EnvironmentCard / GatheringDetail /
     GatheringEventDetail / Chip): 16% fill over the surface the card sits on, 50%
     border, tint on the GLYPH only. The rail renders inside .fabricate-app cards, so
     it mixes against --fab-surface-raised rather than theme root. */
  .essence-pool-meter.has-tint {
    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));
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

  /* LAYOUT AND ARIA ONLY (issue 1514). The track, its corner, its ground and its fill are
     `FillBar`'s now; this element survives to carry the `progressbar` role and the three
     `aria-value*` attributes the primitive deliberately does not emit, and to give the bar a
     block box to fill. The five fill-state rules that lived here — the base tint, the
     met/partial/short trio and the `has-tint` triple — became the `tone` and `color` props
     `meterTone` and `meterColor` derive, because a scoped block cannot reach inside a child
     component to paint its fill.

     ONE THING IS LOST AND IT IS RECORDED RATHER THAN WORKED AROUND: the fill had a
     `transition: width 0.2s ease` with a `prefers-reduced-motion` escape, and `FillBar` has
     neither, so the bar now moves instantly as units are stepped. Reaching into the primitive
     with a `:global()` rule from here would be this file re-styling a component it does not
     own, which is the whole reason the fill states above moved to props. A `transition` the
     primitive owns is what would close it. */
  .essence-pool-bar {
    display: flex;
  }

  /* LAYOUT ONLY. This sub-label kept its own 10px rung when the section title above it
     converted, which inverted the pair: the title that names the section rendered SMALLER
     than the label nested under it. The type is the kicker's now; the wrapper survives for
     the one margin that separates it from the meters above, which the kicker zeroes. */
  .essence-pool-subtitle {
    margin: var(--fab-space-1) 0 0;
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
</style>

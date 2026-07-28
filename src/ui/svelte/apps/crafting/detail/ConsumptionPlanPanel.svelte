<!-- Svelte 5 runes mode -->
<!--
  ConsumptionPlanPanel states what a craft will spend BEFORE it is spent (issue
  917): one row per planned item with the quantity that item contributes, plus a
  pending line naming the requirements still to choose.

  It renders the projection from `util/requirementSlots.js#buildConsumptionPlan`
  rather than re-deriving anything, so "the tiles are what is consumed" holds by
  construction: the essence rows are the pool's per-carrier allocation (the block
  contributes at most one plan entry per item key however many requirements that
  item funds), and the non-essence rows are the rail's own resolved slots.

  The "still to choose" join uses a list formatter, never an authored separator key
  — a comma-and-"and" join is locale-specific. Foundry V13's
  `game.i18n.getListFormatter()` returns exactly an `Intl.ListFormat` bound to the
  active language; the `formatList` prop is the seam for it (issue 917 L7 lifts that
  read onto foundryBridge), and the platform default stands in until then.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import CraftingThumb from '../CraftingThumb.svelte';

  let {
    // `{ rows, pending }` from buildConsumptionPlan.
    plan = null,
    // Optional locale-aware list formatter: (string[]) => string.
    formatList = null
  } = $props();

  const rows = $derived(Array.isArray(plan?.rows) ? plan.rows : []);
  const pending = $derived(Array.isArray(plan?.pending) ? plan.pending : []);

  function pendingLabel(entry) {
    return entry.kind === 'essence'
      ? localize('FABRICATE.App.Crafting.ConsumptionPlan.EssenceRequirement', { name: entry.name })
      : entry.name;
  }

  function joinNames(names) {
    if (typeof formatList === 'function') return formatList(names);
    return new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(names);
  }

  const pendingText = $derived(
    pending.length === 0
      ? ''
      : localize('FABRICATE.App.Crafting.ConsumptionPlan.StillToChoose', {
          items: joinNames(pending.map(pendingLabel))
        })
  );
</script>

<section class="consumption-plan" data-recipe-section="consumption-plan">
  <p class="consumption-plan-title">
    <i class="fa-solid fa-basket-shopping" aria-hidden="true"></i>
    {localize('FABRICATE.App.Crafting.ConsumptionPlan.Title')}
  </p>

  {#if rows.length === 0}
    <p class="consumption-plan-empty">
      {localize('FABRICATE.App.Crafting.ConsumptionPlan.Empty')}
    </p>
  {:else}
    <ul class="consumption-plan-rows">
      {#each rows as row (row.key)}
        <li class="consumption-plan-row" data-consumption-row={row.key}>
          <CraftingThumb src={row.img} alt="" size={30} glyph="fa-solid fa-cube" />
          <span class="consumption-plan-body">
            <span class="consumption-plan-name">{row.name}</span>
            {#if row.contributions.length > 0}
              <span class="consumption-plan-contributions">
                {#each row.contributions as contribution (contribution.essenceId)}
                  <span
                    class="consumption-plan-contribution"
                    class:is-required={contribution.required}
                    style={contribution.colorToken
                      ? `--fab-chip-color: var(--fab-tag-${contribution.colorToken})`
                      : ''}
                  >
                    <i class={normalizeEssenceIcon(contribution.icon)} aria-hidden="true"></i>
                    {localize('FABRICATE.App.Crafting.Pool.Contribution', {
                      amount: contribution.amount,
                      name: contribution.name
                    })}
                  </span>
                {/each}
              </span>
            {/if}
          </span>
          <span class="consumption-plan-owned">
            {localize('FABRICATE.App.Crafting.ConsumptionPlan.Owned', { count: row.owned })}
          </span>
          <span class="consumption-plan-qty" class:is-short={!row.sufficient}>×{row.quantity}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if pendingText}
    <p class="consumption-plan-pending" data-consumption-pending>
      <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
      {pendingText}
    </p>
  {/if}
</section>

<style>
  /* Dashed, because this is a statement of intent rather than a committed record. */
  .consumption-plan {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px dashed var(--fab-border-strong);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .consumption-plan-title {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .consumption-plan-title i {
    color: var(--fab-accent);
    font-size: 11px;
  }

  .consumption-plan-empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .consumption-plan-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .consumption-plan-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .consumption-plan-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .consumption-plan-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .consumption-plan-contributions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .consumption-plan-contribution {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    color: var(--fab-text-subtle);
  }

  .consumption-plan-contribution.is-required {
    color: var(--fab-chip-color, var(--fab-accent));
  }

  .consumption-plan-contribution i {
    font-size: 8px;
  }

  .consumption-plan-owned {
    flex: 0 0 auto;
    font-size: 10px;
    color: var(--fab-text-subtle);
  }

  .consumption-plan-qty {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
  }

  .consumption-plan-qty.is-short {
    color: var(--fab-danger-text);
  }

  .consumption-plan-pending {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    color: var(--fab-accent);
  }

  .consumption-plan-pending i {
    margin-top: 2px;
    font-size: 10px;
  }
</style>

<!-- Svelte 5 runes mode -->
<!--
  Shared recipe-tier table for the crafting check editors: named tiers a recipe can
  select to override the default DC. Used by the simple check (static DC mode) and
  the routed check (relative type only). Controlled: reads `tiers` + `defaultDc`
  (seeds a new tier's DC) and emits the next `tiers` array via onChange.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { tiers = [], defaultDc = 0, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const list = $derived(Array.isArray(tiers) ? tiers : []);

  function addTier() {
    onChange([...list, { id: newId(), name: '', dc: Number(defaultDc) || 0 }]);
  }

  function updateTier(id, patch) {
    onChange(list.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  }

  function removeTier(id) {
    onChange(list.filter((tier) => tier.id !== id));
  }
</script>

<div class="manager-checks-card-head">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}</h3>
  <button type="button" class="manager-button" data-add-tier onclick={addTier}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add tier')}</span>
  </button>
</div>

{#if list.length === 0}
  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.NoTiers', 'No tiers yet. Add named tiers a recipe can select to override the DC.')}</p>
{:else}
  <div class="manager-checks-outcome-table is-tier" role="table" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}>
    <div class="manager-checks-outcome-head" role="row">
      <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}</span>
      <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')}</span>
      <span role="columnheader" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}></span>
    </div>
    {#each list as tier (tier.id)}
      <div class="manager-checks-outcome-row" role="row" data-tier-row={tier.id}>
        <input
          data-tier-name
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}
          value={tier.name || ''}
          oninput={(event) => updateTier(tier.id, { name: event.currentTarget.value })}
        />
        <input
          type="number"
          data-tier-dc
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')}
          value={tier.dc ?? 0}
          oninput={(event) => updateTier(tier.id, { dc: numeric(event.currentTarget.value) })}
        />
        <button
          type="button"
          class="manager-icon-button is-danger"
          data-remove-tier
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveTier', 'Remove tier')}
          onclick={() => removeTier(tier.id)}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- Svelte 5 runes mode -->
<!--
  Shared recipe-tier table for the crafting check editors: named tiers a recipe can
  select to override the default DC. Used by the simple check (static DC mode) and
  the routed check (relative type only). Controlled: reads `tiers` + `defaultDc`
  (seeds a new tier's DC) and emits the next `tiers` array via onChange.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';

  let { tiers = [], defaultDc = 0, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const list = $derived(Array.isArray(tiers) ? tiers : []);

  // Named once: the column header, the stepper's accessible name, and the `{label}` slot
  // in the shared `Decrease {label}` / `Increase {label}` adjunct strings all read it.
  const dcLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC'));

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
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}
  </h3>
  <button type="button" class="manager-button" data-add-tier onclick={addTier}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add tier')}</span>
  </button>
</div>

{#if list.length === 0}
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.Crafting.NoTiers',
      'No tiers yet. Add named tiers a recipe can select to override the DC.'
    )}
  </p>
{:else}
  <div
    class="manager-checks-outcome-table is-tier"
    role="table"
    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}
  >
    <div class="manager-checks-outcome-head" role="row">
      <span role="columnheader"
        >{text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}</span
      >
      <span role="columnheader">{dcLabel}</span>
      <span
        role="columnheader"
        aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}
      ></span>
    </div>
    {#each list as tier (tier.id)}
      <div class="manager-checks-outcome-row" role="row" data-tier-row={tier.id}>
        <input
          data-tier-name
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}
          value={tier.name || ''}
          oninput={(event) => updateTier(tier.id, { name: event.currentTarget.value })}
        />
        <!-- `fill`, so the stepper takes the row's pinned 102px track and the 36px height
             its `<input>` sibling resolves to rather than sitting in it as a narrower
             inline island. No `allowUnset`: a tier's DC has no absent state — 0 is a real
             DC — and the `data-*` hook rides `inputProps` onto the real `<input>`.

             `min={0}`: 0 is a real DC but -1 is not, and a tier's DC starts at 0, so
             without the clamp one click of the live `−` adjunct commits a negative DC.
             The bare input this replaced had no `min` either, but it had no `−` either. -->
        <Stepper
          fill
          min={0}
          value={tier.dc ?? 0}
          ariaLabel={dcLabel}
          decrementLabel={localize('FABRICATE.Common.Stepper.Decrease', { label: dcLabel })}
          incrementLabel={localize('FABRICATE.Common.Stepper.Increase', { label: dcLabel })}
          inputProps={{ 'data-tier-dc': '' }}
          onChange={(dc) => updateTier(tier.id, { dc })}
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

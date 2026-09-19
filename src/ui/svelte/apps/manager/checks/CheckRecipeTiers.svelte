<!-- Svelte 5 runes mode -->
<!--
  RECIPE DIFFICULTY TIERS — named difficulties a record can pick, each with its own DC, used by
  the simple check in static DC mode and the routed check in relative type only. Controlled.

  IT IS A LIST OF ROWS in the same shape the Outcomes screen draws its outcome tiers, rendering
  the SAME `.manager-checks-tier-*` contract as `CraftingCheckEditor`; the column-header row goes
  with the table, one text field and one number needing none once labelled.

  One affordance is overturned (maintainer ruling, 2026-09-18): issue 1096 recorded a deliberate
  refusal of the chevron rocker, on the reading that the prototype draws one affordance. The design
  system's specimen states both affordances always, and the maintainer ruled for the specimen — so
  the row renders through `SortableList` (issue 1512) and gains the numbered badge, the rocker and
  the polite announcement it had none of. Both the ruling and the decision it reverses are recorded
  in the library's section 16.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    tiers = [],
    defaultDc = 0,
    // Whether a tier's DC anchors the OUTCOME BANDS or simply replaces the base DC. One card,
    // two true sentences; one sentence would be wrong on one of the two screens.
    anchorsBands = false,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const list = $derived(Array.isArray(tiers) ? tiers : []);

  // Named once: the row's micro label, the stepper's accessible name and the shared adjunct
  // strings' `{label}` slot all read it.
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

  // Both inputs are the shared list's (issue 1512) — the drag source, the grip, the arrow keys,
  // the rocker and the announcement. This surface keeps only the array move.

  /** Move one row, clamped. A move to where it already is emits nothing. */
  function moveTier(from, to) {
    if (from < 0 || from >= list.length) return;
    const target = Math.min(Math.max(to, 0), list.length - 1);
    if (target === from) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  function tierName(tier) {
    return tier.name || text('FABRICATE.Admin.Manager.Checks.Crafting.UnnamedTier', 'Unnamed tier');
  }
</script>

<!-- The title and its description STACK, which is what the wrapping element is for: the head
     is a flex row, and the routed editor's `is-inline` variant is the exception. -->
<div class="manager-checks-card-head">
  <div>
    <h3 class="manager-checks-card-title">
      {text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe difficulty tiers')}
    </h3>
    <p class="manager-checks-card-description">
      {anchorsBands
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.TiersLeadBands',
            'A recipe picks one of these; its DC anchors the outcome bands on the Outcomes section.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Crafting.TiersLead',
            'A recipe picks one of these; its DC replaces the base DC above.'
          )}
    </p>
  </div>
</div>

<div class="manager-checks-card-body is-stack">
  {#if list.length === 0}
    <p class="manager-muted" data-tiers-empty>
      {text(
        'FABRICATE.Admin.Manager.Checks.Crafting.NoTiers',
        'No tiers yet. Add named tiers a recipe can select to override the DC.'
      )}
    </p>
    <!-- The adder follows the empty message (issue 1512): with no tiers there is no list for it to
         be a footer of, and an empty state that says "add one" with nothing to press is a dead end. -->
    {@render addTierButton()}
  {:else}
    <SortableList
      items={list}
      itemLabel={tierName}
      numbered
      onReorder={(from, to) => moveTier(from, to)}
      rowClass={() => 'manager-checks-tier-row'}
      rowData={(tier) => ({ 'data-tier-row': tier.id })}
    >
      {#snippet row(tier)}
        <input
          class="manager-checks-tier-name"
          data-tier-name
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}
          value={tier.name || ''}
          oninput={(event) => updateTier(tier.id, { name: event.currentTarget.value })}
        />
        <!-- The number is labelled in the ROW rather than in a column header, so the row stays
             self-describing with no header row above it. `aria-hidden`, because the stepper already
             carries the same word as its own accessible name. -->
        <span class="manager-checks-tier-unit" aria-hidden="true">{dcLabel}</span>
        <!-- `fill`, so the stepper takes the row's pinned track and height rather than sitting in it
             as a narrower inline island. No `allowUnset`: a tier's DC has no absent state, 0 being a
             real DC, and the `data-*` hook rides `inputProps` onto the real `<input>`. `min={0}`
             because -1 is not a DC, and without the clamp one click of the `−` adjunct commits one. -->
        <div class="manager-checks-tier-stepper is-narrow">
          <Stepper
            fill
            min={0}
            value={tier.dc ?? 0}
            {...stepperLabels(dcLabel)}
            inputProps={{ 'data-tier-dc': '' }}
            onChange={(dc) => updateTier(tier.id, { dc })}
          />
        </div>
        <!-- NOT the list's own `removable`: `data-remove-tier` is the hook every mounted driver
             removes a tier by, and the list's remove writes its own. -->
        <ManagerButton
          role="danger"
          class="manager-checks-tier-remove"
          data-remove-tier
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveTier', 'Remove tier')}
          onclick={() => removeTier(tier.id)}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </ManagerButton>
      {/snippet}
      {#snippet footer()}
        <li class="manager-checks-tier-add">{@render addTierButton()}</li>
      {/snippet}
    </SortableList>
  {/if}
</div>

{#snippet addTierButton()}
  <ManagerButton role="dashed" data-add-tier onclick={addTier}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add difficulty tier')}</span>
  </ManagerButton>
{/snippet}

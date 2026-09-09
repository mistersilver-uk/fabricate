<!-- Svelte 5 runes mode -->
<!--
  RECIPE DIFFICULTY TIERS — named difficulties a recipe can pick, each with its own DC.

  Used by the simple check (static DC mode) and the routed check (relative type only).
  Controlled: reads `tiers` + `defaultDc` (which seeds a new tier's DC) and emits the next
  `tiers` array through `onChange`.

  ## It is a LIST OF ROWS, not a table (issue 1096)

  The prototype draws it in exactly the shape the Outcomes screen draws its outcome tiers: a
  46px row on `--fab-bg-0` carrying a drag handle, the name field, a `DC` micro label, a 28px
  stepper pill and a subtle danger remove button, with a full-width dashed `Add difficulty
  tier` under the list rather than a button in the card head. So this renders the SAME
  `.manager-checks-tier-*` contract as `CraftingCheckEditor`, and the column-header row goes
  with the table: the prototype has no column headers, and a two-column table of one text
  field and one number does not need them once each control is labelled.

  ## The handle DRAGS (issue 1096)

  The prototype draws a grip on every row, and a handle that does not reorder is a promise
  the surface does not keep — so the order is authored here rather than the glyph being
  decoration. It is real: `tiers` is an ordered array, the recipe editor's tier picker lists
  it in that order, and nothing else derives from the positions, so a move is a plain array
  reorder with no other consequence.

  ## ONE AFFORDANCE IS OVERTURNED (maintainer ruling M2, 2026-09-09)

  Issue 1096 read the prototype as drawing ONE affordance and recorded a deliberate refusal
  of the chevron rocker: a grip that answers both the pointer and the arrow keys, and no
  visible up/down pair. That decision is OVERTURNED. The design system's own specimen states
  BOTH AFFORDANCES ALWAYS - a single-position nudge is faster than a drag, and the rocker is
  the only affordance a reader can see the RANGE of - and the maintainer ruled for the
  specimen. So this row renders through `SortableList` (issue 1512) and gains the numbered
  badge, the chevron rocker and the polite reorder announcement it had none of; the ruling
  and the decision it reverses are both recorded in the library's section 16.
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
    // Whether the DC a tier carries anchors the OUTCOME BANDS (routed, relative) or simply
    // replaces the base DC (simple). One card, two true sentences; a single sentence would
    // be wrong on one of the two screens that render it.
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

  // Named once: the row's micro label, the stepper's accessible name, and the `{label}` slot
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

  // ── Reordering ────────────────────────────────────────────────────────────────────
  //
  // BOTH INPUTS ARE THE SHARED LIST'S (issue 1512): the drag source, the grip, the arrow
  // keys, the chevron rocker and the announcement. This surface keeps only the array move.

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
     is a flex row, and the routed editor's inline variant (`is-inline`) is the exception
     rather than the default. Without it the description sets beside the title. -->
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
    <!-- THE ADDER FOLLOWS THE EMPTY MESSAGE (issue 1512): with no tiers there is no list for it
         to be a footer of, and an empty state that says "add one" with nothing to press is a dead
         end. -->
    {@render addTierButton()}
  {:else}
    <SortableList
      items={list}
      itemLabel={tierName}
      numbered
      handles
      onReorder={(from, to) => moveTier(from, to)}
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
        <!-- The prototype labels the number in the ROW rather than in a column header, so
             the label goes where the header was and the row stays self-describing with no
             header row above it. It is `aria-hidden` because the stepper already carries
             the same word as its own accessible name; announcing it twice would be worse
             than not announcing it here at all. -->
        <span class="manager-checks-tier-unit" aria-hidden="true">{dcLabel}</span>
        <!-- `fill`, so the stepper takes the row's pinned track and its 28px height rather
             than sitting in it as a narrower inline island. No `allowUnset`: a tier's DC
             has no absent state, 0 is a real DC, and the `data-*` hook rides `inputProps`
             onto the real `<input>`.

             `min={0}`: 0 is a real DC but -1 is not, and a tier's DC starts at 0, so
             without the clamp one click of the live decrement adjunct commits a negative
             DC. -->
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
        <!-- NOT the list's own `removable` control: `data-remove-tier` is the hook every
             mounted driver removes a tier by, and the list's remove writes its own. -->
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

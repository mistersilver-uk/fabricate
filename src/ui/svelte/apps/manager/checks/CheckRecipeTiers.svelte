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

  Drag is the pointer half. The grip is also a real BUTTON that moves its row with the arrow
  keys, because HTML5 drag-and-drop has no keyboard path at all and reordering would
  otherwise be mouse-only — the same failure `manager-recipe-result-move` exists to avoid on
  the progressive result list. The prototype draws one affordance, so this is one affordance
  that answers both inputs rather than a grip plus a visible chevron rocker.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
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
  // `dragIndex` is the row under the pointer, and it is `$state` rather than a plain local
  // because the row it names paints itself as travelling.
  let dragIndex = $state(-1);

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

  function onGripKeydown(event, index) {
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    moveTier(index, index + delta);
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
  {:else}
    <div
      class="manager-checks-tier-list"
      role="list"
      aria-label={text(
        'FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle',
        'Recipe difficulty tiers'
      )}
    >
      {#each list as tier, index (tier.id)}
        <!-- The ROW is the drag source and the drop target; the grip is the handle a
             pointer grabs it by. `ondragover` must preventDefault or the drop never
             fires — that is the HTML5 contract, not a workaround. -->
        <div
          class={`manager-checks-tier-row ${dragIndex === index ? 'is-dragging' : ''}`}
          role="listitem"
          data-tier-row={tier.id}
          draggable="true"
          ondragstart={() => {
            dragIndex = index;
          }}
          ondragend={() => {
            dragIndex = -1;
          }}
          ondragover={(event) => event.preventDefault()}
          ondrop={(event) => {
            event.preventDefault();
            moveTier(dragIndex, index);
            dragIndex = -1;
          }}
        >
          <ManagerButton
            class="manager-checks-tier-grip"
            data-tier-grip={tier.id}
            aria-label={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ReorderTier',
              'Reorder {name} — use the up and down arrow keys'
            ).replace('{name}', tierName(tier))}
            onkeydown={(event) => onGripKeydown(event, index)}
          >
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </ManagerButton>
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
               has no absent state — 0 is a real DC — and the `data-*` hook rides
               `inputProps` onto the real `<input>`.

               `min={0}`: 0 is a real DC but -1 is not, and a tier's DC starts at 0, so
               without the clamp one click of the live `−` adjunct commits a negative DC. -->
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
          <ManagerButton
            role="danger"
            class="manager-checks-tier-remove"
            data-remove-tier
            aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveTier', 'Remove tier')}
            onclick={() => removeTier(tier.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </ManagerButton>
        </div>
      {/each}
    </div>
  {/if}

  <ManagerButton role="dashed" data-add-tier onclick={addTier}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add difficulty tier')}</span>
  </ManagerButton>
</div>

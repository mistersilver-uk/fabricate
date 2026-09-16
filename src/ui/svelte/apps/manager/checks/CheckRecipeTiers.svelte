<!-- Svelte 5 runes mode -->
<!--
  RECIPE DIFFICULTY TIERS — named difficulties a record can pick, each with its own DC, used by
  the simple check in static DC mode and the routed check in relative type only. Controlled.

  IT IS A LIST OF ROWS in the same shape the Outcomes screen draws its outcome tiers, rendering
  the SAME `.manager-checks-tier-*` contract as `CraftingCheckEditor`; the column-header row goes
  with the table, one text field and one number needing none once labelled.

  THE HANDLE DRAGS, a handle that does not reorder being a promise the surface does not keep. The
  grip is ALSO a real BUTTON that moves its row with the arrow keys, HTML5 drag-and-drop having
  no keyboard path: one affordance answers both inputs.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
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

  // `dragIndex` is the row under the pointer, `$state` because the row it names paints itself
  // as travelling.
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
        <!-- The ROW is the drag source and the drop target; the grip is the handle a pointer grabs
             it by. `ondragover` must preventDefault or the drop never fires — the HTML5 contract,
             not a workaround. -->
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

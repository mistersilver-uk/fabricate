<!-- Svelte 5 runes mode -->
<!--
  RequirementRail is the player Crafting tab's single requirement surface (issue
  917): the set's fixed, choice and essence requirements as ONE wrapping row of
  slot tiles, with at most one chooser open at a time and a "Pick for me" wand in
  its own header.

  The wand lives HERE rather than in the app footer because the rail renders inside
  step and routed bodies while Craft sits in a fixed footer outside the scrolling
  body — a footer control could not be scoped to the set the rail is showing.

  Auto-advance announces through this component's OWN live region, never the
  progressive stage list's reorder region: a progressive recipe can render both
  surfaces at once and a shared region would have them overwrite each other.

  The rail renders read-only whenever the displayed step is not the step the engine
  would execute, or while that step's time gate is armed — what is shown then does
  not drive the craft the button fires.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { SLOT_KIND, SLOT_STATE } from '../../../util/requirementSlots.js';
  import RequirementTile from './RequirementTile.svelte';

  let {
    slots = [],
    openSlotId = null,
    readOnly = false,
    // Live-region text for auto-advance and "Pick for me".
    announcement = '',
    // DOM id of the panel the open slot controls, for `aria-controls`.
    panelId = null,
    onOpenSlot = null,
    onPickForMe = null,
  } = $props();

  const items = $derived(Array.isArray(slots) ? slots : []);
  const canPickForMe = $derived(
    !readOnly && items.some((slot) => slot.interactive && slot.state !== SLOT_STATE.MET)
  );

  const STATE_LABEL_KEYS = {
    [SLOT_STATE.MET]: 'FABRICATE.App.Crafting.Slots.TileMet',
    [SLOT_STATE.PARTIAL]: 'FABRICATE.App.Crafting.Slots.TilePartial',
    [SLOT_STATE.SHORT]: 'FABRICATE.App.Crafting.Slots.TileShort',
  };

  function tileLabel(slot) {
    const key = STATE_LABEL_KEYS[slot.state] ?? STATE_LABEL_KEYS[SLOT_STATE.SHORT];
    return localize(key, { name: slot.name, have: slot.have, need: slot.need });
  }

  // Plurals are TWO whole literal keys chosen by a ternary. A concatenated suffix
  // credits only the prefix under the lang-key orphan guard and strands the leaf.
  function optionsLabel(count) {
    return count === 1
      ? localize('FABRICATE.App.Crafting.Slots.OptionsOne', { count })
      : localize('FABRICATE.App.Crafting.Slots.OptionsMany', { count });
  }

  function disclosureText(slot) {
    if (slot.kind === SLOT_KIND.ESSENCE) {
      return slot.have > 0
        ? localize('FABRICATE.App.Crafting.Slots.EditPool')
        : localize('FABRICATE.App.Crafting.Slots.AddItems');
    }
    if (slot.choiceCount > 1) return optionsLabel(slot.choiceCount);
    return localize('FABRICATE.App.Crafting.Slots.Change');
  }

  function tileDomId(slot) {
    return `fabricate-slot-${slot.key}`;
  }

  function isOpen(slot) {
    return slot.interactive && slot.slotId === openSlotId;
  }

  // Auto-advance moves which chooser is OPEN without moving focus, so the change has
  // to be spoken rather than shown. Naming the open slot here means the region's text
  // changes exactly when the open chooser does — whether the rail advanced by itself
  // or the player clicked — and an explicit `announcement` ("Pick for me") wins.
  const openSlot = $derived(items.find(isOpen) ?? null);
  const liveText = $derived.by(() => {
    if (announcement) return announcement;
    if (readOnly || !openSlot) return '';
    return localize('FABRICATE.App.Crafting.Slots.NowShowing', { name: openSlot.name });
  });
</script>

{#if items.length > 0}
  <section class="requirement-rail" data-recipe-section="requirement-rail">
    <div class="requirement-rail-header">
      <p class="crafting-detail-section-title">
        {localize('FABRICATE.App.Crafting.Slots.Title')}
      </p>
      {#if canPickForMe}
        <!-- NO aria-label. The visible label is "Pick for me" and the hint is a whole
             sentence, so labelling the button with the hint would leave an accessible
             name that does not contain its visible text: speech activation by the
             visible label then fails (WCAG 2.5.3 Label in Name). The `<span>` names the
             button; `title` carries the hint for everyone. -->
        <button
          type="button"
          class="requirement-rail-wand"
          data-requirement-pick-for-me
          title={localize('FABRICATE.App.Crafting.Slots.PickForMeHint')}
          onclick={() => onPickForMe?.()}
        >
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Slots.PickForMe')}</span>
        </button>
      {/if}
    </div>

    {#if readOnly}
      <p class="requirement-rail-hint" data-requirement-rail-readonly>
        {localize('FABRICATE.App.Crafting.Slots.ReadOnly')}
      </p>
    {:else}
      <p class="requirement-rail-hint">{localize('FABRICATE.App.Crafting.Slots.Hint')}</p>
    {/if}

    <div class="requirement-rail-slots" data-requirement-rail-slots>
      {#each items as slot (slot.key)}
        <RequirementTile
          {slot}
          {readOnly}
          iconClass={slot.isEssence ? normalizeEssenceIcon(slot.icon) : ''}
          open={isOpen(slot)}
          label={tileLabel(slot)}
          caption={slot.name}
          disclosure={disclosureText(slot)}
          tileId={tileDomId(slot)}
          controlsId={isOpen(slot) ? panelId : null}
          onOpen={(slotId) => onOpenSlot?.(slotId)}
        />
      {/each}
    </div>

    <!-- Auto-advance never steals focus, so the change of open chooser is announced
         here instead. Its own region: ProgressiveStageList owns the reorder one. -->
    <p class="requirement-rail-live" role="status" aria-live="polite" data-requirement-rail-live>
      {liveText}
    </p>
  </section>
{/if}

<style>
  .requirement-rail {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .requirement-rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* Foundry's global button chrome pins a fixed height and centres content; reset it
     the same way the shipped .crafting-alt-option does. */
  .requirement-rail-wand {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 26px;
    padding: 2px var(--fab-space-2);
    border: 1px solid var(--fab-accent-border);
    border-radius: 999px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .requirement-rail-wand:hover {
    background: var(--fab-surface-active);
  }

  .requirement-rail-wand i {
    font-size: 10px;
  }

  .requirement-rail-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Slots WRAP rather than shrink: below the tile's minimum the artwork and the pip
     stop being legible, so a narrow app gets more rows, not smaller tiles. */
  .requirement-rail-slots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .requirement-rail-live {
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  /* Matches the sibling IO section headers. Svelte scopes CSS per component and this
     class is not global, so the rule is redefined here (the IngredientOptionSelector
     precedent). */
  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>

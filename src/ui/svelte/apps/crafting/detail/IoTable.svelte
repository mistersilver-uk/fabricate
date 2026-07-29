<!-- Svelte 5 runes mode -->
<!--
  IoTable is the recipe detail's material-economy region and, since issue 917, the
  COMPOSITION ROOT for the requirement surface: the slot rail, the single open
  chooser (an alternatives picker or the shared essence pool), and the
  consumption-plan panel — followed by the unchanged legacy set-level essence rows,
  the tool rows and the produced outputs.

  The three-surface presentation it replaces (a flat image grid, a separately
  stacked alternatives picker and an essence list) could not tell a player which
  requirement still needed attention, which is the whole job of this area. The
  have/need pip moved into RequirementTile with it; the `fa-layer-group` alternatives
  badge was NOT carried across — the rail's disclosure line already states that a
  slot has alternatives, and the badge used the exact accent trio the open state now
  claims.

  Legacy set-level `ingredientSet.essences` are threshold-only and never consumed,
  so they cannot enter an allocation pool and keep their existing row presentation
  (which also preserves the pinned `[data-io-group="essences"]` smoke selector).
-->
<script>
  import { formatList as localeFormatList, localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import {
    ESSENCE_POOL_SLOT_ID,
    buildConsumptionPlan,
    buildRequirementSlots,
  } from '../../../util/requirementSlots.js';
  import CraftingThumb from '../CraftingThumb.svelte';
  import QuantityTag from '../QuantityTag.svelte';
  import IngredientOptionSelector from './IngredientOptionSelector.svelte';
  import RequirementRail from './RequirementRail.svelte';
  import EssencePoolPanel from './EssencePoolPanel.svelte';
  import ConsumptionPlanPanel from './ConsumptionPlanPanel.svelte';

  let {
    craftability = null,
    result = null,
    onChooseOption = null,
    // Group ids the player has explicitly chosen an option for, so an untouched
    // choice slot reads as a to-do rather than as an error.
    chosenGroupIds = [],
    // Which chooser is open. Resolved (and re-validated) by the store; a static
    // preview passes none and renders no chooser.
    openSlotId = null,
    // A later step's rail, or one whose time gate is armed, is inert preview.
    readOnly = false,
    announcement = '',
    onOpenSlot = null,
    onPickForMe = null,
    onAllocateEssence = null,
    // Locale-aware list join for the "still to choose" line. Defaults to the bridge's
    // own rather than to null: no ancestor supplies this, so a null default would
    // leave the composition root forwarding a dead wire.
    formatList = localeFormatList,
    // DOM id namespace, so several rails (a multi-step list) never collide.
    idPrefix = 'fabricate-req',
  } = $props();

  const slots = $derived(buildRequirementSlots(craftability, { chosenGroupIds }));
  const plan = $derived(buildConsumptionPlan(craftability, { chosenGroupIds }));
  const ingredientChoices = $derived(
    Array.isArray(craftability?.ingredientChoices) ? craftability.ingredientChoices : []
  );
  const essences = $derived(
    Array.isArray(craftability?.essenceStates) ? craftability.essenceStates : []
  );
  const tools = $derived(Array.isArray(craftability?.toolStates) ? craftability.toolStates : []);
  const outputs = $derived(Array.isArray(result?.items) ? result.items : []);

  const panelId = $derived(`${idPrefix}-panel`);
  // The tile the open panel is labelled back at. Every essence tile opens the same
  // pool, so the first of them owns the label.
  const openSlot = $derived(
    slots.find((slot) => slot.interactive && slot.slotId === openSlotId) ?? null
  );
  const openTileId = $derived(openSlot ? `fabricate-slot-${openSlot.key}` : null);
  const poolOpen = $derived(!readOnly && openSlotId === ESSENCE_POOL_SLOT_ID && Boolean(openSlot));
  const openChoices = $derived(
    readOnly || !openSlotId || poolOpen
      ? []
      : ingredientChoices.filter((choice) => choice?.groupId === openSlotId)
  );

  function essenceLabel(state) {
    return String(state?.name ?? state?.label ?? state?.type ?? state?.essenceType ?? '');
  }
  function essenceIcon(state) {
    return normalizeEssenceIcon(state?.icon);
  }
</script>

<section class="crafting-io" data-recipe-section="io">
  {#if slots.length > 0}
    <div class="crafting-io-group" data-io-group="ingredients">
      <RequirementRail
        {slots}
        {openSlotId}
        {readOnly}
        {announcement}
        {panelId}
        {onOpenSlot}
        {onPickForMe}
      />
      {#if poolOpen}
        <EssencePoolPanel
          pool={craftability?.essencePool ?? null}
          {readOnly}
          {panelId}
          labelledBy={openTileId}
          onAllocate={(itemKey, units) => onAllocateEssence?.(itemKey, units)}
        />
      {:else if openChoices.length > 0}
        <!-- `role="region"` is load-bearing: `aria-labelledby` on a roleless `<div>` is
             not exposed at all, so without it the panel the open tile points
             `aria-controls` at would be an unnamed generic. The essence pool is a real
             `<section>` and gets the same treatment for free. -->
        <div id={panelId} role="region" aria-labelledby={openTileId ?? undefined}>
          <IngredientOptionSelector choices={openChoices} onChoose={onChooseOption} />
        </div>
      {/if}
      <ConsumptionPlanPanel {plan} {formatList} />
    </div>
  {/if}

  {#if essences.length > 0}
    <div class="crafting-io-group" data-io-group="essences">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Essences')}</p>
      <ul class="crafting-io-list">
        {#each essences as state, index (state.type ?? state.essenceType ?? index)}
          <li class="crafting-io-row" data-io-satisfied={state.satisfied ? 'true' : 'false'}>
            <span class="crafting-io-essence-label">
              <i class={`crafting-io-essence-icon ${essenceIcon(state)}`} aria-hidden="true"></i>
              <span class="crafting-io-name">{essenceLabel(state)}</span>
            </span>
            <span class="crafting-io-tags">
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Have')}
                value={state.have ?? 0}
                tone={state.satisfied ? 'success' : 'neutral'}
              />
              <QuantityTag
                label={localize('FABRICATE.App.Crafting.Io.Need')}
                value={state.need ?? 0}
                tone="neutral"
              />
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if tools.length > 0}
    <div class="crafting-io-group" data-io-group="tools">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Tools')}</p>
      <ul class="crafting-io-list">
        {#each tools as tool, index (tool.componentId ?? tool.name ?? index)}
          <li class="crafting-io-row" data-io-satisfied={tool.available ? 'true' : 'false'}>
            <span class="crafting-io-tool-label">
              <CraftingThumb src={tool.img} alt="" size={28} />
              <span class="crafting-io-name">{tool.name}</span>
            </span>
            <QuantityTag
              label={tool.available
                ? localize('FABRICATE.App.Crafting.Io.Available')
                : localize('FABRICATE.App.Crafting.Io.Unavailable')}
              value=""
              tone={tool.available ? 'success' : 'danger'}
              icon={tool.available ? 'fa-screwdriver-wrench' : 'fa-triangle-exclamation'}
            />
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if outputs.length > 0}
    <div class="crafting-io-group" data-io-group="outputs">
      <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Io.Output')}</p>
      <ul class="crafting-io-outputs">
        {#each outputs as item, index (item.name + index)}
          <li class="crafting-io-output" data-io-output>
            <CraftingThumb src={item.img} alt="" size={32} />
            <span class="crafting-io-output-name">{item.name}</span>
            <span class="crafting-io-output-qty">×{item.qty}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .crafting-io {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .crafting-io-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-io-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-io-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  /* Tool row: image tile to the left of the tool name. */
  .crafting-io-tool-label {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  /* Legacy set-level essence row: FA icon to the left of the essence name. */
  .crafting-io-essence-label {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .crafting-io-essence-icon {
    flex: 0 0 auto;
    font-size: 14px;
    color: var(--fab-text-muted);
  }

  .crafting-io-tags {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 4px;
  }

  .crafting-io-outputs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Rounded rectangle matching the tier award pills + the rounded-square item image
     it wraps (not a full capsule). */
  .crafting-io-output {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-io-output-name {
    font-size: 13px;
  }

  .crafting-io-output-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>

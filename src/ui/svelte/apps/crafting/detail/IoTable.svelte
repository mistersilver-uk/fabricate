<!-- Svelte 5 runes mode -->
<!--
  IoTable is the recipe detail's material-economy region and the composition root for the
  requirement surface: the slot rail with its single open chooser (the group's alternatives as
  tiles, then its held-stack picker or the shared essence pool when it has either) and the
  consumption-plan panel, followed by three `DataTable`s (issue 1782): the legacy set-level essences,
  the tools and the produced outputs, each bounded and unpaged.

  Legacy set-level `ingredientSet.essences` are threshold-only and never consumed, so they
  cannot enter an allocation pool and keep their own table (which also preserves the
  pinned `[data-io-group="essences"]` smoke selector).
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { formatList as localeFormatList, localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import {
    SLOT_KIND,
    buildConsumptionPlan,
    buildRequirementSlots,
  } from '../../../util/requirementSlots.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import { countText } from '../../../util/craftingQuantityReading.js';
  import Chip from '../../../components/Chip.svelte';
  import IngredientOptionSelector from './IngredientOptionSelector.svelte';
  import RequirementRail from './RequirementRail.svelte';
  import EssencePoolPanel from './EssencePoolPanel.svelte';
  import ConsumptionPlanPanel from './ConsumptionPlanPanel.svelte';
  import { essenceOvershoots } from './essenceOvershoot.js';
  import DataTable from '../../../components/DataTable.svelte';
  import Well from '../../../components/Well.svelte';
  import AwardPill from './AwardPill.svelte';

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
  const openSlot = $derived(
    slots.find((slot) => slot.interactive && slot.slotId === openSlotId) ?? null
  );
  // Any open essence slot shows the pool: the shared pool slot, or a group whose chosen
  // alternative is an essence (beneath that group's alternatives).
  const poolOpen = $derived(!readOnly && openSlot?.kind === SLOT_KIND.ESSENCE);
  const openStacks = $derived(
    readOnly || !openSlotId
      ? []
      : ingredientChoices.filter(
          (choice) => choice?.kind === 'stack' && choice.groupId === openSlotId
        )
  );
  const overshoots = $derived(essenceOvershoots(craftability?.essencePool ?? null));

  function essenceLabel(state) {
    return String(state?.name ?? state?.label ?? state?.type ?? state?.essenceType ?? '');
  }
  function essenceIcon(state) {
    return normalizeEssenceIcon(state?.icon);
  }

  const column = (key, label, extra = {}) => ({ key, label: localize(label), ...extra });
  const essenceColumns = [
    column('name', 'FABRICATE.App.Crafting.Io.Columns.Essence', { rowHeader: true }),
    column('have', 'FABRICATE.App.Crafting.Io.Have', { align: 'end' }),
    column('need', 'FABRICATE.App.Crafting.Io.Need', { align: 'end' }),
  ];
  const toolColumns = [
    column('name', 'FABRICATE.App.Crafting.Io.Columns.Tool', { rowHeader: true }),
    column('status', 'FABRICATE.App.Crafting.Io.Columns.Status', { align: 'end' }),
  ];
  const outputColumns = [
    column('name', 'FABRICATE.App.Crafting.Io.Columns.Output', { rowHeader: true }),
    column('amount', 'FABRICATE.App.Crafting.Io.Columns.Amount', { align: 'end', mono: true }),
  ];
</script>

{#snippet identity(artwork, name, labelClass, nameClass)}
  <span class={labelClass}>
    <Medallion art={artwork.art} icon={artwork.icon} alt="" size={26} />
    <span class={nameClass}>{name}</span>
  </span>
{/snippet}

{#snippet essenceCell(state, column)}
  {#if column.key === 'name'}
    <span class="crafting-io-label">
      <i class={`crafting-io-essence-icon ${essenceIcon(state)}`} aria-hidden="true"></i>
      <span class="crafting-io-name">{essenceLabel(state)}</span>
    </span>
  {:else if column.key === 'have'}
    <!-- A word and a count as two children, so the chip's own gap separates them. -->
    <Chip
      density="list"
      emphasis="solid"
      tone={statusChipTone(state.satisfied ? 'success' : 'neutral')}
      ><span>{localize('FABRICATE.App.Crafting.Io.Have')}</span><span>{countText(state.have)}</span
      ></Chip
    >
  {:else}
    <Chip density="list" emphasis="solid" tone={statusChipTone('neutral')}
      ><span>{localize('FABRICATE.App.Crafting.Io.Need')}</span><span>{countText(state.need)}</span
      ></Chip
    >
  {/if}
{/snippet}

{#snippet toolCell(tool, column)}
  {#if column.key === 'name'}
    {@render identity(
      resolveCraftingArt(tool.img),
      tool.name,
      'crafting-io-tool-label',
      'crafting-io-name'
    )}
  {:else}
    <Chip
      density="list"
      tone={statusChipTone(tool.available ? 'success' : 'danger')}
      icon={`fas ${tool.available ? 'fa-screwdriver-wrench' : 'fa-triangle-exclamation'}`}
      >{tool.available
        ? localize('FABRICATE.App.Crafting.Io.Available')
        : localize('FABRICATE.App.Crafting.Io.Unavailable')}</Chip
    >
  {/if}
{/snippet}

{#snippet outputCell(item, column)}
  {#if item.kind === 'group'}
    {#if column.key === 'name'}
      <!-- A choice group (issue 1773): who chooses and how many, over its alternatives. -->
      <Well label={item.name}>
        <ul class="crafting-io-outputs">
          {#each item.members as member, memberIndex (member.name + memberIndex)}
            <AwardPill item={member} variant="output" />
          {/each}
        </ul>
      </Well>
    {:else}
      <!-- A group's amounts are its alternatives', so its own amount cell states none. -->
      <span class="crafting-io-output-none" aria-hidden="true">—</span>
    {/if}
  {:else if column.key === 'name'}
    {@render identity(
      resolveCraftingArt(item.img, item.glyph),
      item.name,
      'crafting-io-label',
      'crafting-io-name crafting-io-output-name'
    )}
  {:else}
    <span class="crafting-io-output-qty">{item.amountText ?? `×${item.qty ?? 1}`}</span>
  {/if}
{/snippet}

<section class="crafting-io" data-recipe-section="io">
  {#if slots.length > 0}
    <div class="crafting-io-group" data-io-group="ingredients">
      {#snippet chooser()}
        <IngredientOptionSelector
          choices={openStacks}
          need={openSlot?.need ?? 0}
          onChoose={onChooseOption}
        />
        {#if poolOpen}
          <EssencePoolPanel
            pool={craftability?.essencePool ?? null}
            {readOnly}
            onAllocate={(itemKey, units) => onAllocateEssence?.(itemKey, units)}
          />
        {/if}
      {/snippet}
      <!-- The rail's chooser owns the one panel region, so a slot with nothing to show opens none. -->
      <RequirementRail
        {slots}
        {openSlotId}
        {readOnly}
        {announcement}
        {panelId}
        choices={ingredientChoices}
        {onOpenSlot}
        {onChooseOption}
        {onPickForMe}
        chooser={openStacks.length > 0 || poolOpen ? chooser : null}
      />
      <ConsumptionPlanPanel {plan} {overshoots} {formatList} />
    </div>
  {/if}

  {#if essences.length > 0}
    <DataTable
      data-io-group="essences"
      heading={localize('FABRICATE.App.Crafting.Io.Essences')}
      columns={essenceColumns}
      rows={essences}
      rowKey={(state, index) => state.type ?? state.essenceType ?? index}
      rowData={(state) => ({ 'data-io-satisfied': state.satisfied ? 'true' : 'false' })}
      cell={essenceCell}
    />
  {/if}

  {#if tools.length > 0}
    <DataTable
      data-io-group="tools"
      heading={localize('FABRICATE.App.Crafting.Io.Tools')}
      columns={toolColumns}
      rows={tools}
      rowKey={(tool, index) => tool.componentId ?? `${tool.name}-${index}`}
      rowData={(tool) => ({ 'data-io-satisfied': tool.available ? 'true' : 'false' })}
      cell={toolCell}
    />
  {/if}

  {#if outputs.length > 0}
    <DataTable
      data-io-group="outputs"
      heading={localize('FABRICATE.App.Crafting.Io.Output')}
      columns={outputColumns}
      rows={outputs}
      rowKey={(item, index) => `${item.name}-${index}`}
      rowData={(item) => ({ 'data-io-output': item.kind ?? 'component' })}
      cell={outputCell}
    />
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
    gap: var(--fab-space-chip);
  }

  .crafting-io-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  /* A cell's identity: the art tile or the essence glyph to the left of the name. */
  .crafting-io-label,
  .crafting-io-tool-label {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .crafting-io-essence-icon {
    flex: 0 0 auto;
    font-size: 14px;
    color: var(--fab-text-muted);
  }

  .crafting-io-output-none {
    color: var(--fab-text-muted);
  }

  .crafting-io-outputs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }
</style>

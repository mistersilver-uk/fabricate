<!-- Svelte 5 runes mode -->
<!--
  IngredientSetSelector lets the player pick which ingredient set (route) the craft will consume,
  driving store.chooseIngredientSet. It is an ingredient-route comparison drawn as a
  RadioCardGroup (issue 1778), as the Journal draws a stage's routes: each route is a radio card
  labelled by its name, stating its craftability (craftable / missing N / blocked by tools) as a
  status chip and the products it makes as dense list rows, chosen or not. Renders nothing for a
  single-set recipe.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import ListRow from '../../../components/ListRow.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { ingredientOptionStatus } from '../../../util/ingredientOptionStatus.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';

  let { sets = [], selectedSetId = null, onChoose = null } = $props();

  const uid = $props.id();
  const options = $derived(
    (Array.isArray(sets) ? sets.filter((set) => set?.id) : []).map((set) => ({
      ...set,
      value: set.id,
    }))
  );
  const multiple = $derived(options.length > 1);

  const STATUS_LABEL_KEYS = {
    craftable: 'FABRICATE.App.Crafting.Detail.OptionCraftable',
    blocked: 'FABRICATE.App.Crafting.Detail.OptionBlocked',
    missing: 'FABRICATE.App.Crafting.Detail.OptionMissing',
  };

  function statusOf(set) {
    return ingredientOptionStatus(set?.craftability);
  }
  function statusLabel(status) {
    if (status.token === 'missing') {
      return localize(STATUS_LABEL_KEYS.missing, { count: status.count });
    }
    return localize(STATUS_LABEL_KEYS[status.token] ?? STATUS_LABEL_KEYS.craftable);
  }
  function productsOf(set) {
    return Array.isArray(set?.products) ? set.products : [];
  }
</script>

{#if multiple}
  <section class="crafting-set-selector" data-recipe-section="ingredient-sets">
    <RadioCardGroup
      legend={localize('FABRICATE.App.Crafting.Detail.IngredientSetsTitle')}
      legendVisible
      {options}
      selectedValue={selectedSetId ?? ''}
      groupName={`crafting-route-${uid}`}
      optionDataAttr="data-set-id"
      configCards={true}
      onChange={(id) => onChoose?.(id)}
    >
      {#snippet optionBody(set)}
        {@const status = statusOf(set)}
        {@const products = productsOf(set)}
        <div class="fab-stack" data-gap="1">
          <div class="fab-cluster" data-gap="1">
            {#if set.id === selectedSetId}
              <Chip density="list">{localize('FABRICATE.App.Crafting.Detail.SelectedRoute')}</Chip>
            {/if}
            <Chip
              density="list"
              tone={statusChipTone(status.tone)}
              icon={status.icon}
              data-option-status={status.token}
              data-option-status-tone={status.tone}>{statusLabel(status)}</Chip
            >
          </div>
          {#if products.length > 0}
            <Kicker as="span">{localize('FABRICATE.App.Crafting.Detail.OptionProduces')}</Kicker>
            {#each products as product, index (product.name + index)}
              <ListRow
                name={product.name}
                {...resolveCraftingArt(product.img)}
                quantity={`×${product.qty}`}
              />
            {/each}
          {/if}
        </div>
      {/snippet}
    </RadioCardGroup>
  </section>
{/if}

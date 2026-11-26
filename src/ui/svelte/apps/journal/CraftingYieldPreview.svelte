<!-- Svelte 5 runes mode -->
<!-- The viewed crafting stage's yield preview: its tiers, its progressive budget or its routes,
     moved out of `RunDetail.svelte`. `current` says whether the stage is the run's own. -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import ListRow from '../../components/ListRow.svelte';
  import OutcomeLadder from '../../components/OutcomeLadder.svelte';
  import JournalFactRow from './JournalFactRow.svelte';
  import { previewName, previewTiers, quantityText } from './runDetailPresentation.js';

  const AWARD_MODES = Object.freeze({
    equal: 'FABRICATE.App.Journal.Yields.AwardModes.equal',
    exceed: 'FABRICATE.App.Journal.Yields.AwardModes.exceed',
    partial: 'FABRICATE.App.Journal.Yields.AwardModes.partial',
  });

  let { craftingYield = null, current = true } = $props();
</script>

{#if craftingYield}
  <div data-journal-crafting-yield={craftingYield.presentation}>
    {#if craftingYield.presentation === 'tiers'}
      <OutcomeLadder
        tiers={previewTiers(craftingYield.tiers, localize)}
        emptyTierText={localize('FABRICATE.App.Journal.Yields.None')}
        label={localize('FABRICATE.App.Journal.Yields.PreviewTitle')}
        successLabel={localize('FABRICATE.Check.Evidence.Success')}
        failureLabel={localize('FABRICATE.Check.Evidence.Failure')}
        hint={localize(
          current
            ? 'FABRICATE.App.Journal.Yields.CraftingPreviewHint'
            : 'FABRICATE.App.Journal.Yields.FuturePreviewHint'
        )}
      />
    {:else if craftingYield.presentation === 'progressive'}
      <InspectorCard>
        <h3>{localize('FABRICATE.App.Journal.Yields.ProgressiveTitle')}</h3>
        <p>{localize('FABRICATE.App.Journal.Yields.ProgressiveHint')}</p>
        <JournalFactRow
          label={localize('FABRICATE.App.Journal.Yields.AwardMode')}
          value={localize(AWARD_MODES[craftingYield.progressive?.awardMode] ?? AWARD_MODES.equal)}
        />
        {#each craftingYield.progressive?.stages ?? [] as entry, index (index)}
          <ListRow
            name={`${index + 1}. ${previewName(entry, localize)}`}
            art={entry.art ?? ''}
            quantity={entry.quantity ?? localize('FABRICATE.App.Journal.History.NotRecorded')}
            detail={entry.cost == null
              ? localize('FABRICATE.App.Journal.Yields.UnknownCost')
              : localize('FABRICATE.App.Journal.Yields.BudgetCost', {
                  quantity: entry.quantity,
                  cost: entry.cost,
                })}
          />
        {/each}
      </InspectorCard>
    {:else if craftingYield.presentation === 'routes'}
      <p>{localize('FABRICATE.App.Journal.History.FutureRoutes')}</p>
      {#each craftingYield.routes ?? [] as route, index (index)}
        <section class="fab-stack" data-gap="1">
          <Kicker>{route.name || localize('FABRICATE.App.Journal.Stage.Route')}</Kicker>
          {#each route.entries ?? [] as entry, itemIndex (entry.id ?? itemIndex)}
            <ListRow
              name={previewName(entry, localize)}
              art={entry.art ?? ''}
              quantity={quantityText(entry.qty, localize)}
            />
          {:else}<p>{localize('FABRICATE.App.Journal.History.NotRecorded')}</p>{/each}
        </section>
      {/each}
    {/if}
  </div>
{/if}

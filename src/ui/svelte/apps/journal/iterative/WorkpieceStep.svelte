<!-- Svelte 5 runes mode -->
<!-- The live step's body (issue 3011, D-5): the workpiece's counters under its started-with and
     saved caption, the step's results with the one the rules select now, and one card per Crafting
     Action. A redacted run draws no results, because they would name the recipe's yields. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Kicker from '../../../components/Kicker.svelte';
  import OutcomeLadder from '../../../components/OutcomeLadder.svelte';
  import { quantityText } from '../runDetailPresentation.js';
  import ActionCard from './ActionCard.svelte';
  import CounterSection from './CounterSection.svelte';

  const K = Object.freeze({
    saved: 'FABRICATE.App.Journal.Iterative.Workpiece.Saved',
    saving: 'FABRICATE.App.Journal.Iterative.Workpiece.Saving',
    actions: 'FABRICATE.App.Journal.Iterative.Workpiece.ActionsKicker',
    actionsCaption: 'FABRICATE.App.Journal.Iterative.Workpiece.ActionsCaption',
    results: 'FABRICATE.App.Journal.Iterative.Route.Label',
    now: 'FABRICATE.App.Journal.Iterative.Route.NowPill',
    success: 'FABRICATE.Check.Evidence.Success',
    failure: 'FABRICATE.Check.Evidence.Failure',
    none: 'FABRICATE.App.Journal.Yields.None',
  });

  /** `saving` while this run's press saves; `cardState(card)` and `onPress` belong to the view. */
  let { iterative, saving = false, services = null, cardState, onPress } = $props();

  const caption = $derived(
    [iterative.meta?.startedWith, iterative.meta?.hidden, localize(saving ? K.saving : K.saved)]
      .filter(Boolean)
      .join(' ')
  );
  const tiers = $derived(
    (iterative.routes?.tiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      band: tier.band,
      fail: tier.fail,
      props: { title: tier.title },
      yields: (tier.yields ?? []).map((item) => ({
        id: item.id,
        name: item.name ?? '',
        art: item.img ?? '',
        quantity: quantityText(item.quantity, localize),
      })),
    }))
  );
</script>

<div class="workpiece-step">
  <CounterSection counters={iterative.counters ?? []} {caption}>
    {#if !iterative.redacted && tiers.length > 0}
      <OutcomeLadder
        {tiers}
        reachedId={iterative.routes.reachedId}
        reachedLabel={localize(K.now)}
        label={localize(K.results)}
        emptyTierText={localize(K.none)}
        successLabel={localize(K.success)}
        failureLabel={localize(K.failure)}
      />
    {/if}
  </CounterSection>
  <section class="workpiece-step-section">
    <div class="workpiece-step-heading">
      <Kicker as="span">{localize(K.actions)}</Kicker>
      <span class="workpiece-step-caption">{localize(K.actionsCaption)}</span>
    </div>
    <div class="workpiece-cards">
      {#each iterative.cards ?? [] as card (card.actionId)}
        <ActionCard {card} state={cardState(card)} {services} {onPress} />
      {/each}
    </div>
  </section>
</div>

<style>
  .workpiece-step,
  .workpiece-step-section {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }
  .workpiece-step-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--fab-space-2);
  }
  .workpiece-step-caption {
    font-size: 10.5px;
    color: var(--fab-text-muted);
  }
  .workpiece-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    grid-auto-rows: 1fr;
    gap: var(--fab-space-2);
  }
</style>

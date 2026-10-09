<!-- Svelte 5 runes mode -->
<!--
  RollResultBox shows the outcome of the player's most recent craft of the current
  recipe (store.lastRollResult[recipeId]). It is defensive about the result shape:
  it surfaces a success/failure tone, the rolled total and outcome label when
  present, a summed or counted check's outcome sentence, an optional message, the executed check's
  evidence rows, and any awarded items. A pool reduced to zero states no total. Renders nothing
  when there is no recorded result.
-->
<script>
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { statesEvidence } from '../../../../presenters/checkEvidenceRows.js';
  import { countBotched, statesCountEvidence } from '../../../../presenters/countEvidenceRows.js';
  import CheckEvidenceRows from './CheckEvidenceRows.svelte';
  import AwardPill from './AwardPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { result = null } = $props();

  const success = $derived(result?.success !== false);
  const outcome = $derived(result?.outcome ?? result?.checkResult?.outcome ?? null);
  // A pool reduced to zero rolled nothing, so it states no total rather than 0 (issue 2006).
  const zeroPool = $derived(
    result?.check?.count?.zeroPool === true || result?.checkResult?.data?.zeroPool === true
  );
  const total = $derived(zeroPool ? null : (result?.total ?? result?.checkResult?.total ?? null));
  const message = $derived(typeof result?.message === 'string' ? result.message : '');
  const items = $derived(
    Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.awardedResults)
        ? result.awardedResults
        : []
  );
  // What the outcome means for the award, beside the check's evidence; a failure that still
  // awarded items says nothing rather than claim nothing was produced.
  const summary = $derived.by(() => {
    if (!statesEvidence(result?.check) && !statesCountEvidence(result?.check)) return '';
    if (success) return localize('FABRICATE.App.Crafting.Run.ResultProduced');
    if (items.length > 0) return '';
    return countBotched(result.check)
      ? localize('FABRICATE.Check.CountEvidence.Botched')
      : localize('FABRICATE.App.Crafting.Run.NothingProduced');
  });
</script>

{#if result}
  <InspectorCard
    class={`crafting-roll-box ${success ? 'is-success' : 'is-failure'}`}
    data-recipe-section="roll-result"
    data-roll-success={success ? 'true' : 'false'}
  >
    <header class="crafting-roll-head">
      <i class={`fas ${success ? 'fa-circle-check' : 'fa-circle-xmark'}`} aria-hidden="true"></i>
      <span class="crafting-roll-title">
        {success
          ? localize('FABRICATE.App.Crafting.Run.Completed')
          : localize('FABRICATE.App.Crafting.Run.Failed')}
      </span>
      {#if total !== null && total !== undefined}
        <span class="crafting-roll-total" data-roll-total>{total}</span>
      {/if}
    </header>
    {#if summary}
      <p class="crafting-roll-summary" data-roll-summary>{summary}</p>
    {/if}
    {#if outcome}
      <p class="crafting-roll-outcome">{outcome}</p>
    {/if}
    {#if message}
      <p class="crafting-roll-message">{message}</p>
    {/if}
    <CheckEvidenceRows check={result.check ?? null} />
    {#if items.length > 0}
      <ul class="crafting-roll-awards">
        {#each items as item, index (item.name + index)}
          <AwardPill {item} variant="roll" />
        {/each}
      </ul>
    {/if}
  </InspectorCard>
{/if}

<style>
  /* The box is the shared card's; the outcome is its tone fill. */
  :global(.crafting-roll-box.is-success) {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  :global(.crafting-roll-box.is-failure) {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .crafting-roll-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  :global(.crafting-roll-box.is-success) .crafting-roll-head i {
    color: var(--fab-success-text);
  }

  :global(.crafting-roll-box.is-failure) .crafting-roll-head i {
    color: var(--fab-danger-text);
  }

  .crafting-roll-title {
    font-weight: 600;
    font-size: 13px;
  }

  .crafting-roll-total {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 15px;
  }

  .crafting-roll-summary,
  .crafting-roll-outcome,
  .crafting-roll-message {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* The outcome sentence is set as frame 38's player result box sets it. */
  .crafting-roll-summary {
    font-size: 11px;
    line-height: 1.5;
  }

  .crafting-roll-awards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
  }
</style>

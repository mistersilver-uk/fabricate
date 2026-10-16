<!-- Svelte 5 runes mode -->
<!--
  RecipeProduceRow is one row of the recipe inspector's Produces list, toned by role: the item's
  image, or a component's cube or a currency or knowledge reward's glyph (issue 1773), its name,
  then a progressive entry's DC, or the group pill and the amount. A currency reward's amount
  carries its unit and a knowledge reward states its kind, since neither is a count of items. A
  choice group's row is its alternatives as rows of their own, in a box captioned with how many it
  awards and who chooses, as the Requires list draws an any-one-of requirement.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { localizeOr } from '../../../util/localizeOr.js';
  import RecipeProduceRow from './RecipeProduceRow.svelte';

  // What an unnamed reward reads as; an unnamed component reads as the host's `unknownName`.
  const UNNAMED_KEYS = Object.freeze({
    currency: 'FABRICATE.App.Crafting.Io.CurrencyReward',
    knowledge: 'FABRICATE.App.Crafting.Io.UnknownRecipe',
  });

  let { row, unknownName = '', dcLabel = null, groupPill = '' } = $props();

  const name = $derived(
    row.name || (UNNAMED_KEYS[row.kind] ? localize(UNNAMED_KEYS[row.kind]) : unknownName)
  );
  const amount = $derived(
    row.kind === 'knowledge'
      ? localize('FABRICATE.App.Crafting.Io.RecipeKnowledge')
      : row.kind === 'currency'
        ? row.amountLabel
        : `×${row.quantity}`
  );
  const caption = $derived(
    row.kind === 'group'
      ? [
          row.awardStrategy === 'upTo'
            ? localizeOr(
                'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.UpToCount',
                'Up to {count} of',
                {
                  count: row.count,
                }
              )
            : localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.AnyOneOf', 'Any one of'),
          row.chooser === 'rolled'
            ? localizeOr('FABRICATE.Admin.Manager.Recipe.ChoiceGroup.Rolled', 'Rolled')
            : localizeOr(
                'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.PlayerChooses',
                'Player chooses'
              ),
        ].join(' · ')
      : ''
  );
</script>

{#if row.kind === 'group'}
  <div
    class="manager-recipe-flow-anyof"
    data-recipe-produces-choice={row.failure ? 'failure' : 'success'}
  >
    <span class="manager-recipe-flow-anyof-label">
      <i class="fas fa-code-branch" aria-hidden="true"></i>
      {caption}
    </span>
    {#each row.members as member (member.id)}
      <RecipeProduceRow row={{ ...member, failure: row.failure }} {unknownName} {groupPill} />
    {/each}
  </div>
{:else}
  <div
    class={`manager-recipe-flow-row ${row.failure ? 'is-failure' : 'is-produced'}`}
    data-recipe-produces={row.failure ? 'failure' : 'success'}
    data-recipe-produces-kind={row.kind ?? 'component'}
  >
    <span class="manager-recipe-flow-icon" aria-hidden="true">
      {#if row.img}
        <img src={row.img} alt="" />
      {:else}
        <i class={row.icon || 'fas fa-cube'}></i>
      {/if}
    </span>
    <span class="manager-recipe-flow-name">{name}</span>
    {#if dcLabel !== null}
      <!-- Progressive: the component's DC (its ordered "cost") and no quantity, since each entry is
           awarded once and a "×1" would read as if every result is produced together. -->
      <span
        class="manager-recipe-flow-group manager-recipe-flow-dc"
        data-recipe-produces-dc={row.difficulty === null ? '' : String(row.difficulty)}
        >{dcLabel}</span
      >
    {:else}
      {#if groupPill}
        <!-- The GM-authored group name, toned by the role it plays. -->
        <span class={`manager-recipe-flow-group ${row.failure ? 'is-failure' : 'is-success'}`}
          >{groupPill}</span
        >
      {/if}
      <span class="manager-recipe-flow-qty">{amount}</span>
    {/if}
  </div>
{/if}

<!-- Svelte 5 runes mode -->
<!--
  One Crafting Action in the Actions browser, as a `ListRow` row or card from one component, so the
  grid carries the same state as the list: its icon, name, description, Counter costs, whether it
  rolls the crafting check, its effect count and, when it has blocking issues, how many.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `action` | a library Crafting Action | — | the persisted action |
  | `variant` | `'row'` \| `'grid'` | `'row'` | `grid` draws `ListRow`'s card layout |
  | `counterLabels` | `Map` of Counter id to label | empty | names each cost's Counter |
  | `blockingCount` | number | `0` | issues Validation reports on this action |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `onOpen(id)` | function | no-op | opens the Crafting Action editor |
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import ListRow from '../../../components/ListRow.svelte';
  import { interpolate } from '../checks/checksCopy.js';

  let {
    action,
    variant = 'row',
    counterLabels = new Map(),
    blockingCount = 0,
    text = (_key, fallback) => fallback,
    onOpen = () => {},
  } = $props();

  const isCard = $derived(variant === 'grid');
  const rolls = $derived(action.check === 'roll');
  const costs = $derived(Array.isArray(action.costs) ? action.costs : []);
  const effectCount = $derived(Array.isArray(action.effects) ? action.effects.length : 0);
  const description = $derived(
    action.description || text('FABRICATE.Admin.Manager.NoDescription', 'No description')
  );
  const effectsText = $derived(
    effectCount === 1
      ? text('FABRICATE.Admin.Manager.Iterative.EffectsOne', '1 effect')
      : interpolate(text('FABRICATE.Admin.Manager.Iterative.Effects', '{count} effects'), {
          count: effectCount,
        })
  );
  const blockingText = $derived(
    interpolate(text('FABRICATE.Admin.Manager.Iterative.StatusBlocking', '{count} blocking'), {
      count: blockingCount,
    })
  );
  const openLabel = $derived(
    interpolate(
      blockingCount > 0
        ? text('FABRICATE.Admin.Manager.Iterative.OpenActionBlocking', 'Open {name}, {blocking}')
        : text('FABRICATE.Admin.Manager.Iterative.OpenAction', 'Open {name}'),
      { name: action.label, blocking: blockingText }
    )
  );

  const costText = (cost) =>
    interpolate(text('FABRICATE.Admin.Manager.Iterative.CostChip', '{counter} −{amount}'), {
      counter: counterLabels.get(cost.counterId) ?? cost.counterId,
      amount: cost.amount,
    });
</script>

{#snippet badges()}
  <Chip tone="danger" icon="fas fa-circle-exclamation" data-iterative-blocking-chip>
    {blockingText}
  </Chip>
{/snippet}

{#snippet summary()}
  <span class="manager-iterative-action-description" class:is-empty={!action.description}>
    {description}
  </span>
{/snippet}

{#snippet meta()}
  <span class="manager-iterative-action-costs" data-iterative-action-costs>
    <Kicker as="span">
      {text('FABRICATE.Admin.Manager.Iterative.CostsLabel', 'Costs')}
    </Kicker>
    {#each costs as cost, index (index)}
      <Chip mono>{costText(cost)}</Chip>
    {:else}
      <span class="manager-iterative-action-none">
        {text('FABRICATE.Admin.Manager.Iterative.CostsNone', 'None')}
      </span>
    {/each}
  </span>
  <Chip
    tone={rolls ? 'info' : 'neutral'}
    icon={rolls ? 'fas fa-dice-d20' : 'fas fa-ban'}
    data-iterative-action-check={rolls ? 'roll' : 'none'}
  >
    {rolls
      ? text('FABRICATE.Admin.Manager.Iterative.RollsCheck', 'Rolls check')
      : text('FABRICATE.Admin.Manager.Iterative.NoCheck', 'No check')}
  </Chip>
  <span class="manager-iterative-action-effects" data-iterative-action-effects>{effectsText}</span>
{/snippet}

<ListRow
  name={action.label}
  icon={action.icon || 'fas fa-hand-back-fist'}
  density="default"
  layout={isCard ? 'card' : 'row'}
  markSize={isCard ? 38 : 34}
  tone={blockingCount > 0 ? 'danger' : 'neutral'}
  role="listitem"
  class="manager-iterative-action-row"
  data-iterative-action={action.id}
  data-iterative-action-blocking={blockingCount > 0 ? blockingCount : undefined}
  onOpen={() => onOpen(action.id)}
  openProps={{ 'aria-label': openLabel }}
  badges={blockingCount > 0 ? badges : undefined}
  children={summary}
  {meta}
/>

<style>
  .manager-iterative-action-description {
    display: block;
    overflow: hidden;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-iterative-action-description.is-empty {
    color: var(--fab-text-disabled);
  }

  .manager-iterative-action-costs {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .manager-iterative-action-none,
  .manager-iterative-action-effects {
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  .manager-iterative-action-effects {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
  }
</style>

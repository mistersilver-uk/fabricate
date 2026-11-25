<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor's Costs card: what the action pays from the workpiece's counters every
  session, before the check. Each cost is an amount expression, the counter it is paid from and
  whether the action needs enough of that counter to be taken.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `draft` | the staged action | — | read for `costs` |
  | `counters` | `{ id, label }[]` | `[]` | the counters a cost can be paid from |
  | `context` | `{ counterIds, tierIds }` | — | what a cost's marks are judged against |
  | `faults` | `{ code, reason?, field }[]` | `[]` | the action-level marks; this card draws its `costs` one |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `edit(change)` | function | no-op | runs `change(draft)`, the only way this card writes |
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Chip from '../../../components/Chip.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Select from '../../../components/Select.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';

  import ActionExpressionField from './ActionExpressionField.svelte';
  import FaultLine from './FaultLine.svelte';
  import { costFaults, isAmountFault, listEntryFaults } from './iterativeFieldFaults.js';
  import { deriveIterativeId } from './iterativeLibraryModel.js';

  let {
    draft,
    counters = [],
    context,
    faults = [],
    text = (_key, fallback) => fallback,
    edit = () => {},
  } = $props();

  const costs = $derived(arrayOrEmpty(draft.costs));
  const entryFaults = $derived(listEntryFaults('cost', costs));
  const marks = $derived(faults.filter((fault) => fault.field === 'costs'));

  function counterOptions(cost) {
    const options = counters.map((counter) => ({ value: counter.id, label: counter.label }));
    const missing = typeof cost.counterId === 'string' && !context.counterIds.has(cost.counterId);
    return missing ? [...options, { value: cost.counterId, label: cost.counterId }] : options;
  }

  const changeCost = (index, change) =>
    edit((action) => {
      change(action.costs[index]);
    });

  function addCost() {
    edit((action) => {
      const held = arrayOrEmpty(action.costs);
      const taken = held.map((cost) => cost.id);
      const entry = { id: deriveIterativeId('', 'cost', taken), counterId: counters[0]?.id ?? '' };
      action.costs = [...held, { ...entry, amount: '1', needsEnough: true }];
    });
  }

  const removeCost = (index) =>
    edit((action) => {
      action.costs = action.costs.filter((_, at) => at !== index);
    });
</script>

<InspectorCard data-iterative-section="costs">
  {#snippet leading()}<Chip tone="neutral" mono>1</Chip>{/snippet}
  {#snippet title()}{text('FABRICATE.Admin.Manager.Iterative.SectionCosts', 'Costs')}{/snippet}
  {#snippet note()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionCostsNote',
      'Paid every session'
    )}{/snippet}
  <div class="manager-iterative-card-body">
    <p class="manager-iterative-note">
      {text(
        'FABRICATE.Admin.Manager.Iterative.CostsLead',
        'Paid before the check, whatever it rolls. With Needs enough on, the action cannot be taken if that counter is too low; otherwise it pays what is left.'
      )}
    </p>
    {#if costs.length === 0}
      <p class="manager-iterative-note" data-iterative-costs-empty>
        {text('FABRICATE.Admin.Manager.Iterative.CostsEmpty', 'No counter costs.')}
      </p>
    {:else}
      <div class="manager-iterative-costs" role="list">
        {#each costs as cost, index (index)}
          {@const own = costFaults(cost, entryFaults[index], context)}
          {@const rowFaults = own.filter((fault) => !isAmountFault(fault))}
          <div class="manager-iterative-cost" role="listitem" data-iterative-cost={cost.id}>
            <div class="manager-iterative-cost-line">
              <ActionExpressionField
                value={String(cost.amount ?? '')}
                profile="cost"
                {counters}
                {text}
                faults={own.filter(isAmountFault)}
                kind="cost"
                ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CostAmountLabel', 'Cost amount')}
                onChange={(next) =>
                  changeCost(index, (entry) => {
                    entry.amount = next;
                  })}
              />
              <span class="manager-iterative-word"
                >{text('FABRICATE.Admin.Manager.Iterative.CostFrom', 'from')}</span
              >
              <Select
                size="inline"
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Iterative.CostCounterLabel',
                  'Cost counter'
                )}
                value={cost.counterId ?? null}
                options={counterOptions(cost)}
                invalid={rowFaults.length > 0}
                triggerProps={{ 'data-iterative-cost-counter': '' }}
                onChange={(next) =>
                  changeCost(index, (entry) => {
                    entry.counterId = next;
                  })}
              />
              <StatusToggle
                on={cost.needsEnough !== false}
                label={text('FABRICATE.Admin.Manager.Iterative.NeedsEnough', 'Needs enough')}
                ariaLabel={text('FABRICATE.Admin.Manager.Iterative.NeedsEnough', 'Needs enough')}
                data-iterative-cost-needs-enough
                onclick={() =>
                  changeCost(index, (entry) => {
                    entry.needsEnough = entry.needsEnough === false;
                  })}
              />
              <IconButton
                role="danger"
                size="24"
                icon="fas fa-xmark"
                data-iterative-cost-remove={cost.id}
                ariaLabel={text('FABRICATE.Admin.Manager.Iterative.RemoveCost', 'Remove cost')}
                onclick={() => removeCost(index)}
              />
            </div>
            <FaultLine faults={rowFaults} {text} />
          </div>
        {/each}
      </div>
    {/if}
    <FaultLine faults={marks} {text} />
    <Button role="dashed" icon="fas fa-plus" data-iterative-add-cost onclick={addCost}>
      {text('FABRICATE.Admin.Manager.Iterative.AddCost', 'Counter cost')}
    </Button>
  </div>
</InspectorCard>

<style>
  .manager-iterative-costs {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-iterative-cost {
    display: grid;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-iterative-cost-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--fab-space-2);
  }

  .manager-iterative-word {
    align-self: center;
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
  }
</style>

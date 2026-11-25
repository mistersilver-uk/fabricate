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

  Invariants:
  - Removing a cost hands focus to the adder, because the removed row's controls are gone, and
    adding one focuses its amount.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../components/Button.svelte';
  import Chip from '../../../components/Chip.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import Select from '../../../components/Select.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Well from '../../../components/Well.svelte';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';
  import { interpolate } from '../checks/checksCopy.js';

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

  const uid = $props.id();
  let card = $state(null);

  const costs = $derived(arrayOrEmpty(draft.costs));
  // The toggle's name is drawn in bold inside the sentence, so the sentence is split around it.
  const fromLead = $derived(
    text(
      'FABRICATE.Admin.Manager.Iterative.CostsFromLead',
      'Taken from the workpiece. With {toggle} on, the action can’t be taken if that counter is too low; otherwise it pays what’s left.'
    ).split('{toggle}')
  );
  const entryFaults = $derived(listEntryFaults('cost', costs));
  const marks = $derived(faults.filter((fault) => fault.field === 'costs'));

  function counterOptions(cost) {
    const options = counters.map((counter) => ({ value: counter.id, label: counter.label }));
    const missing = typeof cost.counterId === 'string' && !context.counterIds.has(cost.counterId);
    return missing ? [...options, { value: cost.counterId, label: cost.counterId }] : options;
  }

  const counterName = (cost) =>
    counters.find((counter) => counter.id === cost.counterId)?.label ?? cost.counterId ?? '';

  const changeCost = (index, change) =>
    edit((action) => {
      change(action.costs[index]);
    });

  async function addCost() {
    edit((action) => {
      const held = arrayOrEmpty(action.costs);
      const taken = held.map((cost) => cost.id);
      const entry = { id: deriveIterativeId('', 'cost', taken), counterId: counters[0]?.id ?? '' };
      action.costs = [...held, { ...entry, amount: '1', needsEnough: true }];
    });
    await tick();
    [...(card?.querySelectorAll('[data-iterative-amount="cost"]') ?? [])].at(-1)?.focus();
  }

  async function removeCost(index) {
    edit((action) => {
      action.costs = action.costs.filter((_, at) => at !== index);
    });
    await tick();
    card?.querySelector('[data-iterative-add-cost]')?.focus();
  }
</script>

{#snippet needsEnoughName()}{text(
    'FABRICATE.Admin.Manager.Iterative.NeedsEnough',
    'Needs enough'
  )}{/snippet}

<InspectorCard data-iterative-section="costs">
  {#snippet leading()}<Chip tone="neutral" mono>1</Chip>{/snippet}
  {#snippet title()}{text('FABRICATE.Admin.Manager.Iterative.SectionCosts', 'Costs')}{/snippet}
  {#snippet note()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionCostsNote',
      'Paid every session'
    )}{/snippet}
  <div class="manager-iterative-card-body" bind:this={card}>
    <p class="manager-iterative-note">
      {text(
        'FABRICATE.Admin.Manager.Iterative.CostsLead',
        'Paid before the check, whatever it rolls.'
      )}
    </p>
    <div class="manager-iterative-caption" data-iterative-costs-caption>
      <Kicker>{text('FABRICATE.Admin.Manager.Iterative.CostsFrom', 'From counters')}</Kicker>
      <p class="manager-iterative-note">
        {fromLead[0]}<strong
          >{text('FABRICATE.Admin.Manager.Iterative.NeedsEnough', 'Needs enough')}</strong
        >{fromLead.slice(1).join('')}
      </p>
    </div>
    {#if costs.length === 0}
      <p class="manager-iterative-note" data-iterative-costs-empty>
        {text('FABRICATE.Admin.Manager.Iterative.CostsEmpty', 'No counter costs.')}
      </p>
    {:else}
      <div class="manager-iterative-costs" role="list">
        {#each costs as cost, index (index)}
          {@const own = costFaults(cost, entryFaults[index], context)}
          {@const rowFaults = own.filter((fault) => !isAmountFault(fault))}
          {@const rowFaultId = `${uid}-cost-${index}-fault`}
          <Well role="listitem" data-iterative-cost={cost.id}>
            <div class="manager-iterative-cost">
              <div class="manager-iterative-cost-line">
                <ActionExpressionField
                  value={String(cost.amount ?? '')}
                  profile="cost"
                  {counters}
                  {text}
                  faults={own.filter(isAmountFault)}
                  kind="cost"
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Iterative.CostAmountLabel',
                    'Cost amount'
                  )}
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
                  ariaDescribedBy={rowFaults.length > 0 ? rowFaultId : ''}
                  triggerProps={{ 'data-iterative-cost-counter': '' }}
                  onChange={(next) =>
                    changeCost(index, (entry) => {
                      entry.counterId = next;
                    })}
                />
                <StatusToggle
                  on={cost.needsEnough !== false}
                  label={needsEnoughName}
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
                  ariaLabel={interpolate(
                    text('FABRICATE.Admin.Manager.Iterative.RemoveCost', 'Remove {counter} cost'),
                    { counter: counterName(cost) }
                  )}
                  onclick={() => removeCost(index)}
                />
              </div>
              <FaultLine faults={rowFaults} id={rowFaultId} {text} />
            </div>
          </Well>
        {/each}
      </div>
    {/if}
    <FaultLine faults={marks} {text} />
    <Button
      role="dashed"
      icon="fas fa-plus"
      class="manager-iterative-start"
      data-iterative-add-cost
      onclick={addCost}
    >
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

  .manager-iterative-caption {
    display: grid;
    gap: var(--fab-space-1);
  }

  .manager-iterative-caption strong {
    color: var(--fab-text-secondary);
    font-weight: 600;
  }

  .manager-iterative-cost-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--fab-space-2);
  }
</style>

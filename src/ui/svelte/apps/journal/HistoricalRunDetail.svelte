<script>
  import { localize } from '../../util/foundryBridge.js';
  import Callout from '../manager/Callout.svelte';
  import Chip from '../../components/Chip.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import Notice from '../../components/Notice.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import StageCard from '../../components/StageCard.svelte';
  import EssencePool from '../../components/EssencePool.svelte';
  import YieldScale from '../../components/YieldScale.svelte';
  import JournalFactRow from './JournalFactRow.svelte';
  import ThisRun from './ThisRun.svelte';
  import { presentHistory } from './historyPresentation.js';

  let { run, services = null, transient = false } = $props();
  const account = $derived(presentHistory(run, localize));
  const single = $derived(account.stages[0]);
  const recovery = $derived(run?.recoveryEvidence?.required === true);
  const text = (key, data) => localize(`FABRICATE.App.Journal.History.${key}`, data);
  function facts(stage) {
    return [
      {
        id: 'resolution',
        label: text(stage.kind === 'check' ? 'Rolled' : 'Resolution'),
        value: stage.resolution,
      },
      ...(stage.route ? [{ id: 'route', label: text('ChosenRoute'), value: stage.route }] : []),
      ...stage.tools.map((tool) => ({ id: tool.id, label: text('Tool'), value: tool.label })),
      ...(stage.currencySpends ?? []).map((spend, index) => ({
        id: `currency-${index}`,
        label: text('CurrencySpent'),
        value: `${spend.amount} ${spend.unit}`,
      })),
    ];
  }
  function stageIo(stage) {
    return [
      {
        kind: 'consumed',
        label: text('Consumed'),
        items: stage.consumed,
        emptyText: text('NotRecorded'),
      },
      {
        kind: 'produced',
        label: text('Produced'),
        items: stage.produced,
        tone: 'positive',
        emptyText: text(stage.createdResultsRecorded ? 'NothingBanked' : 'NotRecorded'),
      },
    ];
  }
</script>

{#snippet items(label, entries, kind)}
  {#if entries.length}
    <section class="journal-history-items" data-history-items={kind}>
      <Kicker>{label}</Kicker>
      <div class="journal-history-chips">
        {#each entries as item (item.id)}<Chip tone="neutral" icon="fas fa-box">{item.label}</Chip
          >{/each}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet essenceRecaps()}
  {#each account.stages.filter((stage) => stage.essence) as stage (stage.stepId)}
    <EssencePool
      history={stage.essence}
      label={text('EssenceSpent')}
      essenceLabel={() => text('NotRecorded')}
      sourceReading={(_source, contributions) =>
        contributions
          .map(
            (entry) =>
              `+${entry.amount} ${stage.essence.labels[entry.essenceId] || text('NotRecorded')}`
          )
          .join(' · ')}
    />
  {/each}
{/snippet}

<div class="journal-history-detail" data-journal-history-detail>
  {#if !recovery}
    {#if transient || account.failed}
      <Notice
        tone={account.failed ? 'danger' : 'success'}
        title={localize(`FABRICATE.App.Journal.Verdict.${run.status}`)}
        detail={account.failed ? account.failureDetail : ''}
        dataAttr="data-journal-verdict"
        dataValue={run.status}
      >
        {#snippet evidence()}
          {#if account.verdictCheck}<span data-history-verdict-check>{account.verdictCheck}</span
            >{/if}
          {#if transient && !account.multi && account.mode !== 'd100'}
            {#if account.summary}<span>{account.summary.value}</span>{/if}
            {@render items(text('Consumed'), single?.consumed ?? [], 'transient-consumed')}
            {@render items(
              text(account.gathering ? 'BroughtBack' : 'Crafted'),
              account.results,
              'transient-produced'
            )}
          {/if}
        {/snippet}
      </Notice>
    {/if}
    {#if account.summary && !transient}
      <InspectorCard data-history-summary={account.summary.kind}>
        <div class="journal-summary-heading">
          <Medallion
            size={26}
            icon={account.summary.kind === 'check' ? 'fas fa-dice-d20' : 'fas fa-layer-group'}
          />
          <Kicker>{text(account.summary.kind === 'check' ? 'FinalCheck' : 'Resolution')}</Kicker>
        </div>
        <JournalFactRow
          label={text(account.summary.kind === 'check' ? 'Rolled' : 'DecidedBy')}
          value={account.summary.value}
        />
      </InspectorCard>
    {/if}
    {#if account.multi}
      <section class="journal-history-stages" data-history-stages>
        <Kicker>{text('Stages')}</Kicker>
        {#each account.stages as stage, index (stage.stepId ?? index)}
          <StageCard
            presentation="history"
            {stage}
            {index}
            state={stage.status === 'failed' ? 'failed' : 'past'}
            io={stageIo(stage)}
            facts={facts(stage)}
          />
        {/each}
      </section>
      {@render essenceRecaps()}
    {:else if !transient && account.mode !== 'd100'}
      {@render items(
        text(account.cancelled ? 'AlreadySpent' : 'MaterialsUsed'),
        single?.consumed ?? [],
        'consumed'
      )}
      {#if single?.route}<JournalFactRow label={text('ChosenRoute')} value={single.route} />{/if}
      {#each single?.tools ?? [] as tool (tool.id)}<JournalFactRow
          label={text('Tool')}
          value={tool.label}
        />{/each}
      {#each single?.currencySpends ?? [] as spend, index (index)}<JournalFactRow
          label={text('CurrencySpent')}
          value={`${spend.amount} ${spend.unit}`}
        />{/each}
      {@render essenceRecaps()}
      {@render items(
        text(account.gathering ? 'BroughtBack' : 'Crafted'),
        account.results,
        'produced'
      )}
    {/if}
    {#if transient && !account.multi}{@render essenceRecaps()}{/if}
    {#if account.mode === 'd100' && run.gatheringYield?.entries?.length}
      <YieldScale
        entries={run.gatheringYield.entries}
        roll={run.gatheringYield.roll}
        label={text('Scale')}
        labels={{
          cleared: () => text('CameBack'),
          missed: () => text('MissedRoll'),
          threshold: () => text('NotRecorded'),
          quantity: (entry) =>
            entry.qty == null
              ? text('NotRecorded')
              : localize('FABRICATE.App.Journal.Quantity', { n: entry.qty }),
          chance: (entry) => (entry.chance == null ? text('NotRecorded') : `${entry.chance}%`),
          cut: (roll) => text('RolledValue', { roll }),
          topCutNote: () => text('TopCut'),
          bottomCutNote: () => text('BottomCut'),
          cutNote: () => text('Cut'),
        }}
      />
    {/if}
    {#if account.mode === 'routed'}
      <InspectorCard data-history-outcome-log>
        <Kicker>{text('OutcomeLog')}</Kicker>
        {#if account.failed}<JournalFactRow
            label={text('Rolled')}
            value={account.gatheringCheck || text('NotRecorded')}
          />{/if}
        <JournalFactRow label={text('Outcome')} value={account.gatheringOutcome} />
      </InspectorCard>
    {/if}
  {/if}
  <ThisRun {run} {services} />
  <Callout tone="neutral" text={account.closed} dataAttr="data-journal-guidance" />
</div>

<style>
  .journal-history-detail {
    display: grid;
    gap: var(--fab-space-4);
  }
  .journal-history-stages,
  .journal-history-items {
    display: grid;
    gap: var(--fab-space-2);
  }
  .journal-history-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }
</style>

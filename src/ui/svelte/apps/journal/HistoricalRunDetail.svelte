<!-- Renders the builder's entitled historical evidence, with unknowns local to each field. -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Callout from '../manager/Callout.svelte';
  import ListRow from '../../components/ListRow.svelte';
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
  const showTransient = $derived(transient && !account.settling);
  const single = $derived(account.stages[0]);
  const recovery = $derived(run?.recoveryEvidence?.required === true);
  const text = (key, data) => localize(`FABRICATE.App.Journal.History.${key}`, data);
  const resultHeading = $derived(
    text(run?.runType === 'salvage' ? 'Recovered' : account.gathering ? 'BroughtBack' : 'Crafted')
  );
  function dropEvidence(entry) {
    const evidence = [];
    if (['perRow', 'unknown'].includes(run.gatheringYield.rollModel)) {
      evidence.push(
        entry.rawRoll == null
          ? text('RollNotRecorded')
          : text('RolledValue', { roll: entry.rawRoll })
      );
    }
    if (
      entry.effectiveRoll != null &&
      (run.gatheringYield.rollModel !== 'perRow' || entry.effectiveRoll !== entry.rawRoll)
    ) {
      evidence.push(text('EffectiveRollValue', { roll: entry.effectiveRoll }));
    }
    evidence.push(
      entry.threshold == null
        ? text('ThresholdNotRecorded')
        : text('RecordedThreshold', { threshold: entry.threshold })
    );
    let outcome = 'OutcomeNotRecorded';
    if (entry.cleared === true) outcome = 'CheckCleared';
    else if (entry.cleared === false) outcome = 'MissedRoll';
    evidence.push(text(outcome));
    return evidence.join(' · ');
  }
  function facts(stage) {
    return [
      {
        id: 'resolution',
        label: text(stage.kind === 'check' ? 'Rolled' : 'Resolution'),
        value: stage.resolution,
      },
      ...(stage.route ? [{ id: 'route', label: text('ChosenRoute'), value: stage.route }] : []),
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
        emptyText: text(stage.createdResultsRecorded ? 'NothingBanked' : 'NotRecorded'),
      },
    ];
  }
</script>

{#snippet items(label, entries, kind)}
  {#if entries.length}
    <section class="journal-history-items" data-history-items={kind}>
      <Kicker>{label}</Kicker>
      <div class="journal-history-results">
        {#each entries as item (item.id)}<ListRow
            name={item.name}
            art={item.img ?? ''}
            quantity={item.quantityText}
            detail={item.evidence ?? ''}
            truncateName
          />{/each}
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
    {#if account.settling}
      <Notice tone="info" title={text('SettlementTitle')} dataAttr="data-journal-settling" />
    {:else if showTransient || account.failed}
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
          {#if showTransient && !account.multi && account.mode !== 'd100'}
            {#if account.summary}<span>{account.summary.value}</span>{/if}
            {@render items(text('Consumed'), single?.consumed ?? [], 'transient-consumed')}
            {@render items(resultHeading, account.results, 'transient-produced')}
          {/if}
        {/snippet}
      </Notice>
    {/if}
    {#if account.summary && !showTransient}
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
    {:else if !showTransient && account.mode !== 'd100'}
      {@render items(
        text(account.cancelled ? 'AlreadySpent' : 'MaterialsUsed'),
        single?.consumed ?? [],
        'consumed'
      )}
      {#if single?.route}<JournalFactRow label={text('ChosenRoute')} value={single.route} />{/if}
      {#each single?.currencySpends ?? [] as spend, index (index)}<JournalFactRow
          label={text('CurrencySpent')}
          value={`${spend.amount} ${spend.unit}`}
        />{/each}
      {@render essenceRecaps()}
      {@render items(resultHeading, account.results, 'produced')}
    {/if}
    {#if showTransient && !account.multi}{@render essenceRecaps()}{/if}
    {#if account.usableScale}
      <YieldScale
        entries={run.gatheringYield.entries}
        roll={run.gatheringYield.roll}
        rollModel={run.gatheringYield.rollModel ?? 'shared'}
        label={text('Scale')}
        labels={{
          evidence: dropEvidence,
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
      {#if account.unattributedResults.length}
        <p data-history-unattributed>{text('UnattributedAwards')}</p>
        {@render items(text('BroughtBack'), account.unattributedResults, 'produced')}
      {/if}
    {:else if account.mode === 'd100'}
      <JournalFactRow label={text('Scale')} value={text('NotRecorded')} />
      {@render items(text('BroughtBack'), account.results, 'produced')}
    {/if}
    {#if account.mode === 'routed'}
      <InspectorCard data-history-outcome-log="">
        <Kicker>{text('OutcomeLog')}</Kicker>
        {#if account.failed}<JournalFactRow
            label={text('Rolled')}
            value={account.gatheringCheck || text('NotRecorded')}
          />{/if}
        <JournalFactRow label={text('Outcome')} value={account.gatheringOutcome} />
      </InspectorCard>
    {/if}
    {@render items(text('ToolsUsed'), account.tools, 'tools')}
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
  .journal-history-results {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--fab-space-1);
  }
</style>

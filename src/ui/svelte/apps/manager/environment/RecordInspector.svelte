<!--
  The selected composition record's rail leaf: its hero, its live node count and its matching
  evidence, all read-only (issue 1522). The record's per-environment overrides are edited in place
  in its composition row, through `CompositionOverrideBody`.
-->
<script>
  import {
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG,
  } from '../../../../../gatheringImageDefaults.js';
  import { localize } from '../../../util/foundryBridge.js';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import MatchingEvidenceChips from './MatchingEvidenceChips.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { recordNodePool } from './recordNodePool.js';

  let { kind = 'task', environment = null, entry = null } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const defaultImg = $derived(
    kind === 'event' ? DEFAULT_GATHERING_EVENT_IMG : DEFAULT_GATHERING_TASK_IMG
  );
  const record = $derived(entry?.record || null);
  const name = $derived(
    record?.name ||
      entry?.id ||
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed')
  );
  const pool = $derived(recordNodePool(kind, entry, environment));
  const environmentMatchTitle = $derived(
    kind === 'event'
      ? text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.EventEnvironmentMatching',
          'Event Environment Matching'
        )
      : text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.TaskEnvironmentMatching',
          'Task Environment Matching'
        )
  );
</script>

{#if entry}
  <InspectorCard data-record-inspector={kind}>
    <div class="manager-inspector-title-row is-hero-large">
      <img class="manager-recipe-preview" src={record?.img || defaultImg} alt="" />
      <div class="manager-inspector-copy">
        <p class="manager-kicker">
          {kind === 'event'
            ? text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedEvent',
                'Selected event'
              )
            : text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.SelectedTask',
                'Selected task'
              )}
        </p>
        <h2 class="manager-inspector-name" title={name}>{name}</h2>
        <div class="manager-chip-row">
          <CompositionStatePill state={entry.compositionState} />
          <RuntimeStatePill state={entry.runtimeState} />
        </div>
      </div>
    </div>
  </InspectorCard>

  {#if pool.hasNodes}
    <InspectorCard data-record-inspector-section="nodes">
      <h3 class="manager-card-title">
        {text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableNodes',
          'Available nodes'
        )}
      </h3>
      <div class="manager-environment-node-count manager-environment-node-count-readonly">
        <span class="manager-environment-node-count-value" data-node-count>
          <strong>{pool.current}</strong>
          <span aria-hidden="true">/</span>
          <span>{pool.max}</span>
        </span>
      </div>
      {#if pool.nonRegenerating}
        <p class="manager-environment-node-no-restock-hint" data-node-no-restock-hint>
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NodeNoRestock',
            'Cannot restock — permanently depletable.'
          )}
        </p>
      {/if}
    </InspectorCard>
  {/if}

  <InspectorCard data-record-inspector-section="evidence">
    <h3 class="manager-card-title">{environmentMatchTitle}</h3>
    <MatchingEvidenceChips evidence={entry.evidence} variant="checks" />
  </InspectorCard>
{/if}

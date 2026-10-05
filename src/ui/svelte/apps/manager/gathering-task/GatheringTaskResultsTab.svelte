<!--
  The gathering task editor's Results tab (issue 1522): a Direct or Check task's result sets, a
  d100 task's component browser and drop rules, or a legacy Progressive task's pointer to Overview.
  The routed-tier and reward-rule warnings lead it in the stacking region; the view holds the
  save-blocking notice above the panel. Result sets are written whole via `onUpdateTask`.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Notice from '../../../components/Notice.svelte';
  import RecipeResultGroupCard from '../recipe/RecipeResultGroupCard.svelte';
  import RecipeResultsSection from '../recipe/RecipeResultsSection.svelte';
  import GatheringTaskCard from './GatheringTaskCard.svelte';
  import GatheringTaskComponentBrowserCard from './GatheringTaskComponentBrowserCard.svelte';
  import GatheringTaskDropsCard from './GatheringTaskDropsCard.svelte';
  import { resultNoticeCopy } from './taskResultNoticeCopy.js';

  let {
    text,
    task,
    taskResolutionMode,
    routedOutcomeTiers = [],
    noRoutedTiers = false,
    rewardRuleWarning = false,
    selectedRowId = '',
    rewardRules = null,
    itemCards = [],
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    characterModifierLibrary = [],
    searchTerm = $bindable(),
    pageIndex = $bindable(),
    pageSize = $bindable(),
    componentSearchTerm = $bindable(),
    componentTagSearchTerm = $bindable(),
    selectedComponentTags = $bindable(),
    componentPageIndex = $bindable(),
    componentPageSize = $bindable(),
    onUpdateTask = () => {},
    onAddDrop = () => {},
    onSelectDrop = () => {},
    onUpdateDrop = () => {},
    onMoveDrop = () => {},
    onImportDrop = () => {},
  } = $props();

  const copy = $derived(resultNoticeCopy(text));
  const resultGroups = $derived(Array.isArray(task?.resultGroups) ? task.resultGroups : []);
  const dropRows = $derived(Array.isArray(task?.dropRows) ? task.dropRows : []);
  function normalizeRoutedName(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  const routedTierMatches = $derived(
    (Array.isArray(routedOutcomeTiers) ? routedOutcomeTiers : []).map((tier) => {
      const normalizedName = normalizeRoutedName(tier?.name);
      return {
        ...tier,
        matchCount: normalizedName
          ? resultGroups.filter((group) => normalizeRoutedName(group?.name) === normalizedName)
              .length
          : 0,
      };
    })
  );
  function newResultGroupId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function'
      ? random()
      : `gathering-group-${Math.random().toString(36).slice(2, 12)}`;
  }

  function updateResultGroups(nextGroups) {
    onUpdateTask({ resultGroups: nextGroups });
  }

  function updateRoutedResultGroup(index, nextGroup) {
    updateResultGroups(
      resultGroups.map((group, groupIndex) => (groupIndex === index ? nextGroup : group))
    );
  }

  function addRoutedResultGroup() {
    updateResultGroups([...resultGroups, { id: newResultGroupId(), name: '', results: [] }]);
  }

  function removeRoutedResultGroup(index) {
    updateResultGroups(resultGroups.filter((_, groupIndex) => groupIndex !== index));
  }
</script>

{#if noRoutedTiers || rewardRuleWarning}
  <div class="manager-task-notices" data-notice-position="stack">
    {#if noRoutedTiers}
      <Notice tone="warning" title={copy.noRoutedTiers()} data-gathering-routed-no-tiers />
    {/if}
    {#if rewardRuleWarning}
      <Notice tone="warning" title={copy.rewardRule()} data-gathering-task-reward-rule-notice />
    {/if}
  </div>
{/if}

{#if taskResolutionMode === 'straight'}
  <GatheringTaskCard
    class="manager-task-results-card"
    title={text('FABRICATE.Admin.Manager.Environment.Tasks.Results.Title', 'Results')}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Results.StraightHint',
      'Direct gathering awards every item in this one result set without a yield roll.'
    )}
    data-gathering-task-results="straight"
  >
    <RecipeResultsSection
      {resultGroups}
      componentOptions={managedItemOptions}
      idPrefix="gathering-task-"
      onChange={updateResultGroups}
    />
  </GatheringTaskCard>
{:else if taskResolutionMode === 'routed'}
  <GatheringTaskCard
    class="manager-task-results-card"
    title={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Results.RoutedTitle',
      'Results by check'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Results.RoutedHint',
      'Name each result set after a gathering-check tier. Matching ignores surrounding spaces and letter case.'
    )}
    data-gathering-task-results="routed"
  >
    {#if routedTierMatches.length > 0}
      <ul class="manager-gathering-routed-tier-list" data-gathering-routed-tier-list>
        {#each routedTierMatches as tier (tier.id)}
          <li
            data-gathering-routed-tier-status={tier.id}
            data-match-count={tier.matchCount}
            class:is-matched={tier.matchCount === 1}
            class:is-mismatched={tier.matchCount !== 1}
          >
            <i
              class={tier.matchCount === 1 ? 'fas fa-check-circle' : 'fas fa-triangle-exclamation'}
              aria-hidden="true"
            ></i>
            <span class="manager-gathering-routed-tier-name">{tier.name}</span>
            <Chip tone={tier.matchCount === 1 ? 'positive' : 'warning'}>
              {tier.matchCount === 1
                ? text('FABRICATE.Admin.Manager.Environment.Tasks.Results.Matched', 'Matched')
                : text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.Results.MatchCount',
                    '{count} matching sets'
                  ).replace('{count}', tier.matchCount)}
            </Chip>
          </li>
        {/each}
      </ul>
    {/if}

    {#if resultGroups.length === 0}
      <EmptyState
        compact
        icon="fas fa-gift"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.Results.Empty',
          'No result sets yet'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.Results.EmptyHint',
          'Add a named set for each gathering-check tier that can produce results.'
        )}
      >
        <Button
          role="dashed"
          fullWidth
          data-gathering-add-result-set="empty"
          onclick={addRoutedResultGroup}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.Environment.Tasks.Results.AddSet',
              'Add result set'
            )}</span
          >
        </Button>
      </EmptyState>
    {:else}
      <ul class="manager-recipe-result-groups">
        {#each resultGroups as group, index (group?.id || index)}
          <li class="manager-recipe-result-group-item">
            <RecipeResultGroupCard
              {group}
              componentOptions={managedItemOptions}
              onChange={(nextGroup) => updateRoutedResultGroup(index, nextGroup)}
              onRemove={() => removeRoutedResultGroup(index)}
            />
          </li>
        {/each}
      </ul>
      <Button
        role="dashed"
        fullWidth
        data-gathering-add-result-set="footer"
        onclick={addRoutedResultGroup}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Results.AddSet',
            'Add result set'
          )}</span
        >
      </Button>
    {/if}
  </GatheringTaskCard>
{:else if taskResolutionMode === 'd100'}
  <GatheringTaskComponentBrowserCard
    {text}
    {itemCards}
    bind:componentSearchTerm
    bind:componentTagSearchTerm
    bind:selectedComponentTags
    bind:componentPageIndex
    bind:componentPageSize
  />

  <!-- A permanent rule, so a neutral callout before the table it explains. -->
  <Callout
    icon="fas fa-calculator"
    text={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.DropCalculationHelp',
      'Final drop chance = base chance + matching drop-level time/weather modifiers. Gathering modifiers affect the d100 roll.'
    )}
    data-gathering-task-drop-formula
  />

  <GatheringTaskDropsCard
    {text}
    {dropRows}
    {selectedRowId}
    {rewardRules}
    {managedItemOptions}
    {weatherOptions}
    {timeOfDayOptions}
    {biomeOptions}
    {characterModifierLibrary}
    bind:searchTerm
    bind:pageIndex
    bind:pageSize
    {onAddDrop}
    {onSelectDrop}
    {onUpdateDrop}
    {onMoveDrop}
    {onImportDrop}
  />
{:else}
  <EmptyState
    icon="fas fa-clock-rotate-left"
    title={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Results.ProgressiveTitle',
      'Results are not authored here'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Results.ProgressiveHint',
      'This legacy Progressive task keeps its own results. Choose another mode in the Gathering resolution card on Overview to author results here.'
    )}
    data-gathering-task-results="progressive"
  />
{/if}

<style>
  /* Layout only: each notice is the shared `Notice` and states its own appearance. */
  .manager-task-notices {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-gathering-routed-tier-list {
    display: grid;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-gathering-routed-tier-list li {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .manager-gathering-routed-tier-name {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
  }

  .manager-gathering-routed-tier-list .is-matched > i {
    color: var(--fab-success-text);
  }

  .manager-gathering-routed-tier-list .is-mismatched > i {
    color: var(--fab-warning-text);
  }
</style>

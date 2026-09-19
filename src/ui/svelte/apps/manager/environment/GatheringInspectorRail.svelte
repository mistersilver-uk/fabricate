<!-- Svelte 5 runes mode -->
<!--
  The gathering, travel and environment inspector rail: the branch chain that picks the task,
  event, rules or travel leaf, and the four states it owns itself — the gathering-tab
  placeholder, the selected environment's summary, the empty-library setup card and the
  no-selection empty state (issue 1707).

  Every reader and writer arrives as a prop from the shell, which still owns the state; the
  two `bind:` props are the character-modifier search anchor and term, shared by both subjects.
  `characterModifierSearchOpenUp` is a plain value because only the drop list computes it.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import GatheringEventInspector from './GatheringEventInspector.svelte';
  import GatheringRulesInspector from './GatheringRulesInspector.svelte';
  import GatheringTaskInspector from './GatheringTaskInspector.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import TravelInspector from '../world/TravelInspector.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    currentView,
    displayedGatheringTab,
    isWorldTravelRoute,
    activeGatheringInspectorTab,
    selectedGatheringTask,
    editingGatheringTask,
    selectedGatheringDrop,
    activeGatheringTaskEnvironmentCount,
    gatheringTaskAvailability,
    gatheringTaskDropRows,
    gatheringTaskImage,
    gatheringTaskName,
    gatheringTaskReferencingEnvironments,
    gatheringDropCountValue,
    gatheringDropImage,
    gatheringDropName,
    gatheringDropRateTierClass,
    gatheringDropRateTierColor,
    gatheringDropRateValue,
    gatheringDropModifierPickerSelection,
    characterModifierSearchSuggestions,
    selectedGatheringEvent,
    editingGatheringEvent,
    activeGatheringEventEnvironmentCount,
    gatheringEventReferencingEnvironments,
    gatheringEventModifierPickerSelection,
    eventCharacterModifierSearchSuggestions,
    sortedDangerTags,
    selectedSystemModifiers,
    characterModifierSearchOpenUp,
    gatheringConditionAvailableOptions,
    gatheringConditionLabel,
    gatheringConditionModifierRows,
    gatheringModifierCardHint,
    gatheringModifierCardTitle,
    gatheringModifierDisplayValue,
    gatheringModifierKindIcon,
    gatheringModifierValueClass,
    signedToOperatorValue,
    rowCharacterModifiers,
    characterModifierIconForRef,
    characterModifierIsCustomized,
    characterModifierLabelForRef,
    characterModifierLibraryEntry,
    characterModifierOperatorClass,
    selectedGatheringRules,
    worldTravelTab,
    selectedTravelRealm,
    selectedMapRegion,
    worldRealms,
    travelSaving,
    selectedEnvironment,
    selectedEnvironmentFacts,
    selectedEnvironmentSceneState,
    environmentList,
    environmentValidationCount,
    environmentSaveError,
    environmentDirtyFor,
    environmentInvalidFor,
    environmentImage,
    environmentName,
    environmentSelectionModeLabel,
    environmentStatusLabel,
    hasEnvironmentImage,
    truncateDescription,
    characterModifierSearchAnchor = $bindable(),
    characterModifierSearchTerm = $bindable(),
    onDuplicateDrop = () => {},
    onDeleteDrop = () => {},
    onUpdateDrop = () => {},
    onDropCountInput = () => {},
    onDropCountBlur = () => {},
    onDropCountKeydown = () => {},
    onSelectDropModifierPickerOption = () => {},
    onAddDropConditionModifier = () => {},
    onUpdateDropConditionModifier = () => {},
    onDropConditionModifierKeydown = () => {},
    onDeleteDropConditionModifier = () => {},
    onPickDropCharacterModifier = () => {},
    onUpdateDropCharacterModifier = () => {},
    onDeleteDropCharacterModifier = () => {},
    onSetDropCharacterModifierOverride = () => {},
    onSelectEventModifierPickerOption = () => {},
    onAddEventConditionModifier = () => {},
    onUpdateEventConditionModifier = () => {},
    onEventConditionModifierKeydown = () => {},
    onDeleteEventConditionModifier = () => {},
    onPickEventCharacterModifier = () => {},
    onUpdateEventCharacterModifier = () => {},
    onDeleteEventCharacterModifier = () => {},
    onSetEventCharacterModifierOverride = () => {},
    onUpdateRules = () => {},
    onDeleteRealm = () => {},
    onRenameRealm = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

{#if (currentView === 'environments' && displayedGatheringTab === 'tasks') || currentView === 'gathering-task-edit'}
  <GatheringTaskInspector
    editing={currentView === 'gathering-task-edit'}
    task={selectedGatheringTask}
    editingTask={editingGatheringTask}
    selectedDrop={selectedGatheringDrop}
    {activeGatheringTaskEnvironmentCount}
    {environmentImage}
    {environmentName}
    {gatheringDropCountValue}
    {gatheringDropImage}
    {gatheringDropName}
    {gatheringDropRateTierClass}
    {gatheringDropRateTierColor}
    {gatheringDropRateValue}
    {gatheringTaskAvailability}
    {gatheringTaskDropRows}
    {gatheringTaskImage}
    {gatheringTaskName}
    {gatheringTaskReferencingEnvironments}
    {truncateDescription}
    {onDuplicateDrop}
    {onDeleteDrop}
    {onUpdateDrop}
    {onDropCountInput}
    {onDropCountBlur}
    {onDropCountKeydown}
    suggestions={characterModifierSearchSuggestions}
    characterModifierLibrary={selectedSystemModifiers}
    {characterModifierSearchOpenUp}
    bind:characterModifierSearchAnchor
    bind:characterModifierSearchTerm
    {gatheringConditionAvailableOptions}
    {gatheringConditionLabel}
    {gatheringConditionModifierRows}
    {gatheringModifierCardHint}
    {gatheringModifierCardTitle}
    {gatheringModifierDisplayValue}
    {gatheringModifierKindIcon}
    {gatheringModifierValueClass}
    {signedToOperatorValue}
    {rowCharacterModifiers}
    {characterModifierIconForRef}
    {characterModifierIsCustomized}
    {characterModifierLabelForRef}
    {characterModifierLibraryEntry}
    {characterModifierOperatorClass}
    modifierPickerSelection={gatheringDropModifierPickerSelection}
    onSelectModifierPickerOption={onSelectDropModifierPickerOption}
    {onAddDropConditionModifier}
    {onUpdateDropConditionModifier}
    {onDropConditionModifierKeydown}
    {onDeleteDropConditionModifier}
    {onPickDropCharacterModifier}
    {onUpdateDropCharacterModifier}
    {onDeleteDropCharacterModifier}
    {onSetDropCharacterModifierOverride}
  />
{:else if (currentView === 'environments' && displayedGatheringTab === 'encounters') || currentView === 'gathering-event-edit'}
  <GatheringEventInspector
    editing={currentView === 'gathering-event-edit'}
    editingEvent={editingGatheringEvent}
    selectedEvent={selectedGatheringEvent}
    {activeGatheringEventEnvironmentCount}
    {environmentImage}
    {environmentName}
    {gatheringEventReferencingEnvironments}
    {sortedDangerTags}
    {truncateDescription}
    suggestions={eventCharacterModifierSearchSuggestions}
    characterModifierLibrary={selectedSystemModifiers}
    {characterModifierSearchOpenUp}
    bind:characterModifierSearchAnchor
    bind:characterModifierSearchTerm
    {gatheringConditionAvailableOptions}
    {gatheringConditionLabel}
    {gatheringConditionModifierRows}
    {gatheringModifierCardHint}
    {gatheringModifierCardTitle}
    {gatheringModifierDisplayValue}
    {gatheringModifierKindIcon}
    {gatheringModifierValueClass}
    {signedToOperatorValue}
    {rowCharacterModifiers}
    {characterModifierIconForRef}
    {characterModifierIsCustomized}
    {characterModifierLabelForRef}
    {characterModifierLibraryEntry}
    {characterModifierOperatorClass}
    modifierPickerSelection={gatheringEventModifierPickerSelection}
    onSelectModifierPickerOption={onSelectEventModifierPickerOption}
    onAddConditionModifier={onAddEventConditionModifier}
    onUpdateConditionModifier={onUpdateEventConditionModifier}
    onConditionModifierKeydown={onEventConditionModifierKeydown}
    onDeleteConditionModifier={onDeleteEventConditionModifier}
    onPickCharacterModifier={onPickEventCharacterModifier}
    onUpdateCharacterModifier={onUpdateEventCharacterModifier}
    onDeleteCharacterModifier={onDeleteEventCharacterModifier}
    onSetCharacterModifierOverride={onSetEventCharacterModifierOverride}
  />
{:else if currentView === 'environments' && displayedGatheringTab === 'settings'}
  <GatheringRulesInspector rules={selectedGatheringRules} onUpdate={onUpdateRules} />
{:else if isWorldTravelRoute}
  <TravelInspector
    travelTab={worldTravelTab}
    realm={selectedTravelRealm}
    mapRegion={selectedMapRegion}
    realms={worldRealms}
    {travelSaving}
    {onDeleteRealm}
    {onRenameRealm}
  />
{:else if currentView === 'environments' && activeGatheringInspectorTab}
  <section
    class="fabricate-card manager-inspector-card"
    data-gathering-inspector-placeholder={activeGatheringInspectorTab.id}
  >
    <div class="manager-inspector-title-row is-hero-large">
      <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
        <i class={activeGatheringInspectorTab.icon}></i>
      </span>
      <div class="manager-inspector-copy">
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections')}
        </p>
        <h2 class="manager-inspector-name">
          {text(activeGatheringInspectorTab.titleKey, activeGatheringInspectorTab.titleFallback)}
        </h2>
      </div>
    </div>
    <p class="manager-muted">
      {text(activeGatheringInspectorTab.hintKey, activeGatheringInspectorTab.hintFallback)}
    </p>
  </section>
{:else if selectedEnvironment}
  <section class="fabricate-card manager-inspector-card">
    <img
      class={`manager-environment-preview ${hasEnvironmentImage(selectedEnvironment) ? '' : 'is-fallback'}`}
      src={environmentImage(selectedEnvironment)}
      alt=""
    />
    <div class="manager-inspector-copy">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Environment.Selected', 'Selected environment')}
      </p>
      <h2 class="manager-inspector-name" title={environmentName(selectedEnvironment)}>
        {environmentName(selectedEnvironment)}
      </h2>
      <div class="manager-chip-row">
        <Chip tone={selectedEnvironment.enabled === false ? 'disabled' : 'active'}
          >{environmentStatusLabel(selectedEnvironment)}</Chip
        >
        <Chip>{environmentSelectionModeLabel(selectedEnvironment)}</Chip>
        <Chip tone={selectedEnvironmentSceneState.tone}>{selectedEnvironmentSceneState.label}</Chip>
      </div>
    </div>

    <p class="manager-muted">
      {truncateDescription(selectedEnvironment.description) ||
        text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
  </section>

  <section class="fabricate-card manager-inspector-card">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Environment.Details', 'Environment details')}
    </h3>
    <div class="manager-fact-grid">
      {#each selectedEnvironmentFacts as fact (fact.id)}
        <div class="manager-fact" data-environment-fact={fact.id}>
          <span class="manager-fact-line"
            ><strong>{fact.value}</strong>
            <span class="manager-fact-label">{fact.label}</span></span
          >
        </div>
      {/each}
      {#if selectedEnvironment.sceneUuid}
        <div class="manager-fact" data-environment-fact="scene">
          <span class="manager-fact-line"
            ><strong>{selectedEnvironmentSceneState.name || selectedEnvironment.sceneUuid}</strong>
            <span class="manager-fact-label"
              >{text('FABRICATE.Admin.Manager.Environment.Scene', 'Scene')}</span
            ></span
          >
        </div>
      {/if}
    </div>
  </section>

  {#if environmentDirtyFor(selectedEnvironment) || environmentInvalidFor(selectedEnvironment) || environmentSaveError}
    <section class="fabricate-card manager-inspector-card">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Environment.DraftState', 'Draft state')}
      </h3>
      <div class="manager-feature-list">
        {#if environmentDirtyFor(selectedEnvironment)}
          <Chip tone="warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</Chip>
        {/if}
        {#if environmentInvalidFor(selectedEnvironment)}
          <Chip tone="danger"
            >{text(
              'FABRICATE.Admin.Manager.Environment.ValidationCount',
              '{count} validation issues'
            ).replace('{count}', environmentValidationCount)}</Chip
          >
        {/if}
      </div>
      {#if environmentSaveError}
        <p class="manager-muted">{environmentSaveError}</p>
      {/if}
    </section>
  {/if}
{:else if environmentList.length === 0}
  <section
    class="manager-setup-card"
    aria-label={text(
      'FABRICATE.Admin.Manager.Environment.EmptySetup.Title',
      'Plan gathering content'
    )}
  >
    <div class="manager-setup-card-header">
      <i class="fas fa-seedling" aria-hidden="true"></i>
      <div>
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Environment.EmptySetup.Kicker', 'Gathering setup')}
        </p>
        <h3>
          {text('FABRICATE.Admin.Manager.Environment.EmptySetup.Title', 'Plan gathering content')}
        </h3>
      </div>
    </div>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Environment.EmptySetup.Hint',
        'Gathering tasks and events give environments consistent activities, risks, and rewards across gathering locations.'
      )}
    </p>
    <ol class="manager-setup-list">
      <li>
        {text(
          'FABRICATE.Admin.Manager.Environment.EmptySetup.StepTasks',
          'Define gathering tasks with their checks, timing, result groups, and failure outcomes.'
        )}
      </li>
      <li>
        {text(
          'FABRICATE.Admin.Manager.Environment.EmptySetup.StepEvents',
          'Prepare event options that can be reused across your locations.'
        )}
      </li>
      <li>
        {text(
          'FABRICATE.Admin.Manager.Environment.EmptySetup.StepCreate',
          'Create environments after the gathering task and event libraries are ready to attach.'
        )}
      </li>
    </ol>
    <div
      class="manager-setup-links"
      aria-label={text(
        'FABRICATE.Admin.Manager.Environment.EmptySetup.Resources',
        'Environment resources'
      )}
    >
      <ManagerButton
        tag="a"
        href="https://mistersilver-uk.github.io/fabricate/gathering/environments"
        target="_blank"
        rel="noreferrer"
      >
        <i class="fas fa-book-open" aria-hidden="true"></i>
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs',
            'Gathering docs'
          )}</span
        >
      </ManagerButton>
      <ManagerButton
        tag="a"
        href="https://mistersilver-uk.github.io/fabricate/help/quickstart"
        target="_blank"
        rel="noreferrer"
      >
        <i class="fas fa-circle-question" aria-hidden="true"></i>
        <span
          >{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Quickstart', 'Quickstart')}</span
        >
      </ManagerButton>
    </div>
  </section>
{:else}
  <EmptyState
    icon="fas fa-seedling"
    title={text('FABRICATE.Admin.Manager.Environment.SelectEnvironment', 'Select an environment')}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.InspectorHint',
      'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.'
    )}
  />
{/if}

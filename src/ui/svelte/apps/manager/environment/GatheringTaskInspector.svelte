<!-- Svelte 5 runes mode -->
<!--
  The gathering-task inspector column: the selected task's identity, details, drops-summary and
  environment-usage cards while browsing, the selected drop's rate, count and shared modifier
  panel while the task editor is open, and the no-selection empty state (issue 1707).

  `editing` is the task-editor route rather than a route token, and `task` being null renders the
  empty state alone. Every writer arrives from the shell; the eight `*Drop*Modifier*` ones take
  the drop id first, because this unit owns the row and binds it into the panel's arity here.
-->
<script>
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import GatheringModifierEditor from './GatheringModifierEditor.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    editing = false,
    task = null,
    editingTask = null,
    selectedDrop = null,
    /* The task and drop cards' shared readers. */
    activeGatheringTaskEnvironmentCount = () => 0,
    environmentImage = () => '',
    environmentName = () => '',
    gatheringDropCountValue = () => 1,
    gatheringDropImage = () => '',
    gatheringDropName = () => '',
    gatheringDropRateTierClass = () => '',
    gatheringDropRateTierColor = () => '',
    gatheringDropRateValue = () => 1,
    gatheringTaskAvailability = () => '',
    gatheringTaskDropRows = () => [],
    gatheringTaskImage = () => '',
    gatheringTaskName = () => '',
    gatheringTaskReferencingEnvironments = () => [],
    truncateDescription = () => '',
    /* The drop's own writers. */
    onDuplicateDrop = () => {},
    onDeleteDrop = () => {},
    onUpdateDrop = () => {},
    onDropCountInput = () => {},
    onDropCountBlur = () => {},
    onDropCountKeydown = () => {},
    /* Forwarded to `GatheringModifierEditor`, which declares their defaults; the eight
       drop-scoped writers are bound to the row below rather than forwarded as they arrive. */
    suggestions,
    characterModifierLibrary,
    characterModifierSearchOpenUp,
    characterModifierSearchAnchor = $bindable(),
    characterModifierSearchTerm = $bindable(),
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
    modifierPickerSelection,
    onSelectModifierPickerOption,
    onAddDropConditionModifier = () => {},
    onUpdateDropConditionModifier = () => {},
    onDropConditionModifierKeydown = () => {},
    onDeleteDropConditionModifier = () => {},
    onPickDropCharacterModifier = () => {},
    onUpdateDropCharacterModifier = () => {},
    onDeleteDropCharacterModifier = () => {},
    onSetDropCharacterModifierOverride = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

{#if task}
  {#if !editing}
    <section class="fabricate-card manager-inspector-card" data-gathering-task-inspector>
      <div class="manager-inspector-title-row is-hero-large">
        <img class="manager-recipe-preview" src={gatheringTaskImage(task)} alt="" />
        <div class="manager-inspector-copy">
          <p class="manager-kicker">
            {text('FABRICATE.Admin.Manager.Environment.Tasks.Selected', 'Selected gathering task')}
          </p>
          <h2 class="manager-inspector-name" title={gatheringTaskName(task)}>
            {gatheringTaskName(task)}
          </h2>
          <div class="manager-chip-row">
            <Chip tone={task.enabled === false ? 'disabled' : 'active'}>
              {task.enabled === false
                ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
                : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
            </Chip>
            <Chip>{gatheringTaskAvailability(task)}</Chip>
          </div>
        </div>
      </div>

      <p class="manager-muted">
        {truncateDescription(task.description) ||
          text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
      </p>
    </section>

    <section class="fabricate-card manager-inspector-card">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Environment.Tasks.Details', 'Gathering task details')}
      </h3>
      <div class="manager-fact-grid">
        <div class="manager-fact" data-gathering-task-fact="biomes">
          <!-- `{' '}` is the separator, not a literal space: a literal one is the last token -->
          <!-- inside the `{#if}` and Svelte trims block-trailing whitespace, rendering "3Biome". -->
          <!-- `prettier-ignore` preserves the LINE ANCHOR of the directive below, not -->
          <!-- the render (issue 923): Prettier splits a `<span>` holding an `{#if}` -->
          <!-- across several lines whatever the width, which moves the mustache off -->
          <!-- the line `eslint-disable-next-line` is anchored to, so the suppression -->
          <!-- stops applying and the violation resurfaces. The fence must be the LAST -->
          <!-- comment before the element to take effect. The durable guard for this -->
          <!-- whole class is `reportUnusedDisableDirectives: 'error'` in eslint.config.js. -->
          <!-- eslint-disable-next-line svelte/no-useless-mustaches --><!-- prettier-ignore -->
          <span class="manager-fact-line"><strong>{Array.isArray(task.biomes) && task.biomes.length > 0 ? task.biomes.length : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(task.biomes) && task.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
        </div>
        <div class="manager-fact" data-gathering-task-fact="drops">
          <span class="manager-fact-line"
            ><strong>{gatheringTaskDropRows(task).length}</strong>
            <span class="manager-fact-label"
              >{text('FABRICATE.Admin.Manager.Environment.Tasks.Drops', 'Drops')}</span
            ></span
          >
        </div>
        <div class="manager-fact" data-gathering-task-fact="environments">
          <span class="manager-fact-line"
            ><strong>{activeGatheringTaskEnvironmentCount(task)}</strong>
            <span class="manager-fact-label"
              >{text(
                'FABRICATE.Admin.Manager.Environment.Tasks.ActiveEnvironments',
                'Active environments'
              )}</span
            ></span
          >
        </div>
      </div>
    </section>

    <section class="fabricate-card manager-inspector-card" data-task-drops-summary>
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary', 'Drops summary')}
      </h3>
      {#if gatheringTaskDropRows(task).length === 0}
        <p class="manager-muted" data-task-drops-summary-empty>
          {text(
            'FABRICATE.Admin.Manager.Environment.Tasks.NoDropsConfigured',
            'No drops configured yet.'
          )}
        </p>
      {:else}
        <div class="manager-task-drops-summary-list" data-task-drops-summary-list>
          {#each gatheringTaskDropRows(task) as drop (drop.id)}
            <span class="manager-task-drop-summary-chip" data-task-drop-summary-chip>
              <img class="manager-task-drop-summary-thumb" src={gatheringDropImage(drop)} alt="" />
              <span class="manager-task-drop-summary-label" title={gatheringDropName(drop)}
                >{gatheringDropName(drop)}</span
              >
              <strong class="manager-task-drop-summary-percent"
                >{Math.max(1, Math.min(100, Math.floor(Number(drop?.dropRate ?? 1))))}%</strong
              >
            </span>
          {/each}
        </div>
      {/if}
    </section>

    <section
      class="fabricate-card manager-inspector-card manager-task-environment-usage-card"
      data-task-environment-usage
    >
      <h3 class="manager-card-title">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.UsedInEnvironmentsCard',
          'Used in environments'
        )}
      </h3>
      {#if gatheringTaskReferencingEnvironments(task).length === 0}
        <p class="manager-muted" data-task-environment-usage-empty>
          {text(
            'FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments',
            'Not used in any environments yet.'
          )}
        </p>
      {:else}
        <div class="manager-task-environment-usage-grid" data-task-environment-usage-chips>
          {#each gatheringTaskReferencingEnvironments(task) as environment (environment.id)}
            <article class="manager-task-environment-usage-card">
              <img
                class="manager-task-environment-usage-thumb"
                src={environmentImage(environment)}
                alt=""
              />
              <span class="manager-task-environment-usage-name" title={environmentName(environment)}
                >{environmentName(environment)}</span
              >
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if editing}
    {#if (editingTask?.resolutionMode || 'd100') === 'd100' && selectedDrop}
      <div class="manager-drop-inspector-stack" data-gathering-task-drop-inspector>
        <section class="fabricate-card manager-inspector-card manager-drop-editor-header-card">
          <h3 class="manager-card-title">
            {text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}
          </h3>
          <div class="manager-inspector-title-row">
            <img class="manager-recipe-preview" src={gatheringDropImage(selectedDrop)} alt="" />
            <div class="manager-inspector-copy">
              <h2 class="manager-inspector-name">
                {gatheringDropName(selectedDrop)}
              </h2>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.ModifiersApplyOnlyThisDrop',
                  'Modifiers below apply only to this drop.'
                )}
              </p>
            </div>
          </div>
          <div class="manager-drop-editor-actions">
            <ManagerButton
              aria-label={text(
                'FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop',
                'Duplicate'
              )}
              onclick={() => onDuplicateDrop(selectedDrop.id)}
            >
              <i class="fas fa-copy" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop',
                  'Duplicate'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="danger"
              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')}
              onclick={() => onDeleteDrop(selectedDrop.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')}</span>
            </ManagerButton>
          </div>
        </section>

        <div class="manager-drop-inspector-divider" aria-hidden="true"></div>

        <div class="manager-drop-inspector-scroll">
          <section class="fabricate-card manager-inspector-card manager-drop-editor-card">
            <div class="manager-drop-editor-values">
              <label
                class="fabricate-field manager-field manager-drop-rate-editor"
                data-gathering-drop-inspector-rate
              >
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.DropChance',
                    'Drop chance'
                  )}</span
                >
                <!--
        The shared control (issue 883).
      -->
                <ChanceSlider
                  value={gatheringDropRateValue(selectedDrop)}
                  numberLabel={text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent',
                    'Drop chance percent'
                  )}
                  rangeLabel={text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.DropChance',
                    'Drop chance'
                  )}
                  resolveColor={gatheringDropRateTierColor}
                  controlClass={gatheringDropRateTierClass(selectedDrop.dropRate)}
                  stopPropagation={true}
                  onChange={(dropRate) => onUpdateDrop(selectedDrop.id, { dropRate })}
                />
              </label>

              <label
                class="fabricate-field manager-field manager-drop-count-editor"
                data-gathering-drop-inspector-count
              >
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn',
                    'Count'
                  )}</span
                >
                <input
                  type="text"
                  inputmode="numeric"
                  pattern={'[1-9][0-9]{0,2}'}
                  value={gatheringDropCountValue(selectedDrop)}
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn',
                    'Count'
                  )}
                  oninput={(event) => onDropCountInput(selectedDrop.id, event)}
                  onblur={(event) => onDropCountBlur(selectedDrop, event)}
                  onkeydown={(event) => onDropCountKeydown(selectedDrop, event)}
                />
              </label>
            </div>
          </section>

          <GatheringModifierEditor
            subject="drop"
            row={selectedDrop}
            idPrefix={`drop-${selectedDrop.id}`}
            {suggestions}
            {characterModifierLibrary}
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
            {modifierPickerSelection}
            {onSelectModifierPickerOption}
            onAddConditionModifier={(kind, conditionId) =>
              onAddDropConditionModifier(selectedDrop.id, kind, conditionId)}
            onUpdateConditionModifier={(kind, modifierId, value) =>
              onUpdateDropConditionModifier(selectedDrop.id, kind, modifierId, value)}
            onConditionModifierKeydown={(kind, modifier, event) =>
              onDropConditionModifierKeydown(selectedDrop.id, kind, modifier, event)}
            onDeleteConditionModifier={(kind, modifierId) =>
              onDeleteDropConditionModifier(selectedDrop.id, kind, modifierId)}
            onPickCharacterModifier={(modifierId) =>
              onPickDropCharacterModifier(selectedDrop.id, modifierId)}
            onUpdateCharacterModifier={(refId, patch) =>
              onUpdateDropCharacterModifier(selectedDrop.id, refId, patch)}
            onDeleteCharacterModifier={(refId) =>
              onDeleteDropCharacterModifier(selectedDrop.id, refId)}
            onSetCharacterModifierOverride={(ref, enabled, libraryEntry) =>
              onSetDropCharacterModifierOverride(selectedDrop.id, ref, enabled, libraryEntry)}
          />
        </div>
      </div>
    {:else if (editingTask?.resolutionMode || 'd100') === 'd100'}
      <section class="fabricate-card manager-inspector-card" data-gathering-task-drop-inspector>
        <h3 class="manager-card-title">
          {text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}
        </h3>
        <p class="manager-muted">
          {text('FABRICATE.Admin.Manager.Environment.Tasks.NoDrops', 'No drops have been added.')}
        </p>
      </section>
    {/if}
  {/if}
{:else}
  <EmptyState
    icon="fas fa-list-check"
    title={text('FABRICATE.Admin.Manager.Environment.Tasks.SelectTask', 'Select a gathering task')}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.InspectorHint',
      'The inspector shows gathering task availability, active environment matches, and drop summaries for the selected row.'
    )}
  />
{/if}

<!--
  The Component Rules editor's Salvage card: the heading's mode pill and enable switch, the
  progressive banner and reorder policy, the result editor (the stage list, or result sets), and the
  routing, modifier-pick and check-override chrome. The view owns `salvageDraft`, what derives
  from it, and every write.

  Callbacks:
  - `onSalvageChange(patch)` — a shallow patch onto the salvage draft.
  - `onAddGroup()`, `onRemoveGroup(groupId)`, `onUpdateGroup(groupId, patch)` — result sets.
  - `onAddResult(groupId, componentId)`, `onRemoveResult(groupId, resultId)`,
    `onUpdateResult(groupId, result, value)` — a set's rows; the last also serves the stages.
  - `onSetRoute(outcomeName, groupId)` — an outcome's routed set, `''` for unrouted.
  - The stage, DC and open callbacks are forwarded to `ComponentSalvageStages` unchanged.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import Chip from '../../../components/Chip.svelte';
  import Callout from '../../../components/Callout.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import Button from '../../../components/Button.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Select from '../../../components/Select.svelte';
  import SubjectModifierPicker from '../SubjectModifierPicker.svelte';
  import PickerRow from '../recipe/PickerRow.svelte';
  import { toValue } from '../recipe/pickerRowKinds.js';
  import { componentCatalogue, resultAmountInvalid } from '../recipe/resultRows.js';
  // The salvage check override (issue 2005): the DC or the character-value adjustment.
  import CheckOverrideField from './CheckOverrideField.svelte';
  import ComponentSalvageStages from './ComponentSalvageStages.svelte';

  let {
    text,
    format,
    systemLabel = '',
    saving = false,
    instanceId = '',
    componentKey = '',
    salvageDraft,
    salvageResolutionMode = 'simple',
    salvageEnabled = false,
    salvageProgressive = false,
    salvageRouted = false,
    salvageSimpleMode = false,
    salvageHideAddGroup = false,
    salvageShowChrome = false,
    salvageShowDcOverride = false,
    salvageToggleDisabled = false,
    salvageDisabledNotice = '',
    salvageModeOption = null,
    salvageModeLabel = '',
    salvageRouteOptions = [],
    salvageAdderOptions = [],
    salvageOutcomeNames = [],
    salvageCheckEnabled = false,
    salvageCheckTiers = [],
    salvageCheckDc = 0,
    salvageCheckConfig = null,
    previewActors = [],
    resolvePreviewCharacter = () => null,
    checkModifierOptions = [],
    salvageModifierPolicy = 'addAll',
    salvageModifierMaxPicks = null,
    salvageModifierDefaultIds = [],
    componentOptions = [],
    macroOptions = [],
    complicationTriggerOptions = [],
    componentName = () => '',
    salvageStageGroup = null,
    salvageStages = [],
    showDifficulty = false,
    difficulty = null,
    onDifficultyChange = () => {},
    onSalvageChange = () => {},
    onAddGroup = () => {},
    onRemoveGroup = () => {},
    onUpdateGroup = () => {},
    onAddResult = () => {},
    onRemoveResult = () => {},
    onUpdateResult = () => {},
    onSetRoute = () => {},
    onAddStage = () => {},
    onRemoveStage = () => {},
    onMoveStage = () => {},
    onOpenComponent = () => {},
    onManageCheckPresets = () => {},
  } = $props();

  // A salvage result names a component and nothing else, as a recipe result does (issue 1516).
  const SALVAGE_RESULT_KINDS = ['component'];
  const salvageCatalogue = $derived(componentCatalogue(componentOptions));
  const SALVAGE_NAME_HOOK = { 'data-salvage-result-component': '' };
  const SALVAGE_AMOUNT = { inputProps: { 'data-salvage-result-quantity': '' } };
</script>

<section
  class="manager-component-rules-card"
  data-component-edit-section="salvage"
  data-salvage-section
>
  <!-- THE HEADING IS THE CONTROL ROW (issue 676): mode pill, divider, ENABLED, toggle,
   all on the heading line. -->
  <div class="manager-component-rules-card-head">
    <i class="fas fa-recycle manager-component-rules-card-glyph is-accent" aria-hidden="true"></i>
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Title', 'Salvage')}</h3>
      <p class="manager-component-rules-card-sub">
        {format(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.Hint',
          'What this component yields when it is broken down in {system}.',
          { system: systemLabel }
        )}
      </p>
    </div>
    <!-- `data-recipe-section` / `data-recipe-field` are `ToggleCard`'s hooks, kept
     verbatim now the toggle is hand-rolled into the heading: the AC4/AC9/AC10 suites drive
     them, and renaming them would silently unpin the salvage enablement rulings. -->
    <!-- `manager-task-card-heading-control`: see `ComponentDifficultyCard`'s note. -->
    <div
      class="manager-component-heading-controls manager-task-card-heading-control"
      data-recipe-section="salvage-enabled"
    >
      {#if salvageModeLabel}
        <!-- Read-only: the mode is a SYSTEM setting, authored on Crafting Settings, and
         it names the mode that decides this panel's shape. EXEMPT FROM RULING A: the pill
         is not chrome that only means something once salvage runs, and the result editor
         below stays authorable while salvage is off. `tone="secondary"` is a step louder
         than `neutral` and quieter than every semantic family. -->
        <Chip
          density="list"
          tone="secondary"
          icon={salvageModeOption?.icon || ''}
          class="manager-salvage-mode-pill"
          data-salvage-mode={salvageResolutionMode}
        >
          <span>{salvageModeLabel}</span>
        </Chip>
        <span class="manager-component-heading-divider" aria-hidden="true"></span>
      {/if}
      <span class="manager-component-micro-label"
        >{text('FABRICATE.Admin.Manager.Component.SalvageEditor.EnabledMicro', 'Enabled')}</span
      >
      <!-- The per-component salvage gate (issue 676): persisted, normalized and a live
       runtime gate long before any control wrote it, so a component auto-disabled by
       `_disableInvalidSalvageConfigs` was permanently unsalvageable from the UI. The
       zero-groups explanation is VISIBLE body copy (`[data-salvage-disabled-notice]`),
       never a `title` here: a disabled `<button>` receives no mouse events. -->
      <!-- The shared switch, so this card and `ToggleCard` draw one control rather than
       two spellings of it (issue 1040). -->
      <StatusToggle
        on={salvageEnabled}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Component.SalvageEditor.Enable',
          'Salvage this component'
        )}
        disabled={salvageToggleDisabled}
        data-recipe-field="salvageEnabled"
        onclick={() => onSalvageChange({ enabled: !salvageEnabled })}
      />
    </div>
  </div>

  {#if !salvageEnabled}
    <p class="manager-muted" data-salvage-disabled-notice>{salvageDisabledNotice}</p>
  {/if}

  <!-- The banner and the reorder policy sit ABOVE the list (issue 676): both describe
   what the ORDER MEANS, and the order is what is authored below. -->
  {#if salvageShowChrome && salvageProgressive}
    <!-- The shared `Callout`. NEUTRAL, not info (issue 1505): the specimen reserves the
     info tint for a note about LIVE state, and roll budget is an invariant. It also sits
     directly above an info-tinted `ToggleCard`. -->
    <Callout
      tone="neutral"
      icon="fas fa-circle-info"
      data-salvage-roll-budget
      text={text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.RollBudget',
        'Roll budget flows down the list: each result is claimed in order while the check total still covers its DC.'
      )}
    />

    <!-- Progressive-only: the flag has no meaning in the simple or routed salvage modes,
     which award a whole group rather than spending down a list. -->
    <ToggleCard
      variant="is-info"
      icon="fas fa-arrow-down-a-z"
      section="salvage-allow-player-result-reorder"
      field="salvageAllowPlayerResultReorder"
      title={text(
        'FABRICATE.Admin.Manager.Component.SalvageReorder.Title',
        'Allow player result re-ordering'
      )}
      sub={text(
        'FABRICATE.Admin.Manager.Component.SalvageReorder.Sub',
        'Let players drag the salvage order at the table; off keeps this GM order fixed.'
      )}
      toggleLabel={text(
        'FABRICATE.Admin.Manager.Component.SalvageReorder.Toggle',
        'Allow player result re-ordering'
      )}
      on={salvageDraft.allowPlayerResultReorder !== false}
      disabled={saving}
      onToggle={(next) => onSalvageChange({ allowPlayerResultReorder: next === true })}
    />
  {/if}

  <Field as="div" data-salvage-result-groups="">
    {#if salvageProgressive}
      <ComponentSalvageStages
        {text}
        {saving}
        stageGroup={salvageStageGroup}
        stages={salvageStages}
        resultKinds={SALVAGE_RESULT_KINDS}
        catalogue={salvageCatalogue}
        nameProps={SALVAGE_NAME_HOOK}
        {componentOptions}
        {macroOptions}
        {complicationTriggerOptions}
        {componentName}
        {showDifficulty}
        {difficulty}
        {onDifficultyChange}
        {onAddStage}
        {onRemoveStage}
        {onMoveStage}
        {onUpdateResult}
        {onOpenComponent}
      />
    {:else}
      <span class="manager-component-readonly-label">
        <span
          >{text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultGroups',
            'Result sets'
          )}</span
        >
      </span>
      {#if salvageSimpleMode}
        <!-- REQUIRED visible hint (issue 764), never a `title`: a tooltip on an absent
       control never fires. It explains why Add result set is gone at the one-set cap. -->
        <p class="manager-muted" data-salvage-simple-hint>
          {text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.SimpleSingleGroupHint',
            'Simple mode uses a single result set.'
          )}
        </p>
      {/if}
      {#if salvageDraft.resultGroups.length > 0}
        <ul class="manager-recipe-ingredient-sets">
          {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
            <!-- One `--fab-bg-1` card per result group behind a hairline, headed by the
             group's name and its count in the mono face. THE HEAD KEEPS ITS NAME INPUT AND
             THE BODY KEEPS ITS ROWS: the reference's read-only pill run cannot author a
             quantity, choose a component or rename a group. -->
            <li class="manager-salvage-group-card" data-salvage-group={group.id}>
              <div class="manager-salvage-group-header">
                <input
                  type="text"
                  class="manager-input"
                  value={group.name}
                  placeholder={text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder',
                    'Set {n}'
                  ).replace('{n}', String(groupIndex + 1))}
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupName',
                    'Result set name'
                  )}
                  data-salvage-group-name
                  oninput={(event) => onUpdateGroup(group.id, { name: event.currentTarget.value })}
                  disabled={saving}
                />
                <!-- The group's own count, in the mono face at weight 500 — the face
                 ships 400 and 500 only, so the reference's 700 lands on 500. -->
                <span class="manager-salvage-group-count" data-salvage-group-count
                  >{(group.results || []).length}</span
                >
                <IconButton
                  class="is-danger"
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveGroup',
                    'Remove result set'
                  )}
                  data-remove-salvage-group=""
                  onclick={() => onRemoveGroup(group.id)}
                  disabled={saving}
                >
                  <i class="fas fa-xmark" aria-hidden="true"></i>
                </IconButton>
              </div>

              {#if (group.results || []).length > 0}
                <div class="manager-recipe-ingredient-set-groups">
                  {#each group.results as result (result.id)}
                    <!-- The quantity STAYS in simple and routed: these modes award the
                         whole group as authored. Only progressive drops it. -->
                    <PickerRow
                      value={toValue(result)}
                      kinds={SALVAGE_RESULT_KINDS}
                      catalogue={salvageCatalogue}
                      amount={SALVAGE_AMOUNT}
                      rollable
                      clearable={false}
                      removeHook="salvage-result"
                      invalid={resultAmountInvalid(result, text)}
                      disabled={saving}
                      nameProps={SALVAGE_NAME_HOOK}
                      removeProps={{ 'data-remove-salvage-result': '' }}
                      class="is-result"
                      data-salvage-result={result.id}
                      onChange={(value) => onUpdateResult(group.id, result, value)}
                      onRemove={() => onRemoveResult(group.id, result.id)}
                    />
                  {/each}
                </div>
              {:else}
                <p class="manager-muted">
                  {text(
                    'FABRICATE.Admin.Manager.Component.SalvageEditor.NoResults',
                    'No results in this set yet.'
                  )}
                </p>
              {/if}

              <!-- Adding a component the set already produces raises that row's
                   quantity, unless that row is rolled (`withAddedResult`). -->
              <SearchablePopover
                options={salvageAdderOptions}
                panelLabel={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent',
                  'Result component'
                )}
                searchPlaceholder={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder',
                  'Search components...'
                )}
                searchLabel={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder',
                  'Search components...'
                )}
                emptyHint={text(
                  'FABRICATE.Admin.Manager.Component.SalvageEditor.NoComponentsDefined',
                  'No components defined'
                )}
                disabled={saving}
                onSelect={(id) => onAddResult(group.id, id)}
              >
                {#snippet trigger({ attributes })}
                  <!-- ratchet-exempt(design-system): the spread is the popover's own trigger contract (type, ARIA state, handlers, element attachment), never a caller's name -->
                  <Button
                    role="dashed"
                    fullWidth
                    data-add-salvage-result
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult',
                      'Add result'
                    )}
                    disabled={saving}
                    {...attributes}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult',
                        'Add result'
                      )}</span
                    >
                  </Button>
                {/snippet}
              </SearchablePopover>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="manager-muted">
          {text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoGroups', 'No result sets yet.')}
        </p>
      {/if}
      <!-- HIDDEN at the Simple one-success-group cap (issue 764). Routed keeps the
     multi-group list; Simple with no success group yet still shows it. -->
      {#if !salvageHideAddGroup}
        <Button
          role="dashed"
          fullWidth
          data-add-salvage-group
          onclick={() => onAddGroup()}
          disabled={saving}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.Component.SalvageEditor.AddGroup',
              'Add result set'
            )}</span
          >
        </Button>
      {/if}
    {/if}
  </Field>

  <!-- RULING A: everything below is CHROME and collapses when salvage is off. The
   result-group editor above does NOT, because it owns the only add-group control. -->
  {#if salvageShowChrome && salvageRouted}
    <!-- A `--fab-bg-1` well behind a hairline, headed by an `OUTCOME ROUTING` micro-label
     and holding one row per outcome. -->
    <Field as="div" class="manager-salvage-routing-card" data-salvage-routing="">
      <p class="manager-micro-label">
        {text('FABRICATE.Admin.Manager.Component.SalvageEditor.Routing', 'Outcome routing')}
      </p>
      {#if salvageOutcomeNames.length > 0}
        <!-- A `<div>`, not a `<label>`: `Select.svelte`'s host invariant. The caption names the trigger with `aria-labelledby` (issue 1510). -->
        <div class="manager-salvage-routing-list">
          {#each salvageOutcomeNames as outcomeName, routeIndex (outcomeName)}
            <div class="manager-salvage-routing-row">
              <span id={`${instanceId}-salvage-route-${routeIndex}`}>{outcomeName}</span>
              <Select
                size="inline"
                class="manager-salvage-route-select"
                value={salvageDraft.outcomeRouting[outcomeName] || ''}
                options={salvageRouteOptions}
                ariaLabelledBy={`${instanceId}-salvage-route-${routeIndex}`}
                disabled={saving}
                triggerProps={{ 'data-salvage-route': outcomeName }}
                onChange={(next) => onSetRoute(outcomeName, next)}
              />
            </div>
          {/each}
        </div>
      {:else}
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.NoOutcomes',
            'The routed salvage check has no outcome tiers to route yet.'
          )}
        </p>
      {/if}
    </Field>
  {/if}

  <!-- The component's own check-modifier pick (issue 1095), rendered only under the
   salvage check's `bySubject` rule and only over a non-empty system catalogue. ITS GATE IS
   ITS OWN, NOT THE DC OVERRIDE'S: `salvageShowDcOverride` is `simple || routed` and
   excludes progressive, but `CraftingEngine._runSalvageCraftingCheck` builds the modifier
   context before dispatch, so a progressive roll honoured a pick no editor could author. -->
  {#if salvageShowChrome && salvageCheckEnabled && salvageModifierPolicy === 'bySubject'}
    <SubjectModifierPicker
      options={checkModifierOptions}
      selectedIds={salvageDraft.checkModifierIds}
      maxPicks={salvageModifierMaxPicks}
      inheritedIds={salvageModifierDefaultIds}
      disabled={saving}
      subject="component"
      testId="salvage-check-modifier"
      onChange={(next) => onSalvageChange({ checkModifierIds: next })}
    />
  {/if}

  {#if salvageShowChrome && salvageShowDcOverride}
    <!-- Keyed per component: its staged Custom… choice is transient UI state, and a second
     component must not inherit the first's open custom input. The PERSISTED value derives
     the selection, so an off-tier override shows verbatim and rendering never dirties. -->
    {#key componentKey}
      <CheckOverrideField
        config={salvageCheckConfig}
        dcOverride={salvageDraft.dcOverride}
        adjustmentOverride={salvageDraft.adjustmentOverride}
        successesOverride={salvageDraft.successesOverride}
        tiers={salvageCheckTiers}
        systemDc={salvageCheckDc}
        {previewActors}
        {resolvePreviewCharacter}
        {instanceId}
        disabled={saving}
        onChange={onSalvageChange}
        onManagePresets={() => onManageCheckPresets()}
      />
    {/key}
  {/if}
</section>

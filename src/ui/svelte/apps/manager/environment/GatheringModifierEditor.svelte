<!-- Svelte 5 runes mode -->
<!--
  The condition-modifier cards, each attached modifier a `RuleRow`, and the character-modifier
  search, suggestions and reference rows for one record: a gathering task's drop, or a gathering
  event. Written once (issue 1707).

  `subject` is the record a modifier attaches to, never the persisted condition `kind` this markup
  binds. It picks the hook prefix, feeds the card-copy helpers their `scope`, and gates the
  drop-only "No modifiers attached." body. The unit derives nothing: the shell hands down every
  reader and writer already bound to this record. The character-modifier search is a typeahead
  combobox whose list floats in the application root (`util/typeaheadCombobox.svelte.js`).

  Invariants:
  - one `boundsRow` snippet for both subjects — `stepper-call-site-contract.test.js`.
  - every hook name follows `subject` — `manager-environments-mounted.js`.
-->
<script>
  import { tick } from 'svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Field from '../../../components/Field.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import RuleRow from '../../../components/RuleRow.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { typeaheadPanel } from '../../../actions/typeaheadPanel.js';
  import { createTypeaheadCombobox } from '../../../util/typeaheadCombobox.svelte.js';

  let {
    /**
     * `'drop'` or `'event'`: the record a modifier attaches to, not a condition kind. It also
     * feeds the copy helpers' `scope`, where any non-`'event'` value resolves the `Tasks.*` keys.
     */
    subject = 'drop',
    /** That record itself, which the shared readers below take. */
    row = null,
    /** The `id`/`for` stem, already carrying the record's id. */
    idPrefix = '',
    suggestions = [],
    characterModifierLibrary = [],
    characterModifierSearchTerm = $bindable(''),
    /* The shell's shared readers, which take this record and the condition kind. */
    gatheringConditionAvailableOptions = () => [],
    gatheringConditionLabel = () => '',
    gatheringConditionModifierRows = () => [],
    gatheringModifierCardHint = () => '',
    gatheringModifierCardTitle = () => '',
    gatheringModifierDisplayValue = () => '',
    gatheringModifierKindIcon = () => '',
    gatheringModifierValueClass = () => '',
    signedToOperatorValue = (value) => value,
    rowCharacterModifiers = () => [],
    characterModifierIconForRef = () => '',
    characterModifierIsCustomized = () => false,
    characterModifierLabelForRef = () => '',
    characterModifierLibraryEntry = () => null,
    characterModifierOperatorClass = () => '',
    /* The shell's paired writers, pre-bound to this record and normalised to one arity. */
    modifierPickerSelection = () => '',
    onSelectModifierPickerOption = () => {},
    onAddConditionModifier = () => {},
    onUpdateConditionModifier = () => {},
    onConditionModifierKeydown = () => {},
    onDeleteConditionModifier = () => {},
    onPickCharacterModifier = () => {},
    onUpdateCharacterModifier = () => {},
    onDeleteCharacterModifier = () => {},
    onSetCharacterModifierOverride = () => {},
  } = $props();

  // No `anchor`: the wrapping label is an inline box, so the input is the field's visual box.
  const search = createTypeaheadCombobox({
    component: 'GatheringModifierEditor',
    query: () => characterModifierSearchTerm,
    setQuery: (value) => (characterModifierSearchTerm = value),
    count: () => suggestions.length,
    onChoose: (index) => onPickCharacterModifier(suggestions[index].id),
    maxHeightCap: 148,
    rows: { pitch: 34, gap: 2, chrome: 10 },
  });
  const searchLabel = $derived(
    localizeOr(
      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel',
      'Search character modifiers to add'
    )
  );

  // Literals, not composed: every mirror guard that resolves a selector greps `src/` for the
  // attribute name (the View Lab registry's does), and a composed name is invisible to all of
  // them. So the seven names are written twice and the 300 lines of markup once; the modifier
  // row's id hook is written on its `RuleRow` tag for both subjects.
  const HOOK_NAMES = Object.freeze({
    drop: Object.freeze({
      conditionModifiers: 'data-gathering-drop-condition-modifiers',
      conditionModifierPicker: 'data-gathering-drop-condition-modifier-picker',
      characterModifiers: 'data-gathering-drop-character-modifiers',
      characterModifierSearch: 'data-gathering-drop-character-modifier-search',
      characterModifierSuggestions: 'data-gathering-drop-character-modifier-suggestions',
      characterModifierSuggestion: 'data-gathering-drop-character-modifier-suggestion',
      characterModifierRef: 'data-gathering-drop-character-modifier-ref',
    }),
    event: Object.freeze({
      conditionModifiers: 'data-gathering-event-condition-modifiers',
      conditionModifierPicker: 'data-gathering-event-condition-modifier-picker',
      characterModifiers: 'data-gathering-event-character-modifiers',
      characterModifierSearch: 'data-gathering-event-character-modifier-search',
      characterModifierSuggestions: 'data-gathering-event-character-modifier-suggestions',
      characterModifierSuggestion: 'data-gathering-event-character-modifier-suggestion',
      characterModifierRef: 'data-gathering-event-character-modifier-ref',
    }),
  });

  // Clearing a bound persists literal `null`, "no bound", which `0` is not; no `min`, because a
  // modifier's bounds are signed.
  const bounds = $derived(
    [
      ['min', localizeOr('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min')],
      ['max', localizeOr('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max')],
    ].map(([key, label]) => ({ key, label, ...stepperLabels(label) }))
  );

  /** A condition modifier as a `RuleRow`: the condition heads it and its value is the effect. */
  function conditionModifierSchema(kind, valueStep) {
    return {
      head: (modifier) => ({
        glyph: gatheringModifierKindIcon(kind, modifier.conditionId),
        title: gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId,
      }),
      steps: [{ key: 'value', render: valueStep }],
      labels: {
        remove: localizeOr(
          'FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier',
          'Delete modifier'
        ),
      },
    };
  }

  // Each kind's picker, where focus lands once its last modifier is removed.
  let pickers = $state({});

  async function deleteConditionModifier(kind, id, last) {
    onDeleteConditionModifier(kind, id);
    if (!last) return;
    await tick();
    pickers[kind]?.querySelector('select')?.focus();
  }

  /** One hook attribute, spread so its name follows the subject rather than the call site. */
  function hook(name, value = '') {
    const names = HOOK_NAMES[subject] ?? HOOK_NAMES.drop;
    return { [names[name]]: value };
  }
</script>

{#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
  {@const cardTitle = gatheringModifierCardTitle(kind, subject)}
  {@const cardHint = gatheringModifierCardHint(kind, subject)}
  {@const availableConditions = gatheringConditionAvailableOptions(row, kind)}
  {@const pickerSelection = modifierPickerSelection(kind)}
  {@const attachedModifiers = gatheringConditionModifierRows(row, kind)}
  {@const schema = conditionModifierSchema(kind, modifierValue)}
  {#snippet modifierValue(modifier, change)}
    <label class="manager-condition-modifier-value">
      <span class="visually-hidden"
        >{localizeOr(
          'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
          'Modifier value'
        )}</span
      >
      <input
        type="text"
        inputmode="numeric"
        value={gatheringModifierDisplayValue(modifier)}
        aria-label={localizeOr(
          'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
          'Modifier value'
        )}
        oninput={(event) =>
          change({ ...modifier, ...signedToOperatorValue(event.currentTarget.value) })}
        onkeydown={(event) => onConditionModifierKeydown(kind, modifier, event)}
      />
      <span aria-hidden="true">%</span>
    </label>
  {/snippet}
  <!-- ratchet-exempt(design-system): the spread is `hook()`'s one `data-*` name from `HOOK_NAMES` -->
  <InspectorCard
    class="manager-drop-editor-condition-modifier-card"
    {...hook('conditionModifiers', kind)}
  >
    <header class="manager-character-modifier-row-card-header">
      <div class="manager-character-modifier-row-card-heading">
        <h3 class="manager-card-title">{cardTitle}</h3>
        <p class="manager-muted">{cardHint}</p>
      </div>
    </header>
    <div
      class="manager-condition-modifier-add-row"
      {...hook('conditionModifierPicker', kind)}
      bind:this={pickers[kind]}
    >
      <label class="fabricate-field manager-condition-modifier-picker">
        <span class="visually-hidden"
          >{localizeOr(
            'FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel',
            'Condition'
          )}</span
        >
        <select
          value={pickerSelection}
          disabled={availableConditions.length === 0}
          data-tooltip={availableConditions.length === 0
            ? localizeOr(
                'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
                'All conditions already added.'
              )
            : null}
          onchange={(event) => onSelectModifierPickerOption(kind, event.currentTarget.value)}
        >
          {#each availableConditions as option (option.id)}
            <option value={option.id}>{option.label || option.id}</option>
          {/each}
        </select>
      </label>
      <IconButton
        ariaLabel={localizeOr(
          'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
          'Add modifier'
        )}
        title={localizeOr(
          'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
          'Add modifier'
        )}
        disabled={availableConditions.length === 0 || !pickerSelection}
        data-tooltip={availableConditions.length === 0
          ? localizeOr(
              'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
              'All conditions already added.'
            )
          : null}
        onclick={() => onAddConditionModifier(kind, pickerSelection)}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </IconButton>
    </div>
    <div class="manager-condition-modifier-row-list">
      {#each attachedModifiers as modifier (modifier.id)}
        <!-- A condition → drop-chance rule; each hook is written per subject, never composed. -->
        <RuleRow
          class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`}
          data-gathering-drop-modifier-id={subject === 'event' ? undefined : modifier.id}
          data-gathering-event-modifier-id={subject === 'event' ? modifier.id : undefined}
          {schema}
          value={modifier}
          onChange={(next) =>
            next === null
              ? deleteConditionModifier(kind, modifier.id, attachedModifiers.length === 1)
              : onUpdateConditionModifier(kind, modifier.id, {
                  operator: next.operator,
                  value: next.value,
                })}
        />
      {:else}
        <!-- Drop-only, derived from the discriminator: the event copy never carried one. -->
        {#if subject === 'drop'}
          <EmptyState
            compact
            icon="fas fa-sliders"
            title={localizeOr(
              'FABRICATE.Admin.Manager.Environment.Tasks.NoConditionModifiers',
              'No modifiers attached.'
            )}
          />
        {/if}
      {/each}
    </div>
  </InspectorCard>
{/each}

{#snippet boundsRow(ref)}
  <div class="manager-character-modifier-row-bounds fab-cluster" data-gap="3">
    <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. -->
    {#each bounds as bound (bound.key)}
      <Field as="div">
        <span>{bound.label}</span>
        <Stepper
          value={ref[bound.key]}
          allowUnset
          step={1}
          fill
          ariaLabel={bound.ariaLabel}
          decrementLabel={bound.decrementLabel}
          incrementLabel={bound.incrementLabel}
          onChange={(next) => onUpdateCharacterModifier(ref.id, { [bound.key]: next })}
        />
      </Field>
    {/each}
  </div>
{/snippet}

<!-- ratchet-exempt(design-system): the spread is `hook()`'s one `data-*` name from `HOOK_NAMES` -->
<InspectorCard class="manager-character-modifier-row-card" {...hook('characterModifiers')}>
  <header class="manager-character-modifier-row-card-header">
    <div class="manager-character-modifier-row-card-heading">
      <h3 class="manager-card-title">
        {localizeOr(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle',
          'Character modifiers'
        )}
      </h3>
      <p class="manager-muted">
        {localizeOr(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint',
          'Modifiers adjust the final chance based on the attempting character.'
        )}
      </p>
    </div>
  </header>
  <div class="manager-character-modifier-add-search-row">
    <label
      class="fabricate-search is-compact manager-character-modifier-add-search"
      {...hook('characterModifierSearch')}
    >
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={characterModifierSearchTerm}
        placeholder={localizeOr(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder',
          'Search character modifiers...'
        )}
        aria-label={searchLabel}
        disabled={characterModifierLibrary.length === 0}
        data-tooltip={characterModifierLibrary.length === 0
          ? localizeOr(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint',
              'Add a modifier to the system library first to reference it here.'
            )
          : null}
        {...search.field}
      />
      {#if search.listed}
        <div
          class="manager-tag-suggestions manager-character-modifier-add-suggestions"
          aria-label={searchLabel}
          {...hook('characterModifierSuggestions')}
          {...search.list}
          use:typeaheadPanel={search.panel}
        >
          {#each suggestions as option, index (option.id)}
            <button
              type="button"
              class="manager-tag-suggestion manager-character-modifier-add-suggestion"
              {...hook('characterModifierSuggestion', option.id)}
              {...search.option(index)}
            >
              <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"></i>
              <span>{option.label || option.id}</span>
            </button>
          {/each}
        </div>
      {/if}
    </label>
  </div>
  <div class="manager-character-modifier-row-list">
    {#each rowCharacterModifiers(row) as ref (ref.id)}
      {@const libraryEntry = characterModifierLibraryEntry(ref.modifierId)}
      {@const hasOverride = characterModifierIsCustomized(ref)}
      {@const operatorClass = characterModifierOperatorClass(ref.operator)}
      <article
        class="manager-character-modifier-row-reference"
        {...hook('characterModifierRef', ref.id)}
      >
        <header class="manager-character-modifier-row-reference-header">
          <span class="manager-character-modifier-icon"
            ><i class={characterModifierIconForRef(ref)} aria-hidden="true"></i></span
          >
          <span class="manager-character-modifier-row-reference-label"
            >{characterModifierLabelForRef(ref)}</span
          >
          {#if !libraryEntry}
            <span
              class="manager-character-modifier-stale-warning"
              data-tooltip={localizeOr(
                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
                'Unknown modifier ({id})',
                { id: ref.modifierId }
              )}
            >
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            </span>
          {/if}
          <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
            <span class="visually-hidden"
              >{localizeOr(
                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator',
                'Operator'
              )}</span
            >
            <select
              value={ref.operator || '+'}
              onchange={(event) =>
                onUpdateCharacterModifier(ref.id, { operator: event.currentTarget.value })}
            >
              <option value="+"
                >{localizeOr(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive',
                  'Positive'
                )}</option
              >
              <option value="-"
                >{localizeOr(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative',
                  'Negative'
                )}</option
              >
            </select>
          </label>
          <IconButton
            class="is-danger manager-character-modifier-row-reference-delete"
            ariaLabel={localizeOr(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference',
              'Delete character modifier reference'
            )}
            onclick={() => onDeleteCharacterModifier(ref.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </IconButton>
        </header>
        {@render boundsRow(ref)}
        <div class="manager-character-modifier-override-row">
          <StatusToggle
            on={hasOverride}
            ariaLabel={localizeOr(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
              'Override?'
            )}
            label={hasOverride
              ? localizeOr(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn',
                  'Overridden'
                )
              : localizeOr(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                  'Override?'
                )}
            onclick={() => onSetCharacterModifierOverride(ref, !hasOverride, libraryEntry)}
          />
        </div>
        {#if hasOverride}
          <p class="manager-muted manager-character-modifier-override-hint">
            {localizeOr(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint',
              'Overrides the library expression for this row.'
            )}
          </p>
          <label
            class="fabricate-field"
            for={`${idPrefix}-character-modifier-${ref.id}-expression`}
          >
            <span
              >{localizeOr(
                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression',
                'Expression'
              )}</span
            >
            <input
              id={`${idPrefix}-character-modifier-${ref.id}-expression`}
              type="text"
              value={ref.expressionOverride || ''}
              oninput={(event) =>
                onUpdateCharacterModifier(ref.id, {
                  expressionOverride: event.currentTarget.value,
                })}
            />
          </label>
        {/if}
      </article>
    {:else}
      <EmptyState
        compact
        icon="fas fa-sliders"
        title={localizeOr(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty',
          'No character modifiers attached.'
        )}
      />
    {/each}
  </div>
</InspectorCard>

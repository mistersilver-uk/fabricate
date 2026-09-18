<!-- Svelte 5 runes mode -->
<!--
  The condition-modifier cards and the character-modifier search, suggestions and reference rows
  for one record: a gathering task's drop, or a gathering event. Written once (issue 1707).

  `subject` is the record a modifier attaches to, never the persisted condition `kind` this markup
  binds. It picks the hook prefix, feeds the card-copy helpers their `scope`, and gates the
  drop-only "No modifiers attached." body. The unit derives nothing: the shell hands down every
  reader and writer already bound to this record, because an effect here over `suggestions` would
  silently change the event dropdown's open direction.

  Invariants:
  - one `<CharacterModifierBoundsRow>` for both subjects — `stepper-call-site-contract.test.js`.
  - every hook name follows `subject` — `manager-environments-mounted.js`.
-->
<script>
  import CharacterModifierBoundsRow from './CharacterModifierBoundsRow.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';

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
    /** Whether the suggestion list opens upwards. Computed by the shell, never here. */
    characterModifierSearchOpenUp = false,
    characterModifierSearchAnchor = $bindable(null),
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

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Literals, not composed: every mirror guard that resolves a selector greps `src/` for the
  // attribute name (the View Lab registry's does), and a composed name is invisible to all of
  // them. So the eight names are written twice and the 300 lines of markup once.
  const HOOK_NAMES = Object.freeze({
    drop: Object.freeze({
      conditionModifiers: 'data-gathering-drop-condition-modifiers',
      conditionModifierPicker: 'data-gathering-drop-condition-modifier-picker',
      modifierId: 'data-gathering-drop-modifier-id',
      characterModifiers: 'data-gathering-drop-character-modifiers',
      characterModifierSearch: 'data-gathering-drop-character-modifier-search',
      characterModifierSuggestions: 'data-gathering-drop-character-modifier-suggestions',
      characterModifierSuggestion: 'data-gathering-drop-character-modifier-suggestion',
      characterModifierRef: 'data-gathering-drop-character-modifier-ref',
    }),
    event: Object.freeze({
      conditionModifiers: 'data-gathering-event-condition-modifiers',
      conditionModifierPicker: 'data-gathering-event-condition-modifier-picker',
      modifierId: 'data-gathering-event-modifier-id',
      characterModifiers: 'data-gathering-event-character-modifiers',
      characterModifierSearch: 'data-gathering-event-character-modifier-search',
      characterModifierSuggestions: 'data-gathering-event-character-modifier-suggestions',
      characterModifierSuggestion: 'data-gathering-event-character-modifier-suggestion',
      characterModifierRef: 'data-gathering-event-character-modifier-ref',
    }),
  });

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
  <section
    class="fabricate-card manager-inspector-card manager-drop-editor-condition-modifier-card"
    {...hook('conditionModifiers', kind)}
  >
    <header class="manager-character-modifier-row-card-header">
      <div class="manager-character-modifier-row-card-heading">
        <h3 class="manager-card-title">{cardTitle}</h3>
        <p class="manager-muted">{cardHint}</p>
      </div>
    </header>
    <div class="manager-condition-modifier-add-row" {...hook('conditionModifierPicker', kind)}>
      <label class="fabricate-field manager-field manager-condition-modifier-picker">
        <span class="visually-hidden"
          >{text(
            'FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel',
            'Condition'
          )}</span
        >
        <select
          value={pickerSelection}
          disabled={availableConditions.length === 0}
          data-tooltip={availableConditions.length === 0
            ? text(
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
      <button
        type="button"
        class="fabricate-icon-button manager-icon-button"
        aria-label={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
          'Add modifier'
        )}
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
          'Add modifier'
        )}
        disabled={availableConditions.length === 0 || !pickerSelection}
        data-tooltip={availableConditions.length === 0
          ? text(
              'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
              'All conditions already added.'
            )
          : null}
        onclick={() => onAddConditionModifier(kind, pickerSelection)}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
    <div class="manager-condition-modifier-row-list">
      {#each attachedModifiers as modifier (modifier.id)}
        <article
          class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`}
          {...hook('modifierId', modifier.id)}
        >
          <header class="manager-character-modifier-row-reference-header">
            <span class="manager-character-modifier-icon">
              <i class={gatheringModifierKindIcon(kind, modifier.conditionId)} aria-hidden="true"
              ></i>
            </span>
            <span class="manager-character-modifier-row-reference-label"
              >{gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId}</span
            >
            <label class="manager-condition-modifier-value">
              <span class="visually-hidden"
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                  'Modifier value'
                )}</span
              >
              <input
                type="text"
                inputmode="numeric"
                value={gatheringModifierDisplayValue(modifier)}
                aria-label={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                  'Modifier value'
                )}
                oninput={(event) =>
                  onUpdateConditionModifier(
                    kind,
                    modifier.id,
                    signedToOperatorValue(event.currentTarget.value)
                  )}
                onkeydown={(event) => onConditionModifierKeydown(kind, modifier, event)}
              />
              <span aria-hidden="true">%</span>
            </label>
            <button
              type="button"
              class="fabricate-icon-button manager-icon-button is-danger manager-character-modifier-row-reference-delete"
              aria-label={text(
                'FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier',
                'Delete modifier'
              )}
              onclick={() => onDeleteConditionModifier(kind, modifier.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </header>
        </article>
      {:else}
        <!-- Drop-only, derived from the discriminator: the event copy never carried one. -->
        {#if subject === 'drop'}
          <EmptyState
            compact
            icon="fas fa-sliders"
            title={text(
              'FABRICATE.Admin.Manager.Environment.Tasks.NoConditionModifiers',
              'No modifiers attached.'
            )}
          />
        {/if}
      {/each}
    </div>
  </section>
{/each}

<section
  class="fabricate-card manager-inspector-card manager-character-modifier-row-card"
  {...hook('characterModifiers')}
>
  <header class="manager-character-modifier-row-card-header">
    <div class="manager-character-modifier-row-card-heading">
      <h3 class="manager-card-title">
        {text(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle',
          'Character modifiers'
        )}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint',
          'Modifiers adjust the final chance based on the attempting character.'
        )}
      </p>
    </div>
  </header>
  <div class="manager-character-modifier-add-search-row">
    <label
      bind:this={characterModifierSearchAnchor}
      class="fabricate-search manager-search is-compact manager-character-modifier-add-search"
      {...hook('characterModifierSearch')}
    >
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={characterModifierSearchTerm}
        oninput={(event) => {
          characterModifierSearchTerm = event.currentTarget.value;
        }}
        placeholder={text(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder',
          'Search character modifiers...'
        )}
        aria-label={text(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel',
          'Search character modifiers to add'
        )}
        disabled={characterModifierLibrary.length === 0}
        data-tooltip={characterModifierLibrary.length === 0
          ? text(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint',
              'Add a modifier to the system library first to reference it here.'
            )
          : null}
      />
      {#if suggestions.length > 0}
        <div
          class="manager-tag-suggestions manager-character-modifier-add-suggestions"
          class:is-above={characterModifierSearchOpenUp}
          {...hook('characterModifierSuggestions')}
        >
          {#each suggestions as option (option.id)}
            <button
              type="button"
              class="manager-tag-suggestion manager-character-modifier-add-suggestion"
              {...hook('characterModifierSuggestion', option.id)}
              onclick={() => onPickCharacterModifier(option.id)}
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
              data-tooltip={text(
                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
                'Unknown modifier ({id})'
              ).replace('{id}', ref.modifierId)}
            >
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            </span>
          {/if}
          <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
            <span class="visually-hidden"
              >{text(
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
                >{text(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive',
                  'Positive'
                )}</option
              >
              <option value="-"
                >{text(
                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative',
                  'Negative'
                )}</option
              >
            </select>
          </label>
          <button
            type="button"
            class="fabricate-icon-button manager-icon-button is-danger manager-character-modifier-row-reference-delete"
            aria-label={text(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference',
              'Delete character modifier reference'
            )}
            onclick={() => onDeleteCharacterModifier(ref.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </header>
        <CharacterModifierBoundsRow
          min={ref.min}
          max={ref.max}
          onChange={(patch) => onUpdateCharacterModifier(ref.id, patch)}
        />
        <div class="manager-character-modifier-override-row">
          <button
            type="button"
            class={`fabricate-toggle manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
            aria-pressed={hasOverride}
            aria-label={text(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
              'Override?'
            )}
            onclick={() => onSetCharacterModifierOverride(ref, !hasOverride, libraryEntry)}
          >
            <span class="manager-status-toggle-track" aria-hidden="true">
              <span class="manager-status-toggle-knob"></span>
            </span>
            <span class="manager-status-toggle-label">
              {hasOverride
                ? text(
                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn',
                    'Overridden'
                  )
                : text(
                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                    'Override?'
                  )}
            </span>
          </button>
        </div>
        {#if hasOverride}
          <p class="manager-muted manager-character-modifier-override-hint">
            {text(
              'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint',
              'Overrides the library expression for this row.'
            )}
          </p>
          <label
            class="fabricate-field manager-field"
            for={`${idPrefix}-character-modifier-${ref.id}-expression`}
          >
            <span
              >{text(
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
        title={text(
          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty',
          'No character modifiers attached.'
        )}
      />
    {/each}
  </div>
</section>

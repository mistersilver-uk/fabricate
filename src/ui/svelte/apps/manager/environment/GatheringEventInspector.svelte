<!-- Svelte 5 runes mode -->
<!--
  The gathering-event inspector column: the shared modifier panel while the event editor is open,
  and otherwise the selected event's identity, facts and environment-usage cards, or the
  no-selection empty state (issue 1707).

  `editing` is the event-editor route rather than a route token. Every prop below `selectedEvent`
  is a reader or writer of `GatheringModifierEditor`, forwarded unchanged; the two bindable ones
  are the shell's own search anchor and term.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import GatheringModifierEditor from './GatheringModifierEditor.svelte';
  import { DEFAULT_GATHERING_EVENT_IMG } from '../../../../../gatheringImageDefaults.js';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    editing = false,
    editingEvent = null,
    selectedEvent = null,
    /* The event cards' shared readers. */
    activeGatheringEventEnvironmentCount = () => 0,
    environmentImage = () => '',
    environmentName = () => '',
    gatheringEventReferencingEnvironments = () => [],
    sortedDangerTags = () => [],
    truncateDescription = () => '',
    /* Forwarded to `GatheringModifierEditor` and read nowhere here, so they carry no defaults of
       their own: the panel declares them once, and a second copy of that list is a second place
       to change when one moves. */
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
    onAddConditionModifier,
    onUpdateConditionModifier,
    onConditionModifierKeydown,
    onDeleteConditionModifier,
    onPickCharacterModifier,
    onUpdateCharacterModifier,
    onDeleteCharacterModifier,
    onSetCharacterModifierOverride,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

{#if editing && editingEvent}
  <div class="manager-drop-inspector-stack" data-gathering-event-inspector-stack>
    <div class="manager-drop-inspector-scroll">
      <GatheringModifierEditor
        subject="event"
        row={editingEvent}
        idPrefix={`event-${editingEvent.id}`}
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
        {onAddConditionModifier}
        {onUpdateConditionModifier}
        {onConditionModifierKeydown}
        {onDeleteConditionModifier}
        {onPickCharacterModifier}
        {onUpdateCharacterModifier}
        {onDeleteCharacterModifier}
        {onSetCharacterModifierOverride}
      />
    </div>
  </div>
{:else if selectedEvent && !editing}
  <section class="fabricate-card manager-inspector-card" data-gathering-event-inspector>
    <div class="manager-inspector-title-row is-hero-large">
      <img
        class="manager-recipe-preview"
        src={selectedEvent.img || DEFAULT_GATHERING_EVENT_IMG}
        alt=""
      />
      <div class="manager-inspector-copy">
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Environment.Events.Selected', 'Selected gathering event')}
        </p>
        <h2 class="manager-inspector-name" title={selectedEvent.name || ''}>
          {selectedEvent.name ||
            text('FABRICATE.Admin.Manager.Environment.Events.UnnamedEvent', 'Unnamed event')}
        </h2>
        <div class="manager-chip-row">
          <Chip tone={selectedEvent.enabled === false ? 'disabled' : 'active'}>
            {selectedEvent.enabled === false
              ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
              : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
          </Chip>
          {#if Array.isArray(selectedEvent.dangerTags) && selectedEvent.dangerTags.length > 0}
            <Chip>{sortedDangerTags(selectedEvent.dangerTags).join(', ')}</Chip>
          {/if}
        </div>
      </div>
    </div>

    <p class="manager-muted">
      {truncateDescription(selectedEvent.description) ||
        text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
  </section>

  <section class="fabricate-card manager-inspector-card">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Environment.Events.Details', 'Event details')}
    </h3>
    <div class="manager-fact-grid">
      <div class="manager-fact" data-gathering-event-fact="biomes">
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
        <span class="manager-fact-line"><strong>{Array.isArray(selectedEvent.biomes) && selectedEvent.biomes.length > 0 ? selectedEvent.biomes.length : text('FABRICATE.Admin.Manager.Environment.Events.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(selectedEvent.biomes) && selectedEvent.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
      </div>
      <div class="manager-fact" data-gathering-event-fact="drop-rate">
        <span class="manager-fact-line"
          ><strong
            >{(() => {
              const rate = Number(selectedEvent.dropRate);
              if (!Number.isFinite(rate)) return '—';
              return `${Math.max(1, Math.min(100, Math.floor(rate)))}%`;
            })()}</strong
          >
          <span class="manager-fact-label"
            >{text('FABRICATE.Admin.Manager.Environment.Events.DropRate', 'Drop rate')}</span
          ></span
        >
      </div>
      <div class="manager-fact" data-gathering-event-fact="environments">
        <span class="manager-fact-line"
          ><strong>{activeGatheringEventEnvironmentCount(selectedEvent)}</strong>
          <span class="manager-fact-label"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Events.ActiveEnvironments',
              'Active environments'
            )}</span
          ></span
        >
      </div>
    </div>
  </section>

  <section
    class="fabricate-card manager-inspector-card manager-event-environment-usage-card"
    data-event-environment-usage
  >
    <h3 class="manager-card-title">
      {text(
        'FABRICATE.Admin.Manager.Environment.Events.UsedInEnvironmentsCard',
        'Used in environments'
      )}
    </h3>
    {#if gatheringEventReferencingEnvironments(selectedEvent).length === 0}
      <p class="manager-muted" data-event-environment-usage-empty>
        {text(
          'FABRICATE.Admin.Manager.Environment.Events.NotUsedInEnvironments',
          'Not used in any environments yet.'
        )}
      </p>
    {:else}
      <div class="manager-event-environment-usage-grid" data-event-environment-usage-chips>
        {#each gatheringEventReferencingEnvironments(selectedEvent) as environment (environment.id)}
          <article class="manager-event-environment-usage-card">
            <img
              class="manager-event-environment-usage-thumb"
              src={environmentImage(environment)}
              alt=""
            />
            <span class="manager-event-environment-usage-name" title={environmentName(environment)}
              >{environmentName(environment)}</span
            >
          </article>
        {/each}
      </div>
    {/if}
  </section>
{:else if !editing}
  <EmptyState
    icon="fas fa-masks-theater"
    title={text(
      'FABRICATE.Admin.Manager.Environment.Events.SelectEvent',
      'Select a gathering event'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Environment.Events.InspectorHint',
      'The inspector shows event availability, danger tags, drop rate, and active environment usage for the selected row.'
    )}
  />
{/if}

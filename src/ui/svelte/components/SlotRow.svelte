<!-- Svelte 5 runes mode -->
<script>
  import ChoiceOptionList from './ChoiceOptionList.svelte';
  import SlotTile from './SlotTile.svelte';

  let {
    requirements = [],
    held = () => 0,
    claimed = () => 0,
    openSlot = $bindable(''),
    onOpen = () => {},
    onChoose = () => {},
    locked = false,
    slotLabel = (slot) => slot?.label ?? '',
    choiceLabel = '',
    candidateSummary = () => '',
    candidateReading = () => '',
    emptyChoiceText = '',
    label = '',
    hint = '',
  } = $props();

  const opened = $derived(requirements.find((requirement) => requirement.id === openSlot));

  function componentFor(requirement) {
    return requirement.selected || requirement.component || null;
  }

  function requirementCount(requirement) {
    const component = componentFor(requirement);
    const componentId = component?.id || requirement.componentId;
    return componentId ? Math.max(0, Number(held(componentId)) || 0) : 0;
  }

  function tileState(requirement) {
    if (requirement.kind === 'choice' && !componentFor(requirement)) return 'open';
    if (requirement.kind === 'essence') {
      return Number(requirement.poolsMet) >= Number(requirement.poolsRequired) ? 'met' : 'short';
    }
    return requirementCount(requirement) >= Math.max(0, Number(requirement.needed) || 0)
      ? 'met'
      : 'short';
  }

  function tilePip(requirement) {
    if (requirement.kind === 'choice' && !componentFor(requirement)) {
      return String(requirement.candidates?.length ?? 0);
    }
    if (requirement.kind === 'essence') {
      return `${Number(requirement.poolsMet) || 0}/${Number(requirement.poolsRequired) || 0}`;
    }
    return `${requirementCount(requirement)}/${Math.max(0, Number(requirement.needed) || 0)}`;
  }

  function toggle(requirement) {
    const next = openSlot === requirement.id ? '' : requirement.id;
    openSlot = next;
    onOpen(next);
  }

  function choose(slotId, componentId) {
    onChoose(slotId, componentId);
    openSlot = '';
  }
</script>

<div class="fab-slot-row" data-slot-row>
  {#if label || hint}
    <div class="fab-slot-row-heading">
      {#if label}<span class="fab-slot-row-kicker">{label}</span>{/if}
      {#if hint}<span class="fab-slot-row-hint">{hint}</span>{/if}
    </div>
  {/if}
  <div class="fab-slot-row-tiles">
    {#each requirements as requirement (requirement.id)}
      {@const selected = componentFor(requirement)}
      {@const pickable =
        !locked && (requirement.kind === 'choice' || requirement.kind === 'essence')}
      <div data-slot-id={requirement.id}>
        <SlotTile
          label={selected?.label || requirement.label}
          ariaLabel={slotLabel(requirement)}
          art={selected?.art || requirement.art || ''}
          icon={selected?.icon || requirement.icon || 'fas fa-circle'}
          tint={selected?.tint || requirement.tint || ''}
          state={tileState(requirement)}
          pip={tilePip(requirement)}
          pipKind={requirement.kind === 'choice' && !selected ? 'candidate' : 'ratio'}
          affordance={requirement.affordanceLabel || ''}
          interactive={pickable}
          pressed={openSlot === requirement.id}
          disabled={requirement.disabled === true}
          onActivate={() => toggle(requirement)}
        />
      </div>
    {/each}
  </div>
  {#if !locked && opened?.kind === 'choice'}
    <ChoiceOptionList
      slotId={opened.id}
      options={opened.candidates ?? []}
      needed={Math.max(1, Number(opened.needed) || 1)}
      selectedId={opened.selected?.id || ''}
      {held}
      {claimed}
      onChoose={choose}
      label={choiceLabel}
      summary={candidateSummary(opened.candidates?.length ?? 0, opened)}
      {candidateReading}
      emptyText={emptyChoiceText}
    />
  {/if}
</div>

<style>
  .fab-slot-row {
    display: grid;
    gap: var(--fab-space-2);
  }

  .fab-slot-row-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  .fab-slot-row-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-slot-row-hint {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  .fab-slot-row-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    overflow: visible;
  }
</style>

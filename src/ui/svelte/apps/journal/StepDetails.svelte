<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EssencePool from '../../components/EssencePool.svelte';
  import SlotRow from '../../components/SlotRow.svelte';
  import RadioCardGroup from '../../components/RadioCardGroup.svelte';
  import ListRow from '../../components/ListRow.svelte';
  import Chip from '../../components/Chip.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { step = null, run = null, journal = null, editable = false } = $props();
  let openSlot = $state('');
  const busy = $derived(Boolean(journal?.busyRunKey || journal?.busyRunId));

  const snapshot = $derived(
    step?.requirementSnapshot && typeof step.requirementSnapshot === 'object'
      ? step.requirementSnapshot
      : null
  );
  const groups = $derived(
    Array.isArray(snapshot?.ingredientGroups) ? snapshot.ingredientGroups : []
  );
  const availability = $derived(step?.selectionAvailability ?? null);
  // A started stage reads as already spent: its choice was locked and its materials
  // consumed at the moment it began, so nothing here is an intent any more.
  const locked = $derived(availability?.locked === true);
  const plan = $derived(step?.selectionPlan ?? {});
  const routes = $derived(availability?.routes ?? []);
  function chooseRoute(id) {
    if (!editable || busy || !routes.some((route) => route.id === id)) return;
    openSlot = '';
    journal?.setSelection?.(run, {
      selectedIngredientSetId: id,
      ingredientOptionOverrides: {},
      ingredientEssenceAllocation: { stepId: step?.stepId, ingredientSetId: id, allocation: {} },
    });
  }
  const requirementsHint = $derived.by(() => {
    if (busy) return localize('FABRICATE.App.Journal.Actions.Working');
    if (locked) return localize('FABRICATE.App.Journal.Stage.SpentAtStart');
    if (!editable) return localize('FABRICATE.App.Journal.Stage.Locked');
    if (slots.some((slot) => slot.stale))
      return localize('FABRICATE.App.Journal.Stage.StaleSelection');
    return slots.some((slot) => slot.kind === 'choice')
      ? localize('FABRICATE.App.Journal.Stage.RequirementsHint')
      : '';
  });

  function tintOf(value) {
    return String(value ?? '').replace(/^--fab-tag-/u, '');
  }
  function optionId(groupId, optionIndex, itemId = '') {
    return JSON.stringify([String(groupId), Number(optionIndex), String(itemId)]);
  }
  function historicalRequirement(group, groupIndex) {
    const options = Array.isArray(group?.options) ? group.options : [];
    const selectedOptionIndex = Number(
      plan?.ingredientOptionOverrides?.[group?.id]?.optionIndex ?? 0
    );
    const option = options[selectedOptionIndex] ?? options[0] ?? null;
    return {
      groupId: String(group?.id ?? `requirement-${groupIndex}`),
      name: String(
        group?.name ?? localize('FABRICATE.App.Journal.Stage.Requirement', { n: groupIndex + 1 })
      ),
      selectedOptionIndex,
      selectedItemId: plan?.ingredientOptionOverrides?.[group?.id]?.heldItemId ?? null,
      option: option
        ? {
            index: selectedOptionIndex,
            id: option?.id ?? null,
            kind: option?.match?.type ?? 'component',
            name: String(
              option?.name ??
                option?.match?.value ??
                option?.componentId ??
                `#${selectedOptionIndex + 1}`
            ),
            img: option?.img ?? null,
            icon: option?.icon ?? null,
            colorToken: option?.colorToken ?? null,
            need: Math.max(1, Number(option?.quantity ?? group?.quantity) || 1),
            available: true,
            candidates: [],
          }
        : null,
    };
  }
  const requirements = $derived(
    Array.isArray(availability?.requirements) ? availability.requirements : []
  );
  const historicalRequirements = $derived(groups.map(historicalRequirement));

  function choiceOptions(groupId, fallback) {
    const choice = (availability?.choices ?? []).find((entry) => entry?.groupId === groupId);
    return Array.isArray(choice?.options) && choice.options.length > 0
      ? choice.options
      : fallback
        ? [fallback]
        : [];
  }
  function candidateRows(groupId, options) {
    return options.flatMap((option) => {
      const heldItems = Array.isArray(option?.candidates) ? option.candidates : [];
      if (heldItems.length === 0) {
        return [
          {
            id: optionId(groupId, option?.index),
            label: option?.name ?? '',
            art: option?.img ?? '',
            icon: option?.icon ?? 'fas fa-circle',
            tint: tintOf(option?.colorToken),
            disabled: option?.available !== true,
            needed: Number(option?.need) || 1,
            claimed: 0,
            held: option?.available === true ? Number(option?.need) || 1 : 0,
            optionIndex: Number(option?.index) || 0,
            heldItemId: null,
          },
        ];
      }
      return heldItems.map((item) => ({
        id: optionId(groupId, option?.index, item?.itemId),
        label: item?.name ?? option?.name ?? '',
        art: item?.img ?? option?.img ?? '',
        icon: option?.icon ?? 'fas fa-circle',
        tint: tintOf(option?.colorToken),
        disabled: option?.available !== true || item?.available !== true,
        needed: Number(option?.need) || 1,
        claimed: Math.max(0, Number(item?.claimed) || 0),
        held: Math.max(0, Number(item?.held) || 0),
        optionIndex: Number(option?.index) || 0,
        heldItemId: item?.itemId ?? null,
      }));
    });
  }

  function selectedCandidate(requirement, candidates) {
    const picked = Number(requirement?.selectedOptionIndex ?? -1);
    const selectedItemId = requirement?.selectedItemId ?? null;
    return (
      candidates.find(
        (candidate) =>
          candidate.optionIndex === picked &&
          (selectedItemId == null || candidate.heldItemId === selectedItemId)
      ) ?? null
    );
  }

  function slotKind(requirement, options, candidates, selected) {
    if (requirement?.option?.kind === 'essence') return 'essence';
    if (
      options.length > 1 ||
      candidates.length > 1 ||
      (!selected && (requirement?.selectedItemId != null || !requirement?.option))
    )
      return 'choice';
    return 'fixed';
  }

  const slots = $derived(
    requirements.map((requirement, requirementIndex) => {
      const groupId = String(requirement?.groupId ?? `requirement-${requirementIndex}`);
      const options = choiceOptions(groupId, requirement?.option);
      const candidates = candidateRows(groupId, options).map((candidate) => ({
        ...candidate,
        unavailable: candidate.disabled,
        reason: candidate.disabled
          ? localize('FABRICATE.App.Journal.Stage.CandidateUnavailable')
          : '',
        disabled: busy || candidate.disabled,
      }));
      const selected = selectedCandidate(requirement, candidates);
      const needed = Math.max(1, Number(requirement?.option?.need) || 1);
      const essenceRequirements = (availability?.essencePool?.requirements ?? []).filter(
        (entry) => entry?.groupId === groupId
      );
      return {
        id: groupId,
        label: String(requirement?.name ?? ''),
        kind: slotKind(requirement, options, candidates, selected),
        needed,
        available: requirement?.option?.available === true,
        componentId: selected?.id ?? '',
        selected,
        candidates,
        disabled: !editable || busy,
        stale:
          !locked && !selected && (requirement?.selectedItemId != null || !requirement?.option),
        poolsRequired: essenceRequirements.length,
        poolsMet: essenceRequirements.filter((entry) => entry?.satisfied === true).length,
      };
    })
  );

  function held(componentId) {
    const slot = slots.find(
      (entry) =>
        entry.componentId === componentId ||
        entry.candidates.some((candidate) => candidate.id === componentId)
    );
    if (!slot) return 0;
    const candidate = slot.candidates.find((entry) => entry.id === componentId);
    return candidate?.held ?? 0;
  }
  function claimed(componentId) {
    return (
      slots.flatMap((slot) => slot.candidates).find((candidate) => candidate.id === componentId)
        ?.claimed ?? 0
    );
  }
  function choose(groupId, candidateId) {
    if (!editable || busy) return;
    const candidate = slots
      .find((slot) => slot.id === groupId)
      ?.candidates.find((entry) => entry.id === candidateId);
    if (!candidate || candidate.disabled) return;
    const next = {
      ...plan,
      selectedIngredientSetId: plan?.selectedIngredientSetId ?? snapshot?.id,
      ingredientOptionOverrides: {
        ...(plan?.ingredientOptionOverrides ?? {}),
        [groupId]: {
          optionIndex: candidate.optionIndex,
          ...(candidate.heldItemId ? { heldItemId: candidate.heldItemId } : {}),
        },
      },
    };
    journal?.setSelection?.(run, next);
  }

  const pool = $derived(availability?.essencePool ?? null);
  let allocation = $state({});
  let allocationSource = $state('');
  $effect(() => {
    const projected = pool?.allocation ?? {};
    const source = JSON.stringify([run?.key ?? run?.id, step?.stepId, projected]);
    if (source === allocationSource) return;
    allocationSource = source;
    allocation = { ...projected };
  });
  const thresholds = $derived(
    (pool?.requirements ?? []).map((requirement) => ({
      essence: requirement.essenceId,
      amount: requirement.need,
      name: requirement.name,
      icon: requirement.icon,
      tint: tintOf(requirement.colorToken),
      sources: (pool?.carriers ?? [])
        .filter((carrier) => Number(carrier?.perUnit?.[requirement.essenceId]) > 0)
        .map((carrier) => ({
          id: carrier.itemKey,
          label: carrier.name,
          art: carrier.img ?? '',
        })),
    }))
  );
  async function changeAllocation(itemKey, delta) {
    if (!editable || busy) {
      allocation = { ...allocation };
      return;
    }
    const nextAllocation = {
      ...allocation,
      [itemKey]: Math.max(0, (Number(allocation?.[itemKey]) || 0) + delta),
    };
    allocation = nextAllocation;
    try {
      await journal?.setSelection?.(run, {
        ...plan,
        selectedIngredientSetId: plan?.selectedIngredientSetId ?? snapshot?.id,
        ingredientEssenceAllocation: {
          stepId: step?.stepId,
          ingredientSetId: plan?.selectedIngredientSetId ?? snapshot?.id,
          allocation: nextAllocation,
        },
      });
    } finally {
      allocation = { ...(pool?.allocation ?? {}) };
    }
  }
  const carrier = (id) => pool?.carriers?.find((entry) => entry.itemKey === id);
</script>

<div
  class="journal-stage-details"
  data-journal-stage-details
  data-editable={(editable && !busy) || undefined}
  aria-busy={busy || undefined}
>
  {#if routes.length > 1 || availability?.staleRoute}
    <RadioCardGroup
      legend={localize('FABRICATE.App.Journal.Stage.Route')}
      legendVisible
      options={routes.map((route, index) => ({
        ...route,
        value: route.id,
        label: route.name || localize('FABRICATE.App.Journal.Stage.RouteOrdinal', { n: index + 1 }),
      }))}
      selectedValue={availability?.selectedIngredientSetId ?? ''}
      groupName={`journal-route-${step?.stepId}`}
      disabled={!editable || busy}
      onChange={chooseRoute}
      dataAttr="data-journal-route"
    >
      {#snippet optionBody(route)}
        <div class="fab-stack" data-gap="1">
          {#if route.id === availability?.selectedIngredientSetId}
            <Chip density="list">{localize('FABRICATE.App.Journal.Stage.ChosenRoute')}</Chip>
          {/if}
          {#if route.shortfallCount > 0}
            <Chip density="list" tone="danger" icon="fas fa-triangle-exclamation"
              >{localize('FABRICATE.App.Journal.Stage.RouteShortfall', {
                count: route.shortfallCount,
              })}</Chip
            >
          {:else if route.needsSelection}
            <span>{localize('FABRICATE.App.Journal.Stage.RequirementsHint')}</span>
          {/if}
          {#each route.entries ?? [] as entry, index (entry.id ?? index)}
            <ListRow
              name={entry.name || localize('FABRICATE.App.Journal.History.UnknownMaterial')}
              art={entry.art ?? ''}
              quantity={entry.qty == null
                ? localize('FABRICATE.App.Journal.History.NotRecorded')
                : localize('FABRICATE.App.Journal.Quantity', { n: entry.qty })}
            />
          {/each}
        </div>
      {/snippet}
    </RadioCardGroup>
    {#if availability?.staleRoute}<p>
        {localize(
          availability?.selectedIngredientSetId == null
            ? 'FABRICATE.App.Journal.Stage.RouteUnchosen'
            : 'FABRICATE.App.Journal.Stage.StaleSelection'
        )}
      </p>{/if}
  {/if}
  {#if slots.length > 0}
    <SlotRow
      requirements={slots}
      {held}
      {claimed}
      bind:openSlot
      onChoose={choose}
      locked={!editable}
      label={localize(
        locked ? 'FABRICATE.App.Journal.Stage.Consumed' : 'FABRICATE.App.Journal.Stage.Requirements'
      )}
      hint={requirementsHint}
      slotLabel={(slot) => slot.label}
      choiceLabel={localize('FABRICATE.App.Journal.Stage.Choose')}
      candidateSummary={(count) => localize('FABRICATE.App.Journal.Stage.Choices', { count })}
      candidateReading={({ option, held: count, needed, spare }) =>
        [
          localize('FABRICATE.App.Journal.Stage.CandidateReading', { held: count, needed, spare }),
          option.reason,
        ]
          .filter(Boolean)
          .join(' · ')}
      emptyChoiceText={localize('FABRICATE.App.Journal.Stage.NoChoices')}
    />
  {:else if historicalRequirements.length > 0}
    <section class="journal-stage-legacy" data-journal-stage-requirements>
      <h4>{localize('FABRICATE.App.Journal.Stage.Requirements')}</h4>
      {#each historicalRequirements as requirement (requirement.groupId)}
        <JournalFactRow
          label={`${requirement.name}: ${requirement.option?.name ?? ''}`}
          value={localize('FABRICATE.App.Journal.Quantity', {
            n: requirement.option?.need ?? 1,
          })}
        />
      {/each}
    </section>
  {:else if Array.isArray(step?.requirements) && step.requirements.length > 0}
    <section class="journal-stage-legacy" data-journal-stage-requirements>
      <h4>{localize('FABRICATE.App.Journal.Stage.Requirements')}</h4>
      {#each step.requirements as requirement, index (index)}
        <JournalFactRow
          label={requirement.name ?? requirement.componentId}
          value={localize('FABRICATE.App.Journal.Quantity', { n: requirement.quantity })}
        />
      {/each}
    </section>
  {/if}

  {#if pool && thresholds.length > 0}
    <EssencePool
      {thresholds}
      {allocation}
      onStep={changeAllocation}
      yield={(sourceId, essenceId) => Number(carrier(sourceId)?.perUnit?.[essenceId]) || 0}
      spare={(sourceId) =>
        Math.max(
          0,
          (Number(carrier(sourceId)?.ownedUnits) || 0) - (Number(allocation?.[sourceId]) || 0)
        )}
      held={(sourceId) => Number(carrier(sourceId)?.ownedUnits) || 0}
      locked={!editable || busy}
      essenceLabel={(essence) =>
        thresholds.find((threshold) => threshold.essence === essence)?.name ?? essence}
      sourceReading={(_source, contributions, heldCount, spareCount) =>
        contributions.map((entry) => `+${entry.amount} ${entry.label}`).join(' · ') +
        ' · ' +
        localize('FABRICATE.App.Journal.Stage.CarrierReading', {
          held: heldCount,
          spare: spareCount,
        })}
      overshootLabel={(essence, amount) =>
        localize('FABRICATE.App.Journal.Stage.Overshoot', { essence, amount })}
      allocationLabel={(source) =>
        localize('FABRICATE.App.Journal.Stage.Allocate', { name: source.label })}
      decrementLabel={(source) =>
        localize('FABRICATE.App.Journal.Stage.Decrease', { name: source.label })}
      incrementLabel={(source) =>
        localize('FABRICATE.App.Journal.Stage.Increase', { name: source.label })}
      label={localize('FABRICATE.App.Journal.Stage.Essence')}
    />
  {/if}

  <div class="journal-stage-facts" data-journal-stage-evidence>
    {#if step?.detail?.failureText}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.Failure')}
        value={step.detail.failureText}
        danger
      />{/if}
  </div>
</div>

<style>
  .journal-stage-details,
  .journal-stage-facts,
  .journal-stage-legacy {
    display: grid;
    gap: var(--fab-space-3);
  }
  .journal-stage-legacy h4 {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>

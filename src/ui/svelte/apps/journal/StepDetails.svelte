<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import EssencePool from '../../components/EssencePool.svelte';
  import SlotRow from '../../components/SlotRow.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { step = null, run = null, journal = null, editable = false } = $props();
  let openSlot = $state('');

  const snapshot = $derived(
    step?.requirementSnapshot && typeof step.requirementSnapshot === 'object'
      ? step.requirementSnapshot
      : null
  );
  const groups = $derived(
    Array.isArray(snapshot?.ingredientGroups) ? snapshot.ingredientGroups : []
  );
  const availability = $derived(step?.selectionAvailability ?? null);
  const plan = $derived(step?.selectionPlan ?? {});

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
        disabled: item?.available !== true,
        held: Math.max(0, Number(item?.held) || 0),
        optionIndex: Number(option?.index) || 0,
        heldItemId: item?.itemId ?? null,
      }));
    });
  }

  const slots = $derived(
    requirements.map((requirement, requirementIndex) => {
      const groupId = String(requirement?.groupId ?? `requirement-${requirementIndex}`);
      const options = choiceOptions(groupId, requirement?.option);
      const candidates = candidateRows(groupId, options);
      const picked = Number(requirement?.selectedOptionIndex) || 0;
      const selected =
        candidates.find(
          (candidate) =>
            candidate.optionIndex === picked &&
            candidate.heldItemId === (requirement?.selectedItemId ?? null)
        ) ??
        candidates.find((candidate) => candidate.optionIndex === picked) ??
        null;
      const needed = Math.max(1, Number(requirement?.option?.need) || 1);
      const essenceRequirements = (availability?.essencePool?.requirements ?? []).filter(
        (entry) => entry?.groupId === groupId
      );
      return {
        id: groupId,
        label: String(requirement?.name ?? ''),
        kind:
          requirement?.option?.kind === 'essence'
            ? 'essence'
            : options.length > 1
              ? 'choice'
              : 'fixed',
        needed,
        componentId: selected?.id ?? '',
        selected,
        candidates,
        disabled: !editable,
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
    return candidate?.disabled ? 0 : (candidate?.held ?? 0);
  }
  function choose(groupId, candidateId) {
    if (!editable) return;
    const candidate = slots
      .find((slot) => slot.id === groupId)
      ?.candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;
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
  function changeAllocation(itemKey, delta) {
    if (!editable) return;
    const nextAllocation = {
      ...allocation,
      [itemKey]: Math.max(0, (Number(allocation?.[itemKey]) || 0) + delta),
    };
    allocation = nextAllocation;
    journal?.setSelection?.(run, {
      ...plan,
      selectedIngredientSetId: plan?.selectedIngredientSetId ?? snapshot?.id,
      ingredientEssenceAllocation: {
        stepId: step?.stepId,
        ingredientSetId: plan?.selectedIngredientSetId ?? snapshot?.id,
        allocation: nextAllocation,
      },
    });
  }
  const carrier = (id) => pool?.carriers?.find((entry) => entry.itemKey === id);
  const consumed = $derived(
    Array.isArray(step?.consumedIngredients) ? step.consumedIngredients : []
  );
  const lastCheck = $derived(step?.lastCheckResult ?? null);
  const rollResult = $derived(
    formatRoll(
      String(lastCheck?.formula ?? ''),
      numberOrNaN(lastCheck?.total),
      numberOrNaN(lastCheck?.value),
      numberOrNaN(lastCheck?.dc)
    )
  );

  function numberOrNaN(raw) {
    return raw == null ? Number.NaN : Number(raw);
  }
  function formatRoll(formula, total, value, dc) {
    if (formula !== '' && Number.isFinite(total)) {
      return Number.isFinite(dc)
        ? localize('FABRICATE.App.Journal.StepDetails.RollResultWithDc', { formula, total, dc })
        : localize('FABRICATE.App.Journal.StepDetails.RollResult', { formula, total });
    }
    if (Number.isFinite(value)) {
      return Number.isFinite(dc)
        ? localize('FABRICATE.App.Journal.StepDetails.RollResultValueWithDc', { value, dc })
        : localize('FABRICATE.App.Journal.StepDetails.RollResultValue', { value });
    }
    return '';
  }
</script>

<div class="journal-stage-details" data-journal-stage-details data-editable={editable || undefined}>
  {#if slots.length > 0}
    <SlotRow
      requirements={slots}
      {held}
      claimed={() => 0}
      bind:openSlot
      onChoose={choose}
      locked={!editable}
      label={localize('FABRICATE.App.Journal.Stage.Requirements')}
      hint={editable
        ? localize('FABRICATE.App.Journal.Stage.RequirementsHint')
        : localize('FABRICATE.App.Journal.Stage.Locked')}
      slotLabel={(slot) => slot.label}
      choiceLabel={localize('FABRICATE.App.Journal.Stage.Choose')}
      candidateSummary={(count) => localize('FABRICATE.App.Journal.Stage.Choices', { count })}
      candidateReading={({ held: count, needed }) => `${count}/${needed}`}
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
      {#each step.requirements as requirement, index (requirement.itemUuid ?? requirement.componentId ?? index)}
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
      locked={!editable}
      essenceLabel={(essence) =>
        thresholds.find((threshold) => threshold.essence === essence)?.name ?? essence}
      sourceReading={(_source, _contributions, heldCount, spareCount) =>
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
    {#if Number(step?.detail?.requiredSeconds) > 0}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.RequiresTime')}
        value={formatDurationHMS(step.detail.requiredSeconds)}
      />{/if}
    {#if step?.detail?.primaryToolName}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.PrimaryTool')}
        value={step.detail.primaryToolName}
      />{/if}
    {#if step?.detail?.checkLabel}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.Check')}
        value={step.detail.checkLabel}
      />{/if}
    {#if rollResult}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.RollLabel')}
        value={rollResult}
        danger={lastCheck?.success === false}
      />{/if}
    {#if step?.detail?.failureText}<JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.Failure')}
        value={step.detail.failureText}
        danger
      />{/if}
    {#each consumed as item, index (item.itemUuid ?? item.componentId ?? index)}
      <JournalFactRow
        label={localize('FABRICATE.App.Journal.StepDetails.ConsumedTitle')}
        value={`${item.name ?? item.componentId} ${localize('FABRICATE.App.Journal.Quantity', { n: item.quantity })}`}
      />
    {/each}
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

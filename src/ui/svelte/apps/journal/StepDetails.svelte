<!-- Svelte 5 runes mode -->
<!--
  StepDetails renders the current crafting/salvage step's requirement facts as
  shared JournalFactRows (icon + muted label + value): the required time
  (formatted from the projection's raw `requiredSeconds`), the primary tool, the
  crafting check, the rolled result, and — when the step failed — the failure copy
  in the danger tone. Below the facts it lists the step's required ingredients and
  the items actually consumed (image + name + quantity). Card chrome comes from the
  shared JournalCard. Each row/section is omitted when empty; the whole card is
  omitted when there is nothing to show.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { formatDurationHMS } from '../../util/formatDuration.js';
  import JournalCard from './JournalCard.svelte';
  import JournalFactRow from './JournalFactRow.svelte';

  let { step = null, multiStep = true } = $props();

  // Single-step crafting runs read as a plain "craft", so the requirements card
  // drops the step-scoped title; multi-step runs keep "Step requirements".
  const titleKey = $derived(
    multiStep
      ? 'FABRICATE.App.Journal.StepDetails.Title'
      : 'FABRICATE.App.Journal.StepDetails.TitleSingleStep'
  );

  const detail = $derived(step?.detail ?? null);
  const requiredSeconds = $derived(Number(detail?.requiredSeconds));
  const requiredTime = $derived(
    Number.isFinite(requiredSeconds) && requiredSeconds > 0 ? formatDurationHMS(requiredSeconds) : ''
  );
  const primaryTool = $derived(String(detail?.primaryToolName ?? ''));
  const checkLabel = $derived(String(detail?.checkLabel ?? ''));
  const failureText = $derived(String(detail?.failureText ?? ''));

  // The actual rolled check (resolved formula + total, and DC when applicable) —
  // distinct from the authored `checkLabel` requirement above.
  const lastCheck = $derived(step?.lastCheckResult ?? null);
  const rollFormula = $derived(String(lastCheck?.formula ?? ''));
  const rollTotal = $derived(Number(lastCheck?.total));
  // A recorded check result always carries an explicit `value` key (null when no
  // number was rolled), and Number(null) === 0 is finite — so coerce a null/absent
  // value to NaN instead of a fabricated 0 that would render a roll that never happened.
  const rollValue = $derived(lastCheck?.value == null ? Number.NaN : Number(lastCheck.value));
  const rollDc = $derived(Number(lastCheck?.dc));
  const rollFailed = $derived(lastCheck?.success === false);

  // Prefer the full "formula = total" phrasing; fall back to the bare rolled value
  // for legacy / no-formula records that persisted only a `value` (they otherwise
  // showed no roll at all). Each variant appends "vs DC" only when a DC is known.
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

  const rollResult = $derived(formatRoll(rollFormula, rollTotal, rollValue, rollDc));

  // The step's authored required ingredients (persisted snapshot) and the items
  // actually consumed, each already a UI-safe {componentId,itemUuid,quantity,name,img}.
  const requirements = $derived(Array.isArray(step?.requirements) ? step.requirements : []);
  const consumed = $derived(
    Array.isArray(step?.consumedIngredients) ? step.consumedIngredients : []
  );

  const hasAnyFact = $derived(
    requiredTime !== '' ||
      primaryTool !== '' ||
      checkLabel !== '' ||
      rollResult !== '' ||
      failureText !== ''
  );
  const hasContent = $derived(hasAnyFact || requirements.length > 0 || consumed.length > 0);
</script>

{#if hasContent}
  <JournalCard kind="step-details" title={localize(titleKey)}>

    <div class="journal-fact-list">
      {#if requiredTime !== ''}
        <JournalFactRow
          icon="fa-clock"
          label={localize('FABRICATE.App.Journal.StepDetails.RequiresTime')}
          value={requiredTime}
        />
      {/if}
      {#if primaryTool !== ''}
        <JournalFactRow
          icon="fa-screwdriver-wrench"
          label={localize('FABRICATE.App.Journal.StepDetails.PrimaryTool')}
          value={primaryTool}
        />
      {/if}
      {#if checkLabel !== ''}
        <JournalFactRow
          icon="fa-dice-d20"
          label={localize('FABRICATE.App.Journal.StepDetails.Check')}
          value={checkLabel}
        />
      {/if}
      {#if rollResult !== ''}
        <JournalFactRow
          icon="fa-dice"
          label={localize('FABRICATE.App.Journal.StepDetails.RollLabel')}
          value={rollResult}
          danger={rollFailed}
        />
      {/if}
      {#if failureText !== ''}
        <JournalFactRow
          icon="fa-triangle-exclamation"
          label={localize('FABRICATE.App.Journal.StepDetails.Failure')}
          value={failureText}
          danger
        />
      {/if}
    </div>

    {#if requirements.length > 0}
      <section class="journal-step-items" data-journal-requirements>
        <h4 class="journal-step-items-title">
          {localize('FABRICATE.App.Journal.StepDetails.RequirementsTitle')}
        </h4>
        <ul class="journal-step-items-list">
          {#each requirements as item, index (item.componentId ?? item.itemUuid ?? index)}
            <li class="journal-step-item" data-journal-requirement>
              {#if item.img}
                <img class="journal-step-item-thumb" src={item.img} alt="" />
              {/if}
              <span class="journal-step-item-name">{item.name ?? item.componentId ?? ''}</span>
              {#if Number(item.quantity) > 1}
                <span class="journal-step-item-qty"
                  >{localize('FABRICATE.App.Journal.Quantity', { n: item.quantity })}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if consumed.length > 0}
      <section class="journal-step-items" data-journal-consumed>
        <h4 class="journal-step-items-title">
          {localize('FABRICATE.App.Journal.StepDetails.ConsumedTitle')}
        </h4>
        <ul class="journal-step-items-list">
          {#each consumed as item, index (item.itemUuid ?? item.componentId ?? index)}
            <li class="journal-step-item" data-journal-consumed-item>
              {#if item.img}
                <img class="journal-step-item-thumb" src={item.img} alt="" />
              {/if}
              <span class="journal-step-item-name">{item.name ?? item.componentId ?? ''}</span>
              {#if Number(item.quantity) > 1}
                <span class="journal-step-item-qty"
                  >{localize('FABRICATE.App.Journal.Quantity', { n: item.quantity })}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </JournalCard>
{/if}

<style>
  .journal-fact-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .journal-step-items {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin-top: var(--fab-space-2);
    min-width: 0;
  }

  .journal-step-items-title {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .journal-step-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .journal-step-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;
  }

  .journal-step-item-thumb {
    display: block;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    object-fit: cover;
  }

  .journal-step-item-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-step-item-qty {
    flex: 0 0 auto;
    font-weight: 600;
    color: var(--fab-text-muted);
  }
</style>

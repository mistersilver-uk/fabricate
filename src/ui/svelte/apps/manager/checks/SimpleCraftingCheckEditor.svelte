<!-- Svelte 5 runes mode -->
<!--
  Simple pass/fail crafting check editor (simple and alchemy resolution modes). It rolls a
  FORMULA and succeeds when the total reaches the DC, whose value is polymorphic: `static` takes
  the default DC with optional named recipe TIERS, `dynamic` takes what a dropped macro returns,
  and both sides persist so switching mode is non-destructive. The unified `CheckTriggers` editor
  forces success or failure and, under `checkDriven`, breaks tools.

  `showDcSource` (default true) renders the DC-SOURCE half. Salvage and gathering reuse this
  editor with it off, having no records to pick a tier from and no dynamic-DC macro, and take a
  per-entity DC override elsewhere. Controlled through `onChange`. Outside summed roll-over against
  a fixed DC (issue 2005, ruling R2) the two-band strip is a read-only picture of the target, and a
  counting check's (issue 2006) is drawn in net successes.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import IconFactRow from '../IconFactRow.svelte';
  import ThresholdBandStrip from '../../../components/ThresholdBandStrip.svelte';
  import CheckDcMacroCard from './CheckDcMacroCard.svelte';
  import CheckDifficultyCard from './CheckDifficultyCard.svelte';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckTriggers from './CheckTriggers.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Select from '../../../components/Select.svelte';
  import { previewRecordSelectOptions } from './checksSelectOptions.js';
  import {
    normalizeCheckEvaluation,
    normalizeNullableSuccesses,
  } from '../../../../../systems/normalize/checkEvaluation.js';
  import { countRequired } from '../../../../../systems/countCheck.js';
  import { activeCheckEvaluation } from '../../../../../systems/checkTarget.js';
  import { checkTargetChip, countOutcomeCopy, formulaCardLead } from './checksCopy.js';
  import { previewTierAdjustment } from './checkAdjustmentLabel.js';
  import {
    bandsAreEditable,
    buildCountBands,
    buildPassFailBands,
    countBandScale,
    countPoolSettlesToZero,
    describeBandRange,
    describeCountBandRange,
    describeBandsUnavailable,
    previewBandTarget,
    previewScaleSentence,
  } from './checkBandModel.js';

  // `breakageAuthority` gates the per-trigger break-tools toggle on `checkDriven`, and
  // `section` selects which cards render, so one editor serves the five-section strip.
  let {
    value = null,
    showDcSource = true,
    breakageAuthority = 'toolSpecific',
    section = '',
    foundrySystemId = '',
    // The activity's own word for the thing a check is rolled for; see CheckDifficultyCard.
    recordNoun = 'recipe',
    // The check modifiers this check APPLIES and the rule combining them, from the derivation
    // the Modifiers section counts from rather than a second opinion.
    appliedModifiers = [],
    modifierPolicy = 'addAll',
    // The PREVIEW AGAINST binding, and the third `ThresholdBandStrip` binding. A simple check's
    // single boundary IS the DC, so the handle writes the Difficulty card's own field, and the
    // track bounds scale it to the reachable total range.
    previewRecords = [],
    previewRecordId = '',
    previewLabel = '',
    trackMin = null,
    trackMax = null,
    // The Preview-as actor, `{ name, rollData }`, that a character-value target resolves against.
    previewCharacter = null,
    // The previewed actor's flat check-modifier total; a roll-under strip adds it to the target.
    previewModifierTotal = 0,
    // The preview's `{ placement, odds }` a counting Formula card composes from (issue 2006).
    countPreview = null,
    onSelectPreviewRecord = () => {},
    onChange = () => {},
  } = $props();

  // Minted per instance (issue 1510): the Preview-against caption names its own trigger by id, and
  // salvage and gathering mount this editor beside the crafting one.
  const instanceId = $props.id();

  const previewRecordOptions = $derived(previewRecordSelectOptions(previewRecords));

  const checkDriven = $derived(breakageAuthority === 'checkDriven');
  const shows = (id) => !section || section === id;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const dcMode = $derived(value?.dcMode === 'dynamic' ? 'dynamic' : 'static');

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  const dc = $derived(Number(value?.dc ?? 0) || 0);
  // `evaluation` is the authored record the controls write back; `graded` is the one the runtime
  // grades with, which gates the strip and its direction.
  const evaluation = $derived(normalizeCheckEvaluation(value?.evaluation));
  const graded = $derived(activeCheckEvaluation(value));
  const editableBands = $derived(bandsAreEditable(value?.evaluation));
  const counts = $derived(graded.product === 'count');
  const comparison = $derived(value?.thresholdMode === 'exceed' ? 'exceed' : 'meet');
  const targetChip = $derived(checkTargetChip(evaluation, dc, text));

  // The read-only picture (issue 2005): the previewed record's target, graded by the runtime.
  const previewedTier = $derived(
    (Array.isArray(value?.tiers) ? value.tiers : []).find((tier) => tier.id === previewRecordId) ??
      null
  );
  const readonlyTarget = $derived(
    editableBands || counts
      ? null
      : previewBandTarget(
          {
            evaluation: graded,
            anchor: previewedTier ? Number(previewedTier.dc) : dc,
            tier: previewedTier,
            character: previewCharacter,
            modifiers: previewModifierTotal,
          },
          text
        )
  );
  // A count grades the previewed record's successes needed, its own when the tier sets none.
  const countTarget = $derived(
    counts ? countRequired(graded, normalizeNullableSuccesses(previewedTier?.successes)) : null
  );
  const countScale = $derived.by(() => {
    if (!counts) return '';
    const pool = { evaluation: graded, thresholdMode: comparison, character: previewCharacter };
    const zeroPool = countPoolSettlesToZero({ ...pool, placement: countPreview?.placement });
    const cancels = graded.pool.cancel.enabled;
    return countBandScale({ required: countTarget, zeroPool, cancels }, text);
  });
  // The two outcomes read in the successes needed, in the prototype's words.
  const countOutcomes = $derived(counts ? countOutcomeCopy(countTarget, recordNoun, text) : null);
  const readonlyScale = $derived(
    countScale ||
      previewScaleSentence(readonlyTarget, { direction: graded.direction, comparison }, text)
  );

  const failureLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure')
  );
  const successLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')
  );

  // The strip's domain, defaulting to a symmetric window around the DC when the route supplies
  // nothing, a track with no width being undraggable; `min` is additionally clamped BELOW the
  // DC so a DC at the reachable floor still leaves the failure band a band. `null` and `''`
  // are ABSENT, not zero — the guard `ThresholdBandStrip` records for its own `to` edge —
  // because a bare coercion read "no track supplied" as a track ending at zero.
  const suppliedBound = (bound) => {
    if (bound === null || bound === undefined || bound === '') return null;
    const parsed = Number(bound);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const stripMin = $derived(Math.min(suppliedBound(trackMin) ?? dc - 10, dc - 1));
  const stripMax = $derived(Math.max(suppliedBound(trackMax) ?? dc + 10, dc + 1));

  const BAND_COLORS = {
    failure: 'color-mix(in srgb, var(--fab-danger) 22%, var(--fab-bg-0))',
    success: 'color-mix(in srgb, var(--fab-success) 22%, var(--fab-bg-0))',
  };
  const countBands = $derived.by(() => {
    if (!counts) return [];
    const botch = text('FABRICATE.Admin.Manager.Checks.Odds.Botch', 'Botch');
    const names = { success: successLabel, failure: failureLabel, botch };
    return buildCountBands({ evaluation: graded, required: countTarget, names }).map((band) => ({
      ...band,
      range: describeCountBandRange(band, text),
      color: band.success ? BAND_COLORS.success : BAND_COLORS.failure,
    }));
  });
  const readonlyBands = $derived(
    readonlyTarget?.state === 'ok'
      ? buildPassFailBands({
          evaluation: graded,
          comparison,
          target: readonlyTarget.target,
          min: suppliedBound(trackMin),
          max: suppliedBound(trackMax),
          names: { success: successLabel, failure: failureLabel },
        }).map((band) => ({
          ...band,
          range: describeBandRange(band, text),
          color: band.success ? BAND_COLORS.success : BAND_COLORS.failure,
        }))
      : []
  );

  // TWO bands and therefore ONE handle, the whole outcome model of a simple check.
  const editableBandsList = $derived([
    { id: 'failure', index: 0, name: failureLabel, from: stripMin, color: BAND_COLORS.failure },
    { id: 'success', index: 1, name: successLabel, from: dc, color: BAND_COLORS.success },
  ]);
  const bandStripBands = $derived.by(() => {
    if (editableBands) return editableBandsList;
    return counts ? countBands : readonlyBands;
  });

  /**
   * Apply the single boundary move. The strip has already clamped the value inside the track,
   * so this only persists the DC — the field the Difficulty card's stepper writes, which makes
   * the strip a visualisation of that number rather than a second authority over it.
   * @param {{binding: string, dc: number}} patch The strip's own patch.
   */
  function applyBandStripChange(patch) {
    if (patch?.binding !== 'simple') return;
    emit({ dc: patch.dc });
  }
</script>

<div class="manager-checks-editor" data-simple-check-editor>
  {#if shows('roll')}
    <InspectorCard class="manager-checks-card" data-roll-formula-card="">
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Formula')}
          </h3>
          <p class="manager-checks-card-description">
            {formulaCardLead(
              evaluation,
              text,
              'FABRICATE.Admin.Manager.Checks.Crafting.FormulaLead',
              'Rolled once per attempt. Modifiers from the Modifiers tab are applied by the check; they never appear in the formula.'
            )}
          </p>
        </div>
      </div>
      <div class="manager-checks-card-body">
        <CheckFormulaFields
          rollFormula={value?.rollFormula || ''}
          {appliedModifiers}
          {modifierPolicy}
          {recordNoun}
          {foundrySystemId}
          {evaluation}
          thresholdMode={comparison}
          {targetChip}
          underTier={previewTierAdjustment(evaluation, previewedTier)}
          offerSituationalBonus={value?.offerSituationalBonus !== false}
          advantage={value?.advantage ?? null}
          character={previewCharacter}
          {countPreview}
          onChange={emit}
        />
      </div>
    </InspectorCard>

    <!-- DIFFICULTY, in its own card: the DC, the meet/exceed comparison and — on this slot
             alone, the simple check being the one carrying `dcMode` — where the number is from. -->
    <CheckDifficultyCard
      dc={value?.dc ?? 15}
      thresholdMode={value?.thresholdMode || 'meet'}
      dcMode={value?.dcMode || 'static'}
      {showDcSource}
      {recordNoun}
      {evaluation}
      character={previewCharacter}
      countTiers={showDcSource ? (value?.tiers ?? []) : []}
      onChange={emit}
    />
  {/if}

  <!-- A simple check's OUTCOME model: exactly two, neither authored. A statement rather than
         an editor, hence the shared icon fact row and no count badge, and it renders in every
         mode precisely because it IS the mode's outcome model. -->
  {#if shows('outcomes')}
    <InspectorCard class="manager-checks-card" data-simple-outcomes="">
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.TwoOutcomesTitle', 'Two outcomes')}
          </h3>
          {#if readonlyScale}
            <p class="manager-checks-card-description" data-simple-band-scale>{readonlyScale}</p>
          {:else}
            <p class="manager-checks-card-description">
              {text(
                'FABRICATE.Admin.Manager.Checks.Crafting.TwoOutcomesLead',
                'A simple check either clears the difficulty or it does not.'
              )}
            </p>
          {/if}
        </div>
      </div>
      <div class="manager-checks-card-body">
        <!-- PREVIEW AGAINST: the SAME selection the rail's card offers, reported upward, so the
                     simulator and the strip cannot read different records. -->
        {#if previewRecords.length > 1}
          <Field as="div" class="manager-checks-band-record">
            <span id={`${instanceId}-band-record`}
              >{text(
                'FABRICATE.Admin.Manager.Checks.Crafting.PreviewAgainst',
                'Preview against'
              )}</span
            >
            <Select
              size="toolbar"
              value={previewRecordId}
              options={previewRecordOptions}
              ariaLabelledBy={`${instanceId}-band-record`}
              triggerProps={{ 'data-simple-band-record': '' }}
              onChange={onSelectPreviewRecord}
            />
          </Field>
        {/if}

        <ThresholdBandStrip
          readonly={!editableBands}
          binding="simple"
          bands={bandStripBands}
          leadingTick={bandStripBands[0]?.botch ? '<0' : ''}
          {previewLabel}
          min={editableBands ? stripMin : null}
          max={editableBands ? stripMax : null}
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.TwoOutcomesTitle',
            'Two outcomes'
          )}
          boundaryLabel={() =>
            text('FABRICATE.Admin.Manager.Checks.Crafting.SimpleBoundary', 'Difficulty class')}
          fallbackNote={readonlyTarget && readonlyTarget.state !== 'ok'
            ? describeBandsUnavailable(
                readonlyTarget,
                { character: previewCharacter, expression: graded.target.expression },
                text
              )
            : text(
                'FABRICATE.Admin.Manager.Checks.Crafting.SimpleBandsFallback',
                'This check has no reachable range to draw against yet. Set a roll formula and a DC.'
              )}
          data-simple-band-strip
          onChange={applyBandStripChange}
        />
        {#if editableBands}
          <p class="manager-muted" data-simple-band-strip-hint>
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.SimpleBandsHint',
              'A total of {dc} or more succeeds; anything lower fails. Drag the edge or type the DC on the Difficulty card — the number is the authority.'
            ).replace('{dc}', String(dc))}
          </p>
        {/if}

        <div class="manager-checks-flag-list">
          <IconFactRow
            icon="fas fa-circle-check"
            data-simple-outcome="success"
            title={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')}
            subtitle={countOutcomes?.success ??
              text(
                'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessDesc',
                'The roll reaches the DC, and the recipe’s result group is produced in full.'
              )}
          />
          <IconFactRow
            icon="fas fa-circle-xmark"
            data-simple-outcome="failure"
            title={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure')}
            subtitle={countOutcomes?.failure ??
              text(
                'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailureDesc',
                'The roll misses the DC; nothing is produced, and the failure policy decides the cost.'
              )}
          />
        </div>
      </div>
    </InspectorCard>
  {/if}

  {#if shows('triggers')}
    <CheckTriggers
      value={value?.checkBreakage || null}
      rollFormula={value?.rollFormula || ''}
      kind="simple"
      showBreakTools={checkDriven}
      {evaluation}
      onChange={(checkBreakage) => emit({ checkBreakage })}
    />
  {/if}

  {#if showDcSource && shows('roll')}
    <!-- THE TIER LIST RENDERS UNDER BOTH MODES: the macro takes the tier's DC as its anchor and
             returns the final number, so hiding the tiers under dynamic would hide half of what
             the engine reads. -->
    <InspectorCard class="manager-checks-card" data-static-dc="">
      <CheckRecipeTiers
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        {evaluation}
        onChange={(tiers) => emit({ tiers })}
      />
    </InspectorCard>
    {#if dcMode === 'dynamic'}
      <CheckDcMacroCard macroUuid={value?.macroUuid ?? null} {evaluation} onChange={emit} />
    {/if}
  {/if}
</div>

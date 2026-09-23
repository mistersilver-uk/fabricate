<!-- Svelte 5 runes mode -->
<!--
  Simple pass/fail crafting check editor (simple and alchemy resolution modes). It rolls a
  FORMULA and succeeds when the total reaches the DC, whose value is polymorphic: `static` takes
  the default DC with optional named recipe TIERS, `dynamic` takes what a dropped macro returns,
  and both sides persist so switching mode is non-destructive. The unified `CheckTriggers` editor
  forces success or failure and, under `checkDriven`, breaks tools.

  `showDcSource` (default true) renders the DC-SOURCE half. Salvage and gathering reuse this
  editor with it off, having no records to pick a tier from and no dynamic-DC macro, and take a
  per-entity DC override elsewhere. Controlled through `onChange`.
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

  // TWO bands and therefore ONE handle, the whole outcome model of a simple check.
  const bandStripBands = $derived([
    {
      id: 'failure',
      index: 0,
      name: failureLabel,
      from: stripMin,
      color: 'color-mix(in srgb, var(--fab-danger) 22%, var(--fab-bg-0))',
    },
    {
      id: 'success',
      index: 1,
      name: successLabel,
      from: dc,
      color: 'color-mix(in srgb, var(--fab-success) 22%, var(--fab-bg-0))',
    },
  ]);

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
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.FormulaLead',
              'Rolled once per attempt.'
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
          <p class="manager-checks-card-description">
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.TwoOutcomesLead',
              'A simple check either clears the difficulty or it does not.'
            )}
          </p>
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
              triggerData={{ 'data-simple-band-record': '' }}
              onChange={onSelectPreviewRecord}
            />
          </Field>
        {/if}

        <ThresholdBandStrip
          binding="simple"
          bands={bandStripBands}
          {previewLabel}
          min={stripMin}
          max={stripMax}
          groupLabel={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.TwoOutcomesTitle',
            'Two outcomes'
          )}
          boundaryLabel={() =>
            text('FABRICATE.Admin.Manager.Checks.Crafting.SimpleBoundary', 'Difficulty class')}
          fallbackNote={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.SimpleBandsFallback',
            'This check has no reachable range to draw against yet. Set a roll formula and a DC.'
          )}
          dataAttr="data-simple-band-strip"
          onChange={applyBandStripChange}
        />
        <p class="manager-muted" data-simple-band-strip-hint>
          {text(
            'FABRICATE.Admin.Manager.Checks.Crafting.SimpleBandsHint',
            'A total of {dc} or more succeeds; anything lower fails. Drag the edge or type the DC on the Difficulty card — the number is the authority.'
          ).replace('{dc}', String(dc))}
        </p>

        <div class="manager-checks-flag-list">
          <IconFactRow
            icon="fas fa-circle-check"
            dataAttr="data-simple-outcome"
            dataValue="success"
            title={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')}
            subtitle={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessDesc',
              'The roll reaches the DC, and the recipe’s result group is produced in full.'
            )}
          />
          <IconFactRow
            icon="fas fa-circle-xmark"
            dataAttr="data-simple-outcome"
            dataValue="failure"
            title={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure')}
            subtitle={text(
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
        onChange={(tiers) => emit({ tiers })}
      />
    </InspectorCard>
    {#if dcMode === 'dynamic'}
      <CheckDcMacroCard macroUuid={value?.macroUuid ?? null} onChange={emit} />
    {/if}
  {/if}
</div>

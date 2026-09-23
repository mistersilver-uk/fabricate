<!-- Svelte 5 runes mode -->
<!--
  Routed-mode crafting check editor.

  A routed crafting check has a TYPE (relative or fixed), a roll FORMULA with a default DC and
  comparison shared with the simple check, the unified `CheckTriggers` editor, and a table of
  OUTCOME TIERS — relative tiers as offsets from the record's DC, fixed tiers owning a
  non-overlapping segment of the value range. BOTH the relative DC and the fixed start/end are
  kept on each outcome, so switching type destroys neither, and each also carries a name, a
  generated secret id, a success toggle and, under `checkDriven`, a break-tools toggle.

  Controlled; range parsing lives in `utils/craftingCheckExpression.js`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { findRangeConflicts } from '../../../../../utils/craftingCheckExpression.js';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ThresholdBandStrip from '../../../components/ThresholdBandStrip.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import CheckDcMacroCard from './CheckDcMacroCard.svelte';
  import CheckDifficultyCard from './CheckDifficultyCard.svelte';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckTriggers from './CheckTriggers.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Select from '../../../components/Select.svelte';
  import { previewRecordSelectOptions } from './checksSelectOptions.js';

  // `showTiers` (default true) renders the per-recipe tier table, relative type only;
  // salvage/gathering reuse this editor with it off, having no records to pick a tier from.
  // `breakageAuthority` gates the per-outcome break-tools pills on `checkDriven`. `resolutionMode`
  // is the SYSTEM crafting mode, passed only by the crafting-tab instance, and scopes the
  // fixed-type DC hiding to `routedByCheck + fixed`. `section` selects which cards render, so the
  // studio's strip hosts the SAME editor rather than a per-section fork.
  //
  // `previewLabel` names the record the bands are drawn against. ONE selection, not two: the strip
  // and the simulator's readout must never describe different records, so the state is the
  // route's and this control reports upward.
  let {
    value = null,
    showTiers = true,
    breakageAuthority = 'toolSpecific',
    resolutionMode = null,
    section = '',
    foundrySystemId = '',
    // The activity's own word for what a check is rolled for: hard-coding one is how a gathering
    // screen comes to talk about recipes.
    recordNoun = 'recipe',
    // The check modifiers this check APPLIES and the rule combining them, from the same
    // derivation the Modifiers section counts from rather than a second opinion.
    appliedModifiers = [],
    modifierPolicy = 'addAll',
    // The PREVIEW AGAINST binding: the route's own record list, the same one the rail's
    // simulator previews against, plus its DC and name.
    previewRecords = [],
    previewRecordId = '',
    previewDcOverride = null,
    previewLabel = '',
    onSelectPreviewRecord = () => {},
    onChange = () => {},
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');
  const shows = (id) => !section || section === id;
  // THE ONE CONDITION under which this check has no anchor. A `routedByCheck` check of `fixed`
  // type matches a roll against ABSOLUTE value ranges, so there is no DC to meet, to exceed or for
  // a record's difficulty tier to move, and three surfaces are withheld together for that reason:
  // the `Difficulty` card, the tier list and `PREVIEW AGAINST`.
  //
  // BOTH HALVES ARE LOAD-BEARING, and the gate is NAMED rather than spelled out at three call
  // sites. `fixed` alone is not enough — salvage and gathering reuse this editor with no system
  // resolution mode and their fixed checks keep a DC — and `routedByCheck` alone is not either, a
  // relative routed check being DEFINED by its DC.
  // `tests/components/crafting-check-anchor-gate.test.js` pins all four corners.
  const bandsAreAbsolute = $derived(resolutionMode === 'routedByCheck' && type === 'fixed');
  // Outcome options for the `CheckTriggers` outcomeTier condition, from the ACTIVE list.
  const breakageOutcomeOptions = $derived(
    outcomes.map((outcome) => ({ id: outcome.id, name: outcome.name }))
  );

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // Icons name what a tier threshold IS: an offset from the record's DC, or a measured segment.
  const TYPE_OPTIONS = [
    {
      value: 'relative',
      icon: 'fas fa-plus-minus',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelative',
      fallback: 'Relative',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelativeDesc',
      descFallback: 'Tier thresholds are relative to the recipe DC, e.g. DC -5 or DC +10.',
    },
    {
      value: 'fixed',
      icon: 'fas fa-ruler',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixed',
      fallback: 'Fixed',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixedDesc',
      descFallback: 'Each tier owns a non-overlapping segment of the roll value range.',
    },
  ];

  const type = $derived(value?.type === 'fixed' ? 'fixed' : 'relative');
  // Relative and fixed tiers are independent lists and only the active one is ever written.
  const outcomesKey = $derived(type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes');
  const outcomes = $derived(Array.isArray(value?.[outcomesKey]) ? value[outcomesKey] : []);
  // Fixed-mode tiers own a non-overlapping segment of the roll value range, and the conflict
  // set drives the per-row highlight; the textual messages live on the Validation tab.
  const conflicts = $derived(type === 'fixed' ? findRangeConflicts(outcomes) : null);

  // The three numeric column labels, hoisted because each is needed THREE times.
  const dcLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±'));
  const startLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start')
  );
  const endLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End'));

  const successOnLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOn', 'Success')
  );
  const successOffLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessOff', 'Failure')
  );
  const breakOnLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOn', 'Break')
  );
  const breakOffLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreakOff', "Don't break")
  );

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  function setType(nextType) {
    if (nextType === type) return;
    emit({ type: nextType });
  }

  function updateOutcome(id, patch) {
    emit({
      [outcomesKey]: outcomes.map((outcome) =>
        outcome.id === id ? { ...outcome, ...patch } : outcome
      ),
    });
  }

  function removeOutcome(id) {
    emit({ [outcomesKey]: outcomes.filter((outcome) => outcome.id !== id) });
  }

  function addOutcome() {
    const base = { id: newId(), name: '', success: false, breakTools: false };
    let next;
    if (type === 'fixed') {
      const last = outcomes[outcomes.length - 1];
      const nextStart = last ? Number(last.end) + 1 : 1;
      next = { ...base, start: nextStart, end: nextStart };
    } else {
      next = { ...base, dc: 0 };
    }
    emit({ [outcomesKey]: [...outcomes, next] });
  }

  function rowInvalid(index) {
    return !!conflicts && (conflicts.overlapping.has(index) || conflicts.invalid.has(index));
  }

  // THE BAND STRIP is a VISUALISATION of the tier list; the steppers stay the control of record.
  // Bands are handed over in ABSOLUTE track values whatever the type underneath, a strip reading
  // two authored shapes being two components wearing one name, and band identity is a THEME TOKEN.
  //
  // FIVE HUES, WALKED BY POSITION IN VALUE ORDER, and NOT by the `success` flag: a flag has two
  // values, so a flag-derived colour paints two of a five-tier check's bands identically, and
  // ranking WITHIN each family puts the darkest band in the MIDDLE. One ramp is what makes the
  // strip read as escalating, and every tier row's own pill already carries the success split.
  //
  // PREVIEW AGAINST is the record the bands are DRAWN against, where the rail's "Preview as"
  // chooses an ACTOR. NEVER PERSISTED, but not LOCAL either where a route owns it, the rail's
  // simulator and histogram reading the SAME record; a route supplying `previewRecords` is the
  // authority, otherwise the local fallback keeps it live. WITHHELD ONLY WHERE THE BANDS HAVE NO
  // ANCHOR — `bandsAreAbsolute` — a control re-anchoring absolute roll values promising what the
  // model cannot keep.
  let localPreviewRecordId = $state('');
  const recipeTiers = $derived(Array.isArray(value?.tiers) ? value.tiers : []);
  const routeOwnsPreview = $derived(previewRecords.length > 0);

  const previewAgainstOptions = $derived(
    routeOwnsPreview
      ? previewRecordSelectOptions(previewRecords)
      : [
          {
            value: '',
            label: text(
              'FABRICATE.Admin.Manager.Checks.Crafting.PreviewAgainstDefault',
              'Default · DC {dc}'
            ).replace('{dc}', String(Number(value?.dc ?? 0) || 0)),
          },
          ...recipeTiers.map((tier) => ({
            value: tier.id,
            label: `${tier.name || text('FABRICATE.Admin.Manager.Checks.Crafting.UnnamedTier', 'Unnamed tier')} · ${text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')} ${Number(tier.dc ?? 0) || 0}`,
          })),
        ]
  );
  const showPreviewAgainst = $derived(!bandsAreAbsolute && previewAgainstOptions.length > 1);
  const selectedPreviewRecordId = $derived(
    routeOwnsPreview ? previewRecordId : localPreviewRecordId
  );
  const previewTier = $derived(
    routeOwnsPreview ? null : recipeTiers.find((tier) => tier.id === localPreviewRecordId) || null
  );
  // The DC the relative bands resolve against: the PREVIEWED RECORD's, falling back to the
  // check's own. A relative band's absolute position is a function of that number, which is
  // why the strip announces both readings.
  const previewDc = $derived.by(() => {
    const supplied = Number(previewDcOverride);
    if (routeOwnsPreview && Number.isFinite(supplied)) return supplied;
    return previewTier ? Number(previewTier.dc ?? 0) || 0 : Number(value?.dc ?? 0) || 0;
  });

  function selectPreviewRecord(id) {
    localPreviewRecordId = id;
    onSelectPreviewRecord(id);
  }

  // The two segments of the per-tier outcome toggle, hoisted rather than rebuilt per row.
  const outcomeSegments = $derived([
    { value: 'success', fallback: successOnLabel, variant: 'success' },
    { value: 'failure', fallback: successOffLabel, variant: 'danger' },
  ]);

  // The same shape for the `checkDriven`-only tool-breakage choice; `keep` is the benign one.
  const breakToolsSegments = $derived([
    { value: 'keep', fallback: breakOffLabel, variant: 'success' },
    { value: 'break', fallback: breakOnLabel, variant: 'danger' },
  ]);

  // THE RAMP IS BOUNDED BY THE BAND NAME'S CONTRAST, and is mixed into an OPAQUE base for that
  // reason: each band carries its tier's NAME as normal-size text, so WCAG AA wants 4.5:1, and
  // a TRANSLUCENT surface token makes the mix percentage double as an opacity, dropping the
  // ink to 1.74:1. Each tone brings its OWN ink rather than one `--fab-text`, which is what
  // buys the headroom: measured across five tones, seven palettes and every band count the
  // floor is 7.12:1 — see the AA gate in tests/components/manager-layout.test.js.
  const BAND_TONES = ['danger', 'warning', 'success', 'info', 'accent'];
  const BAND_TONE_MIX = 26;
  const BAND_TONE_BASE = 'var(--fab-bg-0)';

  /**
   * The tone for the band at `position` of `count`, in value order. A single band takes the
   * MIDDLE tone, and counts above five reuse one — the cost of a five-stop ramp, stated here.
   */
  function toneFor(position, count) {
    if (count <= 1) return BAND_TONES[Math.floor(BAND_TONES.length / 2)];
    return BAND_TONES[Math.round((position * (BAND_TONES.length - 1)) / (count - 1))];
  }

  function bandFill(tone) {
    return `color-mix(in oklab, var(--fab-${tone}) ${BAND_TONE_MIX}%, ${BAND_TONE_BASE})`;
  }

  const bandStripBands = $derived.by(() => {
    const rows = outcomes.map((outcome, index) => ({
      id: outcome.id,
      index,
      name: outcome.name,
      success: outcome.success === true,
      from: type === 'fixed' ? Number(outcome.start) : previewDc + Number(outcome.dc),
      to: type === 'fixed' ? Number(outcome.end) : null,
    }));
    // Value order, the order the strip DRAWS in, not the authored order. A plain object rather
    // than a `Map`, which `svelte/prefer-svelte-reactivity` rejects.
    const ordered = [...rows].sort(
      (a, b) => (Number.isFinite(a.from) ? a.from : 0) - (Number.isFinite(b.from) ? b.from : 0)
    );
    const toneByIndex = {};
    ordered.forEach((row, position) => {
      toneByIndex[row.index] = toneFor(position, ordered.length);
    });
    return rows.map((row) => {
      const tone = toneByIndex[row.index];
      return {
        ...row,
        color: bandFill(tone),
        ink: `var(--fab-${tone}-text)`,
        swatch: `var(--fab-${tone})`,
      };
    });
  });

  // The key to the strip, on the tier ROW: the band's tone at FULL STRENGTH, without which the
  // ramp is a pattern with no legend. Undiluted, because it carries no text.
  const bandSwatchById = $derived(
    Object.fromEntries(bandStripBands.map((band) => [band.id, band.swatch]))
  );

  /**
   * Apply one boundary move. The strip has already resolved WHICH fields the handle writes and
   * clamped against its neighbours, so this only persists the patch — the FIXED case's coupled
   * pair as ONE `emit`, so a half-applied move cannot be observed.
   */
  function applyBandStripChange(patch) {
    if (patch?.binding === 'fixed') {
      emit({
        [outcomesKey]: outcomes.map((outcome, index) => {
          if (index === patch.index) return { ...outcome, end: patch.end };
          if (index === patch.nextIndex) return { ...outcome, start: patch.start };
          return outcome;
        }),
      });
      return;
    }
    if (patch?.binding === 'relative') {
      emit({
        [outcomesKey]: outcomes.map((outcome, index) =>
          index === patch.index ? { ...outcome, dc: patch.dc } : outcome
        ),
      });
    }
  }
</script>

<div class="manager-checks-editor" data-crafting-check-editor>
  <!-- Check type anchors the OUTCOME tiers, so it sits with them rather than with the roll. -->
  {#if shows('outcomes')}
    <InspectorCard class="manager-checks-card" data-check-type-card="">
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle', 'Check type')}
          </h3>
          <p class="manager-checks-card-description">
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.TypeLead',
              'How the outcome tiers are anchored. Both tier lists are kept, so switching never discards the other.'
            )}
          </p>
        </div>
      </div>
      <div class="manager-checks-card-body">
        <RadioCardGroup
          legendKey="FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle"
          legend="Check type"
          options={TYPE_OPTIONS}
          selectedValue={type}
          groupName="crafting-check-type"
          columns={2}
          optionDataAttr="data-check-type-option"
          onChange={setType}
        />
      </div>
    </InspectorCard>
  {/if}

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
          placeholder="1d20"
          {foundrySystemId}
          onChange={emit}
        />
      </div>
    </InspectorCard>

    <!-- DIFFICULTY, in its own card, WITH its DC-source chooser: a routed RELATIVE check is
             DEFINED as bands offset from a DC, so offering the number without its source was
             incoherent. `bandsAreAbsolute` is the one state with no DC, and it is the SAME named
             gate the tier list and `PREVIEW AGAINST` read. -->
    {#if !bandsAreAbsolute}
      <CheckDifficultyCard
        showDcSource
        dc={value?.dc ?? 15}
        thresholdMode={value?.thresholdMode || 'meet'}
        dcMode={value?.dcMode || 'static'}
        {recordNoun}
        onChange={emit}
      />
    {/if}
  {/if}

  {#if shows('triggers')}
    <CheckTriggers
      value={value?.checkBreakage || null}
      rollFormula={value?.rollFormula || ''}
      kind="routed"
      outcomeOptions={breakageOutcomeOptions}
      showBreakTools={checkDriven}
      onChange={(checkBreakage) => emit({ checkBreakage })}
    />
  {/if}

  <!-- The tier list renders under BOTH DC modes: the macro takes the tier's DC as its anchor
         and returns the final number, so the two COMPOSE rather than compete. -->
  {#if showTiers && !bandsAreAbsolute && shows('roll')}
    <!-- `manager-checks-card`, not the bare `.manager-inspector-card` shell, which pads on TOP of
             `CheckRecipeTiers`' own card-body padding and insets the tier rows past the cards above.
             `SimpleCraftingCheckEditor`'s `data-static-dc` wrapper carries both for that reason. -->
    <InspectorCard class="manager-checks-card" data-routed-tiers="">
      <CheckRecipeTiers
        anchorsBands
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        onChange={(tiers) => emit({ tiers })}
      />
    </InspectorCard>
  {/if}

  {#if !bandsAreAbsolute && shows('roll') && value?.dcMode === 'dynamic'}
    <CheckDcMacroCard macroUuid={value?.macroUuid ?? null} onChange={emit} />
  {/if}

  {#if shows('outcomes')}
    <!-- ONE card: the strip and the tier rows it draws are one subject, and two cards put a
             border between a band and the row that moves it. -->
    <InspectorCard class="manager-checks-card" data-outcome-bands="">
      <!-- STACKED and full-width, like every other studio card head: `is-inline` sets the
                 description on the title's line and pushes it right, where it reads as a caption rather
                 than the card's lead. The head action went with it, leaving ONE add control at the
                 foot of the list. -->
      <div class="manager-checks-card-head">
        <div>
          <h3 class="manager-checks-card-title">
            {text('FABRICATE.Admin.Manager.Checks.Crafting.BandsTitle', 'Outcome bands')}
          </h3>
          <p class="manager-checks-card-description">
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.BandsLead',
              'Transition points between the tiers below. Anything under the first band or over the last clamps into the end band.'
            )}
          </p>
        </div>
      </div>
      <div class="manager-checks-card-body is-roomy">
        {#if showPreviewAgainst}
          <div class="manager-checks-preview-against" data-preview-against>
            <span class="manager-checks-preview-against-label" id="checks-preview-against-label">
              {text('FABRICATE.Admin.Manager.Checks.Crafting.PreviewAgainst', 'Preview against')}
            </span>
            <Select
              size="inline"
              value={selectedPreviewRecordId}
              options={previewAgainstOptions}
              ariaLabelledBy="checks-preview-against-label"
              triggerData={{ 'data-preview-against-select': '' }}
              onChange={selectPreviewRecord}
            />
          </div>
        {/if}
        <!-- THE STRIP AND ITS HINT ARE FOR A CHECK THAT HAS TIERS: rendered unconditionally both say
                     something FALSE when there are none — a gap-or-overlap warning about tiers that do
                     not exist, and an invitation to drag a band edge on a strip with no edges. -->
        {#if outcomes.length > 0}
          <ThresholdBandStrip
            binding={type === 'fixed' ? 'fixed' : 'relative'}
            bands={bandStripBands}
            {previewDc}
            {previewLabel}
            groupLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.BandsTitle', 'Outcome bands')}
            boundaryLabel={(band, nextBand) =>
              text(
                'FABRICATE.Admin.Manager.Checks.Crafting.BandsBoundary',
                'Threshold between {from} and {to}'
              )
                .replace('{from}', band?.name || '')
                .replace('{to}', nextBand?.name || '')}
            fallbackNote={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.BandsFallback',
              'These tiers leave a gap or overlap, so they cannot be drawn as one continuous strip. Edit the numbers in the rows below; the strip returns once the ranges meet.'
            )}
            dataAttr="data-outcome-band-strip"
            onChange={applyBandStripChange}
          />
          <p class="manager-muted" data-outcome-band-strip-hint>
            <!-- The pointer glyph leads the sentence: the hint is about a DIRECT-MANIPULATION
                             affordance. -->
            <i class="fas fa-arrow-pointer" aria-hidden="true"></i>
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.BandsHint',
              'Drag or arrow-key a band edge to move its threshold, or type the numbers below. The numbers are the authority.'
            )}
          </p>
        {/if}

        {#if outcomes.length === 0}
          <p class="manager-muted" data-outcomes-empty>
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.NoOutcomes',
              'No outcome tiers yet. Add the tiers this check routes results into.'
            )}
          </p>
        {:else}
          <!-- A FLEX LIST, not a subgrid table, and no column headers: every control on the row
                         states its own subject through its accessible name. -->
          <div
            class="manager-checks-tier-list"
            role="list"
            aria-label={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.OutcomesTitle',
              'Outcome tiers'
            )}
          >
            {#each outcomes as outcome, index (outcome.id)}
              <div
                class={`manager-checks-tier-row ${rowInvalid(index) ? 'is-invalid' : ''}`}
                role="listitem"
                data-outcome-row={outcome.id}
                data-outcome-id={outcome.id}
              >
                <!-- The KEY to the strip above: this row's band in its own tone, decorative to a screen
                                     reader, the row's accessible name coming from the Name field. -->
                <span
                  class="manager-checks-tier-swatch"
                  data-outcome-swatch={outcome.id}
                  style={`--fab-outcome-swatch: ${bandSwatchById[outcome.id] || 'var(--fab-surface-active)'};`}
                  aria-hidden="true"
                ></span>
                <input
                  class="manager-checks-tier-name"
                  data-outcome-name
                  aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}
                  value={outcome.name || ''}
                  oninput={(event) =>
                    updateOutcome(outcome.id, { name: event.currentTarget.value })}
                />

                <!-- `fill` plus a WIDTH from the layout context, the one thing it may take from this
                                     primitive. `allowUnset` is absent, a tier threshold having no "unset" meaning, and
                                     every `data-*` hook goes through `inputProps` onto the real `<input>`. -->
                {#if type === 'relative'}
                  <div class="manager-checks-tier-stepper">
                    <Stepper
                      fill
                      value={outcome.dc ?? 0}
                      {...stepperLabels(dcLabel)}
                      inputProps={{ 'data-outcome-dc': '' }}
                      onChange={(dc) => updateOutcome(outcome.id, { dc })}
                    />
                  </div>
                {:else}
                  <div class="manager-checks-tier-stepper is-narrow">
                    <Stepper
                      fill
                      value={outcome.start ?? 0}
                      {...stepperLabels(startLabel)}
                      inputProps={{ 'data-outcome-start': '' }}
                      onChange={(start) => updateOutcome(outcome.id, { start })}
                    />
                  </div>
                  <div class="manager-checks-tier-stepper is-narrow">
                    <Stepper
                      fill
                      value={outcome.end ?? 0}
                      {...stepperLabels(endLabel)}
                      inputProps={{ 'data-outcome-end': '' }}
                      onChange={(end) => updateOutcome(outcome.id, { end })}
                    />
                  </div>
                {/if}

                <!-- A SEGMENTED TOGGLE, not a pill that swaps its own label: the click-in-place pill
                                     showed only the state the tier is IN, readable as either a reading or a verb. -->
                <SegmentedControl
                  density="compact"
                  options={outcomeSegments}
                  value={outcome.success === true ? 'success' : 'failure'}
                  groupName={`outcome-success-${outcome.id}`}
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess',
                    'Success'
                  )}
                  dataAttr="data-outcome-success"
                  optionDataAttr="data-outcome-success-option"
                  onChange={(next) => updateOutcome(outcome.id, { success: next === 'success' })}
                />

                <!-- KEPT, and gated, on purpose: the MATCHED TIER's own `breakTools` is read by
                                     `checkRoll.js`, so under `checkDriven` this is the only authoring surface for a
                                     live engine field. -->
                {#if checkDriven}
                  <SegmentedControl
                    density="compact"
                    options={breakToolsSegments}
                    value={outcome.breakTools === true ? 'break' : 'keep'}
                    groupName={`outcome-break-${outcome.id}`}
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
                      'Break tools'
                    )}
                    dataAttr="data-outcome-break"
                    optionDataAttr="data-outcome-break-option"
                    onChange={(next) => updateOutcome(outcome.id, { breakTools: next === 'break' })}
                  />
                {/if}

                <ManagerButton
                  role="danger"
                  class="manager-checks-tier-remove"
                  data-remove-outcome
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Checks.Crafting.RemoveOutcome',
                    'Remove outcome'
                  )}
                  onclick={() => removeOutcome(outcome.id)}
                >
                  <i class="fas fa-trash" aria-hidden="true"></i>
                </ManagerButton>
              </div>
            {/each}
          </div>
        {/if}

        <!-- OUTSIDE the `{#if}`, which is the point rather than the layout: as the last child of the
                     tier list, which only renders with at least one row, a check with ZERO tiers showed
                     the empty sentence and NOTHING to press — the state every routed check starts in.
                     Placed BENEATH that sentence, as `CheckRecipeTiers` and `CheckTriggers` do, on the
                     list's own gap, so the populated state is pixel-unchanged. -->
        <ManagerButton
          role="dashed"
          class="manager-checks-outcome-add"
          data-add-outcome-tier
          onclick={addOutcome}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.Checks.Crafting.AddOutcomeTier',
              'Add outcome tier'
            )}</span
          >
        </ManagerButton>
      </div>
    </InspectorCard>
  {/if}
</div>

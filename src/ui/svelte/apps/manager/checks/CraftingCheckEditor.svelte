<!-- Svelte 5 runes mode -->
<!--
  Routed-mode crafting check editor.

  A routed crafting check has a TYPE (relative or fixed), a roll FORMULA with a
  default DC and comparison (shared with the simple check), the unified CheckTriggers
  editor, and a table of OUTCOME TIERS:
    - relative: each tier's threshold is expressed relative to the recipe's DC
                (DC -5, DC +10, …); relative checks may also define recipe TIERS
                that override the default DC.
    - fixed:    each tier owns a start/end segment of the formula's value range;
                segments must not overlap.
  Every outcome has a name, a generated secret id (kept in data, never shown), a
  success toggle, and (under `checkDriven` authority) a break-tools toggle. Both the
  relative DC and the fixed start/end are kept on each outcome so switching type never
  destroys the other mode's values.

  Reuses the shared check sub-components (formula/DC/comparison, unified triggers,
  recipe tiers) so routed and simple stay structurally identical. Controlled component:
  renders `value`, emits the next value through `onChange`. Range parsing lives in
  utils/craftingCheckExpression.js.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { findRangeConflicts } from '../../../../../utils/craftingCheckExpression.js';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ThresholdBandStrip from '../../../components/ThresholdBandStrip.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckTriggers from './CheckTriggers.svelte';

  // `showTiers` (default true) renders the per-recipe tier table (relative type
  // only). Salvage/gathering reuse this editor with `showTiers={false}` — they have
  // no recipes to pick a tier from; a per-entity DC override lives elsewhere.
  // `breakageAuthority` (issue 419): tool breakage is a check-driven concept, so the
  // per-outcome break-tools pills (and the unified trigger break pills) are shown
  // only under `checkDriven`.
  // `resolutionMode` is the SYSTEM crafting resolution mode, passed only by the
  // crafting-tab instance. From the crafting tab this editor now only ever serves
  // `routedByCheck` (the tier-routing check); `routedByIngredients` authors its
  // pass/fail check via the SimpleCraftingCheckEditor, and the salvage/gathering
  // instances omit this prop entirely (defaulting to relative-with-DC). It scopes the
  // fixed-type DC hiding to `routedByCheck + fixed` (which matches by value range, so
  // the DC is meaningless); every other case keeps showing the DC field.
  // `section` (issue 1096) selects which of this editor's cards render, so the Checks
  // Studio's five-section strip hosts the SAME editor rather than a per-section fork.
  // Empty renders every card, which is what every caller outside the studio still gets.
  //
  // There is deliberately NO `previewLabel` here. `ThresholdBandStrip` takes one and names it
  // in its group label and `aria-valuetext`, but nothing in the product can supply one: what a
  // previewed record IS, and which one is selected, are the outcome simulator's decisions.
  // A prop forwarded from every caller as `''` is a claim the surface cannot honour, so the
  // strip is drawn against the check's own DC and says so.
  let {
    value = null,
    showTiers = true,
    breakageAuthority = 'toolSpecific',
    resolutionMode = null,
    section = '',
    onChange = () => {},
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');
  const shows = (id) => !section || section === id;
  // Fixed-type routed-by-check checks match by value range, so DC + the meet/exceed
  // comparison are meaningless there; hide both (CheckFormulaFields' showDc gate wraps
  // both). Any other case (relative type, salvage/gathering) keeps the DC.
  const hideDc = $derived(resolutionMode === 'routedByCheck' && type === 'fixed');
  // Outcome options for the CheckTriggers outcomeTier condition — both tier lists
  // carry an id + name; the active list is the one the editor is showing.
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

  // Icons name what a tier threshold IS in each type: an offset from the recipe DC
  // (the table's own "DC ±" column) versus a measured segment of the value range.
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
      icon: 'fas fa-ruler-horizontal',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixed',
      fallback: 'Fixed',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixedDesc',
      descFallback: 'Each tier owns a non-overlapping segment of the roll value range.',
    },
  ];

  const type = $derived(value?.type === 'fixed' ? 'fixed' : 'relative');
  // Relative and fixed tiers are independent lists; the editor only ever reads
  // and writes the active type's list, so changes in one mode never touch the other.
  const outcomesKey = $derived(type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes');
  const outcomes = $derived(Array.isArray(value?.[outcomesKey]) ? value[outcomesKey] : []);
  // Fixed-mode tiers own a non-overlapping segment of the roll value range; the
  // conflict set drives the per-row invalid highlight below. The textual
  // validation messages (unnamed tier, no Success tier, range invalid/overlap)
  // are no longer shown inline here — they are surfaced in the Checks editor's
  // Validation tab (see ChecksValidationTab / checksReadiness), the one canonical
  // place a GM reviews per-check issues.
  const conflicts = $derived(type === 'fixed' ? findRangeConflicts(outcomes) : null);

  // The three numeric column labels, hoisted because each is now needed THREE times: its
  // header cell, its stepper's accessible name, and the `{label}` slot in the shared
  // `Decrease {label}` / `Increase {label}` adjunct strings.
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

  // ── The band strip (issue 1096) ──────────────────────────────────────────────────
  //
  // A VISUALISATION of the tier list above; the steppers in the rows stay the control of
  // record. Bands are handed over in ABSOLUTE track values whatever the type underneath,
  // because a strip that had to read two authored shapes would be two components wearing
  // one name — relative offsets are resolved against the previewed DC here.
  //
  // Band identity is carried by a THEME TOKEN, not by a persisted colour: outcome tiers carry
  // no authored colour today, and inventing one would be a persisted-shape change this work
  // does not own. The strip's `color` prop takes the value verbatim, so an authored swatch can
  // replace this later with no strip change.
  //
  // FIVE HUES, WALKED BY POSITION IN VALUE ORDER. The band a tier gets is decided by where it
  // sits in the ordered list — first tier takes the first tone, last tier the last — and NOT by
  // its `success` flag. Two reasons, and the second is the one that was wrong before.
  //
  // A flag has two values, so a flag-derived colour paints two of a five-tier check's bands
  // identically; per-band identity is the whole reason this control refuses the full-track
  // gradient exemption, so that is a defect and not a preference. Ranking WITHIN each family
  // fixed the duplication but not the reading: on a three-tier check the one failure tier is a
  // family of ONE and took the family's strongest tone, so the strip ran mid, dark, light — the
  // darkest band in the MIDDLE, and the failure lighter than the first success. Walking one
  // ramp across the whole list is what makes the strip read left-to-right as escalating.
  //
  // The ramp does not need to re-state the success/failure split, because the row beneath every
  // band already does: each tier row carries a Success/Failure pill, and the boundary handles
  // name both tiers. A colour is a weaker carrier of that fact than the words already on screen.
  const previewDc = $derived(Number(value?.dc ?? 0) || 0);

  // THE RAMP IS BOUNDED BY THE BAND NAME'S CONTRAST, and it is mixed into an OPAQUE base for
  // exactly that reason.
  //
  // Each band carries its tier's NAME at 0.72rem/600 — normal-size text, so WCAG AA wants
  // 4.5:1 against whatever the band paints. An earlier ramp mixed into `--fab-surface-raised`,
  // which is TRANSLUCENT in every theme, so the mix percentage doubled as an opacity: the fill
  // lightened as the ramp climbed and the ink fell to 1.74:1. Mixed into `--fab-bg-0` the
  // painted colour is a pure function of the theme's own tokens, independent of whatever the
  // strip is stacked on, which is what makes any claim about it measurable at all.
  //
  // Each tone brings its OWN ink — `--fab-<tone>-text`, the ink each family already ships for
  // its soft fill — rather than one `--fab-text` for the whole strip. That is what buys the
  // headroom: a single ink forces every band to stay under one luminance ceiling, and it was
  // that ceiling, not the hues, that held the previous ramp to a 4.64:1 floor. Measured across
  // all five tones, all seven palettes and every band count, the floor is now 7.12:1
  // (`hearth-herb`, danger) — see the AA gate in tests/components/manager-layout.test.js.
  const BAND_TONES = ['danger', 'warning', 'success', 'info', 'accent'];
  const BAND_TONE_MIX = 26;
  const BAND_TONE_BASE = 'var(--fab-bg-0)';

  /**
   * The tone for the band at `position` of `count`, in value order.
   *
   * A single band takes the MIDDLE tone: with nothing to escalate against, an end of the ramp
   * would be a claim about a tier list that has no shape.
   *
   * Counts above five reuse a tone — five stops cannot give six bands six hues — so a six-tier
   * check paints two adjacent bands alike. That is the cost of the five-stop ramp and it is
   * stated here rather than hidden; the tier rows below still name every tier.
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
    // Value order, which is the order the strip DRAWS in — not the authored order, which a GM
    // listing Masterwork first has authored high-to-low. A plain object keyed by the authored
    // index rather than a `Map`: `svelte/prefer-svelte-reactivity` rejects a mutable built-in
    // `Map` inside a component, and nothing here needs reactivity.
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

  // The key to the strip, on the tier ROW: the band's tone at FULL STRENGTH, as a dot. Without
  // it the ramp is a pattern with no legend and no way to tell which row moved which band. The
  // dot shows the undiluted tone rather than the band's 26% fill because it carries no text, so
  // nothing about it is bounded by contrast — and a 12px pale mix would read as no colour.
  const bandSwatchById = $derived(
    Object.fromEntries(bandStripBands.map((band) => [band.id, band.swatch]))
  );

  /**
   * Apply one boundary move. The strip has already resolved WHICH authored field(s) the
   * handle writes and clamped the value against its neighbours; this only has to persist
   * the patch it describes — including the FIXED case's coupled pair, which is written as
   * one `emit` so a half-applied move can never be observed.
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
  <!-- Check type anchors the OUTCOME tiers (offsets from the recipe's DC, or absolute
       value ranges), so it sits with them rather than with the roll. -->
  {#if shows('outcomes')}
    <section class="manager-inspector-card">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.TypeTitle', 'Check type')}
      </h3>
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
    </section>
  {/if}

  {#if shows('roll')}
    <section class="manager-inspector-card">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}
      </h3>
      <CheckFormulaFields
        rollFormula={value?.rollFormula || ''}
        dc={value?.dc ?? 15}
        thresholdMode={value?.thresholdMode || 'meet'}
        showDc={!hideDc}
        placeholder="1d20"
        onChange={emit}
      />
    </section>
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

  {#if showTiers && type === 'relative' && shows('roll')}
    <section class="manager-inspector-card" data-routed-tiers>
      <CheckRecipeTiers
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        onChange={(tiers) => emit({ tiers })}
      />
    </section>
  {/if}

  {#if shows('outcomes')}
    <section class="manager-inspector-card" data-outcome-bands>
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.BandsTitle', 'Outcome bands')}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.BandsLead',
          'Transition points between the tiers below. Anything under the first band or over the last clamps into the end band.'
        )}
      </p>
      <ThresholdBandStrip
        binding={type === 'fixed' ? 'fixed' : 'relative'}
        bands={bandStripBands}
        {previewDc}
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
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.BandsHint',
          'Drag or arrow-key a band edge to move its threshold, or type the numbers below. The numbers are the authority.'
        )}
      </p>
    </section>
  {/if}

  {#if shows('outcomes')}
    <section class="manager-inspector-card">
      <div class="manager-checks-card-head">
        <h3 class="manager-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomesTitle', 'Outcome tiers')}
        </h3>
        <button type="button" class="manager-button" data-add-outcome onclick={addOutcome}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddOutcome', 'Add outcome')}</span>
        </button>
      </div>

      {#if outcomes.length === 0}
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.Crafting.NoOutcomes',
            'No outcome tiers yet. Add the tiers this check routes results into.'
          )}
        </p>
      {:else}
        <div
          class={`manager-checks-outcome-table ${type === 'fixed' ? 'is-fixed' : 'is-relative'} ${checkDriven ? '' : 'is-no-break'}`}
          role="table"
          aria-label={text(
            'FABRICATE.Admin.Manager.Checks.Crafting.OutcomesTitle',
            'Outcome tiers'
          )}
        >
          <div class="manager-checks-outcome-head" role="row">
            <span
              role="columnheader"
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBand', 'Band')}
            ></span>
            <span role="columnheader"
              >{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}</span
            >
            {#if type === 'relative'}
              <span role="columnheader">{dcLabel}</span>
            {:else}
              <span role="columnheader">{startLabel}</span>
              <span role="columnheader">{endLabel}</span>
            {/if}
            <span role="columnheader"
              >{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeColumn', 'Outcome')}</span
            >
            {#if checkDriven}
              <span role="columnheader"
                >{text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak', 'Break tools')}</span
              >
            {/if}
            <span
              role="columnheader"
              aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}
            ></span>
          </div>

          {#each outcomes as outcome, index (outcome.id)}
            <div
              class={`manager-checks-outcome-row ${rowInvalid(index) ? 'is-invalid' : ''}`}
              role="row"
              data-outcome-row={outcome.id}
              data-outcome-id={outcome.id}
            >
              <!-- The KEY to the strip above: this row's band, as a dot in that band's own
                   tone. Not an icon and not a control — it carries the row's own accessible
                   name through the Name field beside it, so it is decorative to a screen
                   reader and the information it adds is the visual pairing sighted GMs need. -->
              <span
                class="manager-checks-outcome-swatch"
                data-outcome-swatch={outcome.id}
                style={`--fab-outcome-swatch: ${bandSwatchById[outcome.id] || 'var(--fab-surface-active)'};`}
                aria-hidden="true"
              ></span>
              <input
                data-outcome-name
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeName', 'Name')}
                value={outcome.name || ''}
                oninput={(event) => updateOutcome(outcome.id, { name: event.currentTarget.value })}
              />

              <!-- `fill` rather than the inline default: these are pinned 102px subgrid
                 tracks beside a 36px name field, and an inline-flex island would leave the
                 numeric columns a different height and width from every sibling on the row.
                 `allowUnset` is deliberately absent — a tier threshold has no "unset"
                 meaning, so 0 is the real value and is shown as 0.
                 Every `data-*` hook goes through `inputProps` so it lands on the real
                 `<input>`: on the wrapper it would resolve to a `<div>` and break both the
                 mounted `.value` reads and Playwright's `fill()` / `inputValue()`. -->
              {#if type === 'relative'}
                <Stepper
                  fill
                  value={outcome.dc ?? 0}
                  {...stepperLabels(dcLabel)}
                  inputProps={{ 'data-outcome-dc': '' }}
                  onChange={(dc) => updateOutcome(outcome.id, { dc })}
                />
              {:else}
                <Stepper
                  fill
                  value={outcome.start ?? 0}
                  {...stepperLabels(startLabel)}
                  inputProps={{ 'data-outcome-start': '' }}
                  onChange={(start) => updateOutcome(outcome.id, { start })}
                />
                <Stepper
                  fill
                  value={outcome.end ?? 0}
                  {...stepperLabels(endLabel)}
                  inputProps={{ 'data-outcome-end': '' }}
                  onChange={(end) => updateOutcome(outcome.id, { end })}
                />
              {/if}

              <button
                type="button"
                class={`manager-checks-state-pill ${outcome.success === true ? 'is-positive' : 'is-negative'}`}
                data-outcome-success
                aria-pressed={outcome.success === true}
                aria-label={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess',
                  'Success'
                )}
                onclick={() => updateOutcome(outcome.id, { success: !(outcome.success === true) })}
              >
                {outcome.success === true ? successOnLabel : successOffLabel}
              </button>

              {#if checkDriven}
                <button
                  type="button"
                  class={`manager-checks-state-pill ${outcome.breakTools === true ? 'is-negative' : 'is-positive'}`}
                  data-outcome-break
                  aria-pressed={outcome.breakTools === true}
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
                    'Break tools'
                  )}
                  onclick={() =>
                    updateOutcome(outcome.id, { breakTools: !(outcome.breakTools === true) })}
                >
                  {outcome.breakTools === true ? breakOnLabel : breakOffLabel}
                </button>
              {/if}

              <button
                type="button"
                class="manager-icon-button is-danger"
                data-remove-outcome
                aria-label={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.RemoveOutcome',
                  'Remove outcome'
                )}
                onclick={() => removeOutcome(outcome.id)}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

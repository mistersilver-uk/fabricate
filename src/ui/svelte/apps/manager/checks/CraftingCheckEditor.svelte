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
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ThresholdBandStrip from '../../../components/ThresholdBandStrip.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import CheckDifficultyCard from './CheckDifficultyCard.svelte';
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
    foundrySystemId = '',
    // The activity's own word for the thing a check is rolled for, for the Difficulty
    // card's `{record}` copy. A default keeps the editor mountable in isolation; hard-coding
    // one activity's noun is how a gathering screen comes to talk about recipes.
    recordNoun = 'recipe',
    // The check modifiers this check APPLIES and the rule that combines them, for the
    // formula card's `WHAT ACTUALLY GETS ROLLED` inset. Resolved by the caller from the
    // activity's whole modifier context, which is the same derivation the Modifiers
    // section counts from — an editor re-deriving it would be a second opinion.
    appliedModifiers = [],
    modifierPolicy = 'addAll',
    onChange = () => {},
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');
  const shows = (id) => !section || section === id;
  // Fixed-type routed-by-check checks match by value range, so the DC and the meet/exceed
  // comparison are meaningless there; the whole Difficulty card is withheld. Any other case
  // (relative type, salvage/gathering) keeps it.
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
  // ── PREVIEW AGAINST (issue 1096) ────────────────────────────────────────────────
  //
  // The record the bands are DRAWN against. It is the bands' own control and lives in
  // their card; the rail's separate "Preview as" chooses an ACTOR and is issue 1097's.
  // Two controls, two subjects, and conflating them is what left this one missing.
  //
  // LOCAL STATE, never persisted: choosing a tier to look at is not an edit to the
  // system, and writing it into the check would make a GM's viewport a saved field every
  // other GM then inherits.
  //
  // RELATIVE ONLY. A `fixed` check's bands are absolute roll values that no recipe DC can
  // move, and `routedByCheck + fixed` hides the DC field entirely — a control offering to
  // re-anchor bands that have no anchor would be a promise the model cannot keep.
  let previewTierId = $state('');
  const recipeTiers = $derived(Array.isArray(value?.tiers) ? value.tiers : []);
  const showPreviewAgainst = $derived(type === 'relative' && recipeTiers.length > 0);
  const previewTier = $derived(recipeTiers.find((tier) => tier.id === previewTierId) || null);
  const previewDc = $derived(
    previewTier ? Number(previewTier.dc ?? 0) || 0 : Number(value?.dc ?? 0) || 0
  );

  const previewAgainstOptions = $derived([
    {
      id: '',
      label: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.PreviewAgainstDefault',
        'Default · DC {dc}'
      ).replace('{dc}', String(Number(value?.dc ?? 0) || 0)),
    },
    ...recipeTiers.map((tier) => ({
      id: tier.id,
      label: `${tier.name || text('FABRICATE.Admin.Manager.Checks.Crafting.UnnamedTier', 'Unnamed tier')} · ${text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')} ${Number(tier.dc ?? 0) || 0}`,
    })),
  ]);

  // The two segments of the per-tier outcome toggle. Hoisted rather than rebuilt per row:
  // the option list is identical for every tier, and a per-row literal would be N copies
  // of one contract for the duplication gate to count.
  const outcomeSegments = $derived([
    { value: 'success', fallback: successOnLabel, variant: 'success' },
    { value: 'failure', fallback: successOffLabel, variant: 'danger' },
  ]);

  // The same shape for the `checkDriven`-only tool-breakage choice. `keep` is the benign
  // option, so it takes the success tint and `break` takes danger.
  const breakToolsSegments = $derived([
    { value: 'keep', fallback: breakOffLabel, variant: 'success' },
    { value: 'break', fallback: breakOnLabel, variant: 'danger' },
  ]);

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
    <section class="manager-inspector-card manager-checks-card" data-check-type-card>
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
    </section>
  {/if}

  {#if shows('roll')}
    <section class="manager-inspector-card manager-checks-card" data-roll-formula-card>
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
    </section>

    <!-- DIFFICULTY, in its own card (issue 1096). No DC-source chooser: `dcMode` and
         `macroUuid` live on the SIMPLE check slot only — the routed slot carries neither,
         and the engine runs a DC macro for `simple.dcMode === 'dynamic'` alone — so a
         static/dynamic pair here would write a field nothing reads. -->
    {#if !hideDc}
      <CheckDifficultyCard
        dc={value?.dc ?? 15}
        thresholdMode={value?.thresholdMode || 'meet'}
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

  {#if showTiers && type === 'relative' && shows('roll')}
    <section class="manager-inspector-card" data-routed-tiers>
      <CheckRecipeTiers
        anchorsBands
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        onChange={(tiers) => emit({ tiers })}
      />
    </section>
  {/if}

  {#if shows('outcomes')}
    <!-- ONE card, as the prototype has it: the strip and the tier rows it draws are the
         same subject, and splitting them into two cards put a card border between a band
         and the row that moves it. -->
    <section class="manager-inspector-card manager-checks-card" data-outcome-bands>
      <div class="manager-checks-card-head is-inline">
        <h3 class="manager-checks-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.BandsTitle', 'Outcome bands')}
        </h3>
        <p class="manager-checks-card-description">
          {text(
            'FABRICATE.Admin.Manager.Checks.Crafting.BandsLead',
            'Transition points between the tiers below. Anything under the first band or over the last clamps into the end band.'
          )}
        </p>
        <!-- The top-right add action stays alongside the full-width dashed one at the
             foot of the list: the head action is where a GM already looks for a card's
             verb, and the dashed one is where the list ends. -->
        <ManagerButton data-add-outcome onclick={addOutcome}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddOutcome', 'Add outcome')}</span>
        </ManagerButton>
      </div>
      <div class="manager-checks-card-body is-roomy">
        {#if showPreviewAgainst}
          <div class="manager-checks-preview-against" data-preview-against>
            <span class="manager-checks-preview-against-label" id="checks-preview-against-label">
              {text('FABRICATE.Admin.Manager.Checks.Crafting.PreviewAgainst', 'Preview against')}
            </span>
            <select
              data-preview-against-select
              aria-labelledby="checks-preview-against-label"
              value={previewTierId}
              onchange={(event) => {
                previewTierId = event.currentTarget.value;
              }}
            >
              {#each previewAgainstOptions as option (option.id)}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
          </div>
        {/if}
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

        {#if outcomes.length === 0}
          <p class="manager-muted">
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.NoOutcomes',
              'No outcome tiers yet. Add the tiers this check routes results into.'
            )}
          </p>
        {:else}
          <!-- A FLEX LIST, not a subgrid table. There are no column headers, because every
             control on the row states its own subject: the stepper carries the threshold
             label as its accessible name, and the segmented toggle names both options. -->
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
                <!-- The KEY to the strip above: this row's band in that band's own tone. Not
                   an icon and not a control — the row's accessible name comes from the Name
                   field beside it, so this is decorative to a screen reader and the
                   information it adds is the visual pairing sighted GMs need. -->
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

                <!-- `fill` plus a WIDTH from the layout context, which is the one thing a
                   layout context may take from this primitive. `allowUnset` is deliberately
                   absent — a tier threshold has no "unset" meaning, so 0 is the real value
                   and is shown as 0. Every `data-*` hook goes through `inputProps` so it
                   lands on the real `<input>`: on the wrapper it would resolve to a `<div>`
                   and break both the mounted `.value` reads and Playwright's `fill()`. -->
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

                <!-- A SEGMENTED TOGGLE, not a pill that swaps its own label. The click-in-place
                   pill showed only the state the tier is IN, so a GM could not tell whether
                   the word was a reading or the verb that would change it. -->
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

                <!-- KEPT, and gated, on purpose. The prototype authors tool breakage on a
                   TRIGGER, and `CheckTriggers` already ships that control here. But the
                   MATCHED TIER's own `breakTools` is read by `checkRoll.js` when a routed
                   check resolves, so under `checkDriven` this is the only authoring surface
                   for a live engine field and deleting it would strand persisted data. Under
                   the default `toolSpecific` authority the row is exactly the prototype's
                   five elements. -->
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

            <ManagerButton role="dashed" data-add-outcome-tier onclick={addOutcome}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.AddOutcomeTier',
                  'Add outcome tier'
                )}</span
              >
            </ManagerButton>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

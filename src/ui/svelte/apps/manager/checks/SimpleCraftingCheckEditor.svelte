<!-- Svelte 5 runes mode -->
<!--
  Simple pass/fail crafting check editor (simple and alchemy resolution modes).

  A simple check rolls a FORMULA and succeeds when the total reaches the DC
  (meet-or-exceed or exceed). The DC value is polymorphic:
    - static:  the DC is the default, with optional named recipe TIERS (each its
               own DC) the recipe editor can pick from.
    - dynamic: a dropped macro is handed the ingredient set, recipe, and actor
               and returns the DC. Both sides persist so switching the DC mode is
               non-destructive.
  The unified CheckTriggers editor lets each trigger force success or failure and
  (under `checkDriven` authority) break tools. The formula row, trigger editor, and
  recipe-tier table are shared with the routed editor.

  `showDcSource` (default true) renders the DC-SOURCE half of this check: the
  static/dynamic chooser inside the Difficulty card, plus the recipe-tier table or the
  dynamic-DC macro card below it. Salvage and gathering reuse this editor with
  `showDcSource={false}`: they have no records to pick a tier from and no dynamic-DC
  macro, so they author the base DC and the comparison alone and take a per-entity DC
  override elsewhere.

  Controlled component: renders `value` and emits the next value via `onChange`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconFactRow from '../IconFactRow.svelte';
  import CheckDcMacroCard from './CheckDcMacroCard.svelte';
  import CheckDifficultyCard from './CheckDifficultyCard.svelte';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckTriggers from './CheckTriggers.svelte';

  // `breakageAuthority` (issue 419): the unified CheckTriggers editor is always
  // rendered; under `checkDriven` it also exposes the per-trigger break-tools toggle.
  // `section` (issue 1096) selects which of this editor's cards render, so the Checks
  // Studio's five-section strip hosts the SAME editor rather than a per-section fork.
  // Empty renders every card.
  let {
    value = null,
    showDcSource = true,
    breakageAuthority = 'toolSpecific',
    section = '',
    foundrySystemId = '',
    // The activity's own word for the thing a check is rolled for; see CheckDifficultyCard.
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

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const dcMode = $derived(value?.dcMode === 'dynamic' ? 'dynamic' : 'static');

  function emit(patch) {
    onChange({ ...value, ...patch });
  }
</script>

<div class="manager-checks-editor" data-simple-check-editor>
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
          {foundrySystemId}
          onChange={emit}
        />
      </div>
    </section>

    <!-- DIFFICULTY, in its own card (issue 1096): the DC, the meet/exceed comparison and —
         on this slot alone — where the number comes from. The simple check is the one that
         carries `dcMode`/`macroUuid`, so it is the one that shows the chooser. -->
    <CheckDifficultyCard
      dc={value?.dc ?? 15}
      thresholdMode={value?.thresholdMode || 'meet'}
      dcMode={value?.dcMode || 'static'}
      {showDcSource}
      {recordNoun}
      onChange={emit}
    />
  {/if}

  <!-- A simple check's OUTCOME model: exactly two, and neither is authored. It is a
       statement rather than an editor, which is why it renders through the shared icon
       fact row instead of a bespoke pair of cards — and why the section carries no count
       badge. It renders in every mode precisely because it is the mode's outcome model;
       hiding it would leave the section blank on the one mode that has nothing else. -->
  {#if shows('outcomes')}
    <section class="manager-inspector-card manager-checks-card" data-simple-outcomes>
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
    </section>
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
    <!-- THE TIER LIST RENDERS UNDER BOTH MODES (issue 1096). The macro is handed the tier's
         DC as its anchor and returns the final number, so the two COMPOSE rather than
         compete; hiding the tiers under dynamic would hide half of what the engine reads. -->
    <section class="manager-inspector-card manager-checks-card" data-static-dc>
      <CheckRecipeTiers
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        onChange={(tiers) => emit({ tiers })}
      />
    </section>
    {#if dcMode === 'dynamic'}
      <CheckDcMacroCard macroUuid={value?.macroUuid ?? null} onChange={emit} />
    {/if}
  {/if}
</div>

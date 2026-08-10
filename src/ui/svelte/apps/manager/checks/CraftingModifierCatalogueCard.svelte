<!-- Svelte 5 runes mode -->
<!--
  Crafting check-modifier catalogue editor (issue 770).

  A crafting system may define a named catalogue of check modifiers — e.g. Medicine,
  Alchemy, Herbalism for a DC20 healing salve — each an authored roll-data expression
  (`@abilities.med.mod`).

  The SYSTEM owns every decision this card authors (issue 1055). There is no authority
  axis and no per-recipe override of the rule: a recipe may be handed the SELECTION, and
  only when the rule itself says so.

  The card authors three things:

    1. The COMBINATION RULE (`defaultModifierPolicy`) — who selects the eligible
       modifiers, and how they reduce to the one number appended to the check roll:
         - Add all:      sum the system's default set. Nobody selects.
         - Highest:      the single largest of it (a deterministic max, not a pool).
         - Recipe picks: the RECIPE author selects, at recipe-edit time; the picks sum.
         - Player picks: the PLAYER selects, at roll time; the picks sum.
       `MODIFIER_POLICIES` in the resolver is the source of that list and its order;
       `policyDefersSelection` is the source of which two defer the selection.
    2. The PICK CAP (`maxModifierPicks`) — how many modifiers the deferred-to party may
       pick. It bounds the two selecting rules only, and ABSENT means unlimited, which is
       why the control's empty state is a real value rather than a blank to be defaulted.
    3. The DEFAULT ELIGIBLE SET (`defaultModifierIds`) — which catalogue entries apply.
       Under the two non-selecting rules that IS the set; under `byRecipe` it is what a
       recipe inherits until it picks its own; under `playerPicks` it is the menu the
       player chooses from.

  Sibling of the failure-consumption card, rendered for every crafting sub-tab —
  INCLUDING the ones where the catalogue cannot reach a roll, because a catalogue that
  silently does nothing is the defect this card must report rather than hide. `inertCause`
  names which of the two reasons applies (there were three until issue 1094 retired the
  roll-formula placeholder and, with it, the "you forgot to reference it" cause).

  Controlled component: it renders the passed props and emits a partial patch via
  `onChange` — the store spreads the patch onto the existing `craftingCheck` (preserving
  sibling check fields) and the whole arrays are replaced on write (removing an entry
  persists without a `-=`).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import {
    normalizeModifierPolicy,
    policyDefersSelection,
    resolveMaxModifierPicks,
  } from '../../../../../systems/craftingModifierResolver.js';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  const DEFAULTS_LABEL_ID = 'manager-crafting-modifier-defaults-label';
  // The cap hint is the ONLY place "empty means unlimited" is stated, and the Stepper's
  // blank field cannot state it, so the input takes the hint as its description rather
  // than leaving a screen-reader user with an unexplained empty number field.
  const MAX_PICKS_HINT_ID = 'manager-crafting-modifier-max-picks-hint';

  let {
    checkModifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    // The cap on how many modifiers a SELECTING rule may pick (issue 1055). ABSENT is a
    // real value — "unlimited" — so this prop is deliberately `null` by default and no
    // call site may coerce it to a number: `resolveMaxModifierPicks` decides what absence
    // means, and it must decide the same thing here as it does in the engine.
    maxModifierPicks = null,
    // Why the catalogue reaches no roll, or '' when it does: 'noCheck' (this resolution
    // mode rolls no crafting check at all) or 'noFormula' (a check slot exists but has no
    // authored roll formula). One boolean cannot carry this, and the two need different
    // remedies, so the cause is passed rather than derived from a flag.
    inertCause = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Icon vocabulary for the four combination rules: Add all stacks the whole eligible
  // set, Highest sorts and takes the top one, Recipe picks hands the selection to the
  // recipe author (a scroll — the document being authored), and Player picks hands it to
  // the player at roll time (the manager's "manual choice" glyph). Both glyphs are Font
  // Awesome FREE (`fontAwesomeFreeClassicIcons.js`, generated from FA Free 6.7.2):
  // Foundry bundles FA Pro, so a Pro glyph would render, but a community package is not
  // licensed to use one.
  //
  // The ORDER mirrors `MODIFIER_POLICIES`, which declares itself to be in
  // authoring-surface order; the two selecting rules therefore sit adjacent, which is
  // what the 2x2 grid below reads as a pair.
  const POLICY_OPTIONS = [
    {
      value: 'addAll',
      icon: 'fas fa-layer-group',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll',
      fallback: 'Add all',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAllDesc',
      descFallback: 'Sum every eligible modifier into the crafting-check roll.',
    },
    {
      value: 'highest',
      icon: 'fas fa-arrow-up-wide-short',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest',
      fallback: 'Highest',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighestDesc',
      descFallback: 'Use only the single largest eligible modifier (a deterministic maximum).',
    },
    {
      value: 'byRecipe',
      icon: 'fas fa-scroll',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipe',
      fallback: 'Recipe picks',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipeDesc',
      descFallback:
        'Each recipe picks which modifiers apply, on its Overview tab; the picks are summed. Recipes that pick nothing use the default set below.',
    },
    {
      value: 'playerPicks',
      icon: 'fas fa-hand-pointer',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicks',
      fallback: 'Player picks',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicksDesc',
      descFallback:
        'The player picks from the default set at roll time on an interactive craft; the picks are summed and added to the roll. Other crafts pick the best legal selection.',
    },
  ];

  // The cap means a different thing under each selecting rule — a bound on the RECIPE
  // AUTHOR at edit time, or a bound on the PLAYER at roll time — so the hint is keyed by
  // the rule rather than written once and left ambiguous. Only the two rules
  // `policyDefersSelection` admits can appear here, which is why there is no third entry.
  const MAX_PICKS_COPY = {
    byRecipe: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksByRecipe',
      fallback:
        'The most modifiers a recipe author may pick for one recipe. Leave it empty for no limit. Lowering it below what a recipe already picked keeps the recipe intact but rolls only the first modifiers it picked, up to this many.',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksPlayerPicks',
      fallback:
        'The most modifiers a player may pick at roll time. Leave it empty for no limit. A limit of 1 is the single-pick behaviour: the player chooses one modifier from the default set.',
    },
  };

  // What the default set IS depends on the rule, and the three readings are materially
  // different decisions: under `addAll`/`highest` it is the whole eligible set and no one
  // narrows it; under `byRecipe` it is the fallback a recipe inherits until it picks its
  // own; under `playerPicks` it is the menu the player chooses from at roll time. One
  // sentence covering all three would have to say nothing specific about any of them.
  const DEFAULTS_INTRO_COPY = {
    byRecipe: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntro',
      fallback:
        'Which modifiers apply when a recipe does not pick its own. A recipe can pick its own set on its Overview tab.',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroPlayerPicks',
      fallback:
        'Which modifiers the player chooses from at roll time. Every recipe in this system offers this set.',
    },
  };

  const DEFAULTS_INTRO_LOCKED = {
    key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroLocked',
    fallback: 'Which modifiers apply. Every recipe in this system uses this set.',
  };

  // Why the catalogue reaches no roll. Each cause has its own remedy, so each has its
  // own sentence — "the modifiers do nothing" with no reason is not actionable. Both
  // sentences name the REAL remaining cause and, per issue 1094, neither names a
  // placeholder: modifiers are added to the check roll automatically, so a GM told to
  // reference one would be told to do something that does nothing.
  const INERT_COPY = {
    noCheck: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoCheck',
      fallback:
        'This resolution mode rolls no crafting check, so nothing here is applied. Change the resolution mode on System settings to one that rolls a check, or use the alchemy tiered or simple check mode.',
    },
    noFormula: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoFormula',
      fallback:
        'The crafting check for this resolution mode has no roll formula yet, so nothing here is rolled. Author one above and these modifiers are added to it automatically.',
    },
  };

  const modifiers = $derived(Array.isArray(checkModifiers) ? checkModifiers : []);
  // Normalized through the resolver's OWN rule vocabulary rather than a local copy of
  // it. The literal `['addAll','highest','byRecipe','playerPicks']` that stood here was
  // a hand-maintained mirror of `VALID_POLICIES` — a mirror that has to be edited in
  // lockstep is exactly the drift issue 855 was.
  const selectedPolicy = $derived(normalizeModifierPolicy(defaultModifierPolicy) ?? 'addAll');
  // Whether the selected rule defers the selection to someone else, and therefore whether
  // the cap means anything at all. Asked of the resolver rather than re-derived from a
  // local `['byRecipe','playerPicks']` membership test, for the same reason as above.
  const defersSelection = $derived(policyDefersSelection(selectedPolicy));
  const maxPicksCopy = $derived(MAX_PICKS_COPY[selectedPolicy] || null);
  // Routed through the resolver so the field shows the bound the ENGINE would apply: a
  // stored `0`, `-2` or `"three"` all read as unlimited there, and a field that rendered
  // them verbatim would report a cap that truncates nothing. `Infinity` → `null` is the
  // Stepper's unset value, which is what makes "unlimited" a blank field rather than a
  // magic number the GM has to know.
  const maxPicksLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks }));
  const maxPicksValue = $derived(Number.isFinite(maxPicksLimit) ? maxPicksLimit : null);
  const maxPicksLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicks', 'Maximum picks')
  );
  const defaultsIntro = $derived(DEFAULTS_INTRO_COPY[selectedPolicy] || DEFAULTS_INTRO_LOCKED);
  // Gated on the catalogue being NON-EMPTY as well as on the cause. The notice reports a
  // CATALOGUE that reaches no roll, and an empty catalogue is not one: a fresh crafting
  // system is `simple` + `rollFormula: ''`, so an ungated notice put a permanent warning
  // callout ("These modifiers reach no roll… Author one above") directly above the
  // empty-catalogue empty state, warning about nothing on first contact with the tab.
  // `RecipeOverviewTab` already gates its equivalent banner on `hasModifierCatalogue`;
  // this is the same rule, on the surface that owns the catalogue.
  const inert = $derived(modifiers.length > 0 ? INERT_COPY[inertCause] || null : null);
  const defaultIds = $derived(Array.isArray(defaultModifierIds) ? defaultModifierIds : []);

  function newId() {
    return globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto.randomUUID();
  }

  function emitModifiers(next) {
    onChange({ checkModifiers: next });
  }

  function addModifier() {
    emitModifiers([
      ...modifiers,
      { id: newId(), label: '', icon: DEFAULT_MODIFIER_ICON, expression: '' },
    ]);
  }

  // A bare roll-data path with no leading `@`, e.g. `abilities.med.mod`. ONLY these
  // get the sigil re-added on write; anything else is stored verbatim.
  function updateModifier(id, patch) {
    emitModifiers(
      modifiers.map((modifier) => (modifier.id === id ? { ...modifier, ...patch } : modifier))
    );
  }

  function removeModifier(id) {
    // Dropping the entry from the catalogue also drops it from the default set so a
    // dangling default id never lingers (the normalizer would drop it anyway).
    emitModifiers(modifiers.filter((modifier) => modifier.id !== id));
    if (defaultIds.includes(id)) {
      onChange({ defaultModifierIds: defaultIds.filter((defaultId) => defaultId !== id) });
    }
  }

  function selectPolicy(policy) {
    onChange({ defaultModifierPolicy: policy });
  }

  // `Stepper` reports a clamped number, or `null` when an `allowUnset` field is cleared.
  // `null` is persisted VERBATIM rather than being dropped from the patch: absence is the
  // "unlimited" value, so clearing the field has to be able to REMOVE an existing cap,
  // and a patch that omitted the key would leave the old bound in place.
  function selectMaxPicks(next) {
    onChange({ maxModifierPicks: next });
  }

  function toggleDefault(id, checked) {
    const next = checked
      ? [...new Set([...defaultIds, id])]
      : defaultIds.filter((defaultId) => defaultId !== id);
    onChange({ defaultModifierIds: next });
  }
</script>

<section class="manager-inspector-card" data-crafting-modifier-catalogue>
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueHeading', 'Check modifiers')}
  </h3>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueIntro',
      'Named character modifiers added to the crafting-check roll automatically, as one + N[Modifiers] term. Each expression resolves against the crafter (e.g. @abilities.med.mod).'
    )}
  </p>

  {#if inert}
    <p class="manager-modifier-inert" role="note" data-crafting-modifier-inert={inertCause}>
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertHeading',
            'These modifiers reach no roll'
          )}</strong
        >
        {text(inert.key, inert.fallback)}
      </span>
    </p>
  {/if}

  <div class="manager-modifier-catalogue" data-crafting-modifier-rows>
    {#if modifiers.length === 0}
      <p class="manager-muted" data-crafting-modifier-empty>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueEmpty',
          'No check modifiers yet. Add one to make it available to the checks in this system.'
        )}
      </p>
    {/if}
    {#each modifiers as modifier (modifier.id)}
      <div class="manager-character-modifier-row" data-crafting-modifier-row={modifier.id}>
        <div class="manager-modifier-name-row">
          <div
            class="manager-field manager-modifier-icon-field"
            data-crafting-modifier-field="icon"
          >
            <span class="manager-recipe-micro-label"
              >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierIcon', 'Icon')}</span
            >
            <IconPicker
              value={modifier.icon || DEFAULT_MODIFIER_ICON}
              buttonTitle={text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierChangeIcon',
                'Change icon'
              )}
              onChange={(iconClass) => updateModifier(modifier.id, { icon: iconClass })}
            />
          </div>
          <label class="manager-field manager-modifier-label-field">
            <span class="manager-recipe-micro-label"
              >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabel', 'Label')}</span
            >
            <input
              type="text"
              data-crafting-modifier-field="label"
              value={modifier.label || ''}
              placeholder={text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabelPlaceholder',
                'Medicine'
              )}
              oninput={(event) => updateModifier(modifier.id, { label: event.currentTarget.value })}
            />
          </label>
        </div>
        <div class="manager-modifier-expression-row">
          <label class="manager-field manager-modifier-field-expression">
            <span class="manager-recipe-micro-label"
              >{text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierExpression',
                'Expression'
              )}</span
            >
            <RollDataExpressionInput
              dataField="crafting-modifier"
              inputAttrs={{ 'data-crafting-modifier-field': 'expression' }}
              value={modifier.expression}
              placeholder="abilities.med.mod"
              onChange={(expression) => updateModifier(modifier.id, { expression })}
            />
          </label>
          <button
            type="button"
            class="manager-icon-button is-danger manager-modifier-remove"
            data-crafting-modifier-remove={modifier.id}
            title={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove',
              'Remove modifier'
            )}
            aria-label={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove',
              'Remove modifier'
            )}
            onclick={() => removeModifier(modifier.id)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    {/each}
    <button type="button" class="manager-button" data-crafting-modifier-add onclick={addModifier}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierAdd', 'Add modifier')}
    </button>
  </div>

  <h4 class="manager-modifier-subheading">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading', 'Combination rule')}
  </h4>
  <!-- TWO columns, so the group is a 2x2. This is explicit maintainer feedback on the
       three-up layout that stood here: at this much copy per card — a name plus a
       two-clause sentence naming who selects, when, and how the picks reduce — three
       columns packs too much text into each card, so the layout drops to two.
       `--manager-radio-card-columns` is a FIXED track count
       (`repeat(var(…), minmax(0, 1fr))`), never `auto-fit`, so the count is the layout:
       four options at 2 columns is a clean 2x2 with no orphan row, and it puts the two
       non-selecting rules on the top row and the two selecting rules on the bottom one,
       which is the distinction the pick cap below applies to. -->
  <RadioCardGroup
    legendKey="FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading"
    legend="Combination rule"
    options={POLICY_OPTIONS}
    selectedValue={selectedPolicy}
    groupName="crafting-modifier-policy"
    columns={2}
    dataAttr="data-crafting-modifier-policy"
    optionDataAttr="data-crafting-modifier-policy-option"
    onChange={selectPolicy}
  />

  {#if defersSelection && maxPicksCopy}
    <!-- Shown under the two SELECTING rules only, because a cap on a selection nobody
         makes is a control with no effect. Membership comes from the resolver
         (`policyDefersSelection`), not from a local list, so this surface cannot drift
         from the reduction it is bounding. -->
    <h4 class="manager-modifier-subheading">{maxPicksLabel}</h4>
    <p class="manager-muted" id={MAX_PICKS_HINT_ID}>
      {text(maxPicksCopy.key, maxPicksCopy.fallback)}
    </p>
    <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. It carries no
         caption span either — the `<h4>` above IS this field's visible label, exactly as
         the Default modifiers block below is labelled by its own heading, and a second
         "Maximum picks" directly under the first would be the same words twice. The
         Stepper's `ariaLabel` repeats that heading verbatim, so the accessible name still
         starts with the visible one (WCAG 2.5.3). -->
    <div
      class="manager-field manager-modifier-max-picks-field"
      data-crafting-modifier-max-picks={maxPicksValue === null
        ? 'unlimited'
        : String(maxPicksValue)}
    >
      <Stepper
        value={maxPicksValue}
        allowUnset
        min={1}
        fill
        placeholder={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksUnlimited',
          'Unlimited'
        )}
        {...stepperLabels(maxPicksLabel)}
        inputProps={{
          'data-crafting-modifier-max-picks-input': '',
          'aria-describedby': MAX_PICKS_HINT_ID,
        }}
        onChange={selectMaxPicks}
      />
    </div>
  {/if}

  {#if modifiers.length > 0}
    <h4 class="manager-modifier-subheading" id={DEFAULTS_LABEL_ID}>
      {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsHeading', 'Default modifiers')}
    </h4>
    <p class="manager-muted">
      {text(defaultsIntro.key, defaultsIntro.fallback)}
    </p>
    <div class="manager-modifier-defaults" data-crafting-modifier-defaults>
      <ModifierPillSelect
        options={modifiers}
        selectedIds={defaultIds}
        testId="crafting-modifier-defaults"
        labelledBy={DEFAULTS_LABEL_ID}
        menuLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsAdd',
          'Add default modifier'
        )}
        allSelectedLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsAllSelected',
          'All modifiers are on by default.'
        )}
        noneSelectedLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsNone',
          'No modifiers on by default.'
        )}
        onToggle={toggleDefault}
      />
    </div>
  {/if}
</section>

<style>
  .manager-modifier-catalogue {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-block: 0.5rem 1rem;
  }

  /* The row container, the icon/label name-row, and the `@` expression field all reuse
     the global manager-character-modifier-row / manager-modifier-name-row /
     manager-prerequisite-path-input classes (styles/fabricate.css) so the Checks-tab
     catalogue reads as the same design language as the System-tab modifier list. Only
     the expression + delete line needs a local rule. */
  .manager-modifier-expression-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .manager-modifier-field-expression {
    flex: 1 1 auto;
  }

  .manager-modifier-remove {
    flex: 0 0 auto;
  }

  .manager-modifier-subheading {
    margin-block: 1rem 0.35rem;
  }

  .manager-modifier-defaults {
    margin-top: 0.35rem;
  }

  /* The inert notice sits at the TOP of the card, above the catalogue it invalidates,
     and is warning-toned rather than muted: everything below it is authoring that
     currently reaches no roll, which is not a footnote. Mirrors
     `.manager-resolution-mode-note`'s icon-beside-text shape (RadioCardGroup) so the
     two read as the same kind of statement. */
  .manager-modifier-inert {
    display: flex;
    gap: var(--fab-space-2);
    margin-block: 0.5rem 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .manager-modifier-inert strong {
    /* The heading and its sentence share one line box so the note stays a paragraph,
       not a two-block callout competing with the card title above it. */
    margin-right: 0.25rem;
  }

  /* The cap is a one-to-three-digit field, and the card is a full-width inspector panel,
     so `fill` alone would stretch a stepper across ~700px for two characters. `Stepper`'s
     header names this exact case: where the slot has no intrinsic width, cap it in the
     LAYOUT context rather than dropping `fill` (an unfilled `.fab-stepper` is still a
     flex item and `align-items: stretch` widens it to the same box anyway). 160px is the
     width the other four such call sites use. */
  .manager-modifier-max-picks-field {
    max-width: 160px;
    margin-top: 0.35rem;
  }
</style>

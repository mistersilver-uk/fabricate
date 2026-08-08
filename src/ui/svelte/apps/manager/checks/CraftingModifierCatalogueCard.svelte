<!-- Svelte 5 runes mode -->
<!--
  Crafting check-modifier catalogue editor (issue 770).

  A crafting system may define a named catalogue of check modifiers — e.g. Medicine,
  Alchemy, Herbalism for a DC20 healing salve — each an authored roll-data expression
  (`@abilities.med.mod`).

  The card authors TWO independent axes (issue 1055), which the pre-1055 single "policy"
  select conflated:

    1. The COMBINATION RULE — how the eligible modifiers reduce to the one number that
       replaces `@craftingmod`:
         - Add all:      sum every eligible modifier.
         - Highest:      the single largest modifier (a deterministic max, not a pool).
         - Player picks: the player selects exactly one at roll time. The only
           non-deterministic rule and the only one needing an interactive craft; every
           other path resolves it as Highest.
       The retired fourth value `byRecipe` was never a rule at all — it named WHO
       decides — so it moved onto the authority axis and is now a legacy value the
       resolver translates.
    2. The AUTHORITY LEVEL — how much of the above a recipe may decide for itself:
         - none:       nothing; every recipe inherits both.
         - setOnly:    the eligible set.
         - setAndRule: the eligible set and the combination rule.
       ABSENT (the key omitted) means "not yet stamped" and resolves as `setAndRule`,
       the pre-1055 behaviour — `resolveRecipeModifierAuthority` owns that, so this card
       shows the level the engine would actually apply rather than inventing a default.

  A default eligible set names which catalogue entries apply when a recipe does not
  override them.

  Sibling of the failure-consumption card, rendered for every crafting sub-tab —
  INCLUDING the ones where the catalogue cannot reach a roll, because a catalogue that
  silently does nothing is the defect this card must report rather than hide. `inertCause`
  names which of the three reasons applies.

  Controlled component: it renders the passed props and emits a partial patch via
  `onChange` — the store spreads the patch onto the existing `craftingCheck` (preserving
  sibling check fields) and the whole arrays are replaced on write (removing an entry
  persists without a `-=`).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import {
    normalizeModifierPolicy,
    resolveRecipeModifierAuthority,
  } from '../../../../../systems/craftingModifierResolver.js';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  const DEFAULTS_LABEL_ID = 'manager-crafting-modifier-defaults-label';

  let {
    checkModifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    // The system's authority level (issue 1055). ABSENT is a real state — "not yet
    // stamped" — so this prop is deliberately `undefined` by default and the call site
    // must NOT coerce it: `resolveRecipeModifierAuthority` decides what absence means,
    // and it must decide the same thing here as it does in the engine.
    recipeModifierAuthority = undefined,
    // How many recipes in this system carry a `craftingModifier` override. Lowering the
    // authority level leaves them on disk and stops honouring them, so the card states
    // the count beside the control rather than after the fact.
    affectedRecipeCount = 0,
    // How many recipes carry an override WITH a rule (policy). At `setOnly` level, only
    // these recipes are affected by a downgrade (the rest keep their set overrides); at
    // `none` all overrides are affected.
    affectedRecipeRuleCount = 0,
    // Why the catalogue reaches no roll, or '' when it does: 'noCheck' (this resolution
    // mode rolls no crafting check at all), 'noFormula' (a check slot exists but has no
    // authored roll formula) or 'noPlaceholder' (a formula is authored but never spends
    // `@craftingmod`). One boolean cannot carry this, and the three need different
    // remedies, so the cause is passed rather than derived from a flag.
    inertCause = '',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // `localize`'s interpolating form, with the same fallback contract as `text` — the
  // fallback carries the same `{name}` placeholders so an unlocalized build reads
  // identically to a localized one rather than printing a raw brace.
  function count(key, fallback, data) {
    const translated = localize(key, data);
    if (translated && translated !== key) return translated;
    return fallback.replace(/\{(\w+)\}/g, (_match, name) => String(data?.[name] ?? ''));
  }

  // Icon vocabulary for the three combination rules: Add all stacks the whole eligible
  // set, Highest sorts and takes the top one, Player picks hands the choice to the
  // player at roll time (the manager's "manual choice" glyph).
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
      value: 'playerPicks',
      icon: 'fas fa-hand-pointer',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicks',
      fallback: 'Player picks',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicksDesc',
      descFallback:
        'On an interactive craft whose formula uses @craftingmod, the player picks one eligible modifier at roll time (highest pre-selected); other crafts use the highest.',
    },
  ];

  // Delegation icons: a padlock keeps every decision at the system, and the two scroll
  // glyphs hand progressively more of it to the recipe. `fas fa-scroll` was freed by
  // retiring the `byRecipe` RULE, which is the same idea this axis now carries properly.
  const AUTHORITY_OPTIONS = [
    {
      value: 'none',
      icon: 'fas fa-lock',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityNone',
      fallback: 'Set by the system',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityNoneDesc',
      descFallback:
        'Every recipe uses the default set and the combination rule above. Recipes get no check-modifier control.',
    },
    {
      value: 'setOnly',
      icon: 'fas fa-scroll',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthoritySetOnly',
      fallback: 'Recipes choose the set',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthoritySetOnlyDesc',
      descFallback:
        'Each recipe may choose which catalogue modifiers are eligible. The combination rule stays system-wide.',
    },
    {
      value: 'setAndRule',
      icon: 'fas fa-scroll-old',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthoritySetAndRule',
      fallback: 'Recipes choose set and rule',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthoritySetAndRuleDesc',
      descFallback:
        'Each recipe may choose its eligible modifiers and override the combination rule.',
    },
  ];

  // The consequence clause per level, so the affected-recipe count reads as a decision
  // input rather than a bare number. Keyed by the EFFECTIVE level, which is why absence
  // resolves before this lookup.
  const AUTHORITY_IMPACT = {
    none: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityImpactNone',
      fallback: 'At this level they stay on the recipe but are not applied.',
    },
    setOnly: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityImpactSetOnly',
      fallback:
        'At this level their eligible sets apply; any combination-rule override stays on the recipe but is not applied.',
    },
    setAndRule: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityImpactSetAndRule',
      fallback: 'Lowering the level keeps them on the recipe but stops applying them.',
    },
  };

  // Why the catalogue reaches no roll. Each cause has its own remedy, so each has its
  // own sentence — "the modifiers do nothing" with no reason is not actionable.
  const INERT_COPY = {
    noCheck: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoCheck',
      fallback:
        'This system resolves without a crafting check, so nothing here is rolled. Check modifiers only apply through @craftingmod in a crafting-check formula.',
    },
    noFormula: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoFormula',
      fallback:
        'The crafting check for this resolution mode has no roll formula yet, so nothing here is rolled. Author one above and reference @craftingmod in it.',
    },
    noPlaceholder: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoPlaceholder',
      fallback:
        'The crafting check’s roll formula never references @craftingmod, so every modifier below contributes nothing. Add @craftingmod to the formula to apply them.',
    },
  };

  const modifiers = $derived(Array.isArray(checkModifiers) ? checkModifiers : []);
  // Normalized through the resolver's OWN rule vocabulary rather than a local copy of
  // it. The literal `['addAll','highest','byRecipe','playerPicks']` that stood here was
  // a hand-maintained mirror of `VALID_POLICIES`, and this change narrows that set — a
  // mirror that has to be edited in lockstep is exactly the drift issue 855 was.
  const selectedPolicy = $derived(normalizeModifierPolicy(defaultModifierPolicy) ?? 'addAll');
  // The level the ENGINE would apply, so an unstamped system shows `setAndRule` (what it
  // actually does) instead of a blank group or an invented `none`.
  const selectedAuthority = $derived(resolveRecipeModifierAuthority({ recipeModifierAuthority }));
  // Select the appropriate count based on the authority level. The disclosure informs
  // about recipes whose overrides are inactive at this level:
  // - at `none`: all overrides are inactive → show total count
  // - at `setOnly`: only rule overrides are inactive → show rule count
  // - at `setAndRule`: no overrides are inactive → show 0 (no disclosure)
  const relevantAffectedCount = $derived(
    selectedAuthority === 'setAndRule'
      ? 0
      : selectedAuthority === 'setOnly'
        ? affectedRecipeRuleCount
        : affectedRecipeCount
  );
  const overrideCount = $derived(
    Number.isFinite(relevantAffectedCount) ? Math.max(0, Math.trunc(relevantAffectedCount)) : 0
  );
  const inert = $derived(INERT_COPY[inertCause] || null);
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

  function selectAuthority(authority) {
    onChange({ recipeModifierAuthority: authority });
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
      'Named character modifiers a recipe can draw on through the @craftingmod placeholder in the roll formula. Each expression resolves against the crafter (e.g. @abilities.med.mod).'
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
          'No check modifiers yet. Add one to let recipes reference @craftingmod.'
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

  <h4 class="manager-modifier-subheading">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityHeading', 'Authority level')}
  </h4>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityIntro',
      'How much of the above each recipe may decide for itself. Which modifiers compete is often recipe-specific even when the rule is not.'
    )}
  </p>
  <RadioCardGroup
    legendKey="FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityHeading"
    legend="Authority level"
    options={AUTHORITY_OPTIONS}
    selectedValue={selectedAuthority}
    groupName="crafting-modifier-authority"
    columns={2}
    dataAttr="data-crafting-modifier-authority"
    optionDataAttr="data-crafting-modifier-authority-option"
    onChange={selectAuthority}
  />

  {#if overrideCount > 0}
    <!-- The downgrade disclosure. Deliberately inline card copy rather than a
         `confirmDialog`: nothing is deleted and the level is reversible, so a modal
         would spend the GM's one interruption budget on a change they can undo by
         clicking the card above. It states the count BEFORE the click, and restates
         what the currently-selected level is already doing to those recipes. -->
    <p
      class="manager-muted manager-modifier-authority-impact"
      data-crafting-modifier-authority-impact={overrideCount}
    >
      {overrideCount === 1
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityAffectedOne',
            '1 recipe in this system carries a check-modifier override.'
          )
        : count(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierAuthorityAffected',
            '{count} recipes in this system carry check-modifier overrides.',
            { count: overrideCount }
          )}
      {text(AUTHORITY_IMPACT[selectedAuthority].key, AUTHORITY_IMPACT[selectedAuthority].fallback)}
    </p>
  {/if}

  {#if modifiers.length > 0}
    <h4 class="manager-modifier-subheading" id={DEFAULTS_LABEL_ID}>
      {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsHeading', 'Default modifiers')}
    </h4>
    <p class="manager-muted">
      {selectedAuthority === 'none'
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroLocked',
            'Which modifiers apply. Every recipe in this system uses this set.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntro',
            'Which modifiers apply when a recipe does not choose its own. A recipe can narrow this set on its Overview tab.'
          )}
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

  /* Attached to the authority group above it, not floated as a separate remark: the
     count is an input to the choice, so it must not read as unrelated card copy. */
  .manager-modifier-authority-impact {
    margin-top: 0.35rem;
  }
</style>

<!-- Svelte 5 runes mode -->
<!--
  Crafting check-modifier catalogue editor (issue 770).

  A crafting system may define a named catalogue of check modifiers — e.g. Medicine,
  Alchemy, Herbalism for a DC20 healing salve — each an authored roll-data expression
  (`@abilities.med.mod`). A resolution policy decides how the eligible modifiers combine
  into the `@craftingmod` formula placeholder:
    - Add all:   sum every eligible modifier.
    - Pick highest: use the single largest modifier (a deterministic max, not a dice pool).
    - By recipe: each recipe supplies its own modifier set (summed).
    - Player picks: the player selects exactly one at roll time (Phase 2). The only
      non-deterministic policy, and the only one that needs an interactive craft — every
      other path resolves it as Pick highest.
  A default eligible set names which catalogue entries apply when a recipe does not
  override them.

  Sibling of the failure-consumption card; only rendered when the system's crafting
  check is usable (has an authored roll formula). Controlled component: it renders the
  passed props and emits a partial patch via `onChange` — the store spreads the patch
  onto the existing `craftingCheck` (preserving sibling check fields) and the whole
  arrays are replaced on write (removing an entry persists without a `-=`).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ModifierPillSelect from '../../../components/ModifierPillSelect.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';

  let {
    checkModifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const POLICY_OPTIONS = [
    {
      value: 'addAll',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll',
      fallback: 'Add all',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAllDesc',
      descFallback: 'Sum every eligible modifier into the crafting-check roll.',
    },
    {
      value: 'highest',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest',
      fallback: 'Pick highest',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighestDesc',
      descFallback: 'Use only the single largest eligible modifier (a deterministic maximum).',
    },
    {
      value: 'byRecipe',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipe',
      fallback: 'By recipe',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipeDesc',
      descFallback: 'Each recipe chooses its own modifier set; the chosen set is summed.',
    },
    {
      value: 'playerPicks',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicks',
      fallback: 'Player picks',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicksDesc',
      descFallback:
        'On an interactive craft whose formula uses @craftingmod, the player picks one eligible modifier at roll time (highest pre-selected); other crafts use the highest.',
    },
  ];

  const modifiers = $derived(Array.isArray(checkModifiers) ? checkModifiers : []);
  const selectedPolicy = $derived(
    ['addAll', 'highest', 'byRecipe', 'playerPicks'].includes(defaultModifierPolicy)
      ? defaultModifierPolicy
      : 'addAll'
  );
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
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading', 'Default combination')}
  </h4>
  <div
    class="manager-checks-type-options"
    role="radiogroup"
    data-crafting-modifier-policy
    aria-label={text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading',
      'Default combination'
    )}
  >
    {#each POLICY_OPTIONS as option (option.value)}
      <label
        class={`manager-resolution-option ${selectedPolicy === option.value ? 'is-active' : ''}`}
        data-crafting-modifier-policy-option={option.value}
      >
        <input
          type="radio"
          name="crafting-modifier-policy"
          value={option.value}
          checked={selectedPolicy === option.value}
          onchange={() => selectPolicy(option.value)}
        />
        <span class="manager-resolution-option-body">
          <span class="manager-resolution-option-name"
            >{text(option.labelKey, option.fallback)}</span
          >
          <span class="manager-resolution-option-desc"
            >{text(option.descKey, option.descFallback)}</span
          >
        </span>
      </label>
    {/each}
  </div>

  {#if modifiers.length > 0}
    <h4 class="manager-modifier-subheading">
      {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsHeading', 'Default modifiers')}
    </h4>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntro',
        'Which modifiers apply by default. A recipe can override this set on its Overview tab.'
      )}
    </p>
    <div class="manager-modifier-defaults" data-crafting-modifier-defaults>
      <ModifierPillSelect
        options={modifiers}
        selectedIds={defaultIds}
        testId="crafting-modifier-defaults"
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
  .manager-modifier-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

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
</style>

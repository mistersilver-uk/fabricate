<!-- Svelte 5 runes mode -->
<!--
  Crafting check-modifier catalogue editor (issue 770, Phase 1).

  A crafting system may define a named catalogue of check modifiers — e.g. Medicine,
  Alchemy, Herbalism for a DC20 healing salve — each an authored roll-data expression
  (`@abilities.med.mod`). A resolution policy decides how the eligible modifiers combine
  into the `@craftingmod` formula placeholder:
    - Add all:   sum every eligible modifier.
    - Pick highest: use the single largest modifier (a deterministic max, not a dice pool).
    - By recipe: each recipe supplies its own modifier set (summed).
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

  let {
    checkModifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    onChange = () => {}
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
      descFallback: 'Sum every eligible modifier into the crafting-check roll.'
    },
    {
      value: 'highest',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest',
      fallback: 'Pick highest',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighestDesc',
      descFallback: 'Use only the single largest eligible modifier (a deterministic maximum).'
    },
    {
      value: 'byRecipe',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipe',
      fallback: 'By recipe',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyByRecipeDesc',
      descFallback: 'Each recipe chooses its own modifier set; the chosen set is summed.'
    }
  ];

  const modifiers = $derived(Array.isArray(checkModifiers) ? checkModifiers : []);
  const selectedPolicy = $derived(
    ['addAll', 'highest', 'byRecipe'].includes(defaultModifierPolicy)
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
    emitModifiers([...modifiers, { id: newId(), label: '', expression: '' }]);
  }

  function updateModifier(id, patch) {
    emitModifiers(modifiers.map((modifier) => (modifier.id === id ? { ...modifier, ...patch } : modifier)));
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
    const next = checked ? [...new Set([...defaultIds, id])] : defaultIds.filter((defaultId) => defaultId !== id);
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
      <div class="manager-modifier-row" data-crafting-modifier-row={modifier.id}>
        <label class="manager-modifier-field">
          <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabel', 'Label')}</span>
          <input
            type="text"
            data-crafting-modifier-field="label"
            value={modifier.label || ''}
            placeholder={text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabelPlaceholder', 'Medicine')}
            oninput={(event) => updateModifier(modifier.id, { label: event.currentTarget.value })}
          />
        </label>
        <label class="manager-modifier-field">
          <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierIcon', 'Icon (optional)')}</span>
          <input
            type="text"
            data-crafting-modifier-field="icon"
            value={modifier.icon || ''}
            placeholder="fas fa-staff-snake"
            oninput={(event) => updateModifier(modifier.id, { icon: event.currentTarget.value })}
          />
        </label>
        <label class="manager-modifier-field manager-modifier-field-expression">
          <span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierExpression', 'Expression')}</span>
          <input
            type="text"
            data-crafting-modifier-field="expression"
            value={modifier.expression || ''}
            placeholder="@abilities.med.mod"
            oninput={(event) => updateModifier(modifier.id, { expression: event.currentTarget.value })}
          />
        </label>
        <button
          type="button"
          class="manager-icon-button is-danger"
          data-crafting-modifier-remove={modifier.id}
          title={text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove', 'Remove modifier')}
          aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove', 'Remove modifier')}
          onclick={() => removeModifier(modifier.id)}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    {/each}
    <button
      type="button"
      class="manager-secondary-button"
      data-crafting-modifier-add
      onclick={addModifier}
    >
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
    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading', 'Default combination')}
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
          <span class="manager-resolution-option-name">{text(option.labelKey, option.fallback)}</span>
          <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
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
      {#each modifiers as modifier (modifier.id)}
        <label class="manager-modifier-default-option">
          <input
            type="checkbox"
            data-crafting-modifier-default={modifier.id}
            checked={defaultIds.includes(modifier.id)}
            onchange={(event) => toggleDefault(modifier.id, event.currentTarget.checked)}
          />
          <span>{modifier.label || text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierUnnamed', 'Unnamed modifier')}</span>
        </label>
      {/each}
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

  .manager-modifier-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .manager-modifier-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1 1 8rem;
    min-width: 0;
  }

  .manager-modifier-field-expression {
    flex: 2 1 12rem;
  }

  .manager-modifier-subheading {
    margin-block: 1rem 0.35rem;
  }

  .manager-modifier-defaults {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .manager-modifier-default-option {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
</style>

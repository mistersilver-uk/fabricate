<!-- Svelte 5 runes mode -->
<!--
  Simple pass/fail crafting check editor (simple and alchemy resolution modes).

  A simple check has a shared roll FORMULA and a polymorphic DC:
    - static:  a default DC applied to every recipe, plus optional named recipe
               TIERS (each its own DC) the recipe editor can pick from.
    - dynamic: a dropped macro that is handed the ingredient set, recipe, and
               actor and must return a DC number.
  Both the static and dynamic fields persist so switching dcMode is non-destructive.

  Controlled component: renders `value` and emits the next value via `onChange`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';

  let { value = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const DC_MODE_OPTIONS = [
    {
      value: 'static',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStatic',
      fallback: 'Static',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStaticDesc',
      descFallback: 'A fixed DC for every recipe, with optional named recipe tiers.',
    },
    {
      value: 'dynamic',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamic',
      fallback: 'Dynamic',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamicDesc',
      descFallback: 'A macro computes the DC from the ingredients, recipe, and actor.',
    },
  ];

  const dcMode = $derived(value?.dcMode === 'dynamic' ? 'dynamic' : 'static');
  const tiers = $derived(Array.isArray(value?.tiers) ? value.tiers : []);
  const diceGroups = $derived(parseDiceGroups(value?.rollFormula));

  let resolvedMacroName = $state('');
  let resolvedMacroMissing = $state(false);
  $effect(() => {
    const uuid = value?.macroUuid;
    resolvedMacroName = '';
    resolvedMacroMissing = false;
    if (!uuid) return;
    let cancelled = false;
    const resolve = globalThis.fromUuid;
    if (typeof resolve !== 'function') {
      resolvedMacroName = uuid;
      return;
    }
    Promise.resolve(resolve(uuid))
      .then((doc) => {
        if (cancelled) return;
        if (doc) resolvedMacroName = doc.name || uuid;
        else resolvedMacroMissing = true;
      })
      .catch(() => {
        if (!cancelled) resolvedMacroMissing = true;
      });
    return () => {
      cancelled = true;
    };
  });

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  function setDcMode(nextMode) {
    if (nextMode === dcMode) return;
    emit({ dcMode: nextMode });
  }

  function numeric(rawValue) {
    if (rawValue === '' || rawValue === '-') return 0;
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function updateTier(id, patch) {
    emit({ tiers: tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)) });
  }

  function removeTier(id) {
    emit({ tiers: tiers.filter((tier) => tier.id !== id) });
  }

  function addTier() {
    emit({ tiers: [...tiers, { id: newId(), name: '', dc: Number(value?.defaultDc) || 0 }] });
  }

  function handleMacroDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Macro' || !uuid) return;
    emit({ macroUuid: uuid });
  }
</script>

<div class="manager-checks-editor" data-simple-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}</h3>
    <label class="manager-field">
      <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')}</span>
      <input
        data-check-roll-formula
        value={value?.rollFormula || ''}
        placeholder="1d20+@abilities.int.mod"
        oninput={(event) => emit({ rollFormula: event.currentTarget.value })}
      />
    </label>
    <div class="manager-checks-dice">
      <span class="manager-field-label">{text('FABRICATE.Admin.Manager.Checks.Crafting.DiceGroups', 'Dice groups')}</span>
      {#if diceGroups.length > 0}
        <div class="manager-chip-row">
          {#each diceGroups as group, index (`${group.raw}-${index}`)}
            <span class="manager-chip" data-dice-group>{group.raw}</span>
          {/each}
        </div>
      {:else}
        <p class="manager-muted" data-dice-empty>{text('FABRICATE.Admin.Manager.Checks.Crafting.NoDice', 'No dice detected in this expression.')}</p>
      {/if}
    </div>
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'Difficulty (DC)')}</h3>
    <div class="manager-checks-type-options" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'Difficulty (DC)')}>
      {#each DC_MODE_OPTIONS as option (option.value)}
        <label
          class={`manager-resolution-option ${dcMode === option.value ? 'is-active' : ''}`}
          data-dc-mode-option={option.value}
        >
          <input
            type="radio"
            name="crafting-check-dc-mode"
            value={option.value}
            checked={dcMode === option.value}
            onchange={() => setDcMode(option.value)}
          />
          <span class="manager-resolution-option-body">
            <span class="manager-resolution-option-name">{text(option.labelKey, option.fallback)}</span>
            <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
          </span>
        </label>
      {/each}
    </div>
  </section>

  {#if dcMode === 'static'}
    <section class="manager-inspector-card" data-static-dc>
      <label class="manager-field manager-checks-default-dc">
        <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.DefaultDc', 'Default DC')}</span>
        <input
          type="number"
          data-default-dc
          value={value?.defaultDc ?? 15}
          oninput={(event) => emit({ defaultDc: numeric(event.currentTarget.value) })}
        />
      </label>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.DefaultDcHint', 'Used for every recipe unless the recipe selects a tier below.')}</p>

      <div class="manager-checks-card-head">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}</h3>
        <button type="button" class="manager-button" data-add-tier onclick={addTier}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add tier')}</span>
        </button>
      </div>

      {#if tiers.length === 0}
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.NoTiers', 'No tiers yet. Add named tiers a recipe can select to override the default DC.')}</p>
      {:else}
        <div class="manager-checks-outcome-table is-tier" role="table" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}>
          <div class="manager-checks-outcome-head" role="row">
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')}</span>
            <span role="columnheader" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}></span>
          </div>
          {#each tiers as tier (tier.id)}
            <div class="manager-checks-outcome-row" role="row" data-tier-row={tier.id}>
              <input
                data-tier-name
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierName', 'Name')}
                value={tier.name || ''}
                oninput={(event) => updateTier(tier.id, { name: event.currentTarget.value })}
              />
              <input
                type="number"
                data-tier-dc
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')}
                value={tier.dc ?? 0}
                oninput={(event) => updateTier(tier.id, { dc: numeric(event.currentTarget.value) })}
              />
              <button
                type="button"
                class="manager-icon-button is-danger"
                data-remove-tier
                aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveTier', 'Remove tier')}
                onclick={() => removeTier(tier.id)}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <section class="manager-inspector-card" data-dynamic-dc>
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'DC macro')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroHint', 'The macro is run with the selected ingredient set, the recipe, and the actor, and must return a DC number.')}</p>
      <div
        class="manager-component-source-drop-zone manager-checks-macro-drop-zone"
        data-check-macro-dropzone
        role="group"
        aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'DC macro')}
        use:dragDrop={{ onDrop: handleMacroDrop, activeClass: 'is-drop-active' }}
      >
        <i class="fas fa-scroll" aria-hidden="true"></i>
        {#if value?.macroUuid}
          <span class="manager-checks-macro-name" class:is-missing={resolvedMacroMissing}>
            {resolvedMacroMissing
              ? text('FABRICATE.Admin.Manager.Checks.Crafting.MacroMissing', 'Linked macro not found')
              : resolvedMacroName || value.macroUuid}
          </span>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-unlink-macro
            aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.MacroUnlink', 'Unlink macro')}
            onclick={() => emit({ macroUuid: null })}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        {:else}
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroDropHint', 'Drag a macro here to compute the DC.')}</span>
        {/if}
      </div>
    </section>
  {/if}
</div>

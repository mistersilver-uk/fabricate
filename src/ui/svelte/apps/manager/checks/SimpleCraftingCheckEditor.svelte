<!-- Svelte 5 runes mode -->
<!--
  Simple pass/fail crafting check editor (simple and alchemy resolution modes).

  A simple check rolls a FORMULA and succeeds when the total reaches a SUCCESS
  THRESHOLD (meet-or-exceed or exceed). The threshold value is polymorphic:
    - static:  the success threshold is the default, with optional named recipe
               TIERS (each its own threshold) the recipe editor can pick from.
    - dynamic: a dropped macro is handed the ingredient set, recipe, and actor
               and returns the threshold. Both sides persist so switching the DC
               mode is non-destructive.
  Each die in the formula can also define a critical RAW roll that auto-fails or
  auto-succeeds the check regardless of the total.

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
      descFallback: 'A fixed success threshold for every recipe, with optional named recipe tiers.',
    },
    {
      value: 'dynamic',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamic',
      fallback: 'Dynamic',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcDynamicDesc',
      descFallback: 'A macro computes the threshold from the ingredients, recipe, and actor.',
    },
  ];

  const dcMode = $derived(value?.dcMode === 'dynamic' ? 'dynamic' : 'static');
  const thresholdMode = $derived(value?.thresholdMode === 'exceed' ? 'exceed' : 'meet');
  const tiers = $derived(Array.isArray(value?.tiers) ? value.tiers : []);
  // One row per unique die in the formula (e.g. "1d20", "1d4"). Each carries the
  // die's producible range so the raw-roll input can be clamped to it.
  const uniqueDice = $derived(
    parseDiceGroups(value?.rollFormula).reduce((list, group) => {
      if (!list.some((die) => die.raw === group.raw)) {
        list.push({ raw: group.raw, min: group.count, max: group.count * group.sides });
      }
      return list;
    }, [])
  );

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
    emit({ tiers: [...tiers, { id: newId(), name: '', dc: Number(value?.successThreshold) || 0 }] });
  }

  function handleMacroDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Macro' || !uuid) return;
    emit({ macroUuid: uuid });
  }

  // Per-die critical rolls. A die can have several (e.g. raw 1 auto-fails and raw
  // 20 auto-succeeds on the same d20), so each crit is its own row keyed by id.
  function critsForDie(die) {
    return (Array.isArray(value?.diceCrits) ? value.diceCrits : []).filter((crit) => crit.die === die);
  }

  function addCrit(die) {
    const list = Array.isArray(value?.diceCrits) ? value.diceCrits : [];
    emit({ diceCrits: [...list, { id: newId(), die: die.raw, raw: die.max, effect: null }] });
  }

  function updateCrit(id, patch) {
    const list = Array.isArray(value?.diceCrits) ? value.diceCrits : [];
    emit({ diceCrits: list.map((crit) => (crit.id === id ? { ...crit, ...patch } : crit)) });
  }

  function removeCrit(id) {
    const list = Array.isArray(value?.diceCrits) ? value.diceCrits : [];
    emit({ diceCrits: list.filter((crit) => crit.id !== id) });
  }

  function setCritRaw(id, min, max, rawValue) {
    updateCrit(id, { raw: Math.max(min, Math.min(max, numeric(rawValue))) });
  }

  // Setting one effect clears the other; clicking the active effect clears it.
  function toggleCritEffect(crit, effect) {
    updateCrit(crit.id, { effect: crit.effect === effect ? null : effect });
  }
</script>

<div class="manager-checks-editor" data-simple-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}</h3>
    <div class="manager-checks-formula-row">
      <label class="manager-field manager-checks-formula-field">
        <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaLabel', 'Formula')}</span>
        <input
          data-check-roll-formula
          value={value?.rollFormula || ''}
          placeholder="1d20+@abilities.int.mod"
          oninput={(event) => emit({ rollFormula: event.currentTarget.value })}
        />
      </label>
      <label class="manager-field manager-checks-threshold-field">
        <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.SuccessThreshold', 'Success threshold')}</span>
        <input
          type="number"
          data-success-threshold
          value={value?.successThreshold ?? 15}
          oninput={(event) => emit({ successThreshold: numeric(event.currentTarget.value) })}
        />
      </label>
      <label class="manager-field manager-checks-threshold-mode">
        <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdComparison', 'Comparison')}</span>
        <select
          data-threshold-mode
          value={thresholdMode}
          onchange={(event) => emit({ thresholdMode: event.currentTarget.value })}
        >
          <option value="meet">{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdMeet', 'Meet or exceed')}</option>
          <option value="exceed">{text('FABRICATE.Admin.Manager.Checks.Crafting.ThresholdExceed', 'Exceed')}</option>
        </select>
      </label>
    </div>

    <div class="manager-checks-card-head">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritTitle', 'Critical rolls')}</h3>
    </div>
    {#if uniqueDice.length === 0}
      <p class="manager-muted" data-dice-empty>{text('FABRICATE.Admin.Manager.Checks.Crafting.NoDice', 'No dice detected in this formula.')}</p>
    {:else}
      {#each uniqueDice as die (die.raw)}
        {@const rows = critsForDie(die.raw)}
        <div class="manager-checks-crit-group" data-crit-group={die.raw}>
          <div class="manager-checks-card-head manager-checks-crit-group-head">
            <span class="manager-checks-crit-die" data-crit-die={die.raw}>{die.raw}</span>
            <button type="button" class="manager-button" data-add-crit onclick={() => addCrit(die)}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddCrit', 'Add critical')}</span>
            </button>
          </div>
          {#if rows.length > 0}
            <div class="manager-checks-outcome-table is-crit" role="table" aria-label={`${die.raw} ${text('FABRICATE.Admin.Manager.Checks.Crafting.CritTitle', 'Critical rolls')}`}>
              <div class="manager-checks-outcome-head" role="row">
                <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritRaw', 'Raw roll')}</span>
                <span role="columnheader">{text('FABRICATE.Admin.Manager.Checks.Crafting.CritForce', 'Force Outcome')}</span>
                <span role="columnheader" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeActions', 'Actions')}></span>
              </div>
              {#each rows as crit (crit.id)}
                <div class="manager-checks-outcome-row" role="row" data-crit-row={crit.id}>
                  <input
                    type="number"
                    data-crit-raw
                    min={die.min}
                    max={die.max}
                    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.CritRaw', 'Raw roll')}
                    value={crit.raw ?? die.max}
                    oninput={(event) => setCritRaw(crit.id, die.min, die.max, event.currentTarget.value)}
                  />
                  <div class="manager-checks-force-outcome">
                    <button
                      type="button"
                      class={`manager-checks-state-pill ${crit.effect === 'fail' ? 'is-negative' : ''}`}
                      data-crit-fail
                      aria-pressed={crit.effect === 'fail'}
                      onclick={() => toggleCritEffect(crit, 'fail')}
                    >
                      {text('FABRICATE.Admin.Manager.Checks.Crafting.CritFail', 'Auto-fail')}
                    </button>
                    <button
                      type="button"
                      class={`manager-checks-state-pill ${crit.effect === 'succeed' ? 'is-positive' : ''}`}
                      data-crit-succeed
                      aria-pressed={crit.effect === 'succeed'}
                      onclick={() => toggleCritEffect(crit, 'succeed')}
                    >
                      {text('FABRICATE.Admin.Manager.Checks.Crafting.CritSucceed', 'Auto-succeed')}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="manager-icon-button is-danger"
                    data-remove-crit
                    aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.RemoveCrit', 'Remove critical roll')}
                    onclick={() => removeCrit(crit.id)}
                  >
                    <i class="fas fa-trash" aria-hidden="true"></i>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'Threshold source')}</h3>
    <div class="manager-checks-type-options" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'Threshold source')}>
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
      <div class="manager-checks-card-head">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.TiersTitle', 'Recipe tiers')}</h3>
        <button type="button" class="manager-button" data-add-tier onclick={addTier}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.AddTier', 'Add tier')}</span>
        </button>
      </div>

      {#if tiers.length === 0}
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.NoTiers', 'No tiers yet. Add named tiers a recipe can select to override the success threshold.')}</p>
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
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'Threshold macro')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroHint', 'The macro is run with the selected ingredient set, the recipe, and the actor, and must return the success threshold.')}</p>
      <div
        class="manager-component-source-drop-zone manager-checks-macro-drop-zone"
        data-check-macro-dropzone
        role="group"
        aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'Threshold macro')}
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
          <span>{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroDropHint', 'Drag a macro here to compute the threshold.')}</span>
        {/if}
      </div>
    </section>
  {/if}
</div>

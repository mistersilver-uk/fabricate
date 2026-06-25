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
  Per-die critical raw rolls force success or failure (and may break tools). The
  formula row, crit table, and recipe-tier table are shared with the routed editor.

  `showDcSource` (default true) renders the DC-source section (static/dynamic
  radios + the recipe-tier table + the dynamic-DC macro). Salvage and gathering
  reuse this editor with `showDcSource={false}`: they have no recipes to pick a
  tier from and no dynamic-DC macro, so they author just the default DC (on the
  formula row) plus a per-entity DC override elsewhere.

  Controlled component: renders `value` and emits the next value via `onChange`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckDiceCrits from './CheckDiceCrits.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckBreakage from './CheckBreakage.svelte';

  // `breakageAuthority` (issue 419): under `checkDriven` the CheckBreakage editor
  // replaces the legacy per-die break-tools toggles for authoring tool breakage.
  let {
    value = null,
    showDcSource = true,
    breakageAuthority = 'toolSpecific',
    onChange = () => {}
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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

  function handleMacroDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Macro' || !uuid) return;
    emit({ macroUuid: uuid });
  }
</script>

<div class="manager-checks-editor" data-simple-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}</h3>
    <CheckFormulaFields
      rollFormula={value?.rollFormula || ''}
      dc={value?.dc ?? 15}
      thresholdMode={value?.thresholdMode || 'meet'}
      onChange={emit}
    />
    <CheckDiceCrits
      rollFormula={value?.rollFormula || ''}
      diceCrits={value?.diceCrits || []}
      showBreakTools={!checkDriven}
      onChange={(diceCrits) => emit({ diceCrits })}
    />
  </section>

  {#if checkDriven}
    <CheckBreakage
      value={value?.checkBreakage || null}
      rollFormula={value?.rollFormula || ''}
      kind="simple"
      onChange={(checkBreakage) => emit({ checkBreakage })}
    />
  {/if}

  {#if showDcSource}
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'DC source')}</h3>
    <div class="manager-checks-type-options" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'DC source')}>
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
      <CheckRecipeTiers
        tiers={value?.tiers || []}
        defaultDc={value?.dc ?? 0}
        onChange={(tiers) => emit({ tiers })}
      />
    </section>
  {:else}
    <section class="manager-inspector-card" data-dynamic-dc>
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'DC macro')}</h3>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.MacroHint', 'The macro is run with the selected ingredient set, the recipe, and the actor, and must return the DC.')}</p>
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
  {/if}
</div>

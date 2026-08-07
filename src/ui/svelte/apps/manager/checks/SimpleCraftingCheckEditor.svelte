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

  `showDcSource` (default true) renders the DC-source section (static/dynamic
  radios + the recipe-tier table + the dynamic-DC macro). Salvage and gathering
  reuse this editor with `showDcSource={false}`: they have no recipes to pick a
  tier from and no dynamic-DC macro, so they author just the default DC (on the
  formula row) plus a per-entity DC override elsewhere.

  Controlled component: renders `value` and emits the next value via `onChange`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  // The shared macro-name resolver (issue 1036), lifted out of this file so the essence
  // editor's property-macro card resolves names the same way rather than re-deriving the
  // `globalThis.fromUuid` indirection and the stale-resolution latch.
  import { resolveMacroName } from '../../../../../utils/macroReference.js';
  import ItemDropZone from '../ItemDropZone.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import CheckFormulaFields from './CheckFormulaFields.svelte';
  import CheckRecipeTiers from './CheckRecipeTiers.svelte';
  import CheckTriggers from './CheckTriggers.svelte';

  // `breakageAuthority` (issue 419): the unified CheckTriggers editor is always
  // rendered; under `checkDriven` it also exposes the per-trigger break-tools toggle.
  let {
    value = null,
    showDcSource = true,
    breakageAuthority = 'toolSpecific',
    onChange = () => {},
  } = $props();

  const checkDriven = $derived(breakageAuthority === 'checkDriven');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The two icons are literally what the DC is: an authored number, or a script that
  // returns one.
  const DC_MODE_OPTIONS = [
    {
      value: 'static',
      icon: 'fas fa-hashtag',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStatic',
      fallback: 'Static',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.DcStaticDesc',
      descFallback: 'A fixed DC for every recipe, with optional named recipe tiers.',
    },
    {
      value: 'dynamic',
      icon: 'fas fa-code',
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
    resolvedMacroName = '';
    resolvedMacroMissing = false;
    return resolveMacroName(value?.macroUuid, ({ name, missing }) => {
      resolvedMacroName = name;
      resolvedMacroMissing = missing;
    });
  });

  function emit(patch) {
    onChange({ ...value, ...patch });
  }

  function setDcMode(nextMode) {
    if (nextMode === dcMode) return;
    emit({ dcMode: nextMode });
  }

  // `ItemDropZone` has already refused anything that is not a Macro naming a document, so
  // this only has to resolve the uuid out of whichever drag shape arrived. It keeps calling
  // `resolveDropData` because the zone hands `onDrop` the RAW payload by contract.
  function handleMacroDrop(data) {
    const { uuid } = resolveDropData(data);
    if (!uuid) return;
    emit({ macroUuid: uuid });
  }

  // The card's label, resolved here so the markup stays declarative. It is the ONE string
  // the zone renders — empty prompt, resolved name, or the missing notice.
  const macroCardLabel = $derived.by(() => {
    if (!value?.macroUuid) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.MacroDropHint',
        'Drag a macro here to compute the DC.'
      );
    }
    if (resolvedMacroMissing) {
      return text('FABRICATE.Admin.Manager.Checks.Crafting.MacroMissing', 'Linked macro not found');
    }
    return resolvedMacroName || value.macroUuid;
  });
</script>

<div class="manager-checks-editor" data-simple-check-editor>
  <section class="manager-inspector-card">
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.Checks.Crafting.FormulaTitle', 'Roll formula')}
    </h3>
    <CheckFormulaFields
      rollFormula={value?.rollFormula || ''}
      dc={value?.dc ?? 15}
      thresholdMode={value?.thresholdMode || 'meet'}
      onChange={emit}
    />
  </section>

  <CheckTriggers
    value={value?.checkBreakage || null}
    rollFormula={value?.rollFormula || ''}
    kind="simple"
    showBreakTools={checkDriven}
    onChange={(checkBreakage) => emit({ checkBreakage })}
  />

  {#if showDcSource}
    <section class="manager-inspector-card">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.DcTitle', 'DC source')}
      </h3>
      <RadioCardGroup
        legendKey="FABRICATE.Admin.Manager.Checks.Crafting.DcTitle"
        legend="DC source"
        options={DC_MODE_OPTIONS}
        selectedValue={dcMode}
        groupName="crafting-check-dc-mode"
        columns={2}
        optionDataAttr="data-dc-mode-option"
        onChange={setDcMode}
      />
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
        <h3 class="manager-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'DC macro')}
        </h3>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Checks.Crafting.MacroHint',
            'The macro is run with the selected ingredient set, the recipe, and the actor, and must return the DC.'
          )}
        </p>
        <!-- The shared drop primitive (issue 1036). It was hand-rolled here — a bare
             `use:dragDrop` div with its own linked/empty branch and its own unlink button
             — while three other manager surfaces already rendered the same card through
             `ItemDropZone`. Converting it is what gives this control the compendium-drag
             acceptance the hand-rolled `resolveDropData` guard already had but the
             primitive did not, and the MISSING treatment neither of them had.
             `data-check-macro-dropzone` and `data-unlink-macro` are preserved by the
             `kind` mapping: `manager-mounted.test.js` and the View Lab checks case both
             select on the first. -->
        <ItemDropZone
          kind="check-macro"
          documentType="Macro"
          item={value?.macroUuid ? { name: macroCardLabel } : null}
          state={resolvedMacroMissing ? 'missing' : 'linked'}
          title={macroCardLabel}
          emptyIcon="fas fa-scroll"
          unlinkLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.MacroUnlink', 'Unlink macro')}
          onDrop={handleMacroDrop}
          onUnlink={() => emit({ macroUuid: null })}
        />
      </section>
    {/if}
  {/if}
</div>

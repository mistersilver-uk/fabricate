<!-- Svelte 5 runes mode -->
<!--
  THE DC MACRO — the card a check shows when its difficulty is computed rather than authored,
  shared because the ROUTED check carries `dcMode`/`macroUuid` too: two copies would be two
  chances to drift on the one sentence telling a GM what their macro receives.

  The macro receives the ANCHOR DC alongside the ingredients, the record, the system and the
  actor, and returns the final number, so tiers and the macro COMPOSE and the tier list is NOT
  hidden under dynamic. One that throws, returns a non-number or is missing falls back to the
  anchor and never throws mid-craft: a throw inside the engine is a CONSUMING failure, so this
  card's copy promises what `CraftingEngine._resolveSimpleCheckDc` guarantees.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  // The shared macro-name resolver, which owns the `fromUuid` indirection and the latch.
  import { resolveMacroName } from '../../../../../utils/macroReference.js';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';

  let { macroUuid = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let resolvedMacroName = $state('');
  let resolvedMacroMissing = $state(false);
  $effect(() => {
    resolvedMacroName = '';
    resolvedMacroMissing = false;
    return resolveMacroName(macroUuid, ({ name, missing }) => {
      resolvedMacroName = name;
      resolvedMacroMissing = missing;
    });
  });

  // `ItemDropZone` has already refused anything that is not a Macro, so this only resolves the
  // uuid out of whichever drag shape arrived — the zone hands `onDrop` the RAW payload.
  function handleMacroDrop(data) {
    const { uuid } = resolveDropData(data);
    if (!uuid) return;
    onChange({ macroUuid: uuid });
  }

  // The ONE string the zone renders — empty prompt, resolved name, or the missing notice.
  const macroCardLabel = $derived.by(() => {
    if (!macroUuid) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Crafting.MacroDropHint',
        'Drag a macro here to compute the DC.'
      );
    }
    if (resolvedMacroMissing) {
      return text('FABRICATE.Admin.Manager.Checks.Crafting.MacroMissing', 'Linked macro not found');
    }
    return resolvedMacroName || macroUuid;
  });
</script>

<InspectorCard class="manager-checks-card" data-dynamic-dc="">
  <div class="manager-checks-card-head">
    <div>
      <h3 class="manager-checks-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.MacroTitle', 'DC macro')}
      </h3>
      <p class="manager-checks-card-description">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.MacroHint',
          'The macro is handed the base DC above — the difficulty tier the record selected, or the base DC when it selects none — alongside the ingredients, the record and the actor, and returns the number to use. A macro that fails or returns no number leaves the base DC in place.'
        )}
      </p>
    </div>
  </div>
  <div class="manager-checks-card-body">
    <!-- The shared drop primitive, which brings the compendium-drag acceptance and the MISSING
         treatment a hand-rolled zone had neither of. `data-check-macro-dropzone` and
         `data-unlink-macro` are this site's own hooks, stated here rather than switched on by a
         branch inside the primitive, and both are load-bearing selectors. `kind` stays because it
         still ids the zone through `data-item-drop-zone`. -->
    <ItemDropZone
      kind="check-macro"
      hookAttrs={{
        root: { 'data-check-macro-dropzone': true },
        unlink: { 'data-unlink-macro': true },
      }}
      documentType="Macro"
      item={macroUuid ? { name: macroCardLabel } : null}
      state={resolvedMacroMissing ? 'missing' : 'linked'}
      title={macroCardLabel}
      emptyIcon="fas fa-scroll"
      unlinkLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.MacroUnlink', 'Unlink macro')}
      onDrop={handleMacroDrop}
      onUnlink={() => onChange({ macroUuid: null })}
    />
  </div>
</InspectorCard>

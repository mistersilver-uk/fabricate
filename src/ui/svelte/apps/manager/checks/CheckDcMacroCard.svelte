<!-- Svelte 5 runes mode -->
<!--
  THE DC MACRO — the card a check shows when its difficulty is computed rather than authored.

  Extracted from `SimpleCraftingCheckEditor` (issue 1096) because the ROUTED check now carries
  `dcMode`/`macroUuid` too: a routed relative check is defined as bands offset from a DC, so it
  has a DC by construction, and the engine already resolved it through the same
  `_resolveSimpleCheckDc` path. Two copies of a drop-zone card would be two chances to drift on
  the one sentence that tells a GM what their macro receives.

  ## What the macro is handed, and what it must return

  The macro receives the ANCHOR DC — the record's selected difficulty tier, or the static
  default when no tier applies — alongside the ingredients, the record, the system and the
  actor, and returns the final number. Tiers and the macro therefore COMPOSE: a GM can author
  "Legendary Craft is 21" and still have a macro shift it for ingredient quality. That is why
  the difficulty tier list is NOT hidden under dynamic.

  A macro that throws, returns a non-number, or is missing falls back to the anchor and never
  throws mid-craft. That posture is not a nicety: a throw inside the engine is a CONSUMING
  failure — ingredients already spent, tools already broken — so the card's copy promises what
  `CraftingEngine._resolveSimpleCheckDc` actually guarantees.

  Props:
   - macroUuid: the linked macro, or null.
   - onChange(patch): partial patch, merged by the parent into the whole check.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  // The shared macro-name resolver (issue 1036), which owns the `globalThis.fromUuid`
  // indirection and the stale-resolution latch.
  import { resolveMacroName } from '../../../../../utils/macroReference.js';
  import ItemDropZone from '../ItemDropZone.svelte';

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

  // `ItemDropZone` has already refused anything that is not a Macro naming a document, so
  // this only has to resolve the uuid out of whichever drag shape arrived. It keeps calling
  // `resolveDropData` because the zone hands `onDrop` the RAW payload by contract.
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

<section class="manager-inspector-card manager-checks-card" data-dynamic-dc>
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
    <!-- The shared drop primitive (issue 1036), which brings the compendium-drag acceptance
         and the MISSING treatment a hand-rolled zone had neither of.
         `data-check-macro-dropzone` and `data-unlink-macro` are preserved by the `kind`
         mapping: the mounted suites and the View Lab checks case both select on the first. -->
    <ItemDropZone
      kind="check-macro"
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
</section>

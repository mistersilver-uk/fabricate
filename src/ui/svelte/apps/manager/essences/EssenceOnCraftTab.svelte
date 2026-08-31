<!-- Svelte 5 runes mode -->
<!--
  The essence editor's ON CRAFT tab (issue 1036): what this essence carries onto a crafted
  result — an active-effect source, and a property macro.

  ── ONE CARD WHEN LINKED, THE PICKER WHEN NOT (issue 1036, maintainer round 2) ────
  The maintainer's ruling: "the linked item active effect source needs to appear the same way
  a linked item in the tool studio editor view does". The Tool Studio renders exactly one
  control for this — an `ItemDropZone` that IS the drop target in both states — so this tab
  does the same:

   - LINKED  -> `ItemDropZone`: the item image, the item name in bold, an instructional
                sub-line, and the grouped copy-uuid / unlink icon pair right-aligned.
   - UNLINKED -> `EssenceSourceSelector`, which is the drop-or-PICK affordance.

  Three defects go with the rewrite, all read off `manager-essence-edit-on-craft.png`:

   1. the hand-rolled `.manager-essence-source-summary` card stated the raw uuid
      (`Item.sm-ruby`) where the Tool Studio states what to do with the card.
   2. it carried ONE square ✕ where the Tool Studio has the rounded icon pair, and it had no
      copy-uuid at all although the browser inspector two clicks away does.
   3. the `Drop or pick` zone rendered BELOW the linked card as well, so the card and the
      zone said the same thing twice. An earlier review called that "`ItemDropZone`'s shipped
      behaviour"; it is not — `ToolOverviewTab` proves the primitive already suppresses the
      second zone, because there is only ever one zone to begin with.

  `ItemDropZone` itself is UNCHANGED. It already accepts a `documentType`, a `subline`, and a
  `state`, and it already renders the grouped actions; nothing about its other consumers
  moves. The essence source is still a managed COMPONENT id rather than a document uuid, and
  that is why the UNLINKED state stays `EssenceSourceSelector`: only the picker can offer the
  in-system component list. What the drop handler receives is the same raw Item payload in
  both states, which the root already resolves to a component.

  ── BOTH SECTIONS ARE GATED, AND THE BOTH-OFF STATE IS EXPLAINED ──────────────────
  `features.effectTransfer` and `features.propertyMacros` gate their own sections. With both
  off the tab renders an explanatory empty state rather than an empty tab: a blank panel
  reads as a broken screen, where a sentence naming the two system settings reads as a
  configuration fact.

  ── SUPPRESSION IS A STATE ON THE SECTION, NOT A REMOVAL ──────────────────────────
  For a DISABLED essence each section's pill reads `Suppressed` and its sub-line says why.
  The linked cards still render — a GM must be able to see, and change, the link that is
  currently doing nothing.

  ── THE `type !== 'script'` REJECTION LIVES IN THE DROP HANDLER ───────────────────
  Not in the drop predicate: a payload's `type` is the DOCUMENT NAME (`'Macro'`), and the
  macro's own type needs `await fromUuid`. Foundry defaults a NEW Macro to `type: 'chat'`,
  so a GM who pastes JavaScript into a fresh macro without changing its type produces
  exactly the payload this rejects. The check itself is `evaluateMacroDrop` in
  `src/utils/macroReference.js`; the WARNING is this surface's, because the copy belongs to
  the surface rather than to the check.
-->
<script>
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import ExplainerCard from '../ExplainerCard.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    sourceComponentId = '',
    selectedSource = null,
    storedSourceName = '',
    macroUuid = '',
    macroName = '',
    macroMissing = false,
    macroWarning = '',
    disabledEssence = false,
    managedItemOptions = [],
    effectTransferEnabled = false,
    propertyMacrosEnabled = false,
    saving = false,
    // ── THE WORLD-SCOPE LOCK (issue 1372) ──────────────────────────────────────────────────
    // `{effectSource: boolean, macro: boolean}` — whether this system INHERITS that section from
    // the world default. While it does, this system does not own the value, so the editor must
    // not present an edit affordance for it: the card renders read-only, the drop zone and the
    // picker are not drawn, and the unlink control is absent. Turning the section's inherit
    // switch off is the one action that unlocks it, and that switch lives beside the card rather
    // than inside it. Defaults to all-false, so the shipped editor renders exactly as it did.
    lockedSections = {},
    // `{[section]: string}` — the one-line summary of what the locked value resolves to. Without
    // it a locked card states a name and never says why it cannot be edited.
    inheritNotes = {},
    onSourceSelect = () => {},
    onSourceDrop = () => {},
    onSourceClear = () => {},
    onCopySourceUuid = null,
    onMacroDrop = () => {},
    onMacroUnlink = () => {},
  } = $props();

  const sourceLocked = $derived(lockedSections?.effectSource === true);
  const macroLocked = $derived(lockedSections?.macro === true);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const suppressedSub = $derived(
    text(
      'FABRICATE.Admin.Manager.Essence.Preview.Suppressed',
      'This essence is disabled — nothing it carries reaches a crafted result.'
    )
  );

  const sourcePill = $derived(
    sectionPill(
      Boolean(sourceComponentId || storedSourceName),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.Transferring', 'Transferring'),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.NoSource', 'No source')
    )
  );
  const macroPill = $derived(
    sectionPill(
      Boolean(macroUuid),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.RunsOnCraft', 'Runs on craft'),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.NoMacro', 'No macro')
    )
  );

  // ONE pill shape for both sections: `Suppressed` in the disabled tone when the essence is
  // disabled AND the section is configured, otherwise the section's own two states.
  function sectionPill(configured, configuredLabel, emptyLabel) {
    if (!configured) return { tone: 'neutral', label: emptyLabel, suppressed: false };
    if (disabledEssence) {
      return {
        tone: 'neutral',
        label: text('FABRICATE.Admin.Manager.Essence.OnCraft.Suppressed', 'Suppressed'),
        suppressed: true,
      };
    }
    return { tone: 'info', label: configuredLabel, suppressed: false };
  }

  const macroItem = $derived(macroUuid ? { name: macroName || macroUuid, img: '' } : null);

  // The linked source, in the shape `ItemDropZone` renders. `img` is what makes the card show
  // the real item art rather than the empty-drop glyph, so an unresolved link (a stored name
  // with no component behind it) deliberately yields a card with the fallback bag icon rather
  // than no card at all — the GM must be able to see and clear a link that no longer resolves.
  const sourceLinked = $derived(Boolean(selectedSource || sourceComponentId || storedSourceName));
  const sourceItem = $derived(
    sourceLinked
      ? {
          name: selectedSource?.name || storedSourceName || sourceComponentId,
          img: selectedSource?.img || 'icons/svg/item-bag.svg',
        }
      : null
  );
  const sourceUuid = $derived(selectedSource?.originItemUuid || '');

  const explainerItems = $derived([
    {
      icon: 'fas fa-cubes',
      lead: text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.CarriesQuantity',
        'Something an item has.'
      ),
      text: text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.CarriesQuantityHint',
        'A component can hold several of one essence. Tags say what an item is; essences say what it holds.'
      ),
    },
    {
      icon: 'fas fa-wand-magic-sparkles',
      lead: text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.CarriesEffects',
        'Can pass on active effects.'
      ),
      text: text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.CarriesEffectsHint',
        'Link a source component and every active effect on its item is copied onto anything crafted with this essence.'
      ),
    },
    {
      icon: 'fas fa-code',
      lead: text('FABRICATE.Admin.Manager.Essence.OnCraft.CarriesMacro', 'Can rewrite the result.'),
      text: text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.CarriesMacroHint',
        'A property macro runs against the item data before it reaches the player, and may change its properties.'
      ),
    },
  ]);
</script>

<div class="manager-essence-tab-stack" data-essence-tab-panel="oncraft">
  <ExplainerCard
    icon="fas fa-circle-question"
    title={text(
      'FABRICATE.Admin.Manager.Essence.OnCraft.ExplainerTitle',
      'What an essence carries'
    )}
    items={explainerItems}
    dataAttr="data-essence-on-craft-explainer"
  />

  {#if !effectTransferEnabled && !propertyMacrosEnabled}
    <!-- BOTH gates off. An empty tab reads as a broken screen; this reads as the
         configuration fact it is, and names the two settings that change it. -->
    <EmptyState
      icon="fas fa-wand-magic-sparkles"
      title={text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.BothOffTitle',
        'This system carries nothing on craft'
      )}
      hint={text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.BothOffHint',
        'Turn on Effect transfer or Property macros in this system’s crafting settings to give essences behaviour.'
      )}
      dataAttr="data-essence-on-craft-empty"
    />
  {/if}

  {#if effectTransferEnabled}
    <section class="manager-edit-card" data-essence-section="effect-source">
      <div class="manager-edit-card-heading">
        <h3 class="manager-card-title">
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Essence.OnCraft.SourceHeading', 'Active effect source')}
        </h3>
        <Chip
          tone={sourcePill.tone}
          data-essence-source-pill={sourcePill.suppressed ? 'suppressed' : 'state'}
          >{sourcePill.label}</Chip
        >
      </div>
      <p class="manager-muted">
        {sourcePill.suppressed
          ? suppressedSub
          : text(
              'FABRICATE.Admin.Manager.Essence.OnCraft.SourceHint',
              'Optional. Active effects on this component’s item are transferred to whatever is crafted with this essence.'
            )}
      </p>

      {#if sourceLocked}
        <!-- LOCKED: this system inherits the section, so it does not own the value. A read-only
             card states what resolves and why, and draws no drop target, no picker and no
             unlink — the absence of `[data-scoped-source-unlink]` IS the lock.

             NESTED RATHER THAN FLATTENED INTO ONE `{:else if}` CHAIN, deliberately. The
             linked/unlinked pair below is pinned by `essence-studio-fidelity.test.js` as
             `{#if sourceLinked}` with the drop-or-pick zone strictly after its `{:else}` — the
             assertion that stopped the zone rendering twice — and folding this branch into that
             chain would rewrite the very structure that pin exists to hold. -->
        <div class="manager-essence-locked-card" data-scoped-source-locked="effectSource">
          <span class="manager-essence-locked-value">
            {sourceItem?.name ||
              storedSourceName ||
              text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None')}
          </span>
          {#if inheritNotes?.effectSource}
            <p class="manager-muted" data-scoped-source-locked-note>{inheritNotes.effectSource}</p>
          {/if}
        </div>
      {:else}
        {#if sourceLinked}
          <!-- The Tool Studio's linked card, from the same primitive `ToolOverviewTab` renders.
             The sub-line is the INSTRUCTION, not the uuid: the card is itself the drop
             target, and telling the GM so is the thing the uuid was occupying the line
             instead of doing. The uuid is still reachable — `Copy source UUID` is the first
             of the grouped pair, and its `title` shows it. -->
          <ItemDropZone
            item={sourceItem}
            kind="essence-source"
            title={sourceItem.name}
            hint={text(
              'FABRICATE.Admin.Manager.Essence.OnCraft.SourceReplaceHint',
              'Drop another Item here to replace the linked source.'
            )}
            disabled={saving}
            copyLabel={sourceUuid ||
              text(
                'FABRICATE.Admin.Manager.Essence.SourceNoUuid',
                'This component has no source item UUID.'
              )}
            unlinkLabel={text(
              'FABRICATE.Admin.Features.Essences.ClearSourceItem',
              'Remove source item'
            )}
            onDrop={onSourceDrop}
            onCopy={onCopySourceUuid && sourceUuid ? () => onCopySourceUuid(sourceUuid) : null}
            onUnlink={() => onSourceClear()}
            unlinkAttr="data-scoped-source-unlink"
          />
        {:else}
          <!-- UNLINKED only. `EssenceSourceSelector` is the drop-or-PICK affordance, and the
             pick half is why it survives at all: an essence source is an in-system managed
             component, so there is a list to choose from that a document drop zone cannot
             offer. Rendering it BESIDE the linked card is what said the same thing twice. -->
          <div class="manager-essence-source-drop-zone">
            <EssenceSourceSelector
              value={null}
              items={managedItemOptions}
              disabled={saving}
              onDrop={onSourceDrop}
              onSelect={(itemId) => onSourceSelect(itemId || '')}
              onClear={() => onSourceClear()}
            />
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  {#if propertyMacrosEnabled}
    <section class="manager-edit-card" data-essence-section="macro">
      <div class="manager-edit-card-heading">
        <h3 class="manager-card-title">
          <i class="fas fa-code" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Essence.Macro.Heading', 'Property macro')}
        </h3>
        <Chip
          tone={macroPill.tone}
          data-essence-macro-pill={macroPill.suppressed ? 'suppressed' : 'state'}
          >{macroPill.label}</Chip
        >
      </div>
      <p class="manager-muted">
        {macroPill.suppressed
          ? suppressedSub
          : text(
              'FABRICATE.Admin.Manager.Essence.Macro.Hint',
              'Optional. Runs once per craft against the item data, before the item is created in the player’s inventory.'
            )}
      </p>

      <!-- `documentType="Macro"` is what makes the shared drop zone accept a Macro rather
           than an Item, and `state="missing"` is what paints an unresolvable link as
           broken. A broken macro link is otherwise indistinguishable from a working one:
           at craft time an unresolvable uuid is logged and SKIPPED SILENTLY, deliberately,
           because a toast would fire once per essence per result on the crafting player's
           screen for a GM-side authoring defect. -->
      <!-- `hint` is the INSTRUCTION, not the uuid (issue 1036, maintainer round 2). It was
           `macroUuid`, and `macroItem.name` falls back to the same uuid when the macro does
           not resolve — which is precisely the lab's state — so the card rendered
           `Macro.lab-aether-binding` as its title AND again as its sub-line. The Tool Studio
           gives that line to a useful sentence, so this does too; the uuid survives as the
           card's title in the unresolved case, which is the one case it is diagnostic in. -->
      {#if macroLocked}
        <!-- LOCKED, for the same reason and with the same consequence as the source card. -->
        <div class="manager-essence-locked-card" data-scoped-macro-locked="macro">
          <span class="manager-essence-locked-value">
            {macroName ||
              macroUuid ||
              text('FABRICATE.Admin.Manager.Essence.Macro.Unnamed', 'the linked property macro')}
          </span>
          {#if inheritNotes?.macro}
            <p class="manager-muted" data-scoped-macro-locked-note>{inheritNotes.macro}</p>
          {/if}
        </div>
      {:else}
        <ItemDropZone
          item={macroItem}
          kind="essence-macro"
          documentType="Macro"
          state={macroMissing ? 'missing' : 'linked'}
          disabled={saving}
          title={text(
            'FABRICATE.Admin.Manager.Essence.Macro.DropTitle',
            'Drop a script macro here'
          )}
          hint={macroUuid
            ? text(
                'FABRICATE.Admin.Manager.Essence.Macro.ReplaceHint',
                'Drop another Macro here to replace the linked script.'
              )
            : text(
                'FABRICATE.Admin.Manager.Essence.Macro.EmptyHint',
                'Drop a script Macro from this world or an installed compendium.'
              )}
          subline={macroMissing
            ? text(
                'FABRICATE.Admin.Manager.Essence.Macro.Missing',
                'This macro no longer resolves, so it will be skipped at craft time.'
              )
            : ''}
          unlinkLabel={text('FABRICATE.Admin.Manager.Essence.Macro.Unlink', 'Unlink macro')}
          onDrop={onMacroDrop}
          onUnlink={macroUuid ? onMacroUnlink : null}
          unlinkAttr="data-scoped-macro-unlink"
        />
      {/if}
      {#if macroWarning}
        <p class="manager-validation-error" role="alert" data-essence-macro-warning>
          {macroWarning}
        </p>
      {/if}
    </section>
  {/if}
</div>

<style>
  /* THE LOCKED VALUE CARD. Static class names, so Svelte can prove each selector is used and
     `lint:svelte:warnings` stays at zero. */
  .manager-essence-locked-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-essence-locked-value {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.85rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-essence-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>

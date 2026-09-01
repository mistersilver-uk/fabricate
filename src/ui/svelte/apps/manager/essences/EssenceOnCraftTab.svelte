<!-- Svelte 5 runes mode -->
<!--
  The essence editor's TWO BEHAVIOUR CARDS: what this essence carries onto a crafted result in
  THIS crafting system — an active-effect source, and a macro that runs on craft.

  It is the body of the `Essence rules` tab for an essence the world catalogue holds, and the body
  of the shipped `On craft` tab for a CREATE draft, which has no shared definition. The difference
  between the two is carried by `scoped` and nothing else; see its declaration.

  ── ONE CARD WHEN LINKED, THE PICKER WHEN NOT (issue 1036, maintainer round 2) ────
  The maintainer's ruling: "the linked item active effect source needs to appear the same way
  a linked item in the tool studio editor view does". The Tool Studio renders exactly one
  control for this — an `ItemDropZone` that IS the drop target in both states — so this tab
  does the same:

   - LINKED  -> `ItemDropZone`: the item image, the item name in bold, its ADDRESS on a mono
                line, an instructional sub-line, and the grouped copy-uuid / unlink icon pair
                right-aligned.
   - UNLINKED -> `EssenceSourceSelector`, which is the drop-or-PICK affordance.

  `ItemDropZone` itself is UNCHANGED except for the optional address line issue 1372 adds. It
  already accepts a `documentType`, a `subline`, and a `state`, and it already renders the
  grouped actions; nothing about its other consumers moves. The essence source is still a
  managed COMPONENT id rather than a document uuid, and that is why the UNLINKED state stays
  `EssenceSourceSelector`: only the picker can offer the in-system component list. What the
  drop handler receives is the same raw Item payload in both states, which the root already
  resolves to a component.

  ── EACH CARD CARRIES ITS OWN INHERIT SWITCH (issue 1372, maintainer parity round 7) ──
  The two switches used to sit together in a band ABOVE the tab strip, sharing one grey slab with
  the enable toggle and the remove action. The reference puts each switch INSIDE the card it
  governs, in a bordered row between the card's explanation and its value, and that placement is
  the point: the switch decides whether the value below it is this system's to change, and a GM
  reading a locked value has to find the control that unlocks it without leaving the card.

  `InheritRow` renders the pair as a set, so this file asks it for ONE section at a time and
  supplies the head sentence, because the section's name is already the card's title one line up.

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
  import InheritRow from '../scoped/InheritRow.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
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
    // switch off is the one action that unlocks it, and that switch is the row inside the same
    // card. Defaults to all-false, so a create draft renders exactly as the shipped editor did.
    lockedSections = {},
    // `{[section]: string}` — the one-line summary of what each section resolves to. It is the
    // inherit row's note; without it a row says "Inheriting the world default" and never says
    // what is being inherited, and a row-count assertion passes green over every note empty.
    inheritNotes = {},
    // ── WHAT A LOCKED CARD RENDERS (issue 1372) ────────────────────────────────────────────
    // `{sourceName, sourceUuid, macroUuid, macroName}` — the WORLD DEFAULT, resolved by the
    // editor, which is the half that holds the world entry. A locked card wears a `World default`
    // pill, and before this prop existed it rendered the DRAFT's own source and macro underneath
    // it: the same two fields the unlocked card edits, relabelled as the world's. That read as
    // correct for as long as no card could be locked at all, and became visible the moment the
    // lab world seeded an inheriting section. It is used ONLY by the two locked branches, so an
    // unlocked card is byte-identical to what it rendered before.
    worldDefaults = {},
    // WHETHER THIS ESSENCE HAS A SHARED WORLD DEFINITION. `true` is the system Essence Rules
    // screen: each card carries its own inherit switch and the tab drops the explainer, because
    // the cards state their own meaning and the tab is no longer one third of an editor. `false`
    // is the CREATE draft, which has no world record, no sections to inherit and therefore no
    // switches — and keeps the explainer, which is the only place a first-time GM is told what an
    // essence can carry at all.
    scoped = false,
    // WHETHER THIS SYSTEM HAS A MEMBERSHIP RECORD to write an inherit switch onto. It is
    // separate from `scoped` because the two states differ: an essence with a shared definition
    // that this system has NOT adopted still gets the rules screen's copy and its callout, but
    // has no record for a switch to write to, and a switch that wrote to nothing would report a
    // state it could not hold.
    inheritable = false,
    // The membership record's `inherit` map, read by `InheritRow`. An ABSENT key reads as
    // inheriting, matching `isSectionInherited`.
    inheritedMap = {},
    // `{[section]: string}` — the bold head sentence of each inherit row, supplied by the editor
    // because it names the crafting SYSTEM, which this tab is not handed.
    inheritHeadings = {},
    onToggleInherit = () => {},
    onSourceSelect = () => {},
    onSourceDrop = () => {},
    onSourceClear = () => {},
    onCopySourceUuid = null,
    onMacroDrop = () => {},
    onMacroUnlink = () => {},
  } = $props();

  const sourceLocked = $derived(lockedSections?.effectSource === true);
  const macroLocked = $derived(lockedSections?.macro === true);
  const lockedSourceName = $derived(String(worldDefaults?.sourceName ?? '').trim());
  const lockedSourceUuid = $derived(String(worldDefaults?.sourceUuid ?? '').trim());
  const lockedMacroUuid = $derived(String(worldDefaults?.macroUuid ?? '').trim());
  const lockedMacroName = $derived(String(worldDefaults?.macroName ?? '').trim());

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

  const worldDefaultLabel = $derived(
    text('FABRICATE.Admin.Manager.Essence.OnCraft.WorldDefaultPill', 'World default')
  );

  const sourcePill = $derived(
    sectionPill(
      sourceLocked,
      Boolean(sourceComponentId || storedSourceName),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.Transferring', 'Transferring effects'),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.NoSource', 'No source')
    )
  );
  const macroPill = $derived(
    sectionPill(
      macroLocked,
      Boolean(macroUuid),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.RunsOnCraft', 'Runs on craft'),
      text('FABRICATE.Admin.Manager.Essence.OnCraft.NoMacro', 'No macro')
    )
  );

  // ONE pill shape for both sections. SUPPRESSION OUTRANKS INHERITANCE, because a disabled
  // essence carries nothing at all and where the value came from is the smaller fact; an
  // INHERITED section then reports the world default, which is what the reference's macro card
  // states; and only a section this system owns reports its own two states.
  function sectionPill(locked, configured, configuredLabel, emptyLabel) {
    if (configured && disabledEssence) {
      return {
        tone: 'neutral',
        label: text('FABRICATE.Admin.Manager.Essence.OnCraft.Suppressed', 'Suppressed'),
        suppressed: true,
      };
    }
    if (locked) return { tone: 'neutral', label: worldDefaultLabel, suppressed: false };
    if (!configured) return { tone: 'neutral', label: emptyLabel, suppressed: false };
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

<div class="manager-essence-tab-stack" data-essence-tab-panel={scoped ? 'rules' : 'oncraft'}>
  {#if !scoped}
    <!-- THE CREATE DRAFT'S PRIMER. It is dropped on the rules screen, where each card carries
         its own explanatory line and the shared-definition callout above them says which layer
         is which — three sentences of the same subject stated twice. -->
    <ExplainerCard
      icon="fas fa-circle-question"
      title={text(
        'FABRICATE.Admin.Manager.Essence.OnCraft.ExplainerTitle',
        'What an essence carries'
      )}
      items={explainerItems}
      dataAttr="data-essence-on-craft-explainer"
    />
  {/if}

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
        <h3 class="manager-card-title manager-essence-card-title">
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
              'Active effects on this item are copied onto anything crafted with this essence here.'
            )}
      </p>

      {#if inheritable}
        <!-- THE SWITCH THAT DECIDES WHETHER THE VALUE BELOW IS THIS SYSTEM'S TO CHANGE. -->
        <div class="manager-essence-inherit-slot">
          <InheritRow
            entityType="essence"
            section="effectSource"
            stateChip={false}
            headings={inheritHeadings}
            inherited={inheritedMap}
            notes={inheritNotes}
            disabled={saving}
            onToggle={onToggleInherit}
          />
        </div>
      {/if}

      {#if sourceLocked}
        <!-- LOCKED: this system inherits the section, so it does not own the value. A read-only
             tile states what resolves and where it came from, and draws no drop target, no
             picker and no unlink — the absence of `[data-scoped-source-unlink]` IS the lock.

             NESTED RATHER THAN FLATTENED INTO ONE `{:else if}` CHAIN, deliberately. The
             linked/unlinked pair below is pinned by `essence-studio-fidelity.test.js` as
             `{#if sourceLinked}` with the drop-or-pick zone strictly after its `{:else}` — the
             assertion that stopped the zone rendering twice — and folding this branch into that
             chain would rewrite the very structure that pin exists to hold. -->
        <div class="manager-essence-locked-card" data-scoped-source-locked="effectSource">
          <span class="manager-essence-locked-glyph" aria-hidden="true"
            ><i class="fas fa-wand-magic-sparkles"></i></span
          >
          <span class="manager-essence-locked-copy">
            <span class="manager-essence-locked-value">
              {lockedSourceName || text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None')}
            </span>
            {#if lockedSourceUuid}
              <code class="manager-essence-locked-uuid">{lockedSourceUuid}</code>
            {/if}
          </span>
          <StatusPill tone="subtle" icon="fas fa-globe" label={worldDefaultLabel} />
        </div>
      {:else}
        {#if sourceLinked}
          <!-- The Tool Studio's linked card, from the same primitive `ToolOverviewTab` renders.
             The sub-line is the INSTRUCTION, not the uuid: the card is itself the drop
             target, and telling the GM so is the thing the uuid was occupying the line
             instead of doing. The address has its own mono line above it since issue 1372,
             which is the reference's own three-line tile. -->
          <ItemDropZone
            item={sourceItem}
            kind="essence-source"
            title={sourceItem.name}
            uuid={sourceUuid}
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
        <h3 class="manager-card-title manager-essence-card-title">
          <i class="fas fa-code" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Essence.Macro.Heading', 'Macro on craft')}
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
              'Runs against the item data before it reaches the character’s inventory, and may rewrite its properties.'
            )}
      </p>

      {#if inheritable}
        <div class="manager-essence-inherit-slot">
          <InheritRow
            entityType="essence"
            section="macro"
            stateChip={false}
            headings={inheritHeadings}
            inherited={inheritedMap}
            notes={inheritNotes}
            disabled={saving}
            onToggle={onToggleInherit}
          />
        </div>
      {/if}

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
           gives that line to a useful sentence, so this does too; the address is the mono
           line issue 1372 adds, which is a different slot from the sub-line. -->
      {#if macroLocked}
        <!-- LOCKED, for the same reason and with the same consequence as the source card. -->
        <div class="manager-essence-locked-card" data-scoped-macro-locked="macro">
          <span class="manager-essence-locked-glyph" aria-hidden="true"
            ><i class="fas fa-code"></i></span
          >
          <span class="manager-essence-locked-copy">
            <span class="manager-essence-locked-value">
              {lockedMacroName ||
                lockedMacroUuid ||
                text('FABRICATE.Admin.Manager.Essence.Macro.Unnamed', 'the linked property macro')}
            </span>
            {#if lockedMacroUuid && lockedMacroUuid !== lockedMacroName}
              <code class="manager-essence-locked-uuid">{lockedMacroUuid}</code>
            {/if}
          </span>
          <StatusPill tone="subtle" icon="fas fa-globe" label={worldDefaultLabel} />
        </div>
      {:else}
        <ItemDropZone
          item={macroItem}
          kind="essence-macro"
          documentType="Macro"
          state={macroMissing ? 'missing' : 'linked'}
          disabled={saving}
          uuid={macroUuid && macroUuid !== macroItem?.name ? macroUuid : ''}
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
  /* THE INHERIT SWITCH'S OWN BOX. `InheritRow` renders a bare stacked row — head, note, switch —
     which is the right shape for a group of them under a heading. Inside a card it needs to read
     as a control strip rather than as more of the card's copy, so this slot gives it the
     reference's bordered row with the switch pulled to the trailing edge.

     `:global(...)` on every child selector because those elements are rendered by `InheritRow`,
     not by this component, and a scoped selector would carry this file's `svelte-<hash>` and
     match nothing. The SLOT keeps its scoping, so none of this escapes into another caller of
     the same row. */
  .manager-essence-inherit-slot {
    min-width: 0;
  }

  .manager-essence-inherit-slot :global(.manager-scoped-inherit-row) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .manager-essence-inherit-slot :global(.manager-scoped-inherit-head),
  .manager-essence-inherit-slot :global(.manager-scoped-inherit-note) {
    grid-column: 1;
  }

  .manager-essence-inherit-slot :global(.manager-status-toggle) {
    grid-column: 2;
    grid-row: 1 / -1;
  }

  /* THE LOCKED VALUE TILE. Static class names, so Svelte can prove each selector is used and
     `lint:svelte:warnings` stays at zero. It is deliberately NOT `ItemDropZone`: that primitive
     is a drop target in both of its states, and an inherited section must present no edit
     affordance at all. */
  .manager-essence-locked-card {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .manager-essence-locked-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-secondary);
  }

  .manager-essence-locked-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
    flex: 1 1 auto;
  }

  .manager-essence-locked-value {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.85rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-essence-locked-uuid {
    font-family: var(--fab-font-mono);
    font-size: 0.68rem;
    color: var(--fab-text-subtle);
    overflow-wrap: anywhere;
  }

  .manager-essence-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  /* SENTENCE CASE, AT FULL INK. See `SharedDefinitionCallout.svelte`'s twin of this rule for the
     whole argument: `.manager-card-title` is the manager's uppercase micro-label, the reference
     draws these two as `Active effect source` and `Macro on craft`, and the Checks Studio already
     set the precedent for retiring the treatment per-card rather than globally. Compounded so the
     rule is (0,3,0) against the global's (0,2,0). */
  .manager-card-title.manager-essence-card-title {
    color: var(--fab-text);
    font-size: 0.86rem;
    letter-spacing: 0;
    text-transform: none;
  }
</style>

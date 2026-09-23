<!--
  The essence editor's TWO BEHAVIOUR CARDS: what this essence carries onto a crafted result in THIS
  crafting system — an active-effect source, and a macro that runs on craft. It is the body of the
  `Essence rules` tab for a catalogued essence and of the `On craft` tab for a CREATE draft, with
  `scoped` carrying the difference and nothing else.

  ONE CARD WHEN LINKED, THE PICKER WHEN NOT, so the linked state looks as the Tool Studio's does.
  UNLINKED keeps `EssenceSourceSelector` because only the PICKER can offer the in-system component
  list: an essence source is a managed COMPONENT id, not a document uuid. Both states hand the drop
  handler the same raw Item payload, which the root resolves to a component.

  EACH CARD CARRIES ITS OWN INHERIT SWITCH, in a bordered row between the card's explanation and its
  value: the switch decides whether the value below it is this system's to change, and a GM reading
  a locked value must find the control that unlocks it without leaving the card. `InheritRow`
  renders the pair as a set, so this file asks for ONE section at a time.

  BOTH SECTIONS ARE GATED on their own system feature, and with both off the tab renders an
  explanatory empty state rather than a blank panel that reads as a broken screen. SUPPRESSION IS A
  STATE ON THE SECTION, NOT A REMOVAL, because a GM must see and change a link doing nothing.

  THE `type !== 'script'` REJECTION LIVES IN THE DROP HANDLER, not the predicate: a payload's `type`
  is the DOCUMENT NAME and the macro's own type needs `await fromUuid`. The check is
  `evaluateMacroDrop`; the WARNING is this surface's.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import ExplainerCard from '../ExplainerCard.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import InheritRow from '../scoped/InheritRow.svelte';
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
    // THE WORLD-SCOPE LOCK: whether this system INHERITS each section from the world default.
    // While it does, this system does not own the value, so the card renders read-only with no
    // drop zone, picker or unlink — their absence IS the lock — and the section's own inherit
    // switch is the one action that unlocks it. Defaults to all-false for a create draft.
    lockedSections = {},
    // The one-line summary of what each section resolves to: without it a row says "Inheriting the
    // world default" and never says what, while a row-count assertion passes green.
    inheritNotes = {},
    // WHAT A LOCKED CARD RENDERS: the WORLD DEFAULT, resolved by the editor, which holds the world
    // entry. Without it a locked card wore a `World default` pill over the DRAFT's own source and
    // macro — the fields the unlocked card edits, relabelled as the world's. Used ONLY by the two
    // locked branches, so an unlocked card is byte-identical to before.
    worldDefaults = {},
    // WHETHER THIS ESSENCE HAS A SHARED WORLD DEFINITION. `true` is the rules screen, where each
    // card carries its own switch and the tab drops the explainer; `false` is the CREATE draft,
    // which has no sections to inherit and keeps the explainer a first-time GM needs.
    scoped = false,
    // WHETHER THIS SYSTEM HAS A MEMBERSHIP RECORD to write a switch onto — separate from `scoped`,
    // because an unadopted essence still gets the rules screen's copy while a switch would write
    // to nothing and report a state it could not hold.
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

  // ONE pill shape for both sections. SUPPRESSION OUTRANKS INHERITANCE, because a disabled essence
  // carries nothing at all; an inherited section then reports the world default, and only a section
  // this system owns reports its own two states.
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

  // The linked source in `ItemDropZone`'s shape. `img` is what shows real item art rather than the
  // empty-drop glyph, so an unresolved link yields a fallback-icon card rather than no card: the
  // GM must be able to see and clear a link that no longer resolves.
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
    <!-- THE CREATE DRAFT'S PRIMER, dropped on the rules screen where each card explains itself
         and the shared-definition callout says which layer is which. -->
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
    <!-- THE CONTROL HALF of the validation row action. The `source` warning is about this card as
         a WHOLE: the value is reached through a drop zone, a picker or a locked tile by state, and
         none of the three is present in every failing state, so the card is the destination. It
         declares both the tabindex that makes focus real and the attribute Foundry reads. -->
    <section
      class="manager-edit-card"
      data-essence-section="effect-source"
      data-validation-target="essence-source"
      tabindex="-1"
      data-keyboard-focus="true"
    >
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
        <!-- LOCKED: a read-only tile states what resolves and whence, drawing no drop target,
             picker or unlink — that absence IS the lock. NESTED rather than flattened into one
             `{:else if}` chain, whose shape `essence-studio-fidelity.test.js` pins. -->
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
          <Chip tone="subtle" icon="fas fa-globe">{worldDefaultLabel}</Chip>
        </div>
      {:else}
        {#if sourceLinked}
          <!-- The Tool Studio's linked card, from the same primitive. The sub-line is the
             INSTRUCTION, not the uuid: the card IS the drop target, and the address has its own
             mono line above it. -->
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
          <!-- UNLINKED only. The PICK half is why `EssenceSourceSelector` survives: an essence
             source is an in-system managed component, so there is a list a document drop zone
             cannot offer. Rendering it beside the linked card said the same thing twice. -->
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
    <!-- THE CONTROL HALF for the `macro` row and its system-scope twin (issue 1517). Same shape
         and same reason as the effect-source card above; addressed as `essence-macro`. -->
    <section
      class="manager-edit-card"
      data-essence-section="macro"
      data-validation-target="essence-macro"
      tabindex="-1"
      data-keyboard-focus="true"
    >
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

      <!-- `documentType="Macro"` makes the shared drop zone accept a Macro, and `state="missing"`
           paints an unresolvable link as broken — otherwise indistinguishable from a working one,
           since at craft time such a uuid is logged and SKIPPED SILENTLY rather than toasting a
           player once per essence per result for a GM-side defect. -->
      <!-- `hint` is the INSTRUCTION, not the uuid, which `macroItem.name` falls back to when the
           macro does not resolve, so the card rendered it as title AND sub-line. -->
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
          <Chip tone="subtle" icon="fas fa-globe">{worldDefaultLabel}</Chip>
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
  /* THE INHERIT SWITCH'S OWN BOX: `InheritRow` renders a bare stacked row, right under a heading
     and wrong inside a card, so this slot gives it a bordered strip with the switch at the trailing
     edge. `:global(...)` on every child, because `InheritRow` writes those elements; the SLOT keeps
     its scoping, so none of it escapes. */
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

  /* THE LOCKED VALUE TILE, deliberately NOT `ItemDropZone`, which is a drop target in both of its
     states where an inherited section must present no edit affordance at all. */
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

  /* SENTENCE CASE, AT FULL INK — see `SharedDefinitionCallout.svelte`'s twin for the argument.
     Compounded so the rule is (0,3,0) against the global's (0,2,0). */
  .manager-card-title.manager-essence-card-title {
    color: var(--fab-text);
    font-size: 0.86rem;
    letter-spacing: 0;
    text-transform: none;
  }
</style>

<!-- Svelte 5 runes mode -->
<!--
  The essence editor's ON CRAFT tab (issue 1036): what this essence carries onto a crafted
  result — an active-effect source, and a property macro.

  ── THE TWO CARDS ARE STRUCTURALLY DIFFERENT, DELIBERATELY ────────────────────────
  The prototype draws them identically. They are not. The active-effect source is an
  in-system managed COMPONENT, so it stays `EssenceSourceSelector`; the property macro is a
  document uuid, so it is `ItemDropZone` with `documentType="Macro"`. Making the source a
  drop zone would ask the GM to drop an Item where the model stores a component id.

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
    onSourceSelect = () => {},
    onSourceDrop = () => {},
    onSourceClear = () => {},
    onMacroDrop = () => {},
    onMacroUnlink = () => {},
  } = $props();

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

      {#if selectedSource || sourceComponentId || storedSourceName}
        <div class="manager-essence-source-summary">
          {#if selectedSource}
            <img
              class="manager-essence-source-thumb"
              src={selectedSource.img || 'icons/svg/item-bag.svg'}
              alt=""
            />
          {:else}
            <span class="manager-essence-source-thumb is-empty" aria-hidden="true">
              <i class="fas fa-link"></i>
            </span>
          {/if}
          <div class="manager-essence-source-copy">
            <strong>{selectedSource?.name || storedSourceName || sourceComponentId}</strong>
            <p class="manager-muted">
              {selectedSource?.originItemUuid ||
                text(
                  'FABRICATE.Admin.Manager.Essence.SourceNoUuid',
                  'This component has no source item UUID.'
                )}
            </p>
          </div>
          <button
            type="button"
            class="manager-icon-button"
            data-essence-source-clear
            aria-label={text(
              'FABRICATE.Admin.Features.Essences.ClearSourceItem',
              'Remove source item'
            )}
            title={text('FABRICATE.Admin.Features.Essences.ClearSourceItem', 'Remove source item')}
            onclick={() => onSourceClear()}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {/if}

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
      <ItemDropZone
        item={macroItem}
        kind="essence-macro"
        documentType="Macro"
        state={macroMissing ? 'missing' : 'linked'}
        disabled={saving}
        title={text('FABRICATE.Admin.Manager.Essence.Macro.DropTitle', 'Drop a script macro here')}
        hint={macroUuid}
        subline={macroMissing
          ? text(
              'FABRICATE.Admin.Manager.Essence.Macro.Missing',
              'This macro no longer resolves, so it will be skipped at craft time.'
            )
          : ''}
        unlinkLabel={text('FABRICATE.Admin.Manager.Essence.Macro.Unlink', 'Unlink macro')}
        onDrop={onMacroDrop}
        onUnlink={macroUuid ? onMacroUnlink : null}
      />
      {#if macroWarning}
        <p class="manager-validation-error" role="alert" data-essence-macro-warning>
          {macroWarning}
        </p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .manager-essence-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>

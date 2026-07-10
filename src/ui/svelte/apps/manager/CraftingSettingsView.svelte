<!-- Svelte 5 runes mode -->
<!--
  Crafting > Settings page (issue 511, PR-B redesign). The system-level crafting
  rules that used to live on the System Overview page, re-laid-out to match the
  Books & Scrolls prototype's "Crafting settings" screen: a main column carrying
  the Recipe resolution and Recipe visibility radio-card grids (plus the salvage
  resolution card when the salvage feature is on) and a right-hand "Effect on this
  system" panel that reads the conditional surface each visibility mode produces.

  Live-apply: resolution changes route through the store's confirm-then-migrate
  flow (reverting the radio if the GM cancels), while the visibility card applies
  each mode immediately and non-destructively (no revert). Per-recipe-item use/
  learn caps are NOT here — they are authored per item on the Books & Scrolls page.

  Props:
   - selectedSystem: the projected selected crafting system. Exposes
     `resolutionMode`, `salvageResolutionMode`, `visibilityMode`, `features` and
     the resolved `craftingEffect` (flags + summaryKey).
   - onSetResolutionMode(mode): confirm + migrate; resolves false when cancelled.
   - onSetSalvageResolutionMode(mode): confirm; resolves false when cancelled.
   - onSetVisibilityMode(mode): live-apply the visibility mode (non-destructive).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ResolutionModeCard from './ResolutionModeCard.svelte';
  import CraftingEffectPanel from './CraftingEffectPanel.svelte';
  import { resolutionModeOptions, salvageResolutionModeOptions } from './resolutionModeOptions.js';

  let {
    selectedSystem = null,
    onSetResolutionMode = () => {},
    onSetSalvageResolutionMode = () => {},
    onSetVisibilityMode = () => {},
    onSetAlchemyCheckMode = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The alchemy check-mode sub-setting (shown only for alchemy systems), nested
  // under Recipe Resolution: none (no check), simple (mandatory pass/fail; a
  // reserved failure result set), or tiered (mandatory routed check, like
  // routed-by-check). Drives whether the crafting check is mandatory and how a
  // matched brew's result set is selected.
  const alchemyCheckModeOptions = [
    {
      value: 'none',
      icon: 'fas fa-circle-check',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNone',
      fallback: 'No check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNoneDesc',
      descFallback: 'A matched brew always succeeds and produces its single result set. No crafting check.'
    },
    {
      value: 'simple',
      icon: 'fas fa-dice-d20',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple',
      fallback: 'Simple check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimpleDesc',
      descFallback: 'A mandatory pass/fail check. On a pass the success result set is produced; on a fail the reserved failure result set is.'
    },
    {
      value: 'tiered',
      icon: 'fas fa-layer-group',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTiered',
      fallback: 'Tiered check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTieredDesc',
      descFallback: 'A mandatory routed check. Each success outcome tier routes to its assigned result set, exactly like routed-by-check.'
    }
  ];

  // The recipe-visibility radio-card options. `global | restricted | item |
  // knowledge` mirror the visibility matrix; icons/copy follow the prototype.
  // The shared ResolutionModeCard renders label + description per option; the
  // `icon` field rides along for parity with the design (and any future icon-aware
  // card variant) and is harmlessly ignored by the current primitive.
  const visibilityModeOptions = [
    {
      value: 'global',
      icon: 'fas fa-globe',
      labelKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.Global',
      fallback: 'Global',
      descKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.GlobalDesc',
      descFallback: 'Every player and character sees all recipes. Nothing is gated.'
    },
    {
      value: 'restricted',
      icon: 'fas fa-user-lock',
      labelKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.Restricted',
      fallback: 'Restricted',
      descKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.RestrictedDesc',
      descFallback: 'Recipes can be made visible to specific characters or players.'
    },
    {
      value: 'item',
      icon: 'fas fa-box-open',
      labelKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.Item',
      fallback: 'Item',
      descKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.ItemDesc',
      descFallback:
        'A character must have the item in their pack. Only mode where limited use appears in the Books & Scrolls editor.'
    },
    {
      value: 'knowledge',
      icon: 'fas fa-graduation-cap',
      labelKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.Knowledge',
      fallback: 'Knowledge',
      descKey: 'FABRICATE.Admin.Manager.Crafting.Visibility.KnowledgeDesc',
      descFallback:
        'A character must learn the recipe from a scroll or book using the item. Only mode where learning limits appear in the Books & Scrolls editor.'
    }
  ];

  // Per-mode fallback copy for the effect summary strip; keyed by visibility mode
  // and resolved through the projected `craftingEffect.summaryKey`.
  const summaryFallbacks = {
    global: 'Every recipe is visible to all players.',
    restricted: 'Grant recipes to specific characters or players in the Access tab.',
    item: 'Players craft from recipes only while holding the linked item.',
    knowledge:
      'Players learn recipes by reading books and scrolls. Configure learning limits in the Books & Scrolls editor.'
  };

  let systemResolutionModeValue = $state('simple');
  let systemSalvageResolutionModeValue = $state('simple');

  $effect(() => {
    systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    systemSalvageResolutionModeValue = selectedSystem?.salvageResolutionMode ?? 'simple';
  });

  const visibilityMode = $derived(selectedSystem?.visibilityMode ?? 'knowledge');
  const craftingEffect = $derived(selectedSystem?.craftingEffect ?? {});
  const effectSummary = $derived(
    text(craftingEffect?.summaryKey, summaryFallbacks[visibilityMode] ?? summaryFallbacks.knowledge)
  );

  async function handleResolutionModeChange(nextValue) {
    const nextMode = nextValue || 'simple';
    systemResolutionModeValue = nextMode;
    const didApply = await onSetResolutionMode(nextMode);
    if (didApply === false) {
      systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    }
  }

  async function handleSalvageResolutionModeChange(nextValue) {
    const previousValue = systemSalvageResolutionModeValue;
    const nextMode = nextValue || 'progressive';
    systemSalvageResolutionModeValue = nextMode;
    const didApply = await onSetSalvageResolutionMode(nextMode);
    if (didApply === false) {
      systemSalvageResolutionModeValue = previousValue;
    }
  }
</script>

{#if selectedSystem}
  <main
    class="manager-main manager-crafting-settings-main"
    data-crafting-settings
    aria-label={text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle', 'Crafting settings')}
  >
    <div class="crafting-settings-layout">
      <div class="crafting-settings-content">
        <section class="manager-section-header">
          <div class="manager-heading">
            <p class="manager-kicker">{selectedSystem.name}</p>
            <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle', 'Crafting settings')}</h2>
            <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Crafting.Settings.Subtitle', 'Control how players get access to the recipes in this system.')}</p>
          </div>
        </section>

        <div class="crafting-settings-body">
          <section class="crafting-settings-section" data-crafting-resolution-section>
            <div class="crafting-settings-section-head">
              <i class="fas fa-diagram-project" aria-hidden="true"></i>
              <h3 class="crafting-settings-section-title">{text('FABRICATE.Admin.Manager.Crafting.Settings.ResolutionHeading', 'Recipe resolution')}</h3>
            </div>
            <p class="crafting-settings-section-intro">{text('FABRICATE.Admin.Manager.Crafting.Settings.ResolutionIntro', 'Choose how a crafting attempt is turned into a result. Applies to every recipe in the system.')}</p>
            <ResolutionModeCard
              cardId="manager-crafting-resolution-mode"
              legendKey="FABRICATE.Admin.SystemSettings.ResolutionMode"
              legendFallback="Recipe resolution mode"
              hintKey="FABRICATE.Admin.Manager.SystemEdit.ResolutionModeHint"
              hintFallback="Changing resolution mode migrates recipes to the new mode where possible and only deletes recipes that cannot be migrated, after a confirmation that reports the counts."
              options={resolutionModeOptions}
              selectedValue={systemResolutionModeValue}
              groupName="manager-crafting-resolution-mode"
              dataAttr="data-crafting-resolution-mode"
              optionDataAttr="data-crafting-resolution-mode-option"
              variant="config-card"
              onChange={handleResolutionModeChange}
            />

            {#if selectedSystem.resolutionMode === 'alchemy'}
              <div class="crafting-settings-subsection" data-crafting-alchemy-checkmode-section>
                <div class="crafting-settings-subsection-head">
                  <i class="fas fa-flask" aria-hidden="true"></i>
                  <h4 class="crafting-settings-subsection-title">{text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading', 'Alchemy check')}</h4>
                </div>
                <p class="crafting-settings-subsection-intro">{text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeIntro', 'Choose how a matched brew is resolved: with no check, a simple pass/fail check, or a tiered routed check.')}</p>
                <ResolutionModeCard
                  cardId="manager-crafting-alchemy-checkmode"
                  legendKey="FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading"
                  legendFallback="Alchemy check"
                  options={alchemyCheckModeOptions}
                  selectedValue={selectedSystem.alchemy?.checkMode ?? 'none'}
                  groupName="manager-crafting-alchemy-checkmode"
                  dataAttr="data-crafting-alchemy-checkmode"
                  optionDataAttr="data-crafting-alchemy-checkmode-option"
                  variant="config-card"
                  onChange={(mode) => onSetAlchemyCheckMode(mode)}
                />
              </div>
            {/if}
          </section>

          <section class="crafting-settings-section" data-crafting-visibility-section>
            <div class="crafting-settings-section-head">
              <i class="fas fa-eye" aria-hidden="true"></i>
              <h3 class="crafting-settings-section-title">{text('FABRICATE.Admin.Manager.Crafting.Settings.VisibilityHeading', 'Recipe visibility')}</h3>
            </div>
            <p class="crafting-settings-section-intro">{text('FABRICATE.Admin.Manager.Crafting.Settings.VisibilityIntro', 'Pick how a recipe becomes available to a character. Exactly one mode is active for the whole system.')}</p>
            <ResolutionModeCard
              cardId="manager-crafting-visibility-mode"
              legendKey="FABRICATE.Admin.Manager.Crafting.Settings.VisibilityHeading"
              legendFallback="Recipe visibility"
              options={visibilityModeOptions}
              selectedValue={visibilityMode}
              groupName="manager-crafting-visibility-mode"
              dataAttr="data-crafting-visibility-mode"
              optionDataAttr="data-crafting-visibility-mode-option"
              variant="config-card"
              onChange={(mode) => onSetVisibilityMode(mode)}
            />
          </section>

          {#if selectedSystem.features?.salvage === true}
            <section class="crafting-settings-section is-compact" data-crafting-salvage-section>
              <div class="crafting-settings-section-head">
                <i class="fas fa-recycle" aria-hidden="true"></i>
                <h3 class="crafting-settings-section-title">{text('FABRICATE.Admin.SystemSettings.SalvageResolutionMode', 'Salvage resolution mode')}</h3>
              </div>
              <p class="crafting-settings-section-intro">{text('FABRICATE.Admin.Manager.Crafting.Settings.SalvageIntro', 'Choose how a salvage attempt is turned into returned components.')}</p>
              <ResolutionModeCard
                cardId="manager-crafting-salvage-resolution-mode"
                legendKey="FABRICATE.Admin.SystemSettings.SalvageResolutionMode"
                legendFallback="Salvage resolution mode"
                hintKey="FABRICATE.Admin.SystemSettings.SalvageResolutionModeHint"
                hintFallback="Salvage has one ingredient, so only progressive and routed-by-check apply. Components incompatible with the new salvage mode will have salvage disabled."
                options={salvageResolutionModeOptions}
                selectedValue={systemSalvageResolutionModeValue}
                groupName="manager-crafting-salvage-resolution-mode"
                dataAttr="data-crafting-salvage-resolution-mode"
                optionDataAttr="data-crafting-salvage-resolution-mode-option"
                variant="config-card"
                onChange={handleSalvageResolutionModeChange}
              />
            </section>
          {/if}
        </div>
      </div>

      <aside class="crafting-settings-context" data-crafting-settings-context>
        <CraftingEffectPanel effect={craftingEffect} summary={effectSummary} />
      </aside>
    </div>
  </main>
{/if}

<style>
  .crafting-settings-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .crafting-settings-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--fab-mv2-border);
    overflow-y: auto;
  }

  .crafting-settings-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-5);
    padding: var(--fab-space-5);
    min-width: 0;
  }

  .crafting-settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .crafting-settings-section:not(:last-child) {
    padding-bottom: var(--fab-space-5);
    border-bottom: 1px solid var(--fab-mv2-border);
  }

  .crafting-settings-section-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .crafting-settings-section-head > i {
    color: var(--fab-mv2-accent);
    font-size: 0.85rem;
  }

  .crafting-settings-section-title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: 1rem;
    font-weight: 600;
    color: var(--fab-mv2-text);
  }

  .crafting-settings-section-intro {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--fab-text-muted);
  }

  /* Nested alchemy check-mode sub-setting, indented under Recipe resolution. */
  .crafting-settings-subsection {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    margin-top: var(--fab-space-3);
    margin-left: var(--fab-space-4);
    padding-left: var(--fab-space-4);
    border-left: 2px solid var(--fab-mv2-border);
    min-width: 0;
  }

  .crafting-settings-subsection-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .crafting-settings-subsection-head > i {
    color: var(--fab-mv2-accent);
    font-size: 0.8rem;
  }

  .crafting-settings-subsection-title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--fab-mv2-text);
  }

  .crafting-settings-subsection-intro {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .crafting-settings-section.is-compact .crafting-settings-section-title {
    font-size: 0.9rem;
  }

  /* The shared ResolutionModeCard always renders a <legend> for its accessible
     name; here the visible heading is the section <h3> above it, so the legend is
     collapsed to a screen-reader-only label to avoid a doubled title. */
  .crafting-settings-section :global(.manager-resolution-mode-legend) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .crafting-settings-context {
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
    background: var(--fab-mv2-surface-2);
    overflow-y: auto;
  }

  /* Key the collapse off the manager SHELL width (`fabricate-manager` container),
     not the viewport — a Foundry window resizes independently of the browser viewport,
     so a viewport @media never fires when the GM shrinks the Fabricate window. */
  @container fabricate-manager (max-width: 900px) {
    .crafting-settings-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .crafting-settings-content {
      border-right: 0;
    }

    .crafting-settings-context {
      border-top: 1px solid var(--fab-mv2-border);
    }
  }
</style>

<!-- Svelte 5 runes mode -->
<!--
  Checks view shell.

  Mirrors the gathering environment editor layout: a full-width tab strip
  (Crafting / Salvage / Gathering / Validation) above a workspace split into a
  central column and a right context menu. Crafting is the default tab.

  A system has exactly one crafting, one salvage, and one gathering check — each
  a singleton whose shape is determined by the system's resolution mode (and
  preserved per mode when modes are switched). So each check tab is a single
  editor page, not a list: there is no create action and no "no checks yet"
  empty state. The Crafting, Salvage, and Gathering tabs show the right context
  menu (docs help); Validation spans the full width with no menu. Placeholder
  content for this first iteration.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../ToggleCard.svelte';
  import ChecksEditorTabs from './ChecksEditorTabs.svelte';
  import ChecksRightMenu from './ChecksRightMenu.svelte';
  import CraftingCheckEditor from './CraftingCheckEditor.svelte';
  import SimpleCraftingCheckEditor from './SimpleCraftingCheckEditor.svelte';
  import ProgressiveCraftingCheckEditor from './ProgressiveCraftingCheckEditor.svelte';
  import CraftingModifierCatalogueCard from './CraftingModifierCatalogueCard.svelte';
  import ChecksValidationTab from './ChecksValidationTab.svelte';

  // `resolutionMode` is the selected system's recipe resolution mode and selects
  // which crafting check editor renders: routed → the outcome-tier editor;
  // simple/alchemy → the simple pass/fail editor; progressive → the formula +
  // crit editor (no DC). `craftingCheck` is the routed draft, `craftingCheckSimple`
  // the simple draft, and `craftingCheckProgressive` the progressive draft (all
  // owned/persisted by the manager root), each with a matching update callback.
  // `salvageResolutionMode` + the salvage drafts drive the Salvage tab's editor
  // (simple/routed reuse the crafting editors with recipe-specific bits hidden;
  // progressive reuses the crafting progressive editor). `onTabChange` notifies the
  // root which check sub-tab is active so the shared header Save persists the right draft.
  let {
    resolutionMode = 'simple',
    alchemyCheckMode = 'none',
    craftingCheck = null,
    craftingCheckSimple = null,
    craftingCheckProgressive = null,
    // Failure consumption policy (issue 712): the system-level `craftingCheck.consumption`
    // block ({ consumeIngredientsOnFail, breakToolsOnFail }), edited by two live-persisting
    // toggles in the non-alchemy crafting sub-tab. The engine applies it on every failed
    // crafting check (and mirrors it for salvage); alchemy resolves consumption through its
    // own `consumeOnFail` flag instead, so these toggles are hidden in alchemy mode.
    craftingConsumption = null,
    // Per-recipe check-modifier catalogue + default policy (issue 770): the crafting-
    // owned `craftingCheck.checkModifiers` catalogue, `defaultModifierPolicy`, and
    // `defaultModifierIds`, edited in a card beside the failure-consumption card and
    // persisted live via `onUpdateCraftingCheckModifiers`. Only shown when the active
    // crafting check is usable (has an authored roll formula).
    craftingCheckModifiers = [],
    craftingDefaultModifierPolicy = 'addAll',
    craftingDefaultModifierIds = [],
    // Alchemy behaviour flags (issue 713): the three system-level alchemy flags the engine
    // already honours. Restored as live-persisting toggles below the alchemy check-mode
    // selector. Defaults mirror the manager normalizer (learnOnCraft OFF; consumeOnFail and
    // showAttemptHistoryToPlayers ON).
    alchemyLearnOnCraft = false,
    alchemyConsumeOnFail = true,
    alchemyShowAttemptHistory = true,
    salvageResolutionMode = 'simple',
    salvageCheckSimple = null,
    salvageCheckRouted = null,
    salvageCheckProgressive = null,
    gatheringResolutionMode = 'd100',
    gatheringCheckProgressive = null,
    gatheringCheckRouted = null,
    // Tool-breakage authority (issue 419): each editor always shows the unified
    // CheckTriggers editor; under `checkDriven` it also exposes the per-trigger
    // break-tools toggle.
    breakageAuthority = 'toolSpecific',
    // Feature flags gate which subsystem check-breakage controls are reachable:
    // salvage is always on; gathering only when features.gathering === true.
    features = {},
    activation = {},
    onUpdateCraftingCheck = () => {},
    onUpdateCraftingCheckSimple = () => {},
    onUpdateCraftingCheckProgressive = () => {},
    onUpdateSalvageCheckSimple = () => {},
    onUpdateSalvageCheckRouted = () => {},
    onUpdateSalvageCheckProgressive = () => {},
    onUpdateGatheringCheckProgressive = () => {},
    onUpdateGatheringCheckRouted = () => {},
    onSetAlchemyCheckMode = () => {},
    onUpdateCraftingConsumption = () => {},
    onUpdateCraftingCheckModifiers = () => {},
    onUpdateAlchemyFlags = () => {},
    onTabChange = () => {},
    onToggleCheckActive = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The system-level alchemy check-mode selector (issue 554). For an alchemy
  // system this renders at the TOP of the Crafting sub-tab, above the per-mode
  // editor: none (no check → the read-only "resolves without a check" notice),
  // simple (the pass/fail editor), or tiered (the routed outcome-tier editor).
  // Selecting a mode persists live via `onSetAlchemyCheckMode` (spread + refresh
  // in the store), swapping the editor below. Labels/copy reuse the shared
  // SystemSettings.Alchemy.CheckMode* strings.
  const ALCHEMY_CHECK_MODE_OPTIONS = [
    {
      value: 'none',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNone',
      fallback: 'No check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNoneDesc',
      descFallback:
        'A matched brew always succeeds and produces its single result set. No crafting check.'
    },
    {
      value: 'simple',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple',
      fallback: 'Simple check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimpleDesc',
      descFallback:
        'A mandatory pass/fail check. On a pass the success result set is produced; on a fail the reserved failure result set is.'
    },
    {
      value: 'tiered',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTiered',
      fallback: 'Tiered check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTieredDesc',
      descFallback:
        'A mandatory routed check. Each success outcome tier routes to its assigned result set, exactly like routed-by-check.'
    }
  ];

  // Failure consumption policy toggle states (issue 712). `consumeIngredientsOnFail`
  // defaults ON (`!== false`), `breakToolsOnFail` defaults OFF (`=== true`), matching
  // the manager normalizer so an authored-OFF system does not read back ON.
  const consumeIngredientsOnFail = $derived(craftingConsumption?.consumeIngredientsOnFail !== false);
  const breakToolsOnFail = $derived(craftingConsumption?.breakToolsOnFail === true);

  let activeTab = $state('crafting');

  // Only `routedByCheck` uses the tier-routing CraftingCheckEditor. `routedByIngredients`
  // authors its optional pass/fail check via the shared SimpleCraftingCheckEditor
  // (bound to `craftingCheck.simple`), alongside `simple`/`alchemy`.
  // Alchemy is handled by a dedicated first branch in the crafting render (a top-of-tab
  // none/simple/tiered selector above the matching editor), so `craftingAlchemy` wins
  // before `craftingRouted`/`craftingSimple` can match. Those two deriveds still include
  // the alchemy cases so `validationSections` selects the right draft (routed for tiered,
  // simple for simple) — do not tighten them without re-checking that.
  const craftingAlchemy = $derived(resolutionMode === 'alchemy');
  const craftingRouted = $derived(
    resolutionMode === 'routedByCheck' || (craftingAlchemy && alchemyCheckMode === 'tiered')
  );
  const craftingSimple = $derived(
    resolutionMode === 'simple' ||
      resolutionMode === 'routedByIngredients' ||
      (craftingAlchemy && alchemyCheckMode === 'simple')
  );
  const craftingProgressive = $derived(resolutionMode === 'progressive');

  // The active non-alchemy crafting check's authored roll formula: a check is usable
  // iff it has an authored rollFormula (issue 770 gate for the modifier catalogue).
  const craftingCheckUsable = $derived(
    (craftingRouted
      ? craftingCheck?.rollFormula
      : craftingProgressive
        ? craftingCheckProgressive?.rollFormula
        : craftingCheckSimple?.rollFormula
    )?.trim?.().length > 0
  );
  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageSimple = $derived(
    salvageResolutionMode === 'simple' || salvageResolutionMode === 'alchemy'
  );
  // The gathering check's shape is the gathering economy's resolution mode. d100
  // is the fixed roll (read-only, no editor); progressive/routed are editable.
  const gatheringD100 = $derived(gatheringResolutionMode === 'd100');
  const gatheringProgressive = $derived(gatheringResolutionMode === 'progressive');
  const gatheringRouted = $derived(gatheringResolutionMode === 'routed');

  // Salvage and gathering are optional features: their tabs are hidden when off (and
  // salvage is not validated when off). The system keeps its config for when each is
  // re-enabled. Salvage defaults on; gathering is opt-in (defaults off).
  const salvageEnabled = $derived(features?.salvage !== false);
  const gatheringEnabled = $derived(features?.gathering === true);
  // If a feature is disabled while its tab is open (or a system without it loads),
  // fall back to the crafting tab so no empty panel shows.
  $effect(() => {
    if (!salvageEnabled && activeTab === 'salvage') activeTab = 'crafting';
    if (!gatheringEnabled && activeTab === 'gathering') activeTab = 'crafting';
  });

  // Subsystem-gated breakage authority. Crafting honours the system authority;
  // salvage and gathering only do so when their feature is enabled — otherwise they
  // stay toolSpecific.
  const craftingBreakageAuthority = $derived(breakageAuthority);
  const salvageBreakageAuthority = $derived(salvageEnabled ? breakageAuthority : 'toolSpecific');
  const gatheringBreakageAuthority = $derived(
    features?.gathering === true ? breakageAuthority : 'toolSpecific'
  );

  const PAGES = {
    crafting: {
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.PageTitle', 'Crafting check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.PageLead',
        "A system has a single crafting check. Its shape is determined by the system's resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ConfigHint',
        'Roll, difficulty, and outcome settings for the crafting check will appear here.'
      )
    },
    salvage: {
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.PageTitle', 'Salvage check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.PageLead',
        "A system has a single salvage check. Its shape is determined by the system's salvage resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.ConfigHint',
        'Roll, difficulty, and outcome settings for the salvage check will appear here.'
      )
    },
    gathering: {
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.PageTitle', 'Gathering check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.PageLead',
        'A system has a single gathering check. In d100 mode it is the fixed d100 roll and is not editable; progressive and routed modes let you define it. Per-task tuning adjusts the difficulty, not the roll.'
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.ConfigHint',
        'Roll, difficulty, and outcome settings for the gathering check will appear here.'
      )
    }
  };

  // The Validation tab aggregates per-check validation: one section per in-play
  // subsystem, each evaluated against its active draft and resolution mode. Salvage
  // is omitted when its feature is off; gathering when off or in the read-only d100
  // roll (which has nothing to author). The active draft per subsystem matches the
  // editor selection above, so the tab validates exactly what the GM is editing.
  const validationSections = $derived.by(() => {
    const list = [
      {
        subsystem: 'crafting',
        mode: resolutionMode,
        check: craftingRouted
          ? craftingCheck
          : craftingProgressive
            ? craftingCheckProgressive
            : craftingCheckSimple
      }
    ];
    if (salvageEnabled) {
      list.push({
        subsystem: 'salvage',
        mode: salvageResolutionMode,
        check: salvageRouted
          ? salvageCheckRouted
          : salvageProgressive
            ? salvageCheckProgressive
            : salvageCheckSimple
      });
    }
    if (gatheringEnabled && !gatheringD100) {
      list.push({
        subsystem: 'gathering',
        mode: gatheringResolutionMode,
        check: gatheringProgressive ? gatheringCheckProgressive : gatheringCheckRouted
      });
    }
    return list;
  });

  const configTitle = text('FABRICATE.Admin.Manager.Checks.Configuration', 'Configuration');
  const pageKicker = text('FABRICATE.Admin.Manager.Checks.PageKicker', 'One per system');
  const page = $derived(PAGES[activeTab] || PAGES.crafting);
  const hasMenu = $derived(activeTab !== 'validation');
</script>

<div class="manager-environment-edit-view" data-environment-editor data-checks-editor>
  <ChecksEditorTabs {activeTab} showSalvage={salvageEnabled} showGathering={gatheringEnabled} onSelect={(tab) => { activeTab = tab; onTabChange(tab); }} />

  <div class="manager-environment-workspace" class:is-inspector-hidden={!hasMenu}>
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activeTab}`}
      aria-labelledby={`checks-tab-${activeTab}`}
    >
      {#if activeTab === 'validation'}
        <ChecksValidationTab sections={validationSections} />
      {:else if activeTab === 'crafting' && craftingAlchemy}
        <div class="manager-checks-page" data-checks-panel="crafting">
          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading', 'Alchemy check')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeIntro', 'Choose how a matched brew is resolved: with no check, a simple pass/fail check, or a tiered routed check.')}</p>
            <div
              class="manager-checks-type-options"
              role="radiogroup"
              data-crafting-alchemy-checkmode
              aria-label={text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading', 'Alchemy check')}
            >
              {#each ALCHEMY_CHECK_MODE_OPTIONS as option (option.value)}
                <label
                  class={`manager-resolution-option ${alchemyCheckMode === option.value ? 'is-active' : ''}`}
                  data-crafting-alchemy-checkmode-option={option.value}
                >
                  <input
                    type="radio"
                    name="crafting-alchemy-checkmode"
                    value={option.value}
                    checked={alchemyCheckMode === option.value}
                    onchange={() => onSetAlchemyCheckMode(option.value)}
                  />
                  <span class="manager-resolution-option-body">
                    <span class="manager-resolution-option-name">{text(option.labelKey, option.fallback)}</span>
                    <span class="manager-resolution-option-desc">{text(option.descKey, option.descFallback)}</span>
                  </span>
                </label>
              {/each}
            </div>
          </section>

          <section class="manager-inspector-card" data-alchemy-behaviour>
            <h3 class="manager-card-title">{text('FABRICATE.Admin.SystemSettings.Alchemy.BehaviourHeading', 'Alchemy behaviour')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.SystemSettings.Alchemy.BehaviourIntro', 'How brewing rewards discovery, treats failed attempts, and remembers dead ends. These apply regardless of the check mode above.')}</p>
            <div class="manager-checks-flag-list">
              <ToggleCard
                variant="is-info"
                icon="fas fa-book-sparkles"
                section="alchemy-learn-on-craft"
                field="learnOnCraft"
                title={text('FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraft', 'Learn a recipe when its ingredients are matched')}
                sub={text('FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraftDesc', 'A matched brew records the recipe as discovered for that player, whether the check passes or fails. Off by default.')}
                toggleLabel={text('FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraft', 'Learn a recipe when its ingredients are matched')}
                on={alchemyLearnOnCraft}
                onToggle={(next) => onUpdateAlchemyFlags({ learnOnCraft: next })}
              />
              <ToggleCard
                variant="is-info"
                icon="fas fa-fire-flame-curved"
                section="alchemy-consume-on-fail"
                field="consumeOnFail"
                title={text('FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFail', 'Consume ingredients on a failed brew')}
                sub={text('FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFailDesc', 'A matched brew that fails its check consumes the submitted ingredients, the same as an unmatched fizzle. On by default.')}
                toggleLabel={text('FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFail', 'Consume ingredients on a failed brew')}
                on={alchemyConsumeOnFail}
                onToggle={(next) => onUpdateAlchemyFlags({ consumeOnFail: next })}
              />
              <ToggleCard
                variant="is-info"
                icon="fas fa-clock-rotate-left"
                section="alchemy-show-attempt-history"
                field="showAttemptHistoryToPlayers"
                title={text('FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistory', 'Show attempt history to players')}
                sub={text('FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistoryDesc', 'Record dead-end attempts so a player sees which ingredient combinations produced no reaction. On by default.')}
                toggleLabel={text('FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistory', 'Show attempt history to players')}
                on={alchemyShowAttemptHistory}
                onToggle={(next) => onUpdateAlchemyFlags({ showAttemptHistoryToPlayers: next })}
              />
            </div>
          </section>

          {#if alchemyCheckMode === 'tiered'}
            <CraftingCheckEditor value={craftingCheck} {resolutionMode} allowNatStepping breakageAuthority={craftingBreakageAuthority} onChange={onUpdateCraftingCheck} />
          {:else if alchemyCheckMode === 'simple'}
            <SimpleCraftingCheckEditor value={craftingCheckSimple} breakageAuthority={craftingBreakageAuthority} onChange={onUpdateCraftingCheckSimple} />
          {:else}
            <section class="manager-inspector-card" data-alchemy-none-readonly>
              <p class="manager-kicker">{pageKicker}</p>
              <h2 class="manager-card-title">
                {text('FABRICATE.Admin.Manager.Checks.Crafting.AlchemyNoneTitle', 'Resolves without a check')}
              </h2>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.AlchemyNoneLead',
                  'This alchemy system is set to “No check”, so a matched brew always succeeds and produces its single result set. There is nothing to configure here. Choose Simple or Tiered above to author a crafting check.'
                )}
              </p>
            </section>
          {/if}
        </div>
      {:else if activeTab === 'crafting' && (craftingRouted || craftingSimple || craftingProgressive)}
        <!-- Non-alchemy crafting: the per-mode editor plus the system-level failure
             consumption policy (issue 712). The wrapper keeps `data-checks-panel="crafting"`
             (the tests key on it) but deliberately NOT the `manager-checks-page` class,
             which the routed test asserts is absent once the editor renders. -->
        <div class="manager-checks-editor-stack" data-checks-panel="crafting">
          {#if craftingRouted}
            <CraftingCheckEditor value={craftingCheck} {resolutionMode} allowNatStepping breakageAuthority={craftingBreakageAuthority} onChange={onUpdateCraftingCheck} />
          {:else if craftingSimple}
            <SimpleCraftingCheckEditor value={craftingCheckSimple} breakageAuthority={craftingBreakageAuthority} onChange={onUpdateCraftingCheckSimple} />
          {:else}
            <ProgressiveCraftingCheckEditor value={craftingCheckProgressive} breakageAuthority={craftingBreakageAuthority} onChange={onUpdateCraftingCheckProgressive} />
          {/if}

          <section class="manager-inspector-card" data-failure-consumption>
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.FailureConsumptionHeading', 'Failure consumption policy')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Checks.Crafting.FailureConsumptionIntro', 'What happens to a recipe’s ingredients and tools when its crafting check fails. Salvage failures follow their own separate policy.')}</p>
            <div class="manager-checks-flag-list">
              <ToggleCard
                variant="is-info"
                icon="fas fa-fire-flame-curved"
                section="failure-consume-ingredients"
                field="consumeIngredientsOnFail"
                title={text('FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFail', 'Consume ingredients on a failed check')}
                sub={text('FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFailDesc', 'The recipe’s ingredients are used up even when the crafting check fails. On by default.')}
                toggleLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFail', 'Consume ingredients on a failed check')}
                on={consumeIngredientsOnFail}
                onToggle={(next) => onUpdateCraftingConsumption({ consumeIngredientsOnFail: next })}
              />
              <ToggleCard
                variant="is-info"
                icon="fas fa-hammer-crash"
                section="failure-break-tools"
                field="breakToolsOnFail"
                title={text('FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFail', 'Break tools on a failed check')}
                sub={text('FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFailDesc', 'Required tools break when the crafting check fails. Off by default.')}
                toggleLabel={text('FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFail', 'Break tools on a failed check')}
                on={breakToolsOnFail}
                onToggle={(next) => onUpdateCraftingConsumption({ breakToolsOnFail: next })}
              />
            </div>
          </section>

          {#if craftingCheckUsable}
            <CraftingModifierCatalogueCard
              checkModifiers={craftingCheckModifiers}
              defaultModifierPolicy={craftingDefaultModifierPolicy}
              defaultModifierIds={craftingDefaultModifierIds}
              onChange={onUpdateCraftingCheckModifiers}
            />
          {/if}
        </div>
      {:else if activeTab === 'salvage' && salvageRouted}
        <div data-checks-panel="salvage">
          <CraftingCheckEditor value={salvageCheckRouted} showTiers={false} allowNatStepping breakageAuthority={salvageBreakageAuthority} onChange={onUpdateSalvageCheckRouted} />
        </div>
      {:else if activeTab === 'salvage' && salvageProgressive}
        <div data-checks-panel="salvage">
          <ProgressiveCraftingCheckEditor value={salvageCheckProgressive} breakageAuthority={salvageBreakageAuthority} onChange={onUpdateSalvageCheckProgressive} />
        </div>
      {:else if activeTab === 'salvage' && salvageSimple}
        <div data-checks-panel="salvage">
          <SimpleCraftingCheckEditor value={salvageCheckSimple} showDcSource={false} breakageAuthority={salvageBreakageAuthority} onChange={onUpdateSalvageCheckSimple} />
        </div>
      {:else if activeTab === 'gathering' && gatheringD100}
        <div class="manager-checks-page" data-checks-panel="gathering" data-gathering-d100-readonly>
          <section class="manager-inspector-card">
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-card-title">
              {text('FABRICATE.Admin.Manager.Checks.Gathering.D100Title', 'Fixed d100 roll')}
            </h2>
            <p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.Checks.Gathering.D100Lead',
                'In d100 mode the gathering check is a fixed d100 roll against each drop’s chance. There is nothing to configure here.'
              )}
            </p>
          </section>
          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{configTitle}</h3>
            <p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.Checks.Gathering.D100Hint',
                'Switch the gathering economy to progressive or routed resolution to define an editable check. Per-task tuning adjusts difficulty, not the roll.'
              )}
            </p>
          </section>
        </div>
      {:else if activeTab === 'gathering' && gatheringProgressive}
        <div data-checks-panel="gathering">
          <ProgressiveCraftingCheckEditor value={gatheringCheckProgressive} breakageAuthority={gatheringBreakageAuthority} onChange={onUpdateGatheringCheckProgressive} />
        </div>
      {:else if activeTab === 'gathering' && gatheringRouted}
        <div data-checks-panel="gathering">
          <CraftingCheckEditor value={gatheringCheckRouted} showTiers={false} breakageAuthority={gatheringBreakageAuthority} onChange={onUpdateGatheringCheckRouted} />
        </div>
      {:else}
        <div class="manager-checks-page" data-checks-panel={activeTab}>
          <section class="manager-inspector-card">
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-card-title">{page.title}</h2>
            <p class="manager-muted">{page.lead}</p>
          </section>
          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{configTitle}</h3>
            <p class="manager-muted">{page.configHint}</p>
          </section>
        </div>
      {/if}
    </div>

    {#if hasMenu}
      <ChecksRightMenu
        {activeTab}
        activation={activation?.[activeTab]}
        onToggleActive={(enabled) => onToggleCheckActive(activeTab, enabled)}
      />
    {/if}
  </div>
</div>

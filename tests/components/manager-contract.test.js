import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const essenceBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte');
const essenceEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte');
const tagsCategoriesPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte');
const systemEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemEditView.svelte');
const craftingSettingsPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSettingsView.svelte');
const resolutionModeOptionsPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/resolutionModeOptions.js');
const systemsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte');
const recipesBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
// The library inspector, extracted out of the root (issue 643). It sits under
// `recipes/`, NOT `recipe/` — the latter is the recipe EDITOR's screenshot-map glob.
const recipeBrowserInspectorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte');
const componentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte');
const componentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte');
const componentRowPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/components/ComponentRow.svelte');
const environmentEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentEditView.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const gatheringTaskEditPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
const gatheringTasksBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte');
const toolsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte');
const appPath = resolve(repoRoot, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js');
const mainPath = resolve(repoRoot, 'src/main.js');
const langPath = resolve(repoRoot, 'lang/en.json');

const rootSource = readFileSync(rootPath, 'utf8');
const essenceBrowserSource = readFileSync(essenceBrowserPath, 'utf8');
const essenceEditSource = readFileSync(essenceEditPath, 'utf8');
const tagsCategoriesSource = readFileSync(tagsCategoriesPath, 'utf8');
const systemEditSource = readFileSync(systemEditPath, 'utf8');
const craftingSettingsSource = readFileSync(craftingSettingsPath, 'utf8');
const resolutionModeOptionsSource = readFileSync(resolutionModeOptionsPath, 'utf8');
const systemsBrowserSource = readFileSync(systemsBrowserPath, 'utf8');
const recipesBrowserSource = readFileSync(recipesBrowserPath, 'utf8');
const recipeBrowserInspectorSource = readFileSync(recipeBrowserInspectorPath, 'utf8');
const componentEditSource = readFileSync(componentEditPath, 'utf8');
const componentsBrowserSource = readFileSync(componentsBrowserPath, 'utf8');
const componentRowSource = readFileSync(componentRowPath, 'utf8');
const environmentEditSource = readFileSync(environmentEditPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const gatheringTaskEditSource = readFileSync(gatheringTaskEditPath, 'utf8');
const gatheringTasksBrowserSource = readFileSync(gatheringTasksBrowserPath, 'utf8');
const toolsBrowserSource = readFileSync(toolsBrowserPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const mainSource = readFileSync(mainPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

const managerSource = [rootSource, recipeBrowserInspectorSource, essenceBrowserSource, essenceEditSource, tagsCategoriesSource, systemEditSource, craftingSettingsSource, resolutionModeOptionsSource, systemsBrowserSource, recipesBrowserSource, componentsBrowserSource, componentEditSource, environmentEditSource, environmentsBrowserSource, gatheringTaskEditSource, gatheringTasksBrowserSource, toolsBrowserSource].join('\n');

function catalogValue(key) {
  return key.split('.').reduce((node, part) => node?.[part], lang);
}

function decodeStaticString(quote, body) {
  return Function(`return ${quote}${body}${quote};`)();
}

function staticTextCalls(source) {
  const pattern = /text\(\s*(["'])(FABRICATE(?:\\.|(?!\1).)*)\1\s*,\s*(["'])((?:\\.|(?!\3).)*)\3\s*\)/gs;
  return [...source.matchAll(pattern)].map(match => ({
    key: match[2],
    fallback: decodeStaticString(match[3], match[4])
  }));
}

function isChangedManagerEnvironmentLocalizationKey(key) {
  return key.startsWith('FABRICATE.Admin.Manager.Environment.')
    || key.startsWith('FABRICATE.Admin.Manager.EnvironmentEditor.')
    || key.startsWith('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.')
    || key.startsWith('FABRICATE.Admin.Manager.CurrencyUnits.')
    || key.startsWith('FABRICATE.Admin.Environments.')
    || [
      'FABRICATE.Admin.Manager.GlobalConditions',
      'FABRICATE.Admin.Manager.CurrentTimeOfDay',
      'FABRICATE.Admin.Manager.CurrentWeather'
    ].includes(key);
}

function sourceName(filePath) {
  return filePath.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '');
}

describe('CraftingSystemManager source contract', () => {
  it('self-registers as the sole crafting system manager app', () => {
    assert.ok(
      appSource.includes('extends SvelteApplicationMixin('),
      'manager app should be a standalone ApplicationV2 shell with no legacy base class'
    );
    assert.ok(
      !appSource.includes('SvelteRecipeManagerApp'),
      'manager app should not reference the removed legacy manager class'
    );
    assert.ok(
      appSource.includes('registerCraftingSystemManagerApp(SvelteCraftingSystemManagerApp)'),
      'manager app should self-register with the manager registry'
    );
    assert.ok(
      !appSource.includes('openCurrentAdmin'),
      'manager app should not expose a legacy admin launch service'
    );
    assert.ok(appSource.includes('height: 940'), 'manager app should open tall enough for gathering task drag/drop');
    assert.ok(
      !mainSource.includes("import './ui/SvelteRecipeManagerApp.svelte.js';"),
      'legacy manager side-effect import should be removed'
    );
    assert.ok(
      mainSource.includes("import './ui/SvelteCraftingSystemManagerApp.svelte.js';"),
      'manager side-effect import should be present for registry wiring'
    );
  });

  // The access rosters are the manager's only Foundry user/ownership surface, and every
  // rule below is one a naive implementation gets WRONG in a way that silently
  // UNDER- or OVER-reports who can craft a recipe (issue 643 §4b).
  it('derives the access rosters from the non-GM roster, never by testing a GM', () => {
    // `Document#testUserPermission` short-circuits EVERY GM (Assistant included, since
    // `User#isGM` is `hasRole(ASSISTANT)`) to OWNER, so GMs must be filtered FIRST.
    assert.ok(appSource.includes('game.users?.players'), 'uses the canonical Foundry non-GM roster');
    assert.ok(appSource.includes('_playerUsers()'), 'both rosters go through the one GM filter');
    assert.equal(
      appSource.includes('actor.isOwner'),
      false,
      'never uses the game.user-scoped Actor#isOwner (always true on a GM client)'
    );
    // The fallback must agree with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`).
    // A `!isGM` filter alone admits role-NONE users, offering the GM a grantable target
    // the engine ignores.
    const fallback = appSource.slice(
      appSource.indexOf('_playerUsers() {'),
      appSource.indexOf('_userRoleLabel(role) {')
    );
    assert.ok(
      fallback.includes("hasRole('PLAYER')") && fallback.includes('USER_ROLES?.PLAYER'),
      'the fallback applies the same role floor as the canonical roster'
    );
    // Everything this labels comes from the GM-free roster, so a GAMEMASTER/ASSISTANT
    // branch would be unreachable code claiming to handle a case that cannot arrive.
    const roleLabel = appSource.slice(appSource.indexOf('_userRoleLabel(role) {'));
    assert.equal(
      roleLabel.slice(0, roleLabel.indexOf('_userColor')).includes('RoleGamemaster'),
      false,
      'a GM never reaches the role label — the roster excludes them'
    );
  });

  it('models "who plays this character" as a SET, with the whole-table case explicit', () => {
    assert.ok(
      appSource.includes("actor.testUserPermission?.(user, 'OWNER')"),
      'OWNER holders control the actor'
    );
    assert.ok(appSource.includes('user.character.id === actor.id'), 'the assigned player too');
    assert.ok(appSource.includes('controlledBy'), 'the union is exposed as a set');
    assert.ok(
      appSource.includes('sharedWithAllPlayers'),
      'ownership.default >= OWNER reaches the whole table'
    );
    assert.ok(appSource.includes('actor.ownership?.default'), 'reads the default ownership level');
    assert.equal(appSource.includes('playedBy'), false, 'no lossy singular playedBy field');
  });

  it('resolves granted character ids over EVERY world actor, not the PC-filtered roster', () => {
    // The runtime predicate applies no type filter, so a grant naming a non-PC actor is
    // still honoured — resolving over the filtered roster would drop it from display.
    assert.ok(appSource.includes('getAccessCharacterActors:'), 'exposes the unfiltered roster');
    const unfiltered = appSource.slice(
      appSource.indexOf('getAccessCharacterActors:'),
      appSource.indexOf('getWorldItemOptions:')
    );
    assert.equal(
      unfiltered.includes('isPlayerCharacterActor'),
      false,
      'the access roster applies no player-character type filter'
    );
  });

  it('key-filters the noisy updateActor hook so an HP tick does not reproject', () => {
    assert.ok(appSource.includes("Hooks.on('updateActor'"), 'actor updates are hooked');
    assert.ok(
      appSource.includes("'ownership' in diff || 'name' in diff || 'img' in diff"),
      'only ownership / name / img reproject the rosters'
    );
    assert.ok(appSource.includes("'createActor'"), 'actor creation reprojects');
    assert.ok(appSource.includes("'deleteActor'"), 'actor deletion reprojects');
    assert.ok(appSource.includes('refreshAccessRosters'), 'reprojects both rosters, not just users');
  });

  it('guards manager startup against unready Fabricate services', () => {
    assert.ok(appSource.includes('isFabricateReady'), 'manager app should expose readiness through services');
    assert.ok(appSource.includes('onFabricateReady'), 'manager app should expose a ready callback service');
    assert.ok(appSource.includes("hooks.once('fabricate.ready'"), 'ready callback should listen at the Foundry edge');
    assert.ok(appSource.includes('_pendingReadyOpen'), 'v2 app should prevent duplicate deferred opens');
    assert.ok(appSource.includes('StartupPending'), 'v2 app should notify when startup defers the window open');
    assert.ok(appSource.includes("hooks.once('fabricate.ready', openWhenReady)"), 'v2 app should defer direct opens until fabricate.ready');
    assert.ok(systemsBrowserSource.includes('systemsLoading'), 'systems browser should receive loading state');
    assert.ok(rootSource.includes('systemsLoading'), 'root should pass loading state to systems browser and inspector');
    assert.equal(lang.FABRICATE.Admin.Manager.LoadingSystems, 'Loading crafting systems...');
    assert.equal(
      lang.FABRICATE.Admin.Manager.StartupPending,
      'Fabricate is still loading. The crafting system manager will open when startup finishes.'
    );
  });

  // Issue 643 — the manager titlebar. The gold badge names the SELECTED CRAFTING
  // SYSTEM. The prototype's "MYTHWRIGHT" is a THEME name and must never leak into
  // the shipped chrome, and the badge's content is user-authored, so it also needs a
  // `title` for the truncated case.
  it('renders a titlebar naming the selected crafting system and its resolution', () => {
    for (const snippet of [
      'class="manager-titlebar"',
      'data-manager-titlebar',
      'class="manager-titlebar-badge"',
      'data-manager-titlebar-system',
      'title={selectedSystem.name}',
      '>{selectedSystem.name}</span>',
      'data-manager-titlebar-status',
      '{titlebarStatusLabel()}'
    ]) {
      assert.ok(rootSource.includes(snippet), `root titlebar should include ${snippet}`);
    }
    // The layer-group icon and "Crafting Systems" product label are gone (issue 643):
    // the Foundry window's own title bar already names the app, so a second copy inside
    // the window was duplicated chrome. The gold badge is now the left-most element.
    assert.equal(
      rootSource.includes('manager-titlebar-icon'),
      false,
      'the duplicated titlebar app icon should be removed'
    );
    assert.equal(
      rootSource.includes('manager-titlebar-product'),
      false,
      'the duplicated "Crafting Systems" titlebar label should be removed'
    );
    assert.equal(
      /mythwright/i.test(rootSource),
      false,
      'the gold badge names the selected crafting system; "Mythwright" is a theme name and must not be hard-coded'
    );
    // The status line reports the SYSTEM's resolution mode, and counts outcome tiers
    // only where tiers exist to count (routedByCheck).
    assert.ok(
      rootSource.includes("selectedSystem?.resolutionMode === 'routedByCheck'\n      ? routedOutcomeTierCount(selectedSystem?.craftingCheck?.routed)"),
      'the titlebar outcome-tier count should only be resolved for a routed-by-check system'
    );
    assert.ok(
      lang.FABRICATE.Admin.Manager.Titlebar.OutcomeTiers === 'outcome tiers',
      'lang should expose the pluralized outcome-tier label the titlebar formats'
    );
  });

  it('renders the rail section label and bare mono count numerals without elevating the dead Graph row', () => {
    assert.ok(rootSource.includes('class="manager-rail-title"'), 'the rail should carry an uppercase section label');
    assert.ok(rootSource.includes('data-manager-rail-section'), 'the rail section label should be addressable');
    assert.ok(
      lang.FABRICATE.Admin.Manager.Nav.SectionLabel === 'GM management',
      'the rail section label should be localized'
    );
    // A rail count is a BARE NUMERAL, not a badge (issue 643). Borrowing `.manager-chip`
    // meant every nav row wore a bordered, 24px-tall, button-shaped pill that the CSS then
    // spent five declarations undoing; `.manager-nav-count` owns its own rule instead.
    assert.ok(
      rootSource.includes('<span class="manager-nav-count">{selectedCounts.components}</span>'),
      'a rail count should render as a bare numeral, not a chip'
    );
    assert.equal(
      rootSource.includes('manager-nav-count manager-chip'),
      false,
      'no rail count should borrow the content chip'
    );
    assert.ok(
      rootSource.includes("<span class=\"manager-nav-count\">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>"),
      'the disabled Graph placeholder should keep its plain Soon span, not gain a chip'
    );
  });

  it('renders the manager shell with Systems and Recipes browser structures', () => {
    for (const snippet of [
      'class="fabricate-manager"',
      'data-manager-view={currentView}',
      'class="manager-header"',
      'class="manager-breadcrumbs"',
      'class={`manager-body ${railCollapsed ? \'is-rail-collapsed\' : \'\'}`}',
      'class="manager-rail"',
      'class="manager-inspector"',
      'ComponentsBrowserView',
      'EnvironmentsBrowserView',
      'EssenceBrowserView',
      'EssenceEditView',
      'TagsCategoriesView',
      'EnvironmentEditView',
      'RecipesBrowserView',
      'SystemEditView',
      'SystemsBrowserView',
      'manager-environment-edit-main'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-main"',
      'class="manager-toolbar"',
      'class="manager-filter"',
      'class="manager-empty"'
    ]) {
      assert.ok(managerSource.includes(snippet), `manager source should include ${snippet}`);
    }
    // `class={componentTableClass}` is GONE (issue 676): the rebuilt browser is a LIST
    // of rows, not a `role="table"` grid, so the table scaffolding and the class that
    // toggled its column template are dropped rather than left orphaned on a non-table
    // structure. `.manager-component-drop-zone` still lives here; the row's own classes
    // moved into the extracted ComponentRow and are pinned there — both are probed by
    // managerLayoutGuards and the smoke harness.
    for (const snippet of ['class="manager-component-drop-zone"', 'ComponentRow']) {
      assert.ok(componentsBrowserSource.includes(snippet), `ComponentsBrowserView should include ${snippet}`);
    }
    for (const snippet of ['manager-component-row', 'class="manager-component-identity"']) {
      assert.ok(componentRowSource.includes(snippet), `ComponentRow should include ${snippet}`);
    }
    // The dropped table scaffolding must not creep back in either file.
    for (const snippet of ['role="table"', 'role="row"', 'role="columnheader"', 'role="cell"']) {
      assert.ok(
        !componentsBrowserSource.includes(snippet) && !componentRowSource.includes(snippet),
        `the component browser must not reintroduce ${snippet}`
      );
    }
    for (const snippet of [
      'manager-system-edit-form',
      'data-edit-control="advanced-options"',
      'manager-feature-tile'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    // The character-modifier editor is formula-only: a plain labelled expression
    // input, with no provider chip, provider-label helper, or macro UUID field.
    assert.ok(
      !systemEditSource.includes('ProviderExpressionInput'),
      'character-modifier editor should not import the deleted provider/expression component'
    );
    assert.ok(
      !systemEditSource.includes('characterModifierProviderLabel'),
      'character-modifier editor should not render a provider label'
    );
    assert.ok(
      !systemEditSource.includes('manager-character-modifier-provider'),
      'character-modifier summary should not render a provider chip'
    );
    assert.ok(
      systemEditSource.includes("onUpdateCharacterModifier(entry.id, { expression: event.currentTarget.value })"),
      'character-modifier editor should bind a plain expression input'
    );
    assert.ok(
      systemEditSource.includes("FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression"),
      'character-modifier editor should keep the localized Expression label'
    );
    for (const snippet of [
      'data-system-currency-units',
      'manager-currency-unit-card',
      'handleAddCurrencyUnit',
      'onSeedCurrencyPresets',
      'manager-character-modifier-summary',
      'manager-currency-subunit-builder',
      'manager-availability-pill is-currency',
      'manager-availability-pill-amount',
      'onUpdateCurrencySubUnit(unit.id, contained.unitId, event.currentTarget.value)',
      'onDeleteCurrencySubUnit(unit.id, contained.unitId)'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    assert.ok(
      rootSource.includes('currencyUnits={selectedCurrencyUnits}'),
      'root should pass selected currency units to SystemEditView'
    );
    assert.ok(
      rootSource.includes('onAddCurrencySubUnit={onAddCurrencySubUnit}'),
      'root should pass currency sub-unit actions to SystemEditView'
    );
    assert.ok(
      rootSource.includes('{currencySpendStrategy}'),
      'root should thread the spend strategy to SystemEditView'
    );
    // Three peer top-level spend strategies (actorProperty / actorInventory / macro). The strategy
    // select renders all three options and the editor branches on each strategy.
    assert.ok(
      systemEditSource.includes("currencySpendStrategy === 'actorInventory'"),
      'currency editor should branch on the actorInventory spend strategy'
    );
    for (const value of ['actorProperty', 'actorInventory', 'macro']) {
      assert.ok(
        systemEditSource.includes(`value: '${value}'`),
        `currency editor should offer the ${value} spend strategy option`
      );
    }
    // Currency spend-strategy / provider / macro controls.
    for (const snippet of [
      'data-system-currency-strategy-select',
      'onSetCurrencySpendStrategy(event.currentTarget.value)',
      // The single shared strategy hint reflects the selected strategy.
      'data-system-currency-strategy-hint',
      'currencySpendStrategyHint()',
      'data-system-currency-provider-select',
      'onSetCurrencyProvider(event.currentTarget.value)',
      'data-system-currency-no-provider',
      'data-system-currency-macros',
      'data-system-currency-macro-dropzone',
      'manager-component-source-drop-zone',
      'use:dragDrop',
      'resolveDropData',
      "type !== 'Macro'",
      'onClearCurrencyMacro(field.key)',
      // Each empty macro drop zone exposes a field-specific accessible name so the three zones are
      // distinguishable to assistive tech (the linked-state group already has a field-specific label).
      'aria-label={currencyMacroDropZoneLabel(field)}'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    // The nested inventory-mode select is gone — macro is now a peer top-level strategy.
    assert.ok(
      !systemEditSource.includes('data-system-currency-inventory-mode-select'),
      'currency editor should not render the removed nested inventory-mode select'
    );
    assert.ok(
      !systemEditSource.includes('inventoryMode'),
      'currency editor should not reference the removed inventoryMode model'
    );
    // The macro branch renders only under the peer macro strategy.
    assert.ok(
      systemEditSource.includes("currencySpendStrategy === 'macro'"),
      'currency editor should branch on the macro spend strategy'
    );
    // A system with no registered provider can still select actorInventory but is steered to the
    // macro strategy via a no-provider callout, and its units are never wiped.
    assert.ok(
      systemEditSource.includes('const currencyHasProviders = $derived(currencyProviderOptions.length > 0)'),
      'currency editor should derive whether the system has any providers'
    );
    // The three macro drop zones (canAfford / increment / decrement) lay out side-by-side in a
    // single responsive row via a namespaced container class.
    assert.ok(
      systemEditSource.includes('manager-currency-macro-zones manager-currency-macro-row'),
      'macro drop zones should be wrapped in the single-row container'
    );
    // Sub-units only drive the engine in actorProperty mode, so the whole sub-unit section (heading,
    // add control, chips, no-eligible callout) is gated behind a derived macro-mode flag — it must
    // not render in provider (read-only) or macro modes.
    assert.ok(
      systemEditSource.includes('const currencyMacroMode = $derived('),
      'currency editor should derive a macro-mode flag'
    );
    assert.ok(
      systemEditSource.includes('{#if currencyMacroMode}'),
      'currency editor should gate the per-unit editor body on the macro-mode flag'
    );
    // The sub-unit section markup (heading, add-sub-unit control, chips) lives only inside the
    // non-macro branch, after the `{#if currencyMacroMode}` gate.
    assert.ok(
      systemEditSource.indexOf('{#if currencyMacroMode}') <
        systemEditSource.indexOf('manager-currency-subunit-section'),
      'sub-unit section should render only in the non-macro (actorProperty) branch'
    );
    // Macro mode shows a conversion hint instead of any sub-unit controls.
    assert.ok(
      systemEditSource.includes('FABRICATE.Admin.Manager.CurrencyUnits.MacroConversionHint'),
      'macro mode should include the macro-conversion hint'
    );
    // The actorInventory strategy (with a provider) makes the units provider-owned and read-only:
    // the Add/Seed header actions and the editable unit controls are gated behind a non-read-only
    // condition, and a dedicated read-only branch with a provider-managed callout renders instead.
    assert.ok(
      systemEditSource.includes('const currencyUnitsReadOnly = $derived(currencyShowProviderBranch)'),
      'currency editor should derive a read-only flag for the active provider inventory branch'
    );
    assert.ok(
      systemEditSource.includes('{#if !currencyUnitsReadOnly}'),
      'currency editor should gate the Add/Seed header actions behind the non-provider (editable) condition'
    );
    assert.ok(
      systemEditSource.includes('{#if currencyUnitsReadOnly}'),
      'currency editor should render a dedicated read-only branch in provider mode'
    );
    for (const snippet of [
      'data-system-currency-provider-managed',
      'manager-currency-provider-managed-callout',
      'currencyProviderManagedHint()',
      'manager-currency-provider-managed-summary',
      'manager-currency-readonly-fields',
      'data-system-currency-readonly-label',
      'data-system-currency-abbreviation',
      'data-system-currency-denomination',
      'FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedTitle'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include read-only ${snippet}`);
    }
    // Provider read-only units present label/abbreviation/denomination as static field/value pairs;
    // they must NOT render sub-unit chips. The only `data-system-currency-subunit` occurrence lives
    // in the editable (actorProperty) branch, after the provider-managed read-only branch.
    assert.ok(
      systemEditSource.indexOf('data-system-currency-provider-managed') <
        systemEditSource.indexOf('data-system-currency-subunit'),
      'provider-managed read-only branch should render before the editable sub-unit chips'
    );
    assert.equal(
      systemEditSource.split('data-system-currency-subunit=').length - 1,
      1,
      'sub-unit chips should appear only once (in the editable actorProperty branch)'
    );
    // The read-only branch precedes the editable branch, so the editable controls (editable amount
    // input, remove cross) live only after the provider-managed branch.
    assert.ok(
      systemEditSource.indexOf('data-system-currency-provider-managed') <
        systemEditSource.indexOf('class="manager-availability-pill-amount"'),
      'provider-managed read-only branch should render before the editable unit list'
    );
    for (const prop of [
      '{currencyProviderId}',
      '{currencyMacros}',
      '{currencyProviderOptions}',
      'onSetCurrencySpendStrategy={onSetCurrencySpendStrategy}',
      'onSetCurrencyProvider={onSetCurrencyProvider}',
      'onSetCurrencyMacro={onSetCurrencyMacro}',
      'onClearCurrencyMacro={onClearCurrencyMacro}'
    ]) {
      assert.ok(rootSource.includes(prop), `root should thread ${prop} to SystemEditView`);
    }
    // The removed nested inventory-mode setter must no longer be threaded.
    assert.ok(
      !rootSource.includes('onSetCurrencyInventoryMode'),
      'root should not thread the removed inventory-mode setter'
    );
    assert.ok(
      rootSource.includes('getCurrencyProvidersForFoundrySystem'),
      'root should derive provider options from the currency provider registry'
    );
    // The currency feature toggle lives in the Optional features section, reads
    // requirements.currency.enabled, and calls onToggleCurrency. It renders always (so the section is
    // never empty), and the Currency Units card is gated on the enabled flag.
    for (const snippet of [
      'const currencyEnabled = $derived(selectedSystem?.requirements?.currency?.enabled === true)',
      'data-system-currency-toggle',
      'onToggleCurrency',
      'FABRICATE.Admin.Manager.Feature.Currency',
      'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency'
    ]) {
      assert.ok(systemEditSource.includes(snippet), `SystemEditView should include ${snippet}`);
    }
    // The currency toggle tile renders independently of visibleFeatures, so the toggle list is no
    // longer hidden behind the empty-feature guard.
    assert.ok(
      systemEditSource.includes('data-feature-key="currency"'),
      'currency toggle tile should always render in the Optional features section'
    );
    // The Currency Units card is gated on currencyEnabled.
    assert.ok(
      systemEditSource.indexOf('{#if currencyEnabled}') <
        systemEditSource.indexOf('manager-currency-unit-card'),
      'Currency Units card should be gated behind the currencyEnabled flag'
    );
    assert.ok(
      rootSource.includes("store.toggleRequirement?.('currency', next)"),
      'root should thread onToggleCurrency to store.toggleRequirement'
    );
    for (const snippet of [
      'class="manager-systems-table"',
      'manager-system-row',
      'manager-system-identity',
      // Same-named systems are disambiguated in the rail via the shared helper (issue 346).
      "import { buildSystemLabelMap, systemDisplayLabel } from '../../util/systemDisambiguation.js'",
      'buildSystemLabelMap(systems)',
      'systemDisplayLabel(system, systemLabels)'
    ]) {
      assert.ok(systemsBrowserSource.includes(snippet), `SystemsBrowserView should include ${snippet}`);
    }
    for (const snippet of [
      'class="manager-recipes-table"',
      'manager-recipe-row',
      'class="manager-recipe-identity"',
      'manager-recipe-status',
      // The row's restored Edit pencil and the column header above the list (issue 643).
      'data-recipe-edit={recipe.id}',
      'class="manager-recipe-table-head"',
      'FABRICATE.Admin.Manager.Recipe.Column.Recipe',
      // The lifted browser view-state seam.
      'browserState = $bindable(null)',
      'createRecipeBrowserState'
    ]) {
      assert.ok(recipesBrowserSource.includes(snippet), `RecipesBrowserView should include ${snippet}`);
    }
    // The row Edit pencil reuses the Books & Scrolls icon-button + pen idiom, and the
    // filter/sort/paging state is lifted (no local $state for those controls remains).
    assert.ok(
      recipesBrowserSource.includes('class="manager-icon-button manager-recipe-edit"'),
      'the row Edit affordance should be a manager-icon-button, matching Books & Scrolls'
    );
    assert.equal(
      /let\s+statusFilter\s*=\s*\$state/.test(recipesBrowserSource),
      false,
      'the browser view-state must be lifted, not held as local component $state'
    );
    assert.ok(
      recipesBrowserSource.includes('recipe.incomplete'),
      'RecipesBrowserView should render the derived Incomplete state'
    );
    assert.ok(
      recipesBrowserSource.includes('FABRICATE.Admin.Manager.Recipe.Incomplete'),
      'RecipesBrowserView should use the localized Incomplete label'
    );
    // The four row states are one component (StatusPill) rather than four ad-hoc
    // chips. The tones stay distinguishable: warning = incomplete-but-enabled,
    // danger = incomplete AND off, i.e. enabling would be REFUSED (issue 643).
    assert.ok(
      recipesBrowserSource.includes("import StatusPill from '../../components/StatusPill.svelte'"),
      'the row should render its states through the shared StatusPill'
    );
    assert.ok(
      /incomplete:\s*\['FABRICATE\.Admin\.Manager\.Recipe\.Incomplete'/.test(recipesBrowserSource),
      'the Incomplete state should carry its localized label'
    );
    assert.ok(
      recipesBrowserSource.includes('FABRICATE.Admin.Manager.Recipe.CantEnable'),
      "an incomplete + disabled recipe should say enabling is refused, not merely 'incomplete'"
    );
    // A card row has no columns: the list is a real <ul role="list"> of <li> cards.
    assert.ok(
      recipesBrowserSource.includes('<ul class="manager-recipe-group-list" role="list"'),
      'recipe rows should be a list, not a role="table"'
    );
    assert.equal(
      recipesBrowserSource.includes('role="table"'),
      false,
      'the card row must not retain the table role'
    );
  });

  it('keeps presentational Svelte free of direct Foundry globals', () => {
    assert.ok(!/\b(?:game|ui|Hooks|CONFIG)\b/.test(rootSource), 'root should not directly reference Foundry globals');
  });

  it('uses localized manager copy keys', () => {
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Title'), 'root should use manager localization keys');
    assert.ok(lang.FABRICATE.Admin.Manager, 'English localization should define manager copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Title, 'Crafting systems');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Components, 'Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.Environments, 'Gathering');
    assert.equal(lang.FABRICATE.Admin.Manager.Breadcrumbs, 'Breadcrumbs');
    assert.equal(lang.FABRICATE.Admin.Manager.EditSystem, 'Edit system');
    assert.equal(lang.FABRICATE.Admin.Manager.ReturnToSystemLibrary, 'Return to System Library');
    assert.equal(lang.FABRICATE.Admin.Manager.StatusOn, 'On');
    assert.equal(lang.FABRICATE.Admin.Manager.StatusOff, 'Off');
    assert.equal(lang.FABRICATE.Admin.Manager.EnableSystemNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.DisableSystemNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.Title, 'System settings');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.SaveDetails, 'Save details');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.EditBadge, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.Title, 'Currency units');
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.Add, 'Add currency unit');
    assert.equal(lang.FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit, 'Add sub-unit');
    for (const key of [
      'SpendStrategy', 'SpendStrategyHint',
      'SpendStrategyActorProperty', 'SpendStrategyActorPropertyHint',
      'SpendStrategyActorInventory', 'SpendStrategyActorInventoryHint',
      'SpendStrategyMacro', 'SpendStrategyMacroHint',
      'Provider', 'ProviderHint', 'NoProviders',
      'MacroCanAfford', 'MacroCanAffordHint', 'MacroIncrement', 'MacroIncrementHint',
      'MacroDecrement', 'MacroDecrementHint', 'MacroDropHint', 'MacroDropZoneLabel', 'MacroReplaceHint',
      'MacroUnlink', 'MacroMissing', 'MacroConversionHint',
      'ProviderManagedTitle', 'ProviderManagedHint'
    ]) {
      assert.ok(lang.FABRICATE.Admin.Manager.CurrencyUnits[key], `CurrencyUnits.${key} should be defined`);
    }
    // The removed nested inventory-mode localization keys must be gone.
    for (const key of ['InventoryMode', 'InventoryModeHint', 'InventoryModeProvider', 'InventoryModeMacro']) {
      assert.equal(
        lang.FABRICATE.Admin.Manager.CurrencyUnits[key],
        undefined,
        `CurrencyUnits.${key} should be removed`
      );
    }
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Title, 'Recipes');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.Requirements, 'Requirements');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EnableNamed, 'Enable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.DisableNamed, 'Disable {name}');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Title, 'Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.DropZoneTitle, 'Drop items to add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.Origin, 'Origin');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.SourceOriginCompendium, 'Compendium');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Title, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.Library, 'Tags & Categories');
    assert.equal(lang.FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback, 'General is already available as the base category.');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Title, 'Essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.Library, 'Essence browser');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditTitle, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EditBreadcrumb, 'Edit essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.CreateBreadcrumb, 'Create essence');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceLinkedFilter, 'Linked');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.SourceNoneShort, 'None');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle, 'Gathering events');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint, 'Browse reusable events before attaching them to environments.');
    assert.equal(rootSource.includes('EncountersPlaceholderTitle'), false);
    assert.equal(rootSource.includes('EncountersPlaceholderHint'), false);
  });

  it('keeps changed manager and environment static localization fallbacks aligned with en.json', () => {
    const environmentComponentDir = resolve(repoRoot, 'src/ui/svelte/apps/manager/environment');
    const contractFiles = [
      rootPath,
      environmentEditPath,
      environmentsBrowserPath,
      ...readdirSync(environmentComponentDir)
        .filter(name => name.endsWith('.svelte'))
        .map(name => resolve(environmentComponentDir, name))
    ];
    const failures = [];

    for (const filePath of contractFiles) {
      const source = readFileSync(filePath, 'utf8');
      for (const { key, fallback } of staticTextCalls(source)) {
        if (!isChangedManagerEnvironmentLocalizationKey(key)) continue;
        const value = catalogValue(key);
        if (typeof value !== 'string') {
          failures.push(`${sourceName(filePath)}: missing ${key}`);
        } else if (value !== fallback) {
          failures.push(`${sourceName(filePath)}: ${key} fallback "${fallback}" does not match en.json "${value}"`);
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  it('routes system Edit to the in-place v2 edit view and existing store callbacks', () => {
    assert.ok(!rootSource.includes('openLegacySystemSettings'), 'root should not keep dead legacy edit routing');
    assert.ok(!rootSource.includes('Edit details'), 'root should not show the former dead edit details label');
    assert.ok(!rootSource.includes('services?.onEditSystem'), 'root should not launch the current admin for system row Edit');
    assert.ok(managerSource.includes('FABRICATE.Admin.Manager.EditSystem'), 'manager should expose a localized system edit action');
    assert.ok(rootSource.includes("activeView = 'system-edit'"), 'system row Edit should transition to the local edit route');
    assert.ok(managerSource.includes('store.saveSystemDetails?.('), 'system edit should save details through the admin store');
    assert.ok(managerSource.includes('onSetResolutionMode(nextMode)') || managerSource.includes('store.setResolutionMode?.(nextMode)'), 'system edit should delegate resolution changes to the admin store');
    assert.ok(rootSource.includes('store.setResolutionMode?.'), 'root should pass the resolution-mode callback through to the system-edit view');
    // Scope the resolution/salvage persistence-value assertions to the resolution
    // mode options module: the alchemy check-mode selector at the top of the Checks
    // tab's Crafting sub-tab legitimately carries a `value: 'tiered'` check-mode
    // option that is unrelated to the retired legacy resolution/salvage `tiered` mode.
    assert.ok(resolutionModeOptionsSource.includes("value: 'routed'"), 'salvage resolution should offer the canonical routed persistence value');
    assert.ok(!resolutionModeOptionsSource.includes("value: 'mapped'"), 'resolution options should not offer the legacy mapped persistence value');
    assert.ok(!resolutionModeOptionsSource.includes("value: 'tiered'"), 'resolution options should not offer the legacy tiered persistence value');
    assert.ok(!rootSource.includes('store.toggleAdvancedOptions?.'), 'root should not retain the removed advanced visibility toggle wiring');
    assert.ok(rootSource.includes('store.toggleFeature?.'), 'root should delegate feature toggles to the admin store');
    assert.ok(!managerSource.includes("storeKey: 'complexRecipes'"), 'system edit should not reintroduce the legacy complex recipes toggle');
    assert.ok(!managerSource.includes("storeKey: 'craftingChecks'"), 'system edit should not reintroduce the legacy crafting checks toggle');
    assert.ok(!managerSource.includes("storeKey: 'outcomeRouting'"), 'system edit should not reintroduce the legacy outcome routing toggle');
    assert.ok(!appSource.includes('onEditSystem'), 'v2 wrapper should not provide a row edit service for this action');
    assert.ok(!appSource.includes('openCurrentAdmin'), 'v2 wrapper should not retain a legacy admin fallback service');
    assert.ok(!appSource.includes('LAST_MANAGED_CRAFTING_SYSTEM'), 'v2 row edit should not seed and launch the current admin');
  });

  it('renames the recipe resolution-mode legend and offers a salvage resolution-mode card', () => {
    // The recipe card legend is renamed; its consumer is now the Crafting Settings
    // page (issue 511 moved the resolution cards off System Overview).
    assert.equal(lang.FABRICATE.Admin.SystemSettings.ResolutionMode, 'Recipe resolution mode');
    assert.ok(craftingSettingsSource.includes("legendFallback=\"Recipe resolution mode\""), 'crafting settings inline fallback should match the renamed value');

    // Salvage card source hooks: fieldset + option attribute names and the radio group name.
    assert.ok(craftingSettingsSource.includes('data-crafting-salvage-resolution-mode'), 'crafting settings should declare the salvage fieldset hook');
    assert.ok(craftingSettingsSource.includes('data-crafting-salvage-resolution-mode-option'), 'crafting settings should declare the salvage option hook');
    assert.ok(craftingSettingsSource.includes('manager-crafting-salvage-resolution-mode'), 'crafting settings should use the dedicated salvage radio group name');

    // New salvage i18n keys are present and non-empty.
    for (const key of [
      'SalvageResolutionMode',
      'SalvageResolutionModeHint',
      'SalvageResolutionSimple',
      'SalvageResolutionSimpleDesc',
      'SalvageResolutionProgressive',
      'SalvageResolutionProgressiveDesc',
      'SalvageResolutionRouted',
      'SalvageResolutionRoutedDesc',
      'ResolutionComingSoon'
    ]) {
      const value = lang.FABRICATE.Admin.SystemSettings[key];
      assert.equal(typeof value, 'string', `SystemSettings.${key} should be a string`);
      assert.ok(value.length > 0, `SystemSettings.${key} should be non-empty`);
    }

    // Salvage option-set guard: the salvage options offer simple (default) +
    // progressive + routed, but never alchemy (no ingredient-set routing).
    const salvageOptionsMatch = resolutionModeOptionsSource.match(/salvageResolutionModeOptions\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(salvageOptionsMatch, 'the shared module should define a salvageResolutionModeOptions array');
    const salvageOptionsBlock = salvageOptionsMatch[1];
    assert.ok(salvageOptionsBlock.includes("value: 'simple'"), 'salvage should offer simple');
    assert.ok(salvageOptionsBlock.includes("value: 'progressive'"), 'salvage should offer progressive');
    assert.ok(salvageOptionsBlock.includes("value: 'routed'"), 'salvage should offer routed');
    assert.ok(!salvageOptionsBlock.includes("value: 'alchemy'"), 'salvage should NOT offer alchemy');

    // Persistence wiring threaded from the root through the crafting settings view to the store.
    assert.ok(craftingSettingsSource.includes('onSetSalvageResolutionMode'), 'crafting settings should accept the salvage persistence prop');
    assert.ok(rootSource.includes('store.setSalvageResolutionMode?.'), 'root should pass the salvage callback through to the crafting settings view');
  });

  it('offers a gathering resolution-mode card with d100 selectable and progressive/routed coming soon', () => {
    const gatheringEconomySource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte'),
      'utf8'
    );
    assert.ok(gatheringEconomySource.includes('data-gathering-resolution-mode'), 'gathering view should declare the resolution fieldset hook');
    assert.ok(gatheringEconomySource.includes('data-gathering-resolution-mode-option'), 'gathering view should declare the resolution option hook');
    assert.ok(gatheringEconomySource.includes('manager-gathering-resolution-mode'), 'gathering view should use the dedicated resolution radio group name');

    const optionsMatch = gatheringEconomySource.match(/gatheringResolutionModeOptions\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(optionsMatch, 'gathering view should define a gatheringResolutionModeOptions array');
    const optionsBlock = optionsMatch[1];
    assert.ok(optionsBlock.includes("value: 'd100'"), 'gathering should offer d100');
    assert.ok(optionsBlock.includes("value: 'progressive'"), 'gathering should offer progressive');
    assert.ok(optionsBlock.includes("value: 'routed'"), 'gathering should offer routed');

    // d100 is selectable; progressive/routed are disabled coming-soon affordances.
    assert.equal(lang.FABRICATE.Admin.Manager.Economy.GatheringResolutionMode, 'Gathering resolution mode');
    for (const key of ['D100', 'D100Desc', 'Progressive', 'Routed']) {
      const value = lang.FABRICATE.Admin.Manager.Economy.Resolution[key];
      assert.equal(typeof value, 'string', `Economy.Resolution.${key} should be a string`);
      assert.ok(value.length > 0, `Economy.Resolution.${key} should be non-empty`);
    }
  });

  it('folds the validation overview into a full-width tabbed System Overview page (#429)', () => {
    // The standalone overview route and the legacy "Edit summary" key are gone.
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.Summary, undefined, 'the legacy Summary key is removed');
    assert.ok(!rootSource.includes('SystemEdit.Summary'), 'no consumer references the removed Summary key');

    // The System Overview page is the renamed system-edit route; the page title,
    // breadcrumb, and nav label all read "System Overview".
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.Nav, 'System Overview', 'the nav item is renamed System Overview');
    assert.equal(lang.FABRICATE.Admin.Manager.SystemEdit.PageTitle, 'System Overview');
    assert.ok(
      rootSource.includes("text('FABRICATE.Admin.Manager.SystemEdit.PageTitle', 'System Overview')"),
      'the page title reads System Overview'
    );
    assert.ok(
      rootSource.includes("text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')"),
      'the renamed nav item reads System Overview'
    );

    // The standalone Overview route was folded into the system-edit page; its old
    // nav item and routed view token are gone.
    assert.ok(!rootSource.includes('data-nav-system-overview'), 'the standalone Overview nav item is removed');
    assert.ok(!rootSource.includes("activeView = 'system-overview'"), 'no route transitions to the standalone overview view');
    assert.ok(rootSource.includes("if (view === 'system-overview') return 'system-edit'"), 'a stale overview token folds into the system-edit page');

    // The renamed nav item uses the validation clipboard icon and carries the
    // open-issue badge that the standalone Overview item used to own.
    assert.ok(
      rootSource.includes('data-nav-system-edit'),
      'the renamed nav item exposes a stable data hook'
    );
    assert.ok(
      rootSource.includes("{#if systemOverviewCount > 0}"),
      'the renamed nav item carries the open-validation-issue badge'
    );

    // The page is a full-width tabbed shell mirroring the environment editor: the
    // shared inspector is skipped, and SystemEditView owns the tabs + workspace.
    assert.ok(
      rootSource.includes("currentView !== 'system-edit'") &&
        rootSource.includes("class=\"manager-inspector\""),
      'the shared inspector is skipped for the full-width system-edit page'
    );
    assert.ok(systemEditSource.includes('SystemEditorTabs'), 'SystemEditView renders the tab bar');
    assert.ok(systemEditSource.includes("activeTab === 'settings'"), 'Settings is a tab panel');
    assert.ok(systemEditSource.includes("activeTab === 'validation'"), 'Validation is a tab panel');
    assert.ok(systemEditSource.includes('SystemOverviewView'), 'the Validation tab renders the overview list');
    assert.ok(systemEditSource.includes('manager-system-workspace'), 'the workspace mirrors the environment workspace');

    // The library inspector's detail card is a 2x2 STAT grid (issue 643, brief §3.3),
    // not the generic fact-line list: it answers Ingredients / Results / Steps /
    // Crafting check. Structure and Result-groups were restatements of the row the GM
    // had just clicked, and Produces — the one thing the old inspector could not tell
    // them — is now a first-class section.
    assert.ok(
      recipeBrowserInspectorSource.includes('class="manager-recipe-stat-grid"'),
      'the library inspector renders the 2x2 stat grid'
    );
    for (const fact of ['ingredients', 'results', 'steps', 'check']) {
      assert.ok(
        recipeBrowserInspectorSource.includes(`id: '${fact}'`),
        `the stat grid answers "${fact}"`
      );
    }
    assert.ok(
      recipeBrowserInspectorSource.includes('data-recipe-produces-empty'),
      'a recipe that makes nothing on a success says so'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('buildRecipeRequirementRows') &&
        recipeBrowserInspectorSource.includes('buildRecipeProduceRows'),
      'the Requires/Produces walk lives in the pure model, not in the component'
    );

    // The inspector is ONE column on the panel background (issue 643): section labels are
    // uppercase micro-labels directly on the panel, not five nested `.manager-inspector-card`
    // boxes under `<h3>` titles, and there is no invented "Recipe details" heading.
    assert.equal(
      recipeBrowserInspectorSource.includes('manager-inspector-card'),
      false,
      'the inspector sections are micro-labels on the panel, not nested cards'
    );
    assert.equal(
      recipeBrowserInspectorSource.includes('Recipe.Details'),
      false,
      'the invented "Recipe details" heading is gone'
    );

    // `Edit recipe` is the point of the inspector: the accent-filled primary. There used to
    // be no Edit at all, and Delete sat as a peer of Duplicate.
    assert.ok(
      recipeBrowserInspectorSource.includes('data-recipe-action="edit"'),
      'the inspector exposes the primary Edit action'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('onEdit = () => {}'),
      'the inspector takes an onEdit callback'
    );
    assert.ok(
      recipeBrowserInspectorSource.includes('manager-recipe-browser-inspector-delete'),
      'Delete is a dark danger button below Edit, not a peer of Duplicate'
    );

    // The reserved alchemy-Simple failure group is SHOWN (danger-toned), not filtered out —
    // deleting it made an alchemy recipe's failure output invisible.
    assert.ok(
      recipeBrowserInspectorSource.includes("data-recipe-produces={row.failure ? 'failure' : 'success'}"),
      'every produced group is rendered, toned by role'
    );
  });

  it('keeps first-slice action and navigation hierarchy focused', () => {
    assert.ok(!rootSource.includes('function viewKicker'), 'top-bar view kickers should not duplicate the page title');
    assert.ok(!rootSource.includes('{viewKicker()}'), 'top-bar header should render only the page title and subtitle');
    assert.ok(
      rootSource.includes('visiblePlaceholderViews'),
      'root should derive selected-system placeholder nav from selection and feature gates'
    );
    // Issue 745: the Crafting group is unconditional (v1.3 headline); the experimental
    // toggle now only gates the unimplemented Graph placeholder.
    assert.ok(rootSource.includes('const experimentalFeaturesEnabled = $derived($viewState.experimentalFeaturesEnabled === true)'), 'root should derive the experimental gate for the Graph placeholder');
    assert.ok(!rootSource.includes('recipesRouteEnabled'), 'the recipes-route experimental gate should be gone');
    assert.ok(!rootSource.includes('!recipesAvailable'), 'route normalization should no longer gate crafting views on the experimental toggle');
    assert.ok(!rootSource.includes("{#if recipesRouteEnabled}"), 'the Crafting rail group should render unconditionally');
    assert.ok(rootSource.includes("if (view.id === 'graph') return experimentalFeaturesEnabled;"), 'the Graph placeholder should be gated on the experimental toggle');
    assert.ok(
      !rootSource.includes("{ id: 'recipes', icon: 'fas fa-scroll'"),
      'the disabled Recipes placeholder should be removed now that Crafting is always available'
    );
    assert.ok(
      rootSource.includes("{ id: 'graph', icon: 'fas fa-project-diagram'"),
      'the Graph placeholder should remain in the planned placeholder list'
    );
    assert.ok(rootSource.includes('selectSystemAndShowBrowser'), 'root should keep an explicit systems-browser route');
    assert.ok(rootSource.includes('manager-scope-card'), 'root should render the selected system in a rail card');
    // The rail card SELECTS (issue 643): before this the rail could name the selected
    // system but offered no way at all to switch to another one.
    assert.ok(rootSource.includes('data-manager-scope-select'), 'the rail card should carry a real system select');
    assert.ok(!rootSource.includes('manager-scope-name'), 'the static rail name span is retired, not merely hidden');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.AllCraftingSystems'), 'the rail back link should be localized');
    assert.ok(!rootSource.includes('FABRICATE.Admin.Manager.Workspace'), 'the rail should not repeat "GM management" below its own section label');
    assert.ok(rootSource.includes('manager-scope-return'), 'root should expose a return-to-system-library rail action');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.ReturnToSystemLibrary'), 'return-to-library action should be localized');
    assert.ok(!rootSource.includes('SystemEdit.EditBadge'), 'system settings nav should not render the former Edit badge');
    assert.ok(rootSource.includes("setView('essences')"), 'essences should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("setView('tags')"), 'tags and categories should be exposed as a real selected-system route');
    assert.ok(rootSource.includes("activeView = 'essence-edit'"), 'essence edit actions should transition to the local edit route');
    assert.ok(!rootSource.includes("{ id: 'essences'"), 'essences should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes("{ id: 'tags'"), 'tags should not remain a disabled placeholder route');
    assert.ok(!rootSource.includes('clearSelectedSystem'), 'root should not expose a selected-system clear route');
    assert.ok(!rootSource.includes("selectSystem('', 'systems')"), 'selected-system rail should not clear real store selection');
    assert.ok(!rootSource.includes('manager-scope-clear'), 'selected-system rail should not render the old x clear icon');
    assert.ok(managerSource.includes('toggleSystemEnabled'), 'systems browser should expose interactive row status toggles');
    assert.ok(systemsBrowserSource.includes('manager-status-toggle'), 'systems browser should render status as a toggle control');
    assert.ok(recipesBrowserSource.includes('manager-status-toggle'), 'recipes browser should render status as a toggle control');
    assert.ok(!recipesBrowserSource.includes('type="checkbox"\n                  checked={recipe.enabled !== false}'), 'recipes browser should not render recipe status as a checkbox');
    assert.ok(!rootSource.includes("setView('systems')"), 'systems should not be exposed as a left-rail tab');
    assert.ok(!rootSource.includes('manager-count-cluster'), 'system rows should not duplicate inspector counts inline');
    assert.ok(!rootSource.includes('FABRICATE.Admin.Manager.QuickActions'), 'inspector should not duplicate row actions');
    assert.ok(
      !rootSource.replace(/\r\n/g, '\n').includes("{:else}\n        <button type=\"button\" class=\"manager-button\" onclick={importSystem}>\n          <i class=\"fas fa-file-import\" aria-hidden=\"true\"></i>\n          <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>\n        </button>\n        <button type=\"button\" class=\"manager-button\" onclick={openCurrentAdmin}>"),
      'system library header should not render the legacy admin launch button'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.SystemLibraryHint, 'Select a row to view counts and enabled features.');
    assert.equal(
      lang.FABRICATE.Admin.Manager.InspectorHint,
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    );
    assert.ok(rootSource.includes("FABRICATE.Admin.Manager.EmptySetup.Title"), 'no-systems inspector should use localized setup copy');
    assert.ok(rootSource.includes("https://mistersilver-uk.github.io/fabricate/quickstart"), 'no-systems inspector should link to the published quickstart');
    assert.ok(rootSource.includes("https://mistersilver-uk.github.io/fabricate"), 'no-systems inspector should link to the published docs');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Title, 'Set up your first system');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Quickstart, 'Quickstart');
    assert.equal(lang.FABRICATE.Admin.Manager.EmptySetup.Docs, 'Docs');
    assert.ok(managerSource.includes('FABRICATE.Admin.Manager.Environment.EmptyTitle'), 'empty environments browser should use Manager localized copy');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.EmptySetup.Title'), 'empty environments inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://mistersilver-uk.github.io/fabricate/gathering-environments'), 'empty environments inspector should link to published gathering docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptyTitle, 'Prepare gathering building blocks first');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptyHint,
      'Define gathering tasks and events before creating environments, then attach those building blocks to each location players can gather from.'
    );
    assert.ok(rootSource.includes('manager-nav-submenu'), 'gathering sections should render in the left rail submenu');
    assert.ok(rootSource.includes('manager-nav-toggle'), 'gathering rail should expose an expand/collapse control');
    assert.ok(rootSource.includes("manager-nav-group ${gatheringMenuExpanded ? 'is-expanded' : ''}"), 'expanded gathering rail should style as one submenu group');
    assert.ok(rootSource.includes('const gatheringEventDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.events) ? selectedGatheringSystemConfig.events : [])'), 'root should derive reusable gathering event counts from selected gathering config');
    assert.ok(rootSource.includes('total: environmentList.length + gatheringTaskDefinitions.length + gatheringEventDefinitions.length'), 'gathering parent count should summarize environments, tasks, and events');
    // Issue 643: a rail count is a bare mono numeral, not a chip.
    assert.ok(rootSource.includes('<span class="manager-nav-count">{gatheringNavCounts.total}</span>'), 'gathering parent should render a summary count numeral');
    assert.ok(rootSource.includes('gatheringNavCounts[gatheringItem.id]'), 'gathering submenu items should render their count chips from gathered section counts');
    assert.equal(rootSource.includes("manager-nav-parent ${isGatheringRoute ? 'is-active' : ''}"), false, 'gathering parent should not use the selected pill class');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Nav.ExpandGathering'), 'gathering rail expand label should be localized');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Nav.CollapseGathering'), 'gathering rail collapse label should be localized');
    assert.equal(environmentsBrowserSource.includes('manager-gathering-tabs'), false, 'gathering page should not render local section tabs');
    assert.ok(rootSource.includes("let activeGatheringTab = $state('environments')"), 'root should own gathering tab state for inspector coordination');
    assert.ok(environmentsBrowserSource.includes("activeGatheringTab = 'environments'"), 'gathering page should accept environments as the default active tab');
    assert.ok(environmentsBrowserSource.includes('onSelectGatheringTab(tabId)'), 'gathering page should report tab changes to the root');
    assert.ok(rootSource.includes('data-gathering-inspector-placeholder'), 'right inspector should render placeholders for non-environment gathering tabs');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.Manager\.Environment\.Actions/g)?.length ?? 0,
      1,
      'environment actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions')}</h3>"),
      'selected environment inspector should not render a redundant Environment actions card'
    );
    assert.ok(environmentsBrowserSource.includes('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint'), 'gathering task browser copy should be localized');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('tasks')"), 'empty environments guidance should route to the Tasks tab');
    assert.ok(environmentsBrowserSource.includes("selectGatheringTab('encounters')"), 'empty environments guidance should route events to the Events tab');
    assert.ok(environmentsBrowserSource.includes('manager-environment-action-grid'), 'environment rows should keep quick action wiring');
    assert.ok(environmentsBrowserSource.includes('onEditEnvironment(environment.id)'), 'environment rows should wire edit quick actions');
    assert.ok(environmentsBrowserSource.includes('onDuplicateEnvironment(environment.id)'), 'environment rows should wire duplicate quick actions');
    assert.ok(environmentsBrowserSource.includes('onDeleteEnvironment(environment.id)'), 'environment rows should wire delete quick actions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Label, 'Gathering sections');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments, 'Environments');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks, 'Tasks');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters, 'Events');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings, 'Settings');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandGathering, 'Expand gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseGathering, 'Collapse gathering menu');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenTasks, 'Review tasks');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenEvents, 'Review events');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint, 'Browse gathering tasks before attaching them to environments.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint, 'Browse reusable events before attaching them to environments.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint, 'Set system-level drop resolution and event rules for gathering.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayTitle, 'Times of day');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.WeatherTitle, 'Weather conditions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptySetup.Title, 'Plan gathering content');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Environment.EmptySetup.StepEvents,
      'Prepare event options that can be reused across your locations.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs, 'Gathering docs');
    // The empty-recipes setup card moved into the extracted library inspector with
    // the rest of the aside (issue 643); the root still supplies the component count
    // and the Components deep-link.
    assert.ok(recipeBrowserInspectorSource.includes('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title'), 'empty recipes inspector should use localized setup copy');
    assert.ok(recipeBrowserInspectorSource.includes('https://mistersilver-uk.github.io/fabricate/recipes'), 'empty recipes inspector should link to published recipe docs');
    assert.ok(recipeBrowserInspectorSource.includes('componentCount > 0'), 'empty recipes inspector should branch on selected-system component count');
    assert.ok(rootSource.includes('componentCount={selectedCounts.components}'), 'the root should feed the inspector its component count');
    assert.ok(rootSource.includes("onAddComponents={() => setView('components')}"), 'empty recipes inspector should route zero-component setup to Components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.Title, 'Set up recipes');
    assert.equal(
      lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint,
      'Add components before creating recipes so ingredients, tools, and results have reusable items to reference.'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents, 'Add components');
    assert.equal(lang.FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs, 'Recipe docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Component.EmptySetup.Title'), 'empty components inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://mistersilver-uk.github.io/fabricate/crafting-systems#components'), 'empty components inspector should link to published component docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.Title, 'Set up components');
    assert.equal(lang.FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs, 'Component docs');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Essence.EmptySetup.Title'), 'empty essences inspector should use localized setup copy');
    assert.ok(rootSource.includes('https://mistersilver-uk.github.io/fabricate/essences'), 'empty essences inspector should link to published essence docs');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.Title, 'Set up essences');
    assert.equal(lang.FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs, 'Essence docs');
  });

  it('keeps manager tags and categories route focused and store-wired', () => {
    assert.ok(
      rootSource.includes("import TagsCategoriesView from './TagsCategoriesView.svelte';"),
      'root should import the focused tags/categories page'
    );
    assert.ok(rootSource.includes('store.addCategory?.(value, icon)'), 'category add should delegate to the admin store with its icon');
    assert.ok(rootSource.includes('store.removeCategory?.(category)'), 'category remove should delegate to the admin store');
    // Per-category icon persistence (issue 689) is a dedicated store seam.
    assert.ok(rootSource.includes('store.setCategoryIcon?.(name, icon)'), 'category icon edits should delegate to the admin store');
    // The COMPONENT category vocabulary (issue 676) — the sibling of the two above,
    // and a SEPARATE store action: it must never be folded into addCategory.
    assert.ok(rootSource.includes('store.addComponentCategory?.(value, icon)'), 'component category add should delegate to the admin store with its icon');
    assert.ok(rootSource.includes('store.removeComponentCategory?.(category)'), 'component category remove should delegate to the admin store');
    assert.ok(rootSource.includes('store.setComponentCategoryIcon?.(name, icon)'), 'component category icon edits should delegate to the admin store');
    assert.ok(rootSource.includes('store.addTag?.(value)'), 'tag add should delegate to the admin store');
    assert.ok(rootSource.includes('store.removeTag?.(tag)'), 'tag remove should delegate to the admin store');
    // The destructive delete is now confirmed inline in the focused route (issue 689),
    // then cascades through the store's remove ops — not an external confirm seam.
    assert.ok(tagsCategoriesSource.includes('onRemoveCategory'), 'focused route should own the vocabulary remove wiring');
    assert.ok(tagsCategoriesSource.includes('GeneralReservedFeedback'), 'focused route should keep reserved General feedback visible');
    assert.ok(!/\b(?:game|ui|Hooks|CONFIG)\b/.test(tagsCategoriesSource), 'tags/categories route should not directly reference Foundry globals');
  });

  it('keeps manager essence browsing browser-only and source UI feature-gated', () => {
    assert.ok(
      rootSource.includes("import EssenceEditView from './EssenceEditView.svelte';"),
      'root should import the dedicated essence edit route'
    );
    assert.ok(rootSource.includes('showEssenceSourceUi'), 'root should derive the effect-transfer source UI gate');
    assert.ok(rootSource.includes("currentView === 'essence-edit'"), 'root should route the dedicated edit view');
    assert.ok(rootSource.includes('confirmDiscardDirtyEssenceDraft'), 'root should protect dirty essence edit drafts when a confirm seam is available');
    assert.ok(essenceBrowserSource.includes('onEditEssence'), 'browser row edit should ask the root to route to edit');
    assert.ok(essenceBrowserSource.includes('showSourceUi'), 'browser should receive the source UI feature gate');
    assert.ok(!essenceBrowserSource.includes('onUpdateEssence'), 'browser should not own essence update persistence');
    assert.ok(!essenceBrowserSource.includes('manager-essence-edit-row'), 'browser should not render inline edit rows');
    assert.ok(!essenceBrowserSource.includes('manager-essence-create-name'), 'browser should not render inline create fields');
    assert.ok(!essenceBrowserSource.includes('manager-essence-action-band'), 'browser should not duplicate the route-header create action');
    assert.ok(!essenceBrowserSource.includes("text('FABRICATE.Admin.Manager.Essence.SourceLinked'"), 'browser should not render linked-source badges');
    assert.ok(essenceBrowserSource.includes('manager-essence-source-cell-image'), 'browser source column should render resolved source images');
    assert.ok(essenceBrowserSource.includes('FABRICATE.Admin.Manager.Essence.SourceNoneShort'), 'browser source column should render compact None copy when unresolved');
  });

  it('uses shared manager essence picker controls on the dedicated edit route', () => {
    assert.ok(essenceEditSource.includes("import IconPicker from '../../components/IconPicker.svelte';"), 'edit route should use the shared IconPicker');
    assert.ok(essenceEditSource.includes("import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';"), 'edit route should use the shared source selector');
    assert.ok(essenceEditSource.includes('showSourceUi'), 'edit route should gate source controls by effect transfer');
    assert.ok(essenceEditSource.includes('onDirtyChange(dirty)'), 'edit route should expose dirty state to route-exit protection');
    assert.ok(essenceEditSource.includes('onSave(draftId || null, updates)'), 'edit route should delegate create and update persistence to the root/store seam');
    assert.ok(essenceEditSource.includes('id="manager-essence-edit-form"'), 'edit route should expose a form target for route-header save actions');
    assert.ok(!essenceEditSource.includes('EditKicker'), 'edit route should not render a duplicate inner route header');
    assert.ok(!essenceEditSource.includes('IconClassHint'), 'edit route should not expose raw icon class copy');
    assert.ok(rootSource.includes('form="manager-essence-edit-form"'), 'root header should own the primary save action for the edit form');
    assert.ok(!rootSource.includes('data-essence-action="edit"'), 'inspector should not duplicate browse row edit actions');
    assert.ok(!rootSource.includes('data-essence-action="delete"'), 'inspector should not duplicate browse row delete actions');
    assert.ok(rootSource.includes('data-essence-action="copy-source"'), 'inspector should expose source UUID copy through the source action row');
    assert.ok(rootSource.includes('data-essence-action="unlink-source"'), 'inspector should expose source unlink through the source action row');
    assert.ok(rootSource.includes('store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId })'), 'inspector source changes should use updateEssence');
    assert.ok(rootSource.includes('importSingleManagedItemFromDrop'), 'inspector source drops should reuse the managed-item import seam');
    assert.ok(!essenceEditSource.includes('game.'), 'edit route should not reference Foundry runtime globals');
  });

  it('wires production essence dirty confirmation and manager app close guard', () => {
    assert.ok(appSource.includes('confirmDiscardEssenceDraft: () => confirmDialog'), 'v2 app should provide a production discard confirmation service');
    for (const key of [
      'DiscardDirtyTitle',
      'DiscardDirtyContent',
      'DiscardDirtyConfirm',
      'DiscardDirtyCancel'
    ]) {
      assert.equal(typeof lang.FABRICATE.Admin.Manager.Essence[key], 'string', `en.json should define Essence.${key}`);
    }
    assert.ok(appSource.includes('registerEssenceDirtyGuard'), 'v2 app should accept the route dirty guard');
    assert.ok(appSource.includes('async close(options)'), 'v2 app should guard window close');
    assert.ok(appSource.includes('canCloseEssence === false'), 'v2 app close should stay open when discard is declined');
  });

  it('keeps the recipes browser browser-only and wired to existing callbacks', () => {
    for (const snippet of [
      'store.setRecipeSearch?.',
      'store.toggleRecipeEnabled?.',
      'store.createRecipe?.()',
      'store.duplicateRecipe?.(recipeId)',
      'store.deleteRecipe?.(recipeId)'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    // The recipes header now offers a single primary "Create recipe" action
    // (create-then-edit) instead of crafting-system import/export, which moved off
    // the recipes header entirely.
    assert.ok(rootSource.includes('function createRecipe('), 'createRecipe handler should be defined');
    assert.ok(!rootSource.includes('onclick={importRecipes}'), 'recipes header should not render import');
    assert.ok(!rootSource.includes('onclick={exportRecipes}'), 'recipes header should not render export');
    // The recipe-edit route is reached BOTH from the inspector's Edit action and from
    // each row's own Edit pencil, restored to match the Books & Scrolls row edit (issue
    // 643): the inspector wires onEdit → editRecipe, and the row wires onEditRecipe →
    // editRecipe(id).
    assert.ok(rootSource.includes('onEdit={() => editRecipe(selectedRecipe?.id)}'), 'inspector Edit should be wired to editRecipe');
    assert.ok(rootSource.includes('onEditRecipe={(id) => editRecipe(id)}'), 'the row Edit pencil should be wired to editRecipe(id)');
    assert.ok(rootSource.includes('function editRecipe('), 'editRecipe navigation should be defined');
    assert.ok(rootSource.includes('function backToRecipesBrowse('), 'backToRecipesBrowse navigation should be defined');
    assert.ok(rootSource.includes("'recipe-edit'"), 'recipe-edit route should be wired');
    // saveRecipeDraft lives in the root (it commits the root-held draft), so scope
    // the inline-save absence to the browser source instead.
    assert.ok(!recipesBrowserSource.includes('saveRecipe'), 'recipes browser should not introduce inline save behavior');
    assert.ok(!rootSource.includes('required station'), 'recipes browser should not introduce unsupported recipe fields');
  });

  it('keeps the components browser browser-only and wired to existing component callbacks', () => {
    for (const snippet of [
      'store.setItemSearch?.',
      'services?.onDropItem?.(data)',
      'store.deleteComponent?.(itemId)',
      'services?.onCopySourceUuid?.(uuid)'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    assert.ok(rootSource.includes("activeView = view"), 'components should use the selected-system route state');
    assert.ok(!rootSource.includes('usageCount ='), 'components browser should not invent usage counts');
    assert.ok(!rootSource.includes('stale source'), 'components browser should not invent source freshness labels');
  });

  it('AC14: confirmComponentRouteExit retains NO component-edit bypass (issue 676)', () => {
    // LOAD-BEARING ASYMMETRY. `confirmComponentRouteExit` deliberately LACKS the
    // `|| nextView === '<kind>-edit'` bypass its recipe and environment siblings carry
    // (`confirmRecipeRouteExit`: `if (activeView !== 'recipe-edit' || nextView === 'recipe-edit') return true;`).
    //
    // That omission is exactly what makes `editComponent` guard component -> component
    // navigation — i.e. it is what makes the salvage "Edit ↗" deep link safe. An
    // implementer told to "mirror the Recipe Studio" copies the bypass and silently
    // discards a dirty draft on a deep-link jump, with nothing failing.
    const guard = rootSource.slice(
      rootSource.indexOf('function confirmComponentRouteExit'),
      rootSource.indexOf('function confirmEnvironmentRouteExit')
    );
    assert.ok(guard.length > 0, 'expected to locate confirmComponentRouteExit');
    assert.ok(
      guard.includes("if (activeView !== 'component-edit') return true;"),
      'the component route guard should short-circuit only on the ACTIVE view'
    );
    assert.ok(
      !guard.includes("nextView === 'component-edit'"),
      'the component route guard must NOT gain the recipe/environment nextView bypass'
    );
    // The sibling that DOES carry it, pinned so this test cannot pass vacuously by the
    // bypass string simply having been renamed everywhere.
    assert.ok(
      rootSource.includes("if (activeView !== 'recipe-edit' || nextView === 'recipe-edit') return true;"),
      'the recipe sibling still carries the bypass this one deliberately omits'
    );
  });

  it('routes the components row Edit action through the in-manager component-edit view', () => {
    assert.ok(
      rootSource.includes("activeView = 'component-edit'"),
      'editComponent should set the activeView to the in-manager component-edit route'
    );
    assert.ok(
      rootSource.includes("import ComponentEditView"),
      'root should import the ComponentEditView'
    );
    assert.ok(
      rootSource.includes("store.updateComponent?."),
      'root should persist component-edit saves through the admin-store updateComponent action'
    );
    assert.ok(
      !rootSource.includes('services?.onEditComponent?.'),
      'manager row Edit should no longer launch the legacy component editor'
    );
    const componentEditScript = componentEditSource.split('</script>')[0] || componentEditSource;
    assert.ok(
      !/\b(?:game|ui|Hooks|CONFIG)\.[a-zA-Z]/.test(componentEditScript),
      'ComponentEditView script should not reference Foundry globals directly'
    );
    assert.ok(
      !componentEditSource.includes('foundry.applications'),
      'ComponentEditView should not import Foundry application classes'
    );
  });

  it('uses a purpose-built manager environment editor instead of mounting the legacy tab', () => {
    assert.ok(
      rootSource.includes("import EnvironmentEditView from './EnvironmentEditView.svelte';"),
      'environment edit route should import the v2 editor view'
    );
    assert.ok(!rootSource.includes("import EnvironmentsTab from '../EnvironmentsTab.svelte';"), 'manager root should not import the full legacy environments tab');
    assert.ok(!rootSource.includes('forceEditorOpen'), 'manager edit route should not force-open the legacy environment editor');
    // The v2 environment editor is a composition/wrapper editor: it composes
    // reusable library tasks/events into one environment via include/exclude,
    // ordering, and a shared automatic|manual composition mode. It does NOT
    // author reusable source records (that lives in the standalone
    // gathering-task-edit / gathering-event-edit routes), so it must wire the
    // composition store actions rather than the inline task-authoring handlers.
    for (const snippet of [
      'store.updateEnvironmentDraft',
      'store.saveEnvironmentDraft',
      'store.deleteEnvironmentDraft',
      'store.setEnvironmentCompositionMode',
      'store.includeEnvironmentRecord',
      'store.forceIncludeEnvironmentRecord',
      'store.excludeEnvironmentRecord',
      'store.restoreEnvironmentRecord',
      'store.reorderEnvironmentRecord',
      'composition={$viewState.environmentComposition}'
    ]) {
      assert.ok(rootSource.includes(snippet), `environment edit route should wire ${snippet}`);
    }
    for (const snippet of [
      'store.addEnvironmentTaskResultGroup',
      'store.addEnvironmentTaskCatalyst',
      'store.updateEnvironmentTaskVisibility',
      'store.updateEnvironmentTaskCheck'
    ]) {
      assert.ok(!environmentEditSource.includes(snippet), `environment composition editor should not author tasks via ${snippet}`);
    }
    assert.ok(!environmentEditSource.includes("id: 'advanced'"), 'environment editor should not define an advanced task tab');
    assert.ok(!environmentEditSource.includes('manager-environment-details-tabs'), 'environment editor should not render environment advanced tabs');
    assert.ok(!environmentEditSource.includes('manager-environment-evidence-column'), 'environment editor should no longer render the duplicated evidence column');
  });

  it('wires Manager gathering libraries, global conditions, and environment composition controls', () => {
    // Global conditions and vocabularies are authored from the gathering
    // workspace browser (settings tab); library task/event authoring and rules
    // live on their own routes, so those store actions are invoked by root-owned
    // functions rather than passed into the environment composition editor.
    for (const snippet of [
      'gatheringConfig={$viewState.gatheringConfig}',
      'onUpdateGatheringConditions={store.updateGatheringConditions}',
      'onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}',
      'onAddGatheringConditionValue={store.addGatheringConditionValue}',
      'onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}',
      'onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}',
      'onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}',
      'onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should wire ${snippet}`);
    }
    // NOTE: per-token environment-editor contracts were removed when the editor
    // was placeholder'd out pending redesign. The store wirings above and the
    // settings/browser surfaces below still need to pass.
    assert.ok(rootSource.includes('data-gathering-inspector-rules'), 'root should render the settings rules inspector');
    assert.ok(environmentsBrowserSource.includes('data-gathering-condition-panel={condition.kind}'), 'settings tab should render condition vocabulary panels');
    assert.ok(environmentsBrowserSource.includes('onToggleGatheringConditionEnabled?.'), 'settings condition panels should wire matching toggles');
    assert.ok(environmentsBrowserSource.includes('onAddGatheringConditionValue?.'), 'settings condition panels should wire value additions');
    assert.ok(environmentsBrowserSource.includes('onUpdateGatheringConditionValue?.'), 'settings condition panels should wire label and icon updates');
    assert.ok(environmentsBrowserSource.includes('onDeleteGatheringConditionValue?.'), 'settings condition panels should wire value deletion');
    assert.ok(environmentsBrowserSource.includes('data-gathering-vocabulary-panel={vocabulary.kind}'), 'settings tab should render region and biome vocabulary panels');
    assert.ok(environmentsBrowserSource.includes('onAddGatheringVocabularyValue?.'), 'settings vocabulary panels should wire value additions');
    assert.ok(environmentsBrowserSource.includes('onUpdateGatheringVocabularyValue?.'), 'settings vocabulary panels should wire label, icon, and colour updates');
    assert.ok(environmentsBrowserSource.includes('onDeleteGatheringVocabularyValue?.'), 'settings vocabulary panels should wire value deletion');
    assert.ok(environmentsBrowserSource.includes('ManagerColorPicker'), 'settings biome panels should use the manager color picker');
    assert.ok(environmentsBrowserSource.includes('IconPicker'), 'settings condition panels should reuse the shared icon picker');
    assert.ok(environmentsBrowserSource.includes('manager-condition-label-input'), 'settings condition panels should expose editable display labels');
    assert.ok(environmentsBrowserSource.includes("onAddGatheringConditionValue?.(kind, { label: value, icon: conditionAddIcon(kind) }"), 'settings condition add should include the selected icon');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Conditions.NewIcon, 'New value icon');
    // NOTE: vocabulary-CSV contracts on environmentEditSource removed pending editor redesign.
    assert.ok(rootSource.includes('updateSelectedGatheringRules'), 'root should wire rule updates');
    assert.ok(rootSource.includes('manager-rule-copy'), 'root should render rule descriptions beside inspector icons');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="rewardLimit"'), 'root should render the reward limit stepper');
    assert.ok(rootSource.includes('data-gathering-rule-stepper="eventLimit"'), 'root should render the event limit stepper');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop'), 'event rule select should use event-specific drop labels');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop, 'Highest ranked successful drop');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.AllDrops, 'All successful drops');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops, 'Limit successful drops');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop, 'Highest ranked triggered event');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops, 'All triggered events');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops, 'Limit triggered events');
    assert.ok(rootSource.includes('selectedGatheringConditionShortcuts'), 'root should derive selected-system condition shortcuts');
    assert.ok(rootSource.includes('buildSelectedGatheringConditionShortcuts'), 'root should keep shortcut visibility gated by selected-system gathering conditions');
    assert.ok(rootSource.includes('data-systems-gathering-conditions'), 'systems inspector should render a global condition shortcut card');
    assert.ok(rootSource.includes('data-systems-gathering-condition={condition.kind}'), 'systems inspector should render one shortcut per enabled condition dimension');
    assert.ok(rootSource.includes("store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId })"), 'systems inspector shortcuts should reuse current condition persistence with selected system id');
    // NOTE: per-token environment-editor negative assertions removed pending editor redesign.
  });

  // NOTE: FilePicker and scene-drop-zone contracts on environmentEditSource removed
  // when the editor was placeholder'd out pending redesign.

  it('wires Manager Gathering Tasks browser through root-owned selection and store callbacks', () => {
    for (const snippet of [
      'selectedGatheringTaskId',
      'onSelectGatheringTask={selectGatheringTask}',
      'onCreateGatheringTask={createGatheringTask}',
      'onEditGatheringTask={editGatheringTask}',
      'onDuplicateGatheringTask={duplicateGatheringTask}',
      'onDeleteGatheringTask={deleteGatheringTask}',
      'onToggleGatheringTaskEnabled={toggleGatheringTaskEnabled}',
      'store.duplicateGatheringLibraryTask',
      'data-gathering-task-inspector',
      'GatheringTaskEditView',
      '{itemCards}',
      'data-gathering-task-drop-inspector',
      'addGatheringDropModifier',
      'updateGatheringDropModifier',
      'manager-drop-editor-actions'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include ${snippet}`);
    }
    for (const snippet of [
      'GatheringTasksBrowserView',
      'tasks={selectedGatheringSystemConfig.tasks || []}',
      'selectedTaskId',
      'managedItemOptions'
    ]) {
      assert.ok(environmentsBrowserSource.includes(snippet), `environment browser should include ${snippet}`);
    }
    for (const snippet of [
      'data-gathering-tasks-browser',
      'manager-gathering-tasks-table',
      'biomeChips(task)',
      'timeChips(task)',
      'weatherChips(task)',
      'rowChips(task)',
      'data-gathering-task-tags',
      'onDuplicateTask(selectedSystemId, task.id)',
      'onDeleteTask(selectedSystemId, task.id)',
      'onToggleTaskEnabled(selectedSystemId, task.id'
    ]) {
      assert.ok(gatheringTasksBrowserSource.includes(snippet), `task browser should include ${snippet}`);
    }
    for (const snippet of [
      'data-gathering-task-editor',
      'class:has-reward-rule-notice={showRewardRuleNotice}',
      'data-gathering-task-core-editor',
      'data-gathering-task-availability',
      'data-gathering-task-component-browser',
      'data-gathering-task-component-grid',
      'data-gathering-component-card',
      'data-gathering-component-name-search',
      'data-gathering-component-tag-search',
      'manager-selected-tag-pill',
      'data-gathering-task-drops-table',
      'data-gathering-task-availability-option',
      'data-gathering-task-availability-pill',
      'data-gathering-task-drop-component-cell',
      'data-gathering-task-drop-chance-cell',
      'data-gathering-task-drop-count',
      'manager-task-drop-controls',
      'manager-task-drop-footer',
      'manager-task-component-browser-card',
      'manager-task-component-grid',
      'manager-task-component-card-grip',
      'let pageSize = $state(5)',
      'manager-drop-cell',
      'manager-drop-component-cell',
      'manager-drop-quantity-cell',
      'manager-drop-modifier-pill',
      'manager-drop-modifier-list',
      'manager-drop-modifier-overflow',
      'manager-drop-rate-value',
      'manager-drop-rate-percent',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
      'inputmode="numeric"',
      "pattern={'[1-9][0-9]{0,2}'}",
      'pattern="[0-9]*"',
      'onClearDropComponent',
      'onDropComponentMouseDown',
      'onDropRateInput',
      'onDropRateBlur',
      'onDropRateKeydown',
      'onComponentDragStart',
      'FabricateManagedComponent',
      "onUpdateDrop(rowId, { componentId: data.componentId, itemUuid: '', systemItemId: '', name: '', enabled: true })",
      'dropRateTierClass',
      'dropRateTierColor',
      'onQuantityInput',
      'onQuantityKeydown',
      'oncontextmenu',
      'use:dragDrop',
      'onImportDrop(rowId, data)',
      'onPickImagePath',
      'DropChance',
      'ClearDropComponentHint',
      'DropQuantityColumn',
      'DropModifierOverflowHint',
      'RewardRuleNotice'
    ]) {
      assert.ok(gatheringTaskEditSource.includes(snippet), `task editor should include ${snippet}`);
    }
    for (const snippet of [
      'manager-drop-editor-values',
      'data-gathering-drop-inspector-rate',
      'data-gathering-drop-inspector-count',
      'gatheringDropRateTierClass',
      'gatheringDropRateTierColor',
      'onGatheringDropRateKeydown',
      'onGatheringDropCountKeydown',
      'manager-drop-rate-control',
      'manager-drop-rate-track',
      'manager-drop-rate-fill'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should include selected drop inspector ${snippet}`);
    }
    assert.ok(!gatheringTaskEditSource.includes('manager-task-editor-tabs'), 'task editor should be a one-page editor without tab navigation');
    assert.ok(gatheringTaskEditSource.includes('TaskIdentity'), 'task editor should render a visible task identity heading');
    assert.ok(!/Tasks\.TaskId(?!entity)/.test(gatheringTaskEditSource), 'task editor should not render the raw internal task id localization');
    assert.ok(!gatheringTaskEditSource.includes('Internal ID'), 'task editor should not render the raw internal task id label');
    assert.ok(!gatheringTaskEditSource.includes('BackToLibrary'), 'task editor should not render a duplicate central back-to-library control');
    assert.ok(!gatheringTaskEditSource.includes('type="checkbox"'), 'task editor status toggle should use the shared button pattern');
    assert.ok(!gatheringTaskEditSource.includes('<select value={selectedCondition'), 'task availability should not use native single-select controls');
    assert.ok(!gatheringTaskEditSource.includes('function selectedCondition('), 'task availability should not collapse arrays to a single selection');
    assert.ok(!gatheringTaskEditSource.includes('Tasks.SelectDrop'), 'drop rows should not render a row-level edit/select quick action');
    assert.ok(!gatheringTaskEditSource.includes('data-gathering-task-drop-actions'), 'drop rows should not render row-level duplicate/delete actions');
    assert.ok(!gatheringTaskEditSource.includes('data-gathering-task-drop-row-number'), 'drop rows should not add a leading row number column');
    assert.ok(!gatheringTaskEditSource.includes('EditDrop'), 'drop rows should not add an edit quick action');
    assert.ok(!gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-component-cell'), 'drop component row values should not render responsive duplicate labels');
    assert.ok(!gatheringTaskEditSource.includes('manager-labeled-cell manager-drop-rate-cell'), 'drop chance row values should not render responsive duplicate labels');
    assert.ok(!gatheringTaskEditSource.includes('QuantityShortHint'), 'drop quantity row values should not render an extra helper label');
    assert.ok(!rootSource.includes('selectedGatheringDrop.componentId ||'), 'selected drop inspector should not render a component selector');
    assert.ok(gatheringTaskEditSource.includes('manager-task-media-column'), 'task editor should group image and status in the media column');
    assert.ok(gatheringTaskEditSource.includes('availableConditionOptions'), 'task editor should filter selected availability options out of menus');
    assert.ok(gatheringTaskEditSource.includes('selectedConditionOptions'), 'task editor should render selected availability values as pills');
    assert.ok(gatheringTaskEditSource.includes('StatusOff'), 'task editor should use shared Off status copy');
    assert.ok(gatheringTaskEditSource.includes('StatusOn'), 'task editor should use shared On status copy');
    assert.ok(gatheringTaskEditSource.includes('manager-task-required-tools-card'), 'task editor should render the Required Tools section');
    assert.ok(gatheringTaskEditSource.includes('data-gathering-task-required-tools'), 'Required Tools section should expose a stable data hook');
    assert.ok(gatheringTaskEditSource.includes('onAddToolReference'), 'task editor should call back to the root for tool-reference additions');
    assert.ok(gatheringTaskEditSource.includes('onRemoveToolReference'), 'task editor should call back to the root for tool-reference removals');
    assert.ok(rootSource.includes('selectedGatheringSystemTools'), 'root should derive the per-system tools library for the task editor');
    assert.ok(rootSource.includes('addToolReferenceToSelectedTask'), 'root should expose an add-tool-reference handler');
    assert.ok(rootSource.includes('removeToolReferenceFromSelectedTask'), 'root should expose a remove-tool-reference handler');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsTitle, 'Required Tools');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty, 'No tools required.');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip, 'Deleted tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.SearchTools, 'Search tools...');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.EmptyTitle, 'No gathering tasks yet');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChance, 'Drop chance');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent, 'Drop chance percent');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn, 'Count');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.ClearDropComponentHint, 'Right-click to clear component');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.DropModifierOverflowHint, 'See selected rule for modifiers');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.NoComponent, 'No Component');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.CreateOrAssign, 'Create or assign');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentity, 'Task Identity');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.TaskId, undefined);
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.NewLibraryTask, 'New Gathering Task');
    assert.equal(
      rootSource.match(/FABRICATE\.Admin\.Manager\.Environment\.Tasks\.Actions/g)?.length ?? 0,
      1,
      'gathering task actions localization should remain only for the header aria label, not a redundant inspector card'
    );
    assert.ok(
      !rootSource.includes("<h3 class=\"manager-card-title\">{text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions')}</h3>"),
      'gathering task inspector should not keep an action card heading'
    );
    assert.ok(!rootSource.includes('duplicateGatheringTask(selectedSystemId, selectedGatheringTask.id)'), 'gathering task inspector should not duplicate row-level duplicate actions');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary, 'Back to task library');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix, 'Copy');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.Tasks.Delete, 'Delete gathering task');
    assert.ok(
      rootSource.includes('onclick={deleteGatheringTaskDraft}'),
      'gathering task editor toolbar should wire the delete button to deleteGatheringTaskDraft'
    );
    assert.ok(
      /manager-button is-danger[\s\S]{0,200}deleteGatheringTaskDraft/.test(rootSource),
      'gathering task editor delete button should use the is-danger destructive style'
    );
  });

  // NOTE: status-toggle contract on environmentEditSource removed when the editor
  // was placeholder'd out pending redesign.

  it('wires the Gathering Tools page through root-owned draft callbacks', () => {
    assert.ok(
      rootSource.includes("import ToolsBrowserView from './ToolsBrowserView.svelte';"),
      'root should import ToolsBrowserView'
    );
    for (const snippet of [
      "currentView === 'tools'",
      'enterToolsDraft',
      'saveToolDraft',
      'saveAllDirtyToolDrafts',
      'cancelToolsDraft',
      'addToolToDraft',
      'updateToolInDraft',
      'deleteToolFromDraft',
      'selectDraftTool',
      'setExpandedDraftTool',
      'toolsDraftDirtyToolIds',
      'toolsDraftSelectedToolId',
      'toolsNavCount',
      'selectedToolDraftValidation'
    ]) {
      assert.ok(rootSource.includes(snippet), `root should reference ${snippet}`);
    }
    assert.ok(
      /onclick=\{\(\) => setView\('tools'\)\}/.test(rootSource),
      'root should wire a top-level Tools nav button to setView(\'tools\')'
    );
    assert.ok(
      rootSource.includes('<span class="manager-nav-count">{toolsNavCount}</span>'),
      'root should render a Tools nav count chip'
    );
    assert.ok(
      lang.FABRICATE.Admin.Manager.Tools && typeof lang.FABRICATE.Admin.Manager.Tools === 'object',
      'lang should expose a FABRICATE.Admin.Manager.Tools block'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Title, 'Tools');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Add, 'Add tool');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.Save, 'Save changes');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.NavigationDirty.SaveAll, 'Save All');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.RequirementInstructions, 'Enter an actor roll-data property. The tool is available when the value is greater than zero.');
    assert.equal(lang.FABRICATE.Admin.Manager.Tools.RequirementExampleActorProperty, 'Example: @tools.example.value');
    assert.ok(!toolsBrowserSource.includes('ProviderExpressionInput'), 'tools requirement editor should not expose provider selection');
    assert.ok(toolsBrowserSource.includes('manager-tools-requirement-expression'), 'tools requirement editor should expose a single expression input');
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.GatheringTabs.Tools, 'Tools');
  });

  it('wires a collapsible left rail persisted via the manager setting seam', () => {
    assert.ok(
      rootSource.includes("let railCollapsed = $state(services?.getSetting?.('managerRailCollapsed') === true);"),
      'rail collapsed state should initialize from the persisted managerRailCollapsed client setting'
    );
    assert.ok(
      rootSource.includes('function toggleManagerRail()'),
      'root should expose a rail toggle handler'
    );
    assert.ok(
      rootSource.includes("services?.setSetting?.('managerRailCollapsed', railCollapsed);"),
      'toggling the rail should persist managerRailCollapsed through the setSetting seam'
    );
    assert.ok(
      rootSource.includes("class={`manager-body ${railCollapsed ? 'is-rail-collapsed' : ''}`}"),
      'manager-body should bind the is-rail-collapsed modifier from rail state'
    );
    assert.ok(
      rootSource.includes('class="manager-rail-toggle"'),
      'rail should render a dedicated collapse/expand control'
    );
    assert.ok(
      rootSource.includes('aria-pressed={railCollapsed}'),
      'rail toggle should expose aria-pressed reflecting collapsed state'
    );
    assert.ok(
      rootSource.includes('FABRICATE.Admin.Manager.Nav.CollapseRail')
        && rootSource.includes('FABRICATE.Admin.Manager.Nav.ExpandRail'),
      'rail toggle labels should be localized for both states'
    );
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.CollapseRail, 'Collapse navigation rail');
    assert.equal(lang.FABRICATE.Admin.Manager.Nav.ExpandRail, 'Expand navigation rail');
    assert.ok(
      appSource.includes('getSetting: this._services.getSetting,')
        && appSource.includes('setSetting: this._services.setSetting,'),
      'manager app should expose the setting seam to the Svelte component services'
    );
  });
});

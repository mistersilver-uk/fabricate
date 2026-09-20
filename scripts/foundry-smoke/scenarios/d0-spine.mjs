/**
 * Phase D0's spine owns the phase's one try/catch/finally, its single `screenshot-manager` step,
 * the world-scoped `experimentalFeatures` flip its `finally` restores, and the issue-#807 signals
 * phase E reads; its nine children run in order inside that `try`. `phase` is null because the
 * skipped branch opens a differently-named phase.
 */

import {
  TRANSIENT_TEARDOWN_SKIP_PREFIX,
  shouldTolerateSmokeTeardown,
} from '../../lib/foundrySmokeSignal.js';
import {
  MANAGER_SYSTEM_RAIL_ENTRIES,
  MANAGER_WORLD_SCOPED_RAIL_ENTRIES,
  railSelector,
} from '../../lib/managerRailEntries.js';
import {
  assertManagerLayoutStable,
  captureManagerThemes,
  chooseSelectOption,
  returnToSystemLibrary,
} from '../pageOps/managerViews.mjs';
import {
  activateSceneAndAwaitCanvasReady,
  assertNoScreenshotOverlays,
  closeOpenApplications,
  exerciseManagerPointerTargets,
  exerciseManagerSystemEditPointerTargets,
  managerSystemRowSelector,
  selectSmokeSystemInManager,
  setManagerWindowSize,
  settleManagerNav,
} from '../pageOps/pageLifecycle.mjs';

import d0ComponentsChecks from './d0-components-checks.mjs';
import d0Gathering from './d0-gathering.mjs';
import d0ImportAlchemyExperimental from './d0-import-alchemy-experimental.mjs';
import d0Knowledge from './d0-knowledge.mjs';
import d0OverviewInteractables from './d0-overview-interactables.mjs';
import d0Recipes from './d0-recipes.mjs';
import d0TagsEssences from './d0-tags-essences.mjs';
import d0Tools from './d0-tools.mjs';
import d0WorldScopeIdentity from './d0-world-scope-identity.mjs';

async function seedSmokeGatheringLibrary(page, craftingSetup) {
  await page.evaluate(
    async ({ sysId, componentMap }) => {
      const config = foundry.utils.deepClone(
        game.settings.get('fabricate', 'gatheringConfig') || {}
      );
      config.conditions = { ...config.conditions, weather: 'rain', timeOfDay: 'dusk' };
      config.systems ||= {};
      const systemConfig = config.systems[sysId] || {};
      const withoutIds = (entries, ids) =>
        (Array.isArray(entries) ? entries : []).filter(
          (entry) => !ids.has(String(entry?.id || ''))
        );
      config.systems[sysId] = {
        ...systemConfig,
        // System-level GatheringRules: a non-'never' reveal policy is required for the blind
        // environment card to surface the "(x/y)" discovered teaser.
        rules: {
          ...systemConfig.rules,
          revealPolicy: 'onAttempt',
        },
        vocabularies: {
          ...systemConfig.vocabularies,
          regions: { values: ['northreach'] },
        },
        tasks: [
          ...withoutIds(
            systemConfig.tasks,
            new Set([
              'smoke-forage-library',
              'smoke-meadow-herbs',
              'smoke-sunken-survey',
              'smoke-crystal-dew',
              'smoke-slow-bloom',
              'smoke-withered-search',
              'smoke-moonpetal',
            ])
          ),
          {
            id: 'smoke-forage-library',
            name: 'Forage Wild Herbs',
            description: 'Forage the wayside for common herbs and roots.',
            img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
            enabled: true,
            region: 'northreach',
            biomes: ['forest'],
            weather: ['rain'],
            timeOfDay: ['dusk'],
            itemSelectionMode: 'highestRankedDrop',
            toolIds: ['smoke-herbalist-sickle'],
            dropRows: [
              {
                id: 'smoke-drop-herb',
                componentId: componentMap['Mystic Herb'],
                quantity: 2,
                dropRate: 80,
                enabled: true,
              },
            ],
          },
          // Player-gathering scenario library tasks.
          {
            id: 'smoke-meadow-herbs',
            name: 'Gather Meadow Herbs',
            description: 'Pick fresh herbs from the open meadow.',
            img: 'icons/consumables/plants/fern-sprig-stem-leaf-herb-green.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            dropRows: [
              {
                id: 'smoke-meadow-drop',
                componentId: componentMap['Mystic Herb'],
                quantity: 1,
                dropRate: 90,
                enabled: true,
              },
            ],
          },
          {
            id: 'smoke-sunken-survey',
            name: 'Survey Sunken Reagents',
            description: 'Wade the flooded ruins for reagents settled in the silt.',
            img: 'icons/environment/wilderness/wall-ruins.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            dropRows: [
              {
                id: 'smoke-sunken-drop',
                componentId: componentMap['Iron Ore'],
                quantity: 1,
                dropRate: 70,
                enabled: true,
              },
            ],
          },
          {
            id: 'smoke-crystal-dew',
            name: 'Bottle Crystal Dew',
            description: "Cut dew-laden crystal fronds with a herbalist's sickle.",
            img: 'icons/consumables/potions/flask-corked-blue.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            toolIds: ['smoke-herbalist-sickle'],
            dropRows: [
              {
                id: 'smoke-crystal-drop',
                componentId: componentMap['Mystic Herb'],
                quantity: 1,
                dropRate: 80,
                enabled: true,
              },
            ],
          },
          {
            id: 'smoke-slow-bloom',
            name: 'Tend Slow Bloom',
            description: 'Tend the slow bloom until it ripens.',
            img: 'icons/commodities/flowers/lily-bloom.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
            dropRows: [
              {
                id: 'smoke-bloom-drop',
                componentId: componentMap['Mystic Herb'],
                quantity: 1,
                dropRate: 80,
                enabled: true,
              },
            ],
          },
          {
            id: 'smoke-withered-search',
            name: 'Search Withered Patch',
            description: 'Pick over a blighted patch for anything still growing.',
            img: 'icons/consumables/plants/dried-herb-bundle-brown.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            dropRows: [
              {
                id: 'smoke-withered-drop',
                componentId: componentMap['Mystic Herb'],
                quantity: 1,
                dropRate: 0,
                enabled: true,
              },
            ],
          },
          {
            id: 'smoke-moonpetal',
            name: 'Secret Moonpetal Harvest',
            description: 'Harvest moonpetals that open only by night.',
            img: 'icons/commodities/flowers/lotus-white.webp',
            enabled: true,
            region: 'meadowlands',
            itemSelectionMode: 'highestRankedDrop',
            dropRows: [
              {
                id: 'smoke-moonpetal-drop',
                componentId: componentMap['Mystic Herb'],
                quantity: 1,
                dropRate: 70,
                enabled: true,
              },
            ],
          },
        ],
        tools: [
          ...withoutIds(systemConfig.tools, new Set(['smoke-herbalist-sickle'])),
          {
            id: 'smoke-herbalist-sickle',
            label: 'Herbalist Sickle',
            enabled: true,
            componentId: componentMap['Herbalist Sickle'],
            requirement: { formula: '@tools.herbalism.value' },
            breakage: { mode: 'limitedUses', maxUses: 5 },
            onBreak: { mode: 'flagBroken' },
          },
        ],
        events: [
          ...withoutIds(systemConfig.events, new Set(['smoke-bramble-event'])),
          {
            id: 'smoke-bramble-event',
            name: 'Bramble Snare',
            description: 'Thorned brambles snare the careless gatherer.',
            img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
            enabled: true,
            dangerTags: ['hazardous'],
            region: 'northreach',
            biomes: ['forest'],
            weather: ['rain'],
            timeOfDay: ['dusk'],
            dropRate: 35,
          },
        ],
      };
      await game.settings.set('fabricate', 'gatheringConfig', config);

      // Tools are system-owned (the `craftingSystems` setting).
      await game.fabricate.getCraftingSystemManager()?.updateSystem?.(sysId, {
        tools: Array.isArray(config.systems?.[sysId]?.tools) ? config.systems[sysId].tools : [],
      });

      // Seed two environment-store fixtures so the player Gathering tab frame exercises both the
      // locked teaser path and the blind chip + "(x/y)" discovered suffix.
      const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
      if (environmentStore) {
        const existingIds = new Set(
          (environmentStore.list?.() || []).map((env) => String(env?.id || ''))
        );
        if (!existingIds.has('smoke-blind-grove')) {
          await environmentStore.create({
            id: 'smoke-blind-grove',
            craftingSystemId: sysId,
            name: 'Shrouded Grove',
            description: 'A fog-veiled grove where the harvest is never certain until tried.',
            img: 'icons/magic/nature/tree-spirit-green.webp',
            enabled: true,
            selectionMode: 'blind',
            region: 'northreach',
            biomes: ['forest'],
            enabledTaskIds: ['smoke-forage-library'],
          });
        }
        if (!existingIds.has('smoke-locked-hollow')) {
          await environmentStore.create({
            id: 'smoke-locked-hollow',
            craftingSystemId: sysId,
            name: 'Sealed Barrow',
            description: 'A hollow sealed against trespass, not yet open to gatherers.',
            img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
            enabled: false,
            selectionMode: 'targeted',
            region: 'northreach',
            biomes: ['forest', 'ruins'],
            enabledTaskIds: ['smoke-forage-library'],
          });
        }
      }
    },
    { sysId: craftingSetup.systemId, componentMap: craftingSetup.componentMap }
  );
}

export default {
  id: 'd0-spine',
  phase: null,
  section: null,
  children: [
    d0Recipes,
    d0ComponentsChecks,
    d0TagsEssences,
    d0Gathering,
    d0Tools,
    d0WorldScopeIdentity,
    d0Knowledge,
    d0OverviewInteractables,
    d0ImportAlchemyExperimental,
  ],
  publishes: ['d0TeardownTolerated', 'd0RequiredCapturesComplete'],
  consumes: ['cleanup', 'craftingSetup', 'd0RequiredCapturesComplete'],
  async run(ctx, { runChildren }) {
    const { page, results, screenshot, startPhase } = ctx;
    const { cleanup, craftingSetup } = ctx.shared;
    const { RUN_SCREENSHOT_PHASES, SCREENSHOT_SCOPING_ACTIVE, SMOKE_PROFILE } = ctx.profile;
    // Gated behind RUN_SCREENSHOT_PHASES so the CI smoke profile skips the ~25 manager captures and
    // pointer hit-tests; local `full` runs continue to regenerate them for visual verification.
    if (RUN_SCREENSHOT_PHASES) {
      startPhase('phase-D0');
      process.stdout.write('Phase D0: Opening Crafting System Manager...\n');
      let previousExperimentalFeatures = false;
      try {
        previousExperimentalFeatures = await page.evaluate(async (sysId) => {
          const previousExperimentalFeatures = Boolean(
            game.settings.get('fabricate', 'experimentalFeatures')
          );
          await game.settings.set('fabricate', 'experimentalFeatures', true);
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: "The Herbalist's Compendium",
            description:
              'Configure categories, item tags, essences, and crafting behaviour for this system.',
          });
          return previousExperimentalFeatures;
        }, craftingSetup.systemId);
        await seedSmokeGatheringLibrary(page, craftingSetup);

        await page.evaluate(async () => {
          // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
          globalThis.__fabricateSmokeManagerApp = (
            await game.fabricate.api.loadCraftingSystemManagerAppClass()
          ).show();
        });
        await page
          .locator('.fabricate-manager')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await selectSmokeSystemInManager(page, craftingSetup.systemId);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });
        const smokeLibraryCounts = await page.evaluate((sysId) => {
          const rawSystem =
            game.settings.get('fabricate', 'gatheringConfig')?.systems?.[sysId] || {};
          const app = globalThis.__fabricateSmokeManagerApp;
          let state = null;
          const unsubscribe = app?._adminStore?.viewState?.subscribe?.((value) => {
            state = value;
          });
          if (typeof unsubscribe === 'function') unsubscribe();
          const viewSystem = state?.gatheringConfig?.systems?.[sysId] || {};
          return {
            rawTasks: Array.isArray(rawSystem.tasks) ? rawSystem.tasks.length : 0,
            rawEvents: Array.isArray(rawSystem.events) ? rawSystem.events.length : 0,
            rawTools: Array.isArray(rawSystem.tools) ? rawSystem.tools.length : 0,
            viewTasks: Array.isArray(viewSystem.tasks) ? viewSystem.tasks.length : 0,
            viewEvents: Array.isArray(viewSystem.events) ? viewSystem.events.length : 0,
            viewTools: Array.isArray(viewSystem.tools) ? viewSystem.tools.length : 0,
          };
        }, craftingSetup.systemId);
        if (
          smokeLibraryCounts.viewTasks < 1 ||
          smokeLibraryCounts.viewEvents < 1 ||
          smokeLibraryCounts.viewTools < 1
        ) {
          throw new Error(
            `Manager smoke gathering library was not loaded: ${JSON.stringify(smokeLibraryCounts)}`
          );
        }
        let navLabels = await page
          .locator('.fabricate-manager .manager-nav-label')
          .evaluateAll((labels) =>
            labels.map((label) => label.textContent?.trim()).filter(Boolean)
          );
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(
            `Manager default selection should keep System Overview first. Saw: ${navLabels.join(', ')}`
          );
        }
        if (
          (await page
            .locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`)
            .count()) === 0
        ) {
          throw new Error('Manager did not select the smoke test system.');
        }
        if (
          (await page
            .locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")')
            .count()) === 0
        ) {
          throw new Error('Manager root breadcrumb is missing.');
        }
        await assertManagerLayoutStable(page, 'normal default selection');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-default-selection');

        // Capture the real system-library manager under every Fabricate theme
        // (genuine Foundry-mounted DOM re-themed via the theme attribute), then
        // restore the default theme before continuing the default-theme flow.
        await captureManagerThemes(ctx);

        await page
          .locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`)
          .first()
          .click();
        await settleManagerNav(page);
        navLabels = await page
          .locator('.fabricate-manager .manager-nav-label')
          .evaluateAll((labels) =>
            labels.map((label) => label.textContent?.trim()).filter(Boolean)
          );
        if (navLabels.includes('Systems')) {
          throw new Error(
            `Manager selected nav should not expose a Systems tab. Saw: ${navLabels.join(', ')}`
          );
        }
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(
            `Manager selected nav should keep System Overview first. Saw: ${navLabels.join(', ')}`
          );
        }
        // The membership loop, by ID AND then by label (issue 1362).
        for (const entry of [
          ...MANAGER_SYSTEM_RAIL_ENTRIES,
          ...MANAGER_WORLD_SCOPED_RAIL_ENTRIES,
        ]) {
          const button = page.locator(railSelector(entry.id));
          if ((await button.count()) === 0) {
            throw new Error(
              `Manager selected nav is missing rail entry #${entry.id} (${entry.label}). Saw: ${navLabels.join(', ')}`
            );
          }
          // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- a Playwright Locator: innerText() is rendered text, which textContent() does not preserve.
          const rendered = (await button.locator('.manager-nav-label').first().innerText()).trim();
          if (rendered !== entry.label) {
            throw new Error(
              `Manager rail entry #${entry.id} should read "${entry.label}"; it reads "${rendered}".`
            );
          }
        }
        // The rail's crafting-system card selects (issue 643): it names the current system AND
        // lists every other, so the GM can switch without a round trip through the system library.
        const scopeSelectValue = await page
          .locator('.fabricate-manager .manager-scope-card [data-manager-scope-select]')
          .first()
          .inputValue()
          .catch(() => '');
        if (scopeSelectValue !== craftingSetup.systemId) {
          throw new Error(
            `Manager rail system select should name the selected system. Saw: "${scopeSelectValue}".`
          );
        }
        if (
          (await page
            .locator(
              '.fabricate-manager .manager-scope-return[aria-label="Return to System Library"]'
            )
            .count()) === 0
        ) {
          throw new Error('Manager selected-system scope is missing the return-to-library action.');
        }
        if (
          (await page
            .locator(
              '.fabricate-manager .manager-section-header .manager-button:has-text("Import")'
            )
            .count()) > 0
        ) {
          throw new Error('Manager duplicated Import in the System library header.');
        }
        if (
          (await page
            .locator(
              '.fabricate-manager .manager-section-header .manager-button:has-text("Create")'
            )
            .count()) > 0
        ) {
          throw new Error('Manager duplicated Create in the System library header.');
        }
        if (
          (await page
            .locator('.fabricate-manager .manager-card-title:has-text("Quick actions")')
            .count()) > 0
        ) {
          throw new Error('Manager inspector still shows duplicate Quick actions.');
        }
        await assertManagerLayoutStable(page, 'normal selected');
        await exerciseManagerPointerTargets(page, craftingSetup.systemId);
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-normal');

        // Collapsible left rail: capture both the expanded default and the
        // collapsed icon-strip state where the middle content column reclaims
        // the freed rail width and section navigation stays reachable.
        const railToggle = page.locator('.fabricate-manager .manager-rail-toggle').first();
        if ((await railToggle.count()) === 0) {
          throw new Error('Manager rail is missing its collapse/expand toggle control.');
        }
        if (
          (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count()) > 0
        ) {
          // Ensure we start from the expanded baseline before capturing it.
          await railToggle.click();
          await page.waitForTimeout(400);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-expanded');

        await railToggle.click();
        await page.waitForTimeout(500);
        if (
          (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count()) === 0
        ) {
          throw new Error('Manager rail toggle did not collapse the navigation rail.');
        }
        const collapsedNavIcons = await page
          .locator('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button:visible')
          .count();
        if (collapsedNavIcons === 0) {
          throw new Error(
            'Collapsed manager rail should keep section navigation reachable as an icon strip.'
          );
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-collapsed');

        // Restore the expanded rail so subsequent manager steps see the default layout.
        await railToggle.click();
        await page.waitForTimeout(400);
        if (
          (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count()) > 0
        ) {
          throw new Error('Manager rail toggle did not re-expand the navigation rail.');
        }

        await returnToSystemLibrary(page);
        await settleManagerNav(page);
        // The settle signature (geometry x navCount) can be identical across this
        // transition, so anchor on the browser row actually re-mounting before the
        // non-retrying count assertions below (issue 750 review finding).
        await page
          .locator(managerSystemRowSelector(craftingSetup.systemId))
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        navLabels = await page
          .locator('.fabricate-manager .manager-nav-label')
          .evaluateAll((labels) =>
            labels.map((label) => label.textContent?.trim()).filter(Boolean)
          );
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(
            `Manager return to library should preserve selected-system nav. Saw nav: ${navLabels.join(', ')}`
          );
        }
        if ((await page.locator('.fabricate-manager .manager-scope-card').count()) === 0) {
          throw new Error('Manager return to library should leave the rail scope visible.');
        }
        if ((await page.locator(managerSystemRowSelector(craftingSetup.systemId)).count()) === 0) {
          throw new Error('Manager return to library did not return to the systems browser.');
        }
        if (
          (await page
            .locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`)
            .count()) === 0
        ) {
          throw new Error('Manager return to library should preserve the selected system row.');
        }

        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.evaluate(async () => {
          (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page
          .locator('.fabricate-manager')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page
          .locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`)
          .first()
          .click();
        await settleManagerNav(page);
        const gatheringOffFact = await page
          .locator('.fabricate-manager [data-count-id="environments"]')
          .first()
          .evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const strong = element.querySelector('strong');
            const style = getComputedStyle(element);
            return {
              text: element.textContent?.replaceAll(/\s+/g, ' ').trim(),
              strongText: strong?.textContent?.trim(),
              className: element.className,
              gridColumn: style.gridColumn,
              width: rect.width,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              strongTagName: strong?.tagName,
            };
          });
        if (gatheringOffFact.text === 'Gathering environments Off') {
          if (
            gatheringOffFact.strongText !== 'Off' ||
            gatheringOffFact.strongTagName !== 'STRONG'
          ) {
            throw new Error(
              `Manager gathering-off fact does not preserve Off emphasis: ${JSON.stringify(gatheringOffFact)}`
            );
          }
          if (!String(gatheringOffFact.className).includes('is-off')) {
            throw new Error(
              `Manager gathering-off fact should use the full-grid special case: ${JSON.stringify(gatheringOffFact)}`
            );
          }
        } else if (!/^\d+ Gathering environments$/.test(gatheringOffFact.text || '')) {
          throw new Error(
            `Manager gathering fact text is wrong: ${JSON.stringify(gatheringOffFact)}`
          );
        }
        if (gatheringOffFact.scrollWidth > gatheringOffFact.clientWidth + 2) {
          throw new Error(
            `Manager gathering-off fact overflows: ${JSON.stringify(gatheringOffFact)}`
          );
        }
        await assertManagerLayoutStable(page, 'normal selected gathering off');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-gathering-off');
        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await seedSmokeGatheringLibrary(page, craftingSetup);
        // Travel route (#257): seed a region and an enabled party BEFORE the manager opens so the
        // initial store refresh picks them up and the Travel route renders real content (a party
        // row plus a current-region override) instead of the empty setup-checklist state.
        await page.evaluate(
          async ({ sysId, crafterId, travelMemberId, sceneId, regionId }) => {
            const realmStore = game.fabricate.getGatheringRealmStore?.();
            const partyStore = game.fabricate.getGatheringPartyStore?.();
            if (!realmStore || !partyStore) {
              throw new Error('Gathering realm/party stores unavailable for Travel seeding.');
            }
            // Select the party actors by stable id (#816).
            const crafter = game.actors.get(crafterId);
            const travelMember = travelMemberId ? game.actors.get(travelMemberId) : null;
            if (!crafter) {
              throw new Error('No smoke-seeded gathering actor found for Travel seeding.');
            }
            // Travel & Realms is disabled by default (#286). Participation is a crafting system flag
            // since #1282 — the realm library itself is world scope — so this is a system write, not
            // a realm-store one.
            const systemManager = game.fabricate.getCraftingSystemManager?.();
            await systemManager?.updateSystem?.(sysId, {
              gatheringRealmSettings: { enabled: true },
            });
            for (const party of partyStore.list()) {
              await partyStore.delete(party.id);
            }
            const existingRealm = realmStore
              .list()
              .find((realm) => realm.name === 'Northreach Vale');
            const realm =
              existingRealm ||
              (await realmStore.create({ name: 'Northreach Vale', enabled: true }));
            const scene = game.scenes.get(sceneId);
            const sceneRegion = scene?.regions?.get(regionId);
            if (!scene || !sceneRegion) {
              throw new Error('Smoke Travel map Region fixture is unavailable.');
            }
            // ONE write (#1282): `setSceneRegionLink` strips the region from every realm and
            // attaches it to this one, so the old read-modify-write loop cannot lose an update.
            await realmStore.setSceneRegionLink(sceneRegion.uuid, realm.id, {
              sceneUuid: scene.uuid,
            });
            const party = await partyStore.create({ name: 'The Vale Wardens' });
            await partyStore.addMember(party.id, crafter.uuid);
            if (travelMember) await partyStore.addMember(party.id, travelMember.uuid);
            await partyStore.setTravelActor(party.id, crafter.uuid);
            await partyStore.setEnabled(party.id, true);
            await partyStore.setCurrentRealmOverride(party.id, [realm.id]);

            // Realm-lock evidence (#294): a second realm the party is NOT in, plus an environment
            // that requires it.
            const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
            if (environmentStore) {
              const hiddenVale =
                realmStore.list().find((r) => r.name === 'Hidden Vale') ||
                (await realmStore.create({ name: 'Hidden Vale', enabled: true }));
              const existingEnvs =
                typeof environmentStore.listBySystem === 'function'
                  ? environmentStore.listBySystem(sysId) || []
                  : [];
              const alreadySeeded =
                Array.isArray(existingEnvs) &&
                existingEnvs.some((env) => env?.name === 'Hidden Hollow');
              if (!alreadySeeded) {
                await environmentStore.create({
                  craftingSystemId: sysId,
                  name: 'Hidden Hollow',
                  description: "Out of the party's current realm — locked until they travel there.",
                  img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
                  enabled: true,
                  selectionMode: 'targeted',
                  sceneUuid: '',
                  compositionMode: 'manual',
                  enabledTaskIds: ['smoke-meadow-herbs'],
                  includedRealmIds: [hiddenVale.id],
                });
              }
            }
          },
          {
            sysId: craftingSetup.systemId,
            crafterId: cleanup.crafterId,
            travelMemberId: cleanup.travelMemberId,
            sceneId: craftingSetup.interactable.sceneId,
            regionId: craftingSetup.interactable.regionId,
          }
        );
        await activateSceneAndAwaitCanvasReady(page, craftingSetup.interactable.sceneId);
        await page.evaluate(async () => {
          // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
          globalThis.__fabricateSmokeManagerApp = (
            await game.fabricate.api.loadCraftingSystemManagerAppClass()
          ).show();
        });
        await page
          .locator('.fabricate-manager')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page
          .locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`)
          .first()
          .click();
        await settleManagerNav(page);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await assertManagerLayoutStable(page, 'stacked selected');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page
          .locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]')
          .first()
          .click();
        await page
          .locator('.fabricate-manager[data-manager-view="system-edit"]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        await exerciseManagerSystemEditPointerTargets(page, craftingSetup.systemId);
        if (
          (await page.locator('.fabricate-manager[data-manager-view="system-edit"]').count()) === 0
        ) {
          throw new Error('Manager system Edit did not stay inside the v2 edit route.');
        }
        for (const selector of [
          '#manager-system-name',
          '#manager-system-description',
          // Recipe-resolution mode moved to the Crafting Settings section
          // (#511 Books & Scrolls); it is no longer a system-edit control.
          '[data-edit-control="advanced-options"]',
          '[data-feature-key="gathering"]',
        ]) {
          if ((await page.locator(`.fabricate-manager ${selector}`).count()) === 0) {
            throw new Error(`Manager system edit is missing required control: ${selector}`);
          }
        }
        await assertManagerLayoutStable(page, 'system edit normal');
        await assertNoScreenshotOverlays(page);
        // The pointer-target pass typed a name without saving, so the identity form is dirty (issue
        // 767 now lights an Unsaved chip).
        const systemNameField = page.locator('.fabricate-manager #manager-system-name').first();
        const saveDetailsButton = page
          .locator('.fabricate-manager .manager-edit-card-heading button[type="submit"]')
          .first();
        await saveDetailsButton.click();
        await page.waitForTimeout(400);
        // Scroll the optional-feature tiles fully into frame so the capture
        // shows the complete feature set (incl. the issue-714 time tile).
        const timeFeatureTile = page
          .locator('.fabricate-manager [data-feature-key="time"]')
          .first();
        if ((await timeFeatureTile.count()) > 0) {
          await timeFeatureTile.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        }
        await screenshot(page, 'manager-system-edit-normal');

        await setManagerWindowSize(page, { width: 900, height: 700 });
        await assertManagerLayoutStable(page, 'system edit narrow');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-narrow');

        // --- Dirty identity form (issue 767) --- Type an un-saved name change so the identity form
        // is dirty, then frame the identity card so the lit "Unsaved" chip beside "Save details" is
        // captured.
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await systemNameField.fill('The Herbalist (unsaved edit)');
        await page
          .locator('.fabricate-manager [data-system-details-dirty]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        const identityHeading = page
          .locator('.fabricate-manager .manager-edit-card-heading')
          .first();
        await identityHeading.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-dirty');

        // Restore the persisted name so the identity form is clean again before the walk navigates
        // away — otherwise the new route-exit guard would raise a discard dialog and block the
        // remaining captures.
        await systemNameField.fill('The Herbalist');
        await page
          .locator('.fabricate-manager [data-system-details-dirty]')
          .first()
          .waitFor({ state: 'detached', timeout: 5000 })
          .catch(() => {});

        // --- Settings-list ergonomics (issue 768) ---
        // The three lists each own a World > Rules & Resources route now, so this captures the
        // ergonomics on Modifiers: the shared IconPicker open, and a row-level copy button.
        await setManagerWindowSize(page, { width: 1280, height: 980 });
        await page.locator('#manager-world-nav-rules').first().click();
        await page.locator('#manager-rules-nav-modifiers').first().click();
        const modifierCard = page.locator('.fabricate-manager [data-world-modifiers]').first();
        await modifierCard.waitFor({ state: 'visible', timeout: 5000 });
        const modifierRows = modifierCard.locator('[data-world-modifier]');
        await modifierRows.nth(1).waitFor({ state: 'visible', timeout: 5000 });
        const modifierRowCount = await modifierRows.count();
        if (modifierRowCount !== 2) {
          throw new Error(
            `System Settings modifier fixture expected 2 rendered rows, found ${modifierRowCount}.`
          );
        }
        await modifierCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(200);

        // Open the first modifier in edit mode and open its IconPicker so the icon
        // dropdown is visible (parity with Currency Units / Character Prerequisites).
        const firstModifierRow = modifierRows.first();
        await firstModifierRow.locator('[data-toggle-modifier]').first().click();
        await page.waitForTimeout(150);
        const modifierIconTrigger = firstModifierRow
          .locator('.essence-icon-picker-trigger')
          .first();
        if ((await modifierIconTrigger.count()) > 0) {
          await modifierIconTrigger.click();
          await page.waitForTimeout(200);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-lists');

        // Reset: close the editor, which also dismisses the IconPicker popover.
        const modifierDone = firstModifierRow
          .locator('.manager-character-modifier-editor button:has-text("Done")')
          .first();
        if ((await modifierDone.count()) > 0) {
          await modifierDone.click().catch(() => {});
          await page.waitForTimeout(150);
        }

        // --- World currency configuration (#393) --- The ladder is world scope, so this walks to
        // World > Rules & Resources > Currency, which is ungated precisely so a GM can author the
        // coins before any system enables them.
        await setManagerWindowSize(page, { width: 1280, height: 900 });
        await page.locator('.fabricate-manager #manager-rules-nav-currency').first().click();
        await page.waitForTimeout(300);
        const currencyCard = page.locator('.fabricate-manager [data-world-currency-units]').first();
        await currencyCard.waitFor({ state: 'visible', timeout: 5000 });
        const currencySeed = currencyCard.locator('button:has-text("Seed presets")').first();
        if ((await currencySeed.count()) > 0) {
          await currencySeed.click();
          await page.waitForTimeout(600);
          await page.evaluate(async () => {
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          });
        }
        await currencyCard
          .locator('[data-world-currency-unit]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        // Scroll the Currency Units card to the top of the manager's scroll area, then capture
        // the WHOLE normal-sized GM window (nav rail, header, context panel + the card) so the
        // feature is shown in context rather than as a cropped element.
        const showCurrencyCard = async () => {
          await currencyCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
        };
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-property');

        // The spend strategy is the app's own option list (issue 1510), so `selectOption` — which
        // is Playwright's `<select>`-ONLY API and throws on anything else — is replaced by the
        // harness's own two-click drive.
        const currencyStrategy = page
          .locator('.fabricate-manager [data-world-currency-strategy-select]')
          .first();
        await chooseSelectOption(page, currencyStrategy, { value: 'macro' });
        await page
          .locator('.fabricate-manager [data-world-currency-macros]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-macro');

        await chooseSelectOption(page, currencyStrategy, { value: 'actorInventory' });
        await page
          .locator('.fabricate-manager [data-world-currency-no-provider]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-inventory');

        // Leave the persisted world on the default strategy. The walk does not navigate back:
        // the next section opens its own manager route (`openManagerCraftingSection`).
        await chooseSelectOption(page, currencyStrategy, { value: 'actorProperty' });
        await page.waitForTimeout(300);

        await runChildren();

        // A scoped `screenshots` run may skip the experimental-off milestone capture, so mark the
        // required captures complete here: every targeted section has run, which makes a later
        // renderer teardown the tolerable post-milestone class.
        if (SCREENSHOT_SCOPING_ACTIVE) {
          ctx.shared.d0RequiredCapturesComplete = true;
        }

        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: 'Arcane Forge',
            description:
              'A mystical forge capable of transmuting raw materials into powerful artifacts.',
          });
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', sysId);
        }, craftingSetup.systemId);
        await closeOpenApplications(page);
        results.steps.push({ step: 'screenshot-manager', passed: true });
        process.stdout.write(
          'Phase D0 complete: Crafting System Manager screenshotted and hit-tested.\n'
        );
      } catch (error) {
        // Issue #807: tolerate-or-fail.
        if (
          shouldTolerateSmokeTeardown({
            message: error.message,
            pageClosed: page.isClosed?.(),
            requiredCapturesComplete: ctx.shared.d0RequiredCapturesComplete,
          })
        ) {
          // Post-milestone transient renderer/page teardown: the same infra class the Phase E
          // Journal step and the unhandledRejection guard already absorb.
          ctx.shared.d0TeardownTolerated = true;
          results.steps.push({
            step: 'screenshot-manager',
            passed: true,
            skipped: true,
            error: TRANSIENT_TEARDOWN_SKIP_PREFIX + error.message,
          });
          process.stderr.write(
            `Phase D0 manager walk skipped after a transient page teardown: ${error.message}\n`
          );
        } else {
          results.steps.push({ step: 'screenshot-manager', passed: false, error: error.message });
        }
      } finally {
        await page
          .evaluate(async (previous) => {
            await game.settings.set('fabricate', 'experimentalFeatures', previous === true);
          }, previousExperimentalFeatures)
          .catch(() => {});
      }
    } else {
      startPhase('phase-D0-skipped');
      process.stdout.write(`Phase D0: skipped (profile=${SMOKE_PROFILE}).\n`);
      results.steps.push({ step: 'screenshot-manager', passed: true, skipped: true });
    }
  },
};

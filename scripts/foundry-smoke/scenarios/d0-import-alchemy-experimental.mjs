/** Phase D0's import-report, alchemy and experimental-features section; it publishes `d0RequiredCapturesComplete`, the milestone the phase's tolerate-or-fail `catch` reads. */

import { railSelector } from '../../lib/managerRailEntries.js';
import {
  assertManagerLayoutStable,
  openChecksActivity,
  openManagerCraftingSection,
} from '../pageOps/managerViews.mjs';
import {
  assertNoScreenshotOverlays,
  closeOpenApplications,
  dismissFoundryNotifications,
  managerSystemRowSelector,
  setManagerWindowSize,
  settleManagerNav,
} from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'import-alchemy-experimental',
  phase: 'phase-D0',
  section: 'import-alchemy-experimental',
  publishes: ['d0RequiredCapturesComplete'],
  consumes: ['craftingSetup', 'alchemyFixtures'],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { craftingSetup, alchemyFixtures } = ctx.shared;
    // The GM-facing import report is a manager modal that only appears AFTER an import, and
    // only surfaces its "needs attention" list when the imported system carries references that
    // cannot resolve in the target world.
    try {
      // Build the import file from the live smoke system so createSystem accepts it (this is
      // the same round-trip the #492 unit tests cover), appending one deliberately-unresolvable
      // component.
      const importReportJson = await page.evaluate((sysId) => {
        const csm = game.fabricate.getCraftingSystemManager();
        const source = csm.getSystem(sysId);
        const payloadSystem = JSON.parse(JSON.stringify(source));
        delete payloadSystem.id; // copy mode strips ids anyway; be explicit
        const components = Array.isArray(payloadSystem.components) ? payloadSystem.components : [];
        const base = components[0] ? JSON.parse(JSON.stringify(components[0])) : {};
        // The orphan is a clone of a real component, so it inherits that component's source
        // references and must overwrite every one of them.
        const orphan = {
          ...base,
          id: 'smoke-import-report-orphan',
          name: 'Smoke Orphan Reagent',
          registeredItemUuid: 'Item.fabricateSmokeMissing0001',
          originItemUuid: 'Item.fabricateSmokeMissing0001',
          aliasItemUuids: [],
        };
        payloadSystem.components = [...components, orphan];
        const payload = {
          schemaVersion: 2,
          fabricateVersion: game.modules?.get('fabricate')?.version || '0.0.0',
          exportedAt: new Date().toISOString(),
          runtimeStateIncluded: false,
          system: payloadSystem,
          recipes: [],
          gatheringEnvironments: [],
          gatheringConfig: { system: {}, shared: {} },
        };
        return JSON.stringify(payload);
      }, craftingSetup.systemId);

      // Snapshot system ids so the throwaway "(Copy)" can be found + deleted.
      const systemIdsBeforeImport = await page.evaluate(() =>
        game.fabricate
          .getCraftingSystemManager()
          .getSystems()
          .map((s) => s.id)
      );

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

      // The Import button lives in the system-library footer; if a system is
      // still scoped in, return to the library so the button is present.
      const returnToLibrary = page.locator('.fabricate-manager .manager-scope-return').first();
      if ((await returnToLibrary.count()) > 0) {
        await returnToLibrary.click().catch(() => {});
        await page.waitForTimeout(300);
      }

      // Open the real import file-picker dialog (file-import icon is unique to it).
      await page
        .locator('.fabricate-manager button.manager-button:has(i.fa-file-import)')
        .first()
        .click();
      const importDialog = page
        .locator(
          '.application.dialog:has(input[name="importFile"]), .dialog:has(input[name="importFile"])'
        )
        .first();
      await importDialog.waitFor({ state: 'visible', timeout: 10_000 });
      // Feed the JSON straight into the native file input, choose "copy" so the
      // import never skips (fresh "(Copy)" system), then submit.
      await importDialog.locator('input[name="importFile"]').setInputFiles({
        name: 'smoke-import-report.json',
        mimeType: 'application/json',
        buffer: Buffer.from(importReportJson, 'utf8'),
      });
      await importDialog.locator('input[name="conflictMode"][value="copy"]').check({ force: true });
      await importDialog
        .locator('button[data-action="ok"], button:has-text("Import")')
        .first()
        .click();

      // Since issue 877 the report is a Svelte modal portaled INTO the manager window
      // (the shared ManagerModal chrome the folder-mapping step below also uses), not
      // a separate DialogV2 application.
      const reportDialog = page.locator('.fabricate-manager [data-import-report]').first();
      await reportDialog.waitFor({ state: 'visible', timeout: 15_000 });
      // Prove the "needs attention" grouped cards rendered (the reported source item).
      await reportDialog
        .locator('[data-import-report-group]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
      // The import fires info/warn toasts that can bleed over the dialog; clear them first.
      await dismissFoundryNotifications(page);
      await screenshot(page, 'manager-import-report');

      // Dismiss the report so the smoke can continue.
      await reportDialog
        .locator('[data-import-report-close]')
        .first()
        .click()
        .catch(() => {});
      await reportDialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

      // Delete the throwaway "(Copy)" system created by the import so no later
      // phase (or system-library row count) sees it.
      await page.evaluate(async (idsBefore) => {
        const csm = game.fabricate.getCraftingSystemManager();
        const before = new Set(idsBefore);
        const created = csm.getSystems().filter((s) => !before.has(s.id));
        for (const s of created) {
          try {
            await csm.deleteSystem(s.id);
          } catch {
            /* best effort */
          }
        }
      }, systemIdsBeforeImport);

      await closeOpenApplications(page);
      results.steps.push({ step: 'import-report', passed: true });
    } catch (error) {
      results.steps.push({ step: 'import-report', passed: false, error: error.message });
      process.stderr.write(`Import report capture failed: ${error.message}\n`);
      await closeOpenApplications(page).catch(() => {});
    }

    // The mapping modal exists only AFTER a folder / whole-pack component drop and is not
    // representable in any world db (Class B).
    try {
      const mappingFixtures = await page.evaluate(async (sysId) => {
        const csm = game.fabricate.getCraftingSystemManager();
        const system = csm.getSystem(sysId);
        const previousCategories = Array.isArray(system.componentCategories)
          ? [...system.componentCategories]
          : [];
        const addedCategory = previousCategories.every((c) => !(c.toLowerCase() === 'reagent'));
        if (addedCategory) {
          await csm.updateSystem(sysId, {
            componentCategories: [...previousCategories, 'Reagent'],
          });
        }
        const itemType = [...game.documentTypes.Item].find((t) => t !== 'base') || 'base';
        const img = 'icons/commodities/metal/ingot-stack-steel.webp';
        const parent = await Folder.create({ name: 'Smoke Bulk Import', type: 'Item' });
        const reagentFolder = await Folder.create({
          name: 'Reagent',
          type: 'Item',
          folder: parent.id,
        });
        const widgetsFolder = await Folder.create({
          name: 'Widgets',
          type: 'Item',
          folder: parent.id,
        });
        await Item.create([
          { name: 'Smoke Sage', type: itemType, img, folder: reagentFolder.id },
          { name: 'Smoke Nightcap', type: itemType, img, folder: reagentFolder.id },
          { name: 'Smoke Cog', type: itemType, img, folder: widgetsFolder.id },
        ]);
        return {
          parentId: parent.id,
          widgetsFolderId: widgetsFolder.id,
          previousCategories,
          addedCategory,
        };
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
      await page.locator(railSelector('manager-nav-component-rules')).click();
      await page
        .locator('.fabricate-manager[data-manager-view="components"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });

      // Dispatch a real world-folder drop onto the component drop zone (the drop
      // handler reads dataTransfer text/plain the same way Foundry drags do).
      await page.evaluate((parentId) => {
        const zone = document.querySelector('.fabricate-manager .manager-component-drop-zone');
        const dataTransfer = new DataTransfer();
        dataTransfer.setData(
          'text/plain',
          JSON.stringify({ type: 'Folder', uuid: `Folder.${parentId}` })
        );
        zone.dispatchEvent(
          new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true })
        );
      }, mappingFixtures.parentId);

      const mappingDialog = page.locator('.fabricate-manager [data-import-mapping]').first();
      await mappingDialog.waitFor({ state: 'visible', timeout: 10_000 });
      // Prove >=2 rows rendered (Reagent + Widgets); parent holds no items so it is
      // not its own row.
      await page
        .locator('.fabricate-manager [data-import-mapping-row]')
        .nth(1)
        .waitFor({ state: 'visible', timeout: 5000 });
      // Skip the non-matching (Widgets) folder so the frame shows a skipped row.
      await page
        .locator(
          `.fabricate-manager [data-import-mapping-row="${mappingFixtures.widgetsFolderId}"] [data-import-mapping-skip]`
        )
        .first()
        .click();
      // The modal IS the intended overlay here (like the import-report dialog), so
      // clear bleed-over toasts but do NOT run assertNoScreenshotOverlays.
      await dismissFoundryNotifications(page);
      await screenshot(page, 'manager-import-folder-mapping');

      // Dismiss without committing, then remove the fixtures + temporary category.
      await page
        .locator('.fabricate-manager [data-import-mapping-cancel]')
        .first()
        .click()
        .catch(() => {});
      await mappingDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.evaluate(
        async ({ parentId, previousCategories, addedCategory, sysId }) => {
          const parent = game.folders.get(parentId);
          if (parent) await parent.delete({ deleteSubfolders: true, deleteContents: true });
          if (addedCategory) {
            await game.fabricate
              .getCraftingSystemManager()
              .updateSystem(sysId, { componentCategories: previousCategories });
          }
        },
        {
          parentId: mappingFixtures.parentId,
          previousCategories: mappingFixtures.previousCategories,
          addedCategory: mappingFixtures.addedCategory,
          sysId: craftingSetup.systemId,
        }
      );

      await closeOpenApplications(page);
      results.steps.push({ step: 'import-folder-mapping', passed: true });
    } catch (error) {
      results.steps.push({ step: 'import-folder-mapping', passed: false, error: error.message });
      process.stderr.write(`Import folder mapping capture failed: ${error.message}\n`);
      await closeOpenApplications(page).catch(() => {});
    }

    // Manager alchemy-settings capture (issue #752 — evidence for #736's #713 half): the
    // Crafting → Settings surface of an ALCHEMY-mode system (the minimal "Smoke Alchemy Bench"
    // seeded in Phase C).
    const alchemyBenchSystemId = alchemyFixtures?.benchSystemId;
    if (alchemyBenchSystemId) {
      try {
        await closeOpenApplications(page);
        await page.evaluate(async () => {
          (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page
          .locator('.fabricate-manager')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page
          .locator(`${managerSystemRowSelector(alchemyBenchSystemId)} .manager-system-identity`)
          .first()
          .click();
        await settleManagerNav(page);
        await openManagerCraftingSection(page, 'settings', 'crafting-settings');
        await page
          .locator('.fabricate-manager [data-crafting-settings]')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        // Confirm this is the alchemy variant: the resolution card marks the
        // alchemy option active for an alchemy-mode system.
        if (
          (await page
            .locator(
              '.fabricate-manager [data-crafting-resolution-mode-option="alchemy"].is-active'
            )
            .count()) === 0
        ) {
          throw new Error(
            'Crafting settings did not render with alchemy as the selected resolution mode.'
          );
        }
        // Issue 713's behaviour flags render in the Checks view for an alchemy-mode system —
        // capture there when the card exists so the frame demonstrates the flags; fall back to
        // the settings surface on builds that predate the card.
        await openChecksActivity(page, 'crafting', 'on-failure');
        await settleManagerNav(page);
        const alchemyBehaviourCard = page
          .locator('.fabricate-manager [data-alchemy-behaviour]')
          .first();
        if ((await alchemyBehaviourCard.count()) > 0) {
          await alchemyBehaviourCard.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-alchemy-settings');
        process.stdout.write('  D0: alchemy settings screenshotted\n');
        await closeOpenApplications(page);
        results.steps.push({ step: 'manager-alchemy-settings', passed: true });
      } catch (error) {
        results.steps.push({
          step: 'manager-alchemy-settings',
          passed: false,
          error: error.message,
        });
        process.stderr.write(`Manager alchemy-settings capture failed: ${error.message}\n`);
        await closeOpenApplications(page).catch(() => {});
      }
    } else {
      results.steps.push({
        step: 'manager-alchemy-settings',
        passed: false,
        error: 'alchemy bench fixture not seeded',
      });
      process.stderr.write(
        'Manager alchemy-settings capture skipped: alchemy bench fixture not seeded.\n'
      );
    }

    // Manager experimental-off capture (issue #752 — evidence for #746): the selected-system
    // rail with fabricate.experimentalFeatures disabled.
    try {
      await closeOpenApplications(page);
      await page.evaluate(async () => {
        await game.settings.set('fabricate', 'experimentalFeatures', false);
      });
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
      const experimentalOffNav = await page
        .locator('.fabricate-manager .manager-nav-label')
        .evaluateAll((labels) => labels.map((label) => label.textContent?.trim()).filter(Boolean));
      if (!experimentalOffNav.includes('System Overview')) {
        throw new Error(
          `Manager experimental-off rail did not render the selected-system nav. Saw: ${experimentalOffNav.join(', ')}`
        );
      }
      const experimentalStillOff = await page.evaluate(() =>
        Boolean(game.settings.get('fabricate', 'experimentalFeatures'))
      );
      if (experimentalStillOff !== false) {
        throw new Error('Experimental features did not read as disabled at capture time.');
      }
      await assertManagerLayoutStable(page, 'experimental off');
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-experimental-off');
      // Milestone (issue #807): the last load-bearing D0 capture has landed. A renderer
      // teardown AFTER this point is tolerable infra flake; before it is not (later frames
      // would be genuinely missing).
      ctx.shared.d0RequiredCapturesComplete = true;
      process.stdout.write('  D0: experimental-off rail screenshotted\n');
      await closeOpenApplications(page);
      results.steps.push({ step: 'manager-experimental-off', passed: true });
    } catch (error) {
      results.steps.push({ step: 'manager-experimental-off', passed: false, error: error.message });
      process.stderr.write(`Manager experimental-off capture failed: ${error.message}\n`);
      await closeOpenApplications(page).catch(() => {});
    }
  },
};

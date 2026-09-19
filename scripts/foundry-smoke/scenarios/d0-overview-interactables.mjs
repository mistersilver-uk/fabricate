/**
 * Phase D0's system overview, validation and interactables section. Its sub-blocks switch systems
 * and open independent apps, and restore the smoke-system selection and active scene inline.
 */

import { COMPONENT_BULK_EDIT_STUDIO, assertManagerLayoutStable, captureBulkEditFrame, returnToSystemLibrary } from '../pageOps/managerViews.mjs';
import { activateSceneAndAwaitCanvasReady, assertNoScreenshotOverlays, closeOpenApplications, managerSystemRowSelector, setManagerWindowSize } from '../pageOps/pageLifecycle.mjs';
import { railSelector } from '../../lib/managerRailEntries.js';

export default {
  id: 'overview-interactables',
  phase: 'phase-D0',
  section: 'overview-interactables',
  publishes: [],
  consumes: ['cleanup', 'craftingSetup'],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    const { cleanup, craftingSetup } = ctx.shared;

        // Select the deliberately-broken "Broken Workshop" system (progressive mode with no
        // progressive check + an incomplete recipe) and capture: (a) the System Overview page's
        // Validation tab showing the kind-grouped issue rows and the system-blocker callout; and
        // (b) the Settings tab showing the system-blocker banner above identity.
        try {
          await setManagerWindowSize(page, { width: 1280, height: 900 });
          // Return to the system library, then select the broken system.
          await returnToSystemLibrary(page);
          await page.waitForTimeout(400);
          await page.locator(`${managerSystemRowSelector(craftingSetup.blockedSystemId)} .manager-system-identity`)
            .first().waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator(`${managerSystemRowSelector(craftingSetup.blockedSystemId)} .manager-system-identity`)
            .first().click();
          await page.waitForTimeout(500);

          // (a) System Overview page — open the tabbed system-edit page, then switch to the
          // Validation tab and wait on the grouped issue rows (not deep leaf content).
          await page.locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]').first().click();
          await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-tab="validation"]').first().click();
          await page.locator('.fabricate-manager .manager-system-tab-panel [data-system-overview]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-overview] [data-overview-issue]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          if (await page.locator('.fabricate-manager [data-system-overview-blocker]').count() === 0) {
            throw new Error('System overview validation tab did not render the system-blocker callout for the broken system.');
          }
          // The seeded stale-task fixture must surface a TASK-kind row whose
          // deep-link button resolves to the owning environment (the UX-defect fix).
          const taskRow = page.locator('.fabricate-manager [data-system-overview] [data-overview-kind="task"]').first();
          await taskRow.waitFor({ state: 'visible', timeout: 5_000 });
          if (await taskRow.locator('[data-overview-link="task"]').count() === 0) {
            throw new Error('System overview task row is missing its environment deep-link button.');
          }
          // The validation tab is a kind-grouped list view (`.manager-system-overview-row`), not a
          // table — assertManagerLayoutStable requires a table-row/edit-form selector and would
          // throw "no table rows" here (as the gathering Settings form capture also skips it).
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-system-overview');

          // (b) Settings tab — wait on the blocker banner above the identity card.
          await page.locator('.fabricate-manager [data-system-tab="settings"]').first().click();
          await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.locator('.fabricate-manager [data-system-edit-blocker]').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertManagerLayoutStable(page, 'system edit blocked');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-system-edit-blocked');

          // (c) Progressive difficulty UI — this system is in progressive crafting mode, so its
          // components browser badges each row's difficulty (a value for component 0, "None" for
          // component 1) and the component editor's body exposes the staged Progressive difficulty
          // control.
          try {
            const blockedNames = craftingSetup.blockedComponentNames || [];
            await page.locator(railSelector('manager-nav-component-rules')).click();
            await page.locator('.fabricate-manager[data-manager-view="components"]').first().waitFor({ state: 'visible', timeout: 5_000 });
            await page.locator('.fabricate-manager [data-component-difficulty]').first()
              .waitFor({ state: 'visible', timeout: 5_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'manager-components-progressive');

            // Issue 772 — the bulk panel's fourth section, Progressive DC, which the manager root
            // gates on `componentDifficultyAxisProgressive` (crafting OR salvage OR gathering
            // resolution being progressive).
            await captureBulkEditFrame(ctx, {
              studio: COMPONENT_BULK_EDIT_STUDIO,
              stepName: 'components-bulk-edit-progressive',
              label: 'manager-components-bulk-edit-progressive',
              stage: async (bulkPanel) => {
                await bulkPanel.locator('[data-component-bulk-tags-empty]').first()
                  .waitFor({ state: 'visible', timeout: 5_000 });
                // `fill` on the shipped Stepper input, exactly as the single-component
                // difficulty capture below drives its control: a finite parse commits and
                // ARMS the axis, so the chip flips to its staged face and Apply goes live.
                await bulkPanel.locator('[data-component-bulk-difficulty]').first().fill('12');
                await bulkPanel.locator('[data-component-bulk-difficulty-staged="true"]')
                  .first().waitFor({ state: 'visible', timeout: 5_000 });
                if (await bulkPanel.locator('[data-component-bulk-apply]').first().isDisabled()) {
                  throw new Error('Bulk edit Apply stayed inert after a progressive DC was staged.');
                }
              },
            });

            // Open the second ("None") component and stage a difficulty so the card, the Unsaved
            // chip, and the editor Save flow are captured together.
            if (blockedNames[1]) {
              await page.locator(`.fabricate-manager .manager-component-row:has-text(${JSON.stringify(blockedNames[1])}) button:has(i.fa-pen)`)
                .first().click();
              await page.locator('.fabricate-manager[data-manager-view="component-edit"]').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
              const difficultyInput = page.locator('.fabricate-manager [data-component-edit-section="difficulty"] input').first();
              await difficultyInput.waitFor({ state: 'visible', timeout: 5_000 });
              await difficultyInput.fill('7');
              await page.locator('.fabricate-manager .manager-header-actions .manager-chip:has-text("Unsaved")').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'manager-component-edit-difficulty');
              await page.locator('.fabricate-manager button[form="manager-component-edit-form"]').first().click();
              await page.locator('.fabricate-manager[data-manager-view="components"]').first()
                .waitFor({ state: 'visible', timeout: 5_000 });
            }
            results.steps.push({ step: 'progressive-difficulty-captures', passed: true });
          } catch (err) {
            results.steps.push({ step: 'progressive-difficulty-captures', passed: false, error: err.message });
            process.stderr.write(`Progressive difficulty capture failed: ${err.message}\n`);
          }

          results.steps.push({ step: 'system-overview-and-banner', passed: true });
        } catch (err) {
          results.steps.push({ step: 'system-overview-and-banner', passed: false, error: err.message });
          process.stderr.write(`System overview capture failed: ${err.message}\n`);
        } finally {
          // Return to the smoke system so later phases see the expected selection.
          await returnToSystemLibrary(page).catch(() => {});
          await page.waitForTimeout(300);
          await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`)
            .first().click().catch(() => {});
          await page.waitForTimeout(400);
        }

        // Open the GM config panel for the seeded `fabricate.interactable` Region behaviour and
        // capture its node section in both states: linked (shares the gathering task's node) and
        // unlinked (its own independent node editor).
        try {
          const interactableRef = craftingSetup.interactable;
          if (!interactableRef?.sceneId || !interactableRef?.regionId || !interactableRef?.behaviorId) {
            throw new Error(`Interactable behaviour ref is incomplete: ${JSON.stringify(interactableRef)}`);
          }
          await page.evaluate(({ s, r, b }) => {
            return game.fabricate.api.getInteractableConfigAppClass().show({ sceneId: s, regionId: r, behaviorId: b });
          }, { s: interactableRef.sceneId, r: interactableRef.regionId, b: interactableRef.behaviorId });

          const configRoot = page.locator('.fabricate-interactable-config').first();
          await configRoot.waitFor({ state: 'visible', timeout: 10_000 });
          const nodeSection = page.locator('[data-interactable-node-section]').first();
          await nodeSection.waitFor({ state: 'visible', timeout: 10_000 });

          const linkToggle = page.locator('[data-interactable-node-link]').first();
          await linkToggle.waitFor({ state: 'visible', timeout: 10_000 });
          if (await linkToggle.getAttribute('aria-pressed') !== 'true') {
            throw new Error('Interactable config opened unlinked; expected the linked default (aria-pressed="true").');
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-linked');

          // Toggle to the independent (unlinked) node editor and wait for its
          // count/respawn controls to mount, then confirm the toggle flipped.
          await linkToggle.click();
          await page.locator('[data-interactable-node-count]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-node-respawn]').first().waitFor({ state: 'visible', timeout: 10_000 });
          if (await linkToggle.getAttribute('aria-pressed') !== 'false') {
            throw new Error('Interactable config did not unlink after toggle (expected aria-pressed="false").');
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-unlinked');

          // ApplicationV2 close() is an async fade-out: await the actual close promise (not a
          // fire-and-forget call) so the config window is fully gone before the Manage panel opens
          // — otherwise it bleeds through behind the next capture.
          await page.evaluate(async () => {
            const app = Object.values(ui.windows).find(w => w?.options?.id === 'fabricate-interactable-config');
            if (app?.close) await app.close();
          }).catch(() => { /* best-effort; closeOpenApplications also sweeps it */ });

          results.steps.push({ step: 'interactable-config', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactable-config', passed: false, error: err.message });
          process.stderr.write(`Interactable config capture failed: ${err.message}\n`);
        }

        // Capture the new Identity/source section in both states: (a) unconfigured — the prominent
        // "Needs configuration" state on a natively-added (empty-system) behaviour, born inert; and
        // (b) configured — the collapsed "Change source" section expanded on a fully-configured
        // interactable (re-target affordance).
        const closeAllConfigWindows = async () => {
          await page.evaluate(async () => {
            const apps = Object.values(ui.windows).filter(w => w?.options?.id === 'fabricate-interactable-config');
            for (const app of apps) { if (app?.close) await app.close(); }
          }).catch(() => { /* best-effort; closeOpenApplications also sweeps it */ });
          await page.locator('.fabricate-interactable-config').first()
            .waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
        };
        const openConfig = async (ref) => {
          await page.evaluate(({ s, r, b }) => {
            return game.fabricate.api.getInteractableConfigAppClass().show({ sceneId: s, regionId: r, behaviorId: b });
          }, { s: ref.sceneId, r: ref.regionId, b: ref.behaviorId });
          await page.waitForTimeout(400); // let the AppV2 render + the Svelte view model settle.
          await page.locator('.fabricate-interactable-config').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-identity-section]').first().waitFor({ state: 'visible', timeout: 10_000 });
        };

        try {
          // (a) CONFIGURED — open the fully-configured interactable FIRST (no prior
          // config window to bleed) and expand the collapsed "Change source" section.
          await closeAllConfigWindows();
          const configuredRef = craftingSetup.interactable;
          await openConfig(configuredRef);
          if (await page.locator('[data-interactable-needs-config]').count() > 0) {
            throw new Error('Configured interactable rendered the unconfigured state.');
          }
          const identityToggle = page.locator('[data-interactable-identity-toggle]').first();
          await identityToggle.waitFor({ state: 'visible', timeout: 10_000 });
          await identityToggle.click();
          await page.locator('[data-interactable-identity-body]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-source-configured');

          // (b) UNCONFIGURED — the prominent "Needs configuration" state on a
          // natively-added (empty-system) behaviour, born inert.
          await closeAllConfigWindows();
          const unconfiguredRef = craftingSetup.unconfiguredInteractable;
          if (!unconfiguredRef?.sceneId || !unconfiguredRef?.regionId || !unconfiguredRef?.behaviorId) {
            throw new Error(`Unconfigured interactable ref is incomplete: ${JSON.stringify(unconfiguredRef)}`);
          }
          await openConfig(unconfiguredRef);
          await page.locator('[data-interactable-needs-config]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('[data-interactable-identity-type]').first().waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'interactable-config-needs-configuration');

          await closeAllConfigWindows();
          results.steps.push({ step: 'interactable-config-source', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactable-config-source', passed: false, error: err.message });
          process.stderr.write(`Interactable config source capture failed: ${err.message}\n`);
        }

        // Open the GM-only Manage Interactables scene panel and capture: a populated list spanning
        // multiple marker-status variants (region-only gathering task + a real Tile marker + a
        // missing marker) AND a Tool-type row, the dedicated empty state (a scene with zero
        // interactables), and the expanded Promote affordance with a populated Source dropdown +
        // visible action buttons.
        try {
          // Sweep any window left over from the config block before opening +
          // capturing, so a still-fading ApplicationV2 cannot bleed through.
          await closeOpenApplications(page);
          await page.locator('#fabricate-crafting-system-manager')
            .waitFor({ state: 'detached', timeout: 10_000 });

          const interactableRef = craftingSetup.interactable;

          // Order is load-bearing: seed the placeables BEFORE the scene is viewed, then activate
          // (issue #1010).
          await page.evaluate(async ({ sceneId, systemId, toolId, taskId }) => {
            const scene = game.scenes.get(sceneId);
            if (!scene) return;

            // A real Tile marker (Foundry core raster icon) the Tile-status row links to.
            const [tile] = await scene.createEmbeddedDocuments('Tile', [{
              texture: { src: 'icons/tools/smithing/anvil.webp' },
              x: 1600, y: 1000, width: 200, height: 200, hidden: false
            }]);

            await scene.createEmbeddedDocuments('Region', [
              {
                name: 'Smithing Anvil (Tool)',
                shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 200, height: 200 }],
                behaviors: [{
                  type: 'fabricate.interactable',
                  system: {
                    interactableType: 'tool',
                    sourceUuid: `Fabricate.${systemId}.tool.${toolId}`,
                    systemId,
                    toolId,
                    name: 'Smithing Anvil',
                    linkedVisual: { mode: 'marker', uuid: tile.uuid, documentName: 'Tile', missingPolicy: 'warn' }
                  }
                }]
              },
              {
                name: 'Lost Forage Marker',
                shapes: [{ type: 'rectangle', x: 2000, y: 1000, width: 200, height: 200 }],
                behaviors: [{
                  type: 'fabricate.interactable',
                  system: {
                    interactableType: 'gatheringTask',
                    sourceUuid: `Fabricate.${systemId}.gatheringTask.${taskId}`,
                    systemId,
                    taskId,
                    name: 'Lost Forage',
                    // A configured marker whose Tile no longer exists ⇒ "missing" badge.
                    linkedVisual: { mode: 'marker', uuid: `Scene.${sceneId}.Tile.fabricateMissingTile`, documentName: 'Tile', missingPolicy: 'warn' }
                  }
                }]
              }
            ]);
          }, {
            sceneId: interactableRef.sceneId,
            systemId: craftingSetup.systemId,
            toolId: 'smoke-herbalist-sickle',
            taskId: 'smoke-forage-library'
          }).catch(() => {});

          // Now view the scene, with every placeable already on it, so the panel's scene-scan finds
          // them.
          await activateSceneAndAwaitCanvasReady(page, interactableRef?.sceneId);

          await page.evaluate(() => game.fabricate.api.getInteractablesManagerAppClass().show());

          const managerRoot = page.locator('.fabricate-interactables-manager').first();
          await managerRoot.waitFor({ state: 'visible', timeout: 10_000 });
          // Wait for the seeded rows (expect the original + the two seeded above).
          await page.locator('.fabricate-interactables-manager .fab-im-row')
            .first().waitFor({ state: 'visible', timeout: 10_000 });
          const rowCount = await page.locator('.fabricate-interactables-manager .fab-im-row').count();
          if (rowCount < 3) {
            throw new Error(`Manage list shows only ${rowCount} row(s); expected at least 3 marker-status variants.`);
          }
          // The danger "missing" badge must be present so the danger-toned branch is exercised.
          if (await page.locator('.fabricate-interactables-manager [data-interactable-manager-chip-marker="missing"]').count() === 0) {
            throw new Error('Manage list is missing the danger marker badge variant.');
          }
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-list');

          // Expand the Promote affordance and capture the source picker with a populated Source
          // dropdown (proving the Tool enumeration fix) and the Promote/Cancel action buttons in
          // frame.
          const promoteToggle = page.locator('.fabricate-interactables-manager [data-interactable-manager-promote-toggle]').first();
          await promoteToggle.waitFor({ state: 'visible', timeout: 10_000 });
          await promoteToggle.click();
          const promotePanel = page.locator('.fabricate-interactables-manager [data-interactable-manager-promote]').first();
          await promotePanel.waitFor({ state: 'visible', timeout: 10_000 });

          // The three blocks this replaces were `page.evaluate` bodies that did
          // `querySelectorAll('… .fab-im-promote select')` and then set `.value` on whatever they
          // found.

          // Pin the crafting system that actually owns the seeded Tool.
          await page.locator('.fabricate-interactables-manager [data-interactable-manager-system]').first().click();
          await page.locator(`.fabricate-select-popover [data-popover-option="${craftingSetup.systemId}"]`)
            .first().click({ timeout: 10_000 });

          // Choose the Tool source type so the Source picker lists the system's tools.
          await page.locator('.fabricate-interactables-manager [data-interactable-manager-source-type-option="tool"]')
            .first().click();
          await page.waitForTimeout(150); // let the $derived source list recompute

          // Assert the Source picker now carries the seeded Tool (the "No sources in this
          // system." row is the failure mode the FIX 1 enumeration repair prevents), then CHOOSE
          // it — which also arms `canPromote` for the confirm button's enabled state below.
          await page.locator('.fabricate-interactables-manager [data-interactable-manager-source]').first().click();
          const sourceRows = page.locator('.fabricate-select-popover [data-popover-option]');
          await sourceRows.first().waitFor({ state: 'visible', timeout: 10_000 });
          const sourceOptionLabels = (await sourceRows.allInnerTexts())
            .map((t) => t.replace(/\s+/g, ' ').trim())
            .filter((t) => t && !/^No sources/i.test(t));
          const seededToolRow = page.locator('.fabricate-select-popover [data-popover-option]')
            .filter({ hasText: /Herbalist Sickle/i });
          if (sourceOptionLabels.length < 1 || (await seededToolRow.count()) === 0) {
            const diag = await page.evaluate(() => {
              const out = { panelRows: [], triggers: [], liveSystems: [] };
              try {
                out.liveSystems = game.fabricate.getCraftingSystemManager().getSystems()
                  .map((s) => ({ id: s.id, name: s.name, toolCount: (s.tools || []).length }));
              } catch (e) { out.liveSystemsErr = e.message; }
              document.querySelectorAll('.fabricate-select-popover [data-popover-option]').forEach((row, i) => {
                out.panelRows.push({ i, value: row.getAttribute('data-popover-option'), text: row.textContent.replace(/\s+/g, ' ').trim() });
              });
              document.querySelectorAll('.fabricate-interactables-manager .fabricate-select-trigger').forEach((btn, i) => {
                out.triggers.push({ i, text: btn.textContent.replace(/\s+/g, ' ').trim() });
              });
              return out;
            });
            process.stderr.write('PROMOTE DIAG: ' + JSON.stringify(diag) + '\n');
            throw new Error('Promote Source picker does not list the seeded Tool — the No-sources regression is not fixed.');
          }
          await seededToolRow.first().click();

          // Ensure the Promote/Cancel actions are in frame (not clipped below the fold).
          await page.locator('.fabricate-interactables-manager [data-interactable-manager-promote-confirm]').first()
            .scrollIntoViewIfNeeded();
          await page.locator('.fabricate-interactables-manager .fab-im-promote-actions').first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-promote');

          // The Manage panel is an ApplicationV2 singleton: its instance lives in
          // foundry.applications.instances (NOT ui.windows), and a bare show() only re-focuses an
          // open window without rescanning a newly-activated scene.
          await closeOpenApplications(page);

          // Empty-state capture: a scene with ZERO interactables exercises the
          // dedicated .fab-im-empty branch. Create a throwaway scene, activate it,
          // re-open the panel, and capture the empty list. Tracked for cleanup.
          const emptySceneId = await page.evaluate(async () => {
            const scene = await Scene.create({
              name: 'Fabricate Empty Interactables Scene',
              active: false,
              background: { src: 'icons/environment/settlement/tower-stone-blue.webp' }
            });
            return scene.id;
          });
          // Registered for cleanup BEFORE activation, so a scene that is created but
          // fails to draw is still torn down by Phase F.
          if (emptySceneId) cleanup.sceneIds.push(emptySceneId);
          // The panel scans `canvas.scene`; wait until the canvas has actually switched to the
          // empty scene before opening (activation → canvas redraw is async), otherwise the panel
          // scans the prior populated scene and the empty branch never renders.
          await activateSceneAndAwaitCanvasReady(page, emptySceneId);
          await page.evaluate(() => game.fabricate.api.getInteractablesManagerAppClass().show());
          await page.locator('.fabricate-interactables-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator('.fabricate-interactables-manager .fab-im-empty').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await assertNoScreenshotOverlays(page, { allowFabricateWindowIds: ['fabricate-interactables-manager'] });
          await screenshot(page, 'interactables-manager-empty');

          await closeOpenApplications(page);

          // Re-activate the original scene so later phases see the expected state, and leave it
          // drawn rather than mid-draw: this block ends here, so an un-awaited redraw would
          // otherwise run on underneath whatever phase follows.
          await activateSceneAndAwaitCanvasReady(page, interactableRef?.sceneId);

          results.steps.push({ step: 'interactables-manager', passed: true });
        } catch (err) {
          results.steps.push({ step: 'interactables-manager', passed: false, error: err.message });
          process.stderr.write(`Manage Interactables capture failed: ${err.message}\n`);
        }
  }
};

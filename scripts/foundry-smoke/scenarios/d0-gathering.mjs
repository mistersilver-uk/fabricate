/**
 * Phase D0's gathering section. It enters via `exerciseManagerEnvironmentPointerTargets`, which
 * clicks the Gathering nav first (absolute), and only browses and edits — the phase-E gathering
 * fixtures were seeded earlier in the always-run spine.
 */

import { assertManagerLayoutStable, captureStableManagerView } from '../pageOps/managerViews.mjs';
import { assertNoScreenshotOverlays, exerciseManagerEnvironmentPointerTargets, setManagerWindowSize, softClick } from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'gathering',
  phase: 'phase-D0',
  section: 'gathering',
  publishes: [],
  consumes: ['craftingSetup'],
  async run(ctx) {
    const { page, screenshot } = ctx;
    const { craftingSetup } = ctx.shared;
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await exerciseManagerEnvironmentPointerTargets(page);
        if (await page.locator('.fabricate-manager .manager-environment-row').count() < 1) {
          throw new Error('Manager environments browser rendered no environment rows.');
        }
        if (await page.locator('.fabricate-manager .manager-environment-row.is-selected:has-text("Azure Grove")').count() === 0) {
          throw new Error('Manager environments browser did not show selected environment row state.');
        }
        const sceneEvidenceCount = await page.locator('.fabricate-manager .manager-inspector [data-environment-fact="scene"]').count();
        const sceneStatusCount = await page.locator('.fabricate-manager .manager-inspector:has-text("Linked scene"), .fabricate-manager .manager-inspector:has-text("Scene unresolved")').count();
        if (sceneEvidenceCount === 0 || sceneStatusCount === 0) {
          throw new Error('Manager environments inspector did not show scene evidence.');
        }
        await assertManagerLayoutStable(page, 'environments normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environments-browse-normal');

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove")').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await assertManagerLayoutStable(page, 'environments stacked');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environments-browse-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        const preTaskLibraryCounts = await page.evaluate((sysId) => {
          const rawSystem = game.settings.get('fabricate', 'gatheringConfig')?.systems?.[sysId] || {};
          const app = globalThis.__fabricateSmokeManagerApp;
          let state = null;
          const unsubscribe = app?._adminStore?.viewState?.subscribe?.(value => { state = value; });
          if (typeof unsubscribe === 'function') unsubscribe();
          const selectedSystemId = state?.selectedSystem?.id || '';
          const viewSystem = state?.gatheringConfig?.systems?.[selectedSystemId] || {};
          return {
            expectedSystemId: sysId,
            selectedSystemId,
            rawTasks: Array.isArray(rawSystem.tasks) ? rawSystem.tasks.length : 0,
            rawEvents: Array.isArray(rawSystem.events) ? rawSystem.events.length : 0,
            rawTools: Array.isArray(rawSystem.tools) ? rawSystem.tools.length : 0,
            viewTasks: Array.isArray(viewSystem.tasks) ? viewSystem.tasks.length : 0,
            viewEvents: Array.isArray(viewSystem.events) ? viewSystem.events.length : 0,
            viewTools: Array.isArray(viewSystem.tools) ? viewSystem.tools.length : 0
          };
        }, craftingSetup.systemId);
        if (preTaskLibraryCounts.viewTasks < 1 || preTaskLibraryCounts.viewEvents < 1 || preTaskLibraryCounts.viewTools < 1) {
          throw new Error(`Manager smoke gathering library disappeared before task screenshot: ${JSON.stringify(preTaskLibraryCounts)}`);
        }
        await page.locator('.fabricate-manager #manager-gathering-nav-tasks').first().click();
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Forage Wild Herbs")').first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator('.fabricate-manager .manager-gathering-task-row:has-text("Forage Wild Herbs") [aria-label^="Edit"]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="gathering-task-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // "Selected Drop Rule" only renders when a drop row is selected
        // (CraftingSystemManagerRoot.svelte:2957 `{#if selectedGatheringDrop}`) and its i18n value
        // is now "Selected Drop", so it isn't asserted here.
        for (const expected of ['Task Identity', 'Task Availability', 'Drop Rules']) {
          if (await page.locator('.fabricate-manager').filter({ hasText: expected }).count() === 0) {
            throw new Error(`Manager gathering task editor is missing "${expected}".`);
          }
        }
        await captureStableManagerView(ctx, {
          layout: 'gathering task editor normal',
          label: 'manager-gathering-task-editor-normal'
        });

        await captureStableManagerView(ctx, {
          width: 1000,
          height: 720,
          layout: 'gathering task editor stacked',
          label: 'manager-gathering-task-editor-stacked',
          settleMs: 250
        });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        // Navigate back to environments via the side nav (always visible on
        // gathering routes; the submenu auto-expands when isGatheringRoute).
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager .manager-environment-row:has-text("Azure Grove") .manager-icon-button').nth(0).click();
        await page.locator('.fabricate-manager[data-manager-view="environment-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });

        // The environment editor mounts the composition editor (tabs + inspector rail).
        await page.locator('.fabricate-manager .manager-environment-edit-view[data-environment-editor]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        // The environment editor header now follows the task/event convention: a static "Edit
        // environment" title (the environment name lives in the identity card, not the header).
        await page.locator('.fabricate-manager .manager-title')
          .filter({ hasText: 'Edit environment' }).first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        const editedEnvNameField = page.locator('.fabricate-manager [data-environment-field="name"]').first();
        await editedEnvNameField.waitFor({ state: 'visible', timeout: 5_000 });
        const editedEnvName = await editedEnvNameField.inputValue();
        if (editedEnvName !== 'Azure Grove') {
          throw new Error(`Environment editor loaded the wrong environment: expected "Azure Grove", got "${editedEnvName}".`);
        }
        if (await page.locator('.fabricate-manager .environment-draft-editor, .fabricate-manager .environment-foundation').count() > 0) {
          throw new Error('Manager environments edit route still rendered the legacy environment editor.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-environment-edit-placeholder');

        // Doc journey (quickstart Step 7 — Configure the Gathering Environment):
        // capture the environment editor's composition Tasks and Events tabs so the
        // docs can show how reusable library tasks and events are composed into an
        // environment. The Overview tab is already captured above as
        // manager-environment-edit-placeholder. Tab ids come from
        // EnvironmentEditorTabs.svelte (data-environment-tab-button / -tab).
        for (const [tabId, label] of [
          ['tasks', 'manager-environment-edit-tasks'],
          ['events', 'manager-environment-edit-events']
        ]) {
          await page.locator(`.fabricate-manager [data-environment-tab-button="${tabId}"]`).first().click();
          await page.locator(`.fabricate-manager [data-environment-tab="${tabId}"]`).first()
            .waitFor({ state: 'visible', timeout: 5_000 });
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
          await screenshot(page, label);
        }
        // Restore the Overview tab before leaving the editor so later state is unchanged.
        await page.locator('.fabricate-manager [data-environment-tab-button="overview"]').first().click();
        await page.locator('.fabricate-manager [data-environment-tab="overview"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        // The "Back to environments" button runs through the unsaved-changes route-exit guard.
        // Verify it's clickable, then navigate back via the side nav.
        await softClick(page.locator('.fabricate-manager .manager-header-actions .manager-button:has-text("Back to environments")'), { trial: true });
        await page.locator('.fabricate-manager #manager-gathering-nav-environments').first().click();
        await page.locator('.fabricate-manager[data-manager-view="environments"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-gathering-nav-encounters').first().click();
        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Bramble Snare")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertManagerLayoutStable(page, 'gathering events normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-events-normal');

        await page.locator('.fabricate-manager .manager-gathering-event-row:has-text("Bramble Snare") [aria-label^="Edit"]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="gathering-event-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        for (const expected of ['Event Identity', 'Event Matching']) {
          if (await page.locator('.fabricate-manager').filter({ hasText: expected }).count() === 0) {
            throw new Error(`Manager gathering event editor is missing "${expected}".`);
          }
        }
        await assertManagerLayoutStable(page, 'gathering event editor normal');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-event-editor-normal');

        // World Parties plus World Travel (#1179, moved to world scope by #1282): the Travel
        // disclosure starts collapsed. Capture each disclosure/selection state through its
        // stable navigation id.
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager #manager-world-nav-travel[aria-expanded="false"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Travel collapsed by default',
          label: 'manager-world-travel-default-collapsed'
        });

        await page.locator('.fabricate-manager #manager-travel-toggle').first().click();
        await page.locator('.fabricate-manager #manager-world-nav-travel[aria-expanded="true"]')
          .first().waitFor({ state: 'visible', timeout: 5_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Travel expanded neutral',
          label: 'manager-world-travel-expanded-neutral'
        });

        const gatheringToggle = page.locator(
          '.fabricate-manager .manager-nav-toggle[aria-controls="manager-gathering-submenu"]'
        ).first();
        const gatheringSubmenu = page.locator('.fabricate-manager #manager-gathering-submenu').first();
        const gatheringWasExpanded = await gatheringSubmenu.isVisible();
        if (!gatheringWasExpanded) {
          await gatheringToggle.click();
          await gatheringSubmenu.waitFor({ state: 'visible', timeout: 5_000 });
        }
        await captureStableManagerView(ctx, {
          layout: 'Gathering and World Travel expanded together',
          label: 'manager-world-travel-with-gathering-expanded'
        });
        if (!gatheringWasExpanded) {
          await gatheringToggle.click();
          await gatheringSubmenu.waitFor({ state: 'hidden', timeout: 5_000 });
        }

        await page.locator('.fabricate-manager #manager-world-nav-parties').first().click();
        await page.locator('.fabricate-manager .manager-travel-parties-row').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Parties normal',
          label: 'manager-world-parties-normal'
        });

        await page.locator('.fabricate-manager #manager-travel-nav-realms').first().click();
        await page.locator('.fabricate-manager [data-travel-panel="realms"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Travel Realms normal',
          label: 'manager-world-travel-realms-normal'
        });
        await captureStableManagerView(ctx, {
          width: 1000,
          height: 720,
          layout: 'World Travel Realms stacked',
          label: 'manager-world-travel-realms-stacked',
          settleMs: 250
        });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        const mapDestination = page.locator('.fabricate-manager #manager-travel-nav-map').first();
        // The View Lab long-label-focus case owns native Space activation and focus-visible
        // evidence for this exact control.
        await mapDestination.click();
        await page.locator('.fabricate-manager [data-travel-panel="map"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator(
          '.fabricate-manager [data-manager-map-region-uuid]:has-text("Fabricate Forage Node")'
        ).first().waitFor({ state: 'visible', timeout: 10_000 });
        await page.locator(
          '.fabricate-manager .manager-travel-inspector' +
          '[aria-label="Selected map region link"]:has-text("Northreach Vale")'
        ).first().waitFor({ state: 'visible', timeout: 10_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Travel Map Region Links normal',
          label: 'manager-world-travel-map-normal'
        });
        await captureStableManagerView(ctx, {
          width: 1000,
          height: 720,
          layout: 'World Travel Map Region Links stacked',
          label: 'manager-world-travel-map-stacked',
          settleMs: 250
        });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager [data-manager-rail-toggle]').first().click();
        await page.locator('.fabricate-manager .manager-body.is-rail-collapsed')
          .first().waitFor({ state: 'visible', timeout: 5_000 });
        await captureStableManagerView(ctx, {
          layout: 'World Travel Map Region Links collapsed rail',
          label: 'manager-world-travel-map-collapsed-rail'
        });
        await page.locator('.fabricate-manager [data-manager-rail-toggle]').first().click();
        await page.locator('.fabricate-manager .manager-body:not(.is-rail-collapsed)')
          .first().waitFor({ state: 'visible', timeout: 5_000 });

        // World > Travel is ungated as of #1282: realms are world geography, so the entry stays put
        // when the selected system opts out of Travel & Realms.
        try {
          await page.evaluate(async (systemId) => {
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.setGatheringRealmsEnabled?.(
              systemId,
              false
            );
          }, craftingSetup.systemId);
          await page.locator('.fabricate-manager #manager-world-nav-travel')
            .first().waitFor({ state: 'visible', timeout: 5_000 });
          await captureStableManagerView(ctx, {
            layout: 'World Travel present for a non-participating system',
            label: 'manager-world-travel-ungated'
          });
        } finally {
          await page.evaluate(async (systemId) => {
            const store = globalThis.__fabricateSmokeManagerApp?._adminStore;
            await store?.setGatheringRealmsEnabled?.(systemId, true);
            await store?.selectSystem?.(systemId);
          }, craftingSetup.systemId);
        }

        // Doc journey (quickstart Step 7 — Configure the Gathering Environment):
        // the gathering Settings tab hosts the d100 Gathering Rules (reward / event
        // selection, event outcome) and the Stamina / Resource-node Limitation
        // toggles. Capture it so the docs can show where those system-level rules
        // live. Nav id from CraftingSystemManagerRoot.svelte (gathering nav 'settings'),
        // panel id from EnvironmentsBrowserView.svelte.
        await page.locator('.fabricate-manager #manager-gathering-nav-settings').first().click();
        await page.locator('.fabricate-manager #manager-gathering-panel-settings').first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        await page.waitForTimeout(300);
        // The gathering Settings panel is a rules/limitation form, not a table, so
        // assertManagerLayoutStable (which requires table rows) does not apply here.
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-gathering-settings');
  }
};

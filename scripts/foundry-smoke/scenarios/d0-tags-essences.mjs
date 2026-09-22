/** Phase D0's tags, categories and essences section. */

import { railSelector } from '../../lib/managerRailEntries.js';
import { assertManagerLayoutStable, captureStableManagerView } from '../pageOps/managerViews.mjs';
import { assertNoScreenshotOverlays, setManagerWindowSize } from '../pageOps/pageLifecycle.mjs';

export default {
  id: 'tags-essences',
  phase: 'phase-D0',
  section: 'tags-essences',
  publishes: [],
  consumes: [],
  async run(ctx) {
    const { page, results, screenshot } = ctx;
    await setManagerWindowSize(page, { width: 1280, height: 820 });
    await page.locator(railSelector('manager-nav-tags')).click();
    await page
      .locator('.fabricate-manager[data-manager-view="tags"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);
    if (
      (await page.locator('.fabricate-manager [data-tags-evidence="how-it-works"]').count()) === 0
    ) {
      throw new Error('Manager tags inspector did not render the How-it-works evidence card.');
    }
    await captureStableManagerView(ctx, {
      layout: 'tags-categories normal',
      label: 'manager-tags-categories-normal',
    });

    // Tags & Categories → Item tags panel, scrolled to its seeded rows (issue #752 — evidence
    // for #735's row rendering).
    try {
      // The issue-689 redesign is tabbed (one vocabulary at a time) and renames the tab "Component
      // tags"; the pre-redesign screen stacks all three panels with the old "Item tags" label.
      const tagsTabButton = page.locator('.fabricate-manager [data-vocabulary-tab="tag"]').first();
      if ((await tagsTabButton.count()) > 0) {
        await tagsTabButton.click();
      }
      const itemTagsPanel = page
        .locator(
          '.fabricate-manager .manager-vocabulary-panel[aria-label="Component tags"], .fabricate-manager .manager-vocabulary-panel[aria-label="Item tags"]'
        )
        .first();
      await itemTagsPanel.waitFor({ state: 'visible', timeout: 5000 });
      const tagRowCount = await itemTagsPanel.locator('[data-tag-id]').count();
      if (tagRowCount < 3) {
        throw new Error(
          `Item tags panel rendered ${tagRowCount} tag rows, expected the three seeded tags.`
        );
      }
      await itemTagsPanel.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-tags-categories-tags-tab');
      process.stdout.write('  D0: tags item-tags rows screenshotted\n');
      results.steps.push({ step: 'tags-categories-tags-tab', passed: true });
    } catch (error) {
      results.steps.push({ step: 'tags-categories-tags-tab', passed: false, error: error.message });
      process.stderr.write(`Tags item-tags capture failed: ${error.message}\n`);
    }

    await captureStableManagerView(ctx, {
      width: 1000,
      height: 700,
      layout: 'tags-categories stacked',
      label: 'manager-tags-categories-stacked',
    });

    await setManagerWindowSize(page, { width: 1280, height: 820 });
    const essenceNav = page.locator(railSelector('manager-nav-essence-rules'));
    if ((await essenceNav.count()) > 0 && !(await essenceNav.first().isDisabled())) {
      await essenceNav.first().click();
      await page
        .locator('.fabricate-manager[data-manager-view="essences"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      await assertManagerLayoutStable(page, 'essences normal');
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-essences-normal');

      await setManagerWindowSize(page, { width: 1000, height: 700 });
      await assertManagerLayoutStable(page, 'essences stacked');
      await assertNoScreenshotOverlays(page);
      await screenshot(page, 'manager-essences-stacked');

      await setManagerWindowSize(page, { width: 1280, height: 820 });
      const essenceRow = page.locator('.fabricate-manager .manager-essence-row');
      if ((await essenceRow.count()) > 0) {
        const editButton = essenceRow.first().locator('.manager-icon-button[title*="Edit" i]');
        if ((await editButton.count()) > 0) {
          await editButton.first().click();
          await page
            .locator('.fabricate-manager[data-manager-view="essence-edit"]')
            .first()
            .waitFor({ state: 'visible', timeout: 5000 });
          await page.waitForTimeout(500);
          await assertManagerLayoutStable(page, 'essence-edit first state');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'manager-essence-edit-first-state');
          await page
            .locator(
              '.fabricate-manager .manager-button:has-text("Cancel"), .fabricate-manager .manager-button:has-text("Back")'
            )
            .first()
            .click({ trial: false })
            .catch(() => {});
          await page.waitForTimeout(250);
        }
      }
    }
  },
};

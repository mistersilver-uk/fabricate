/** Manager-surface page primitives: section and editor navigation, the layout and hit-test assertions, and the captures that pair a stable view with a screenshot. */

import {
  FABRICATE_THEME_IDS,
  FABRICATE_THEME_ATTRIBUTE,
  DEFAULT_FABRICATE_THEME,
} from '../../../src/ui/theme.js';
import {
  assertExpectedSelectorsPresent,
  expectedSelectorsForManagerSurface,
} from '../../lib/managerLayoutGuards.js';
import { railSelector } from '../../lib/managerRailEntries.js';

import {
  assertNoScreenshotOverlays,
  setManagerWindowSize,
  settleManagerNav,
  softClick,
  withDeadline,
} from './pageLifecycle.mjs';

/**
 * A UI-triggered craft / immediate-d100 gather now opens the interactive roll prompt (a Foundry
 * DialogV2 carrying `.fabricate-roll-prompt`).
 */
export async function handleRollPromptIfPresent(ctx, label) {
  const { page, screenshot } = ctx;
  const dialog = page
    .locator('.application.dialog:has(.fabricate-roll-prompt), .dialog:has(.fabricate-roll-prompt)')
    .first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    return false;
  }
  await screenshot(page, label);
  // The confirm button is "Normal" for a d20 check (Advantage/Normal/Disadvantage) or "Roll" for a
  // non-d20 / d100 check (single button).
  const rollBtn = dialog
    .locator(
      'button[data-action="normal"], button[data-action="roll"], button:has-text("Normal"), button:has-text("Roll")'
    )
    .first();
  await rollBtn.click().catch(() => {});
  await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  return true;
}

/**
 * Re-theme the live, Foundry-mounted Fabricate surface exactly as the theme setting's onChange
 * (applyFabricateTheme) does: set the theme attribute on the document element and every
 * `.fabricate` root.
 */
export async function applyManagerTheme(page, themeId) {
  await page.evaluate(
    ({ id, attr }) => {
      document.documentElement.setAttribute(attr, id);
      for (const root of document.querySelectorAll('.fabricate')) root.setAttribute(attr, id);
    },
    { id: themeId, attr: FABRICATE_THEME_ATTRIBUTE }
  );
  await page.waitForTimeout(200);
}

/**
 * Capture the currently-open manager view under every Fabricate theme, then restore the default
 * theme so later Phase D0 captures stay unthemed.
 */
export async function captureManagerThemes(ctx) {
  const { page, screenshot } = ctx;
  const { CAPTURE_THEME_SWEEPS } = ctx.profile;
  // R2 (#750): opt-in only — these 14 theme frames are unasserted and unmapped.
  if (!CAPTURE_THEME_SWEEPS) return;
  for (const themeId of Object.values(FABRICATE_THEME_IDS)) {
    await applyManagerTheme(page, themeId);
    await screenshot(page, `manager-theme-${themeId}`);
  }
  await applyManagerTheme(page, DEFAULT_FABRICATE_THEME);
}

// Recipes now nests inside the gated Crafting nav group (issue 511).
export async function openManagerCraftingSection(page, subitemId, managerView) {
  await page.locator(railSelector('manager-nav-crafting')).click();
  const subitem = page.locator(`.fabricate-manager #manager-crafting-nav-${subitemId}`).first();
  await subitem.waitFor({ state: 'visible', timeout: 5000 });
  await subitem.click();
  await page
    .locator(`.fabricate-manager[data-manager-view="${managerView}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
}

/** Select one of the open Checks activity route's five sections (issue 1096). */
export async function openChecksSection(page, section) {
  const button = page
    .locator(`.fabricate-manager [data-checks-section-button="${section}"]`)
    .first();
  await button.waitFor({ state: 'visible', timeout: 5000 });
  await button.click();
  await page
    .locator(`.fabricate-manager [data-checks-section-button="${section}"][aria-selected="true"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
}

/** Open a Checks Studio activity route, and optionally one of its sections (issue 1096). */
export async function openChecksActivity(page, activity, section = '') {
  await page.locator(railSelector('manager-nav-checks')).click();
  const navItem = page.locator(`.fabricate-manager #manager-checks-nav-${activity}`).first();
  await navItem.waitFor({ state: 'visible', timeout: 5000 });
  await navItem.click();
  await page
    .locator('.fabricate-manager [data-checks-editor]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await page
    .locator(`.fabricate-manager [data-checks-panel="${activity}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  if (section) await openChecksSection(page, section);
}

// Return to the recipes browser (via the Crafting group) and open the named recipe's editor,
// waiting for the recipe-edit route.
export async function openManagerRecipeEditor(page, recipeName) {
  await openManagerCraftingSection(page, 'recipes', 'recipes');
  await page
    .locator(`.fabricate-manager .manager-recipe-row:has-text("${recipeName}") [data-recipe-edit]`)
    .first()
    .click();
  await page
    .locator('.fabricate-manager[data-manager-view="recipe-edit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
}

// The rail's "All crafting systems" back-link is inert on the systems browser itself (issue 643):
// there is nowhere to go back to, so it renders disabled.
export async function returnToSystemLibrary(page) {
  const link = page.locator('.fabricate-manager .manager-scope-return').first();
  if ((await link.count()) === 0) return false;
  if (await link.isDisabled().catch(() => false)) return false;
  await link.click();
  return true;
}

/**
 * Open a recipe, switch to its Results tab, wait for a mode-specific content marker to be VISIBLE,
 * and capture the frame.
 */
export async function captureRecipeResultsTab(ctx, recipeName, label, contentSelector) {
  const { page, screenshot } = ctx;
  await openManagerRecipeEditor(page, recipeName);
  await page.locator('.fabricate-manager [data-recipe-tab-button="results"]').first().click();
  await page
    .locator('.fabricate-manager [data-recipe-tab="results"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await page
    .locator(`.fabricate-manager [data-recipe-tab="results"] ${contentSelector}`)
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  await assertManagerLayoutStable(page, label);
  await assertNoScreenshotOverlays(page);
  await screenshot(page, label);
}

/**
 * Drive the manager's persistent nav rail to the selected system's Edit route and bring the
 * multi-step-recipes feature tile into frame.
 */
export async function openManagerMultiStepFeatureTile(page) {
  await page
    .locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]')
    .first()
    .click();
  await page
    .locator('.fabricate-manager[data-manager-view="system-edit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const tile = page.locator('.fabricate-manager [data-feature-key="multiStepRecipes"]').first();
  await tile.waitFor({ state: 'visible', timeout: 5000 });
  await tile.scrollIntoViewIfNeeded().catch(() => {});
  return tile;
}

/**
 * Capture the currently-open player Alchemy workbench under every Fabricate theme, then restore the
 * default theme.
 */
export async function captureAlchemyThemes(ctx) {
  const { page, screenshot } = ctx;
  const { CAPTURE_THEME_SWEEPS } = ctx.profile;
  // R2 (#750): opt-in only — these theme frames are unasserted and unmapped.
  if (!CAPTURE_THEME_SWEEPS) return;
  for (const themeId of Object.values(FABRICATE_THEME_IDS)) {
    await applyManagerTheme(page, themeId);
    await screenshot(page, `player-alchemy-theme-${themeId}`);
  }
  await applyManagerTheme(page, DEFAULT_FABRICATE_THEME);
}

/**
 * Capture a manager view after applying the standard layout and overlay checks.
 * @param {object} ctx The scenario context.
 * @param {{ width?: number, height?: number, layout: string, label: string, settleMs?: number }} options
 */
export async function captureStableManagerView(
  ctx,
  { width, height, layout, label, settleMs = 0 }
) {
  const { page, screenshot } = ctx;
  if (typeof width === 'number' && typeof height === 'number') {
    await setManagerWindowSize(page, { width, height });
  }
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
  await assertManagerLayoutStable(page, layout);
  await assertNoScreenshotOverlays(page);
  await screenshot(page, label);
}

/** The Component Studio's bulk-edit surface, as data (issues 772 / 1010). */
export const COMPONENT_BULK_EDIT_STUDIO = Object.freeze({
  // The selection changes only the RAIL, which swaps the inspector for the panel, so this reuses
  // the plain browser frame's pinned selectors rather than declaring a second layout.
  layout: 'components normal',
  noun: 'component',
  rowSelector: '.fabricate-manager .manager-component-row',
  selectedRowSelector: '.fabricate-manager .manager-component-row.is-bulk-selected',
  rowBoxSelector: 'label:has(input[data-component-select])',
  panelSelector: '.fabricate-manager [data-component-bulk-panel]',
  displacedInspectorSelector: '.fabricate-manager [data-component-inspector]',
  toolbarCountSelector:
    '.fabricate-manager [data-component-selection-toolbar] [data-component-selection-count]',
  clearSelector: '.fabricate-manager [data-component-clear-selection]',
  selectRows: async (rows, studio) => {
    for (const index of [0, 1]) {
      await rows.nth(index).locator(studio.rowBoxSelector).first().click();
    }
  },
});

/** The Recipe Studio's bulk-edit surface (issue 1010) — the same shape, none of the same hooks. */
export const RECIPE_BULK_EDIT_STUDIO = Object.freeze({
  layout: 'recipes normal',
  noun: 'recipe',
  rowSelector: '.fabricate-manager .manager-recipe-row',
  selectedRowSelector: '.fabricate-manager .manager-recipe-row.is-bulk-selected',
  rowBoxSelector: 'label:has(input[data-recipe-select])',
  panelSelector: '.fabricate-manager [data-recipe-bulk-panel]',
  displacedInspectorSelector: '.fabricate-manager [data-recipe-inspector]',
  toolbarCountSelector:
    '.fabricate-manager [data-recipe-selection-toolbar] [data-recipe-selection-count]',
  clearSelector: '.fabricate-manager [data-recipe-clear-selection]',
});

/** Tick the two rows whose names are given, in order. */
export function selectRecipeRowsByName(...names) {
  return async (rows, studio) => {
    for (const name of names) {
      const row = rows.filter({ hasText: name }).first();
      if ((await row.count()) === 0) {
        throw new Error(`Recipe browser rendered no row named "${name}" to bulk-select.`);
      }
      await row.locator(studio.rowBoxSelector).first().click();
    }
  };
}

/** Issue 1504 — choose an option from a shared `<Select>`, the way a GM does. */
export async function chooseSelectOption(page, trigger, option) {
  // Naming neither row is A caller's defect, and it is refused here rather than carried into
  // Playwright.
  if (option.value === undefined && !Number.isInteger(option.index)) {
    throw new Error(
      'chooseSelectOption was given neither a `value` nor an integer `index`, so it names no row. ' +
        'Address the row by its own `data-popover-option` handle, or positionally by index.'
    );
  }
  await trigger.waitFor({ state: 'visible', timeout: 5000 });
  await trigger.click();
  // `.first()` is safe though it is not bound to this trigger the way `select-control.js` is:
  // the click above fires `dismissOnOutsideClick`, so any other panel is already shut.
  const panel = page.locator('.fabricate-select-popover').first();
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  if (option.value !== undefined) {
    const row = panel.locator(`[data-popover-option="${option.value}"]`).first();
    await row.waitFor({ state: 'visible', timeout: 5000 });
    await row.click();
    return;
  }
  const rows = panel.locator('[role="option"]');
  const count = await rows.count();
  if (count <= option.index) {
    throw new Error(
      `The option list rendered ${count} row(s); index ${option.index} was asked for. A positional ` +
        'choice here means the world authored no vocabulary for this axis, not that the control broke.'
    );
  }
  await rows.nth(option.index).click();
}

/** Choose one segment of a `SegmentedControl`, by its `optionDataAttr` value. */
export async function clickSegment(scope, optionDataAttr, value) {
  const segment = scope.locator(`label[${optionDataAttr}="${value}"]`).first();
  await segment.waitFor({ state: 'visible', timeout: 5000 });
  await segment.click();
}

/** Issue 772 / 1010 — capture one state of a manager browser's bulk edit rail panel. */
export async function captureBulkEditFrame(ctx, { studio, stepName, label, selectRows, stage }) {
  const { page, results } = ctx;
  const pickRows = selectRows ?? studio.selectRows;
  try {
    const rows = page.locator(studio.rowSelector);
    if ((await rows.count()) < 2) {
      throw new Error(`Browser rendered fewer than two ${studio.noun} rows to bulk-select.`);
    }
    await pickRows(rows, studio);
    const bulkPanel = page.locator(studio.panelSelector).first();
    await bulkPanel.waitFor({ state: 'visible', timeout: 5000 });
    // The panel replaces the single-row inspector rather than sitting beside it, so the inspector's
    // absence is half of what the frame is evidence for.
    if ((await page.locator(studio.displacedInspectorSelector).count()) > 0) {
      throw new Error(`The ${studio.noun} bulk panel mounted alongside the inspector it replaces.`);
    }
    const bulkSelectedRows = await page.locator(studio.selectedRowSelector).count();
    if (bulkSelectedRows !== 2) {
      throw new Error(`Expected two bulk-selected ${studio.noun} rows, found ${bulkSelectedRows}.`);
    }
    await page
      .locator(studio.toolbarCountSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    await stage(bulkPanel);

    await captureStableManagerView(ctx, { layout: studio.layout, label });
    process.stdout.write(`  D0: ${stepName} screenshotted\n`);
    results.steps.push({ step: stepName, passed: true });
  } catch (error) {
    results.steps.push({ step: stepName, passed: false, error: error.message });
    process.stderr.write(`${stepName} capture failed: ${error.message}\n`);
  } finally {
    // Clear whether or not the capture succeeded: a live selection keeps the rail on the
    // bulk panel, and the count-to-zero transition is what discards the staged draft.
    await softClick(page.locator(studio.clearSelector));
    try {
      await page
        .locator(studio.panelSelector)
        .first()
        .waitFor({ state: 'detached', timeout: 5000 });
    } catch (error) {
      results.steps.push({ step: `${stepName}-cleared`, passed: false, error: error.message });
      process.stderr.write(`${stepName} left the bulk panel mounted: ${error.message}\n`);
    }
  }
}

/**
 * Issue 801 — capture a GM library's grouped-category continuation frame: seed one category large
 * enough to span a page boundary, shrink the pager to page size 10, advance to the continuation
 * page (the category's remaining slice, "N of M", at the head), and screenshot.
 */
export async function captureGroupedContinuationFrame(ctx, options) {
  const { page, results } = ctx;
  const {
    seed,
    hasSeed,
    cleanup,
    openBrowser,
    settle,
    settleAfterReset,
    groupCountSelector,
    layout,
    label,
    stepName,
    failMessage,
  } = options;
  let handle = null;
  try {
    handle = await seed();
    await openBrowser();
    const size = page.locator('.fabricate-manager [data-pagination-size]').first();
    await chooseSelectOption(page, size, { value: '10' });
    await settle();
    await page.locator('.fabricate-manager [data-pagination-next]').first().click();
    await settle();
    await page.locator(groupCountSelector).first().waitFor({ state: 'visible', timeout: 5000 });
    await captureStableManagerView(ctx, { layout, label });
    results.steps.push({ step: stepName, passed: true });
  } catch (error) {
    results.steps.push({ step: stepName, passed: false, error: error.message });
    process.stderr.write(`${failMessage}: ${error.message}\n`);
  } finally {
    const sizeReset = page.locator('.fabricate-manager [data-pagination-size]').first();
    if ((await sizeReset.count()) > 0) {
      // Narrowed, not removed (issue 1504).
      try {
        await chooseSelectOption(page, sizeReset, { value: '25' });
      } catch (error) {
        process.stderr.write(
          `${failMessage}: the page size was not reset to 25: ${error.message}\n`
        );
      }
      await settleAfterReset();
    }
    if (handle && hasSeed(handle)) {
      await cleanup(handle);
    }
    await openBrowser();
  }
}

/** Issue 806 — the editor round-trip preservation frame for the recipe library. */
export async function captureRecipeEditorRoundtrip(ctx, craftingSetup) {
  const { page, results, screenshot } = ctx;
  const CATEGORY = 'Roundtrip Brews';
  let ids = [];
  try {
    ids = await page.evaluate(
      async ({ sysId, category }) => {
        const rm = game.fabricate.getRecipeManager();
        const created = [];
        for (let index = 1; index <= 3; index += 1) {
          const recipe = await rm.createRecipe(
            {
              name: `Roundtrip Draught ${String(index).padStart(2, '0')}`,
              description: 'Issue 806 editor round-trip preservation fixture.',
              craftingSystemId: sysId,
              ingredientSets: [
                {
                  ingredientGroups: [
                    {
                      name: 'Any reagent',
                      options: [
                        {
                          quantity: 1,
                          match: { type: 'tags', tags: ['reagent'], tagMatch: 'any' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { allowIncomplete: true, notify: false }
          );
          await rm.updateRecipe(recipe.id, { category }, { allowIncomplete: true, notify: false });
          created.push(recipe.id);
        }
        await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        return created;
      },
      { sysId: craftingSetup.systemId, category: CATEGORY }
    );

    await openManagerCraftingSection(page, 'recipes', 'recipes');

    // Filter to the seeded category: a visible chip and a single-group filtered list.
    const categoryFilter = page.locator('.fabricate-manager [data-recipe-category-filter]').first();
    await categoryFilter.selectOption(CATEGORY);
    await settleManagerNav(page);
    await page
      .locator('.fabricate-manager [data-recipe-filter-chip="category"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    // Select a row into the shared shell inspector, so its Edit action survives the
    // collapse below (a collapsed group renders no rows to click).
    await page
      .locator('.fabricate-manager .manager-recipe-row .manager-recipe-identity')
      .first()
      .click();
    const inspectorEdit = page
      .locator('.fabricate-manager .manager-recipe-browser-inspector [data-recipe-action="edit"]')
      .first();
    await inspectorEdit.waitFor({ state: 'visible', timeout: 5000 });

    // Collapse the category group, then open the editor from the inspector.
    const header = page
      .locator('.fabricate-manager .manager-recipe-group [data-group-header]')
      .first();
    await header.click();
    await settleManagerNav(page);
    await inspectorEdit.click();
    await page
      .locator('.fabricate-manager[data-manager-view="recipe-edit"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });

    // Return to the browser: the category filter chip and the collapsed group both survive.
    await page
      .locator(
        '.fabricate-manager .manager-header-actions .manager-button:has-text("Back to recipes")'
      )
      .first()
      .click();
    await page
      .locator('.fabricate-manager[data-manager-view="recipes"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    await page
      .locator('.fabricate-manager [data-recipe-filter-chip="category"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    const stillCollapsed = await page
      .locator('.fabricate-manager .manager-recipe-group [data-group-header]')
      .first()
      .getAttribute('aria-expanded');
    if (stillCollapsed !== 'false') {
      throw new Error(
        `Expected the collapsed group to survive the round-trip; aria-expanded=${stillCollapsed}`
      );
    }

    // The collapsed single-category group renders zero rows on purpose, so
    // `assertManagerLayoutStable` does not apply — the recipe-item validation and recipe-editor
    // tab captures skip it for the same reason.
    await settleManagerNav(page);
    await page.waitForTimeout(200);
    await assertNoScreenshotOverlays(page);
    await screenshot(page, 'manager-recipes-editor-roundtrip');
    results.steps.push({ step: 'recipes-editor-roundtrip', passed: true });
  } catch (error) {
    results.steps.push({ step: 'recipes-editor-roundtrip', passed: false, error: error.message });
    process.stderr.write(`Recipes editor round-trip capture failed: ${error.message}\n`);
  } finally {
    const categoryReset = page.locator('.fabricate-manager [data-recipe-category-filter]').first();
    if ((await categoryReset.count()) > 0) {
      await categoryReset.selectOption('all').catch(() => {});
      await settleManagerNav(page);
    }
    if (ids.length > 0) {
      await page.evaluate(async (recipeIds) => {
        const rm = game.fabricate.getRecipeManager();
        for (const id of recipeIds) {
          await rm.deleteRecipe(id, { notify: false }).catch(() => {});
        }
        await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
      }, ids);
    }
    await openManagerCraftingSection(page, 'recipes', 'recipes');
  }
}

/** Assert manager table rows and summary regions do not horizontally overflow. */
export async function assertManagerLayoutStable(page, label) {
  const metrics = await withDeadline(
    page.evaluate(() => {
      const selectors = [
        '.fabricate-manager',
        '.manager-main',
        '.manager-table-scroll',
        '.manager-system-row',
        '.manager-system-identity',
        '.manager-recipes-table',
        '.manager-recipe-row',
        '.manager-recipe-identity',
        '.manager-environments-table',
        '.manager-environment-row',
        '.manager-environment-identity',
        '.manager-environment-editor-shell',
        '.manager-components-list',
        '.manager-component-row',
        '.manager-component-identity',
        // The essence library's list container and its selecting button (issue 1036).
        '.manager-essences-table',
        '.manager-essence-row',
        '.manager-essence-identity',
        '.manager-vocabulary-row',
        '.manager-gathering-task-row',
        '.manager-gathering-event-row',
        '.manager-tools-row',
        // GM Knowledge surface (issue 785).
        '.manager-knowledge-copy-row',
        '.manager-knowledge-learned-row',
        '[data-manager-tool-id]',
        '[data-tool-edit-view]',
        '.manager-inspector-card',
        '.manager-system-edit-form',
        '.manager-edit-card',
        '.manager-toggle-row',
        '.manager-essence-edit-view',
        '.manager-recipe-edit-main',
        '.manager-component-edit-view',
        '.manager-component-identity-strip',
        '.environment-draft-editor',
        '.manager-environment-edit-view',
        '.manager-gathering-task-edit-view',
        '.manager-gathering-event-edit-view',
        '.manager-environment-workspace',
        '.environment-fields',
        '.environment-task-layout',
        '.manager-travel-view',
        '.manager-travel-parties-row',
        '.manager-travel-realms-row',
        '.manager-map-link-row',
        '.manager-party-member-row',
        '.manager-fact',
      ];
      return selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map((element, index) => {
          const rect = element.getBoundingClientRect();
          return {
            selector,
            index,
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: element.textContent?.replaceAll(/\s+/g, ' ').trim().slice(0, 80) || '',
          };
        })
      );
    }),
    30_000,
    `assertManagerLayoutStable ${label}`
  );

  const overflowing = metrics.filter((metric) => metric.scrollWidth > metric.clientWidth + 2);
  if (overflowing.length > 0) {
    throw new Error(
      `Manager horizontal overflow at ${label}: ${JSON.stringify(overflowing.slice(0, 5))}`
    );
  }

  // Fail loud when a per-surface critical class is renamed/removed: the overflow pass above only
  // measures what it finds, so a selector that matches nothing is silently uncovered.
  assertExpectedSelectorsPresent(metrics, expectedSelectorsForManagerSurface(label), label);

  const rowCount = metrics.filter((metric) =>
    [
      '.manager-system-row',
      '.manager-recipe-row',
      '.manager-environment-row',
      '.manager-component-row',
      '.manager-essence-row',
      '.manager-vocabulary-row',
      '.manager-gathering-task-row',
      '.manager-gathering-event-row',
      '[data-manager-tool-id]',
      '.manager-knowledge-copy-row',
      '.manager-knowledge-learned-row',
      '.manager-travel-parties-row',
      '.manager-travel-realms-row',
      '.manager-map-link-row',
    ].includes(metric.selector)
  ).length;
  const editFormCount = metrics.filter((metric) =>
    [
      '.manager-system-edit-form',
      '.manager-environment-editor-shell',
      '.manager-environment-edit-view',
      '.manager-gathering-task-edit-view',
      '.manager-gathering-event-edit-view',
      '.manager-essence-edit-view',
      '.manager-recipe-edit-main',
      '[data-tool-edit-view]',
      '.manager-component-edit-view',
      '.environment-draft-editor',
    ].includes(metric.selector)
  ).length;
  if (rowCount === 0 && editFormCount === 0) {
    throw new Error(`Manager rendered no table rows at ${label}`);
  }
}

/** Assert at least one recipe row is actually reachable — a pointer hit-test, not a DOM count. */
export async function assertRecipeRowsHittable(page, label) {
  const report = await withDeadline(
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('.manager-recipe-row')];
      rows[0]?.scrollIntoView({ block: 'center' });
      const hittable = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        const x = Math.round(rect.left + Math.min(rect.width / 2, 60));
        const y = Math.round(rect.top + rect.height / 2);
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit) && row.contains(hit);
      }).length;
      return { total: rows.length, hittable };
    }),
    30_000,
    `assertRecipeRowsHittable ${label}`
  );

  if (report.hittable === 0) {
    throw new Error(
      `Recipe library rendered no VISIBLE row at ${label}: ${report.total} row(s) present in the DOM, 0 reachable by a pointer (clipped, zero-height, or painted over).`
    );
  }
}

/**
 * Assert the player's progressive stage list is sound — the checks no unit test can make (issue
 * 651).
 */
export async function assertProgressiveStageListSound(
  page,
  label,
  { expectAnnouncement = false } = {}
) {
  const report = await withDeadline(
    page.evaluate(() => {
      const contains = (outer, inner) =>
        inner.left >= outer.left - 0.5 &&
        inner.right <= outer.right + 0.5 &&
        inner.top >= outer.top - 0.5 &&
        inner.bottom <= outer.bottom + 0.5;

      const rows = [...document.querySelectorAll('[data-progressive-stage]')];
      const thresholds = [...document.querySelectorAll('[data-progressive-stage-threshold]')].map(
        (node) => Number(node.dataset.progressiveStageThreshold)
      );

      const chevrons = [...document.querySelectorAll('[data-progressive-stage-move] button')].map(
        (button) => {
          const box = button.getBoundingClientRect();
          const glyph = button.querySelector('i')?.getBoundingClientRect() ?? null;
          return {
            height: box.height,
            width: box.width,
            glyphContained: glyph ? contains(box, glyph) : false,
            hasGlyph: Boolean(glyph),
          };
        }
      );

      // Per row: the horizontal gap between the up and down buttons.
      const chevronGaps = [...document.querySelectorAll('[data-progressive-stage-move]')]
        .map((group) => {
          const buttons = [...group.querySelectorAll('button')];
          if (buttons.length < 2) return null;
          const a = buttons[0].getBoundingClientRect();
          const b = buttons[1].getBoundingClientRect();
          return Math.round(b.left - a.right);
        })
        .filter((gap) => gap !== null);

      const region = document.querySelector('[data-progressive-stage-status]');
      const regionBox = region?.getBoundingClientRect() ?? null;

      return {
        rowCount: rows.length,
        thresholds,
        chevrons,
        chevronGaps,
        region: region
          ? {
              text: region.textContent?.trim() ?? '',
              width: regionBox.width,
              height: regionBox.height,
            }
          : null,
      };
    }),
    30_000,
    `assertProgressiveStageListSound ${label}`
  );

  if (report.rowCount < 3) {
    throw new Error(`${label}: expected >= 3 progressive stages, saw ${report.rowCount}`);
  }

  const cropped = report.chevrons.filter((c) => !c.hasGlyph || !c.glyphContained || c.height < 30);
  if (cropped.length > 0) {
    throw new Error(
      `${label}: chevron buttons cropped or under-sized (Foundry .app button reset leaked): ${JSON.stringify(cropped.slice(0, 4))}`
    );
  }

  const spaced = report.chevronGaps.filter((gap) => gap > 8);
  if (spaced.length > 0) {
    throw new Error(
      `${label}: chevrons not adjacent — a leaked .app button margin: gaps ${JSON.stringify(spaced)}`
    );
  }

  if (expectAnnouncement) {
    if (!report.region) throw new Error(`${label}: no aria-live region rendered`);
    if (report.region.text.length === 0) {
      throw new Error(
        `${label}: the live region carries no text, so its visibility proves nothing`
      );
    }
    if (report.region.width > 2 || report.region.height > 2) {
      throw new Error(
        `${label}: the live region is VISIBLE (${report.region.width}x${report.region.height}) — the .fabricate .visually-hidden block is missing or overridden. Text: "${report.region.text}"`
      );
    }
  }

  for (let i = 1; i < report.thresholds.length; i++) {
    if (report.thresholds[i] < report.thresholds[i - 1]) {
      throw new Error(
        `${label}: thresholds are not monotonic (${JSON.stringify(report.thresholds)}) — a stage cannot be reached at a lower budget than the stage above it. This is the carried-threshold defect.`
      );
    }
  }

  return report;
}

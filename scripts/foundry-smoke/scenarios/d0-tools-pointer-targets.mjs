/** The Tool Studio pointer hit-test and layout sweep, with the breakage-authority, persisted-state, clipboard and pagination helpers it drives. */

import { railSelector } from '../../lib/managerRailEntries.js';
import {
  chooseSelectOption,
  openChecksActivity,
  openManagerRecipeEditor,
} from '../pageOps/managerViews.mjs';
import {
  assertNoScreenshotOverlays,
  assertPointerTarget,
  setManagerWindowSize,
} from '../pageOps/pageLifecycle.mjs';
import {
  assertDisabledToolOnBreakFieldset,
  assertSavedToolStudioCapture,
  assertToolStudioEditorLayout,
  assertToolStudioLibraryLayout,
  captureToolStudioProduct,
  clickToolTabAndAssertEffect,
  requireSingleLocator,
  resetToolStudioScroll,
  saveToolStudioDraftIfDirty,
  scrollToolEditorPanelToReveal,
  toggleToolControlAndRestore,
  withSingleToolDraftTransition,
  withSingleToolStoreMutation,
} from '../pageOps/toolStudio.mjs';

async function waitForToolBreakageAuthority(page, systemId) {
  try {
    await page.waitForFunction(
      (systemId) => {
        const persistedAuthority = game.fabricate.getCraftingSystemManager().getSystem(systemId)
          ?.toolBreakage?.authority;
        let projectedAuthority = null;
        const unsubscribe =
          globalThis.__fabricateSmokeManagerApp?._adminStore?.viewState?.subscribe?.((state) => {
            projectedAuthority = state?.selectedSystem?.toolBreakage?.authority ?? null;
          });
        if (typeof unsubscribe === 'function') unsubscribe();
        // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
        globalThis.__fabricateToolAuthorityObservation = { persistedAuthority, projectedAuthority };
        return persistedAuthority === 'checkDriven' && projectedAuthority === 'checkDriven';
      },
      systemId,
      { timeout: 10_000, polling: 'raf' }
    );
  } catch (error) {
    const observed = await page.evaluate(
      () => globalThis.__fabricateToolAuthorityObservation ?? null
    );
    throw new Error(
      `Tool breakage authority did not settle to checkDriven: ${JSON.stringify(observed)}`,
      { cause: error }
    );
  } finally {
    await page
      .evaluate(() => {
        delete globalThis.__fabricateToolAuthorityObservation;
      })
      .catch(() => {});
  }
}

async function readPersistedToolEnabled(page, systemId, toolId) {
  return page.evaluate(
    ({ systemId, toolId }) =>
      game.fabricate
        .getCraftingSystemManager()
        .getSystem(systemId)
        ?.tools?.find((tool) => tool.id === toolId)?.enabled,
    { systemId, toolId }
  );
}

async function waitForToolEnabledState(page, systemId, toolId, expected) {
  await page.waitForFunction(
    ({ systemId, toolId, expected }) => {
      const persisted = game.fabricate
        .getCraftingSystemManager()
        .getSystem(systemId)
        ?.tools?.find((tool) => tool.id === toolId)?.enabled;
      const rendered = document.querySelector(
        `.fabricate-manager [data-manager-tool-id="${CSS.escape(toolId)}"] .manager-tools-enabled-toggle`
      );
      return persisted === expected && rendered?.getAttribute('aria-pressed') === String(expected);
    },
    { systemId, toolId, expected },
    { timeout: 10_000, polling: 'raf' }
  );
}

// Orphaned at #1442, which removed its call site; its contract is still pinned by
// tests/screenshot-capture-scoping.test.js, so it is exported rather than deleted here.
export async function withSingleToolClipboardWrite(page, expectedUuid, action) {
  await page.evaluate(() => {
    const app = globalThis.__fabricateSmokeManagerApp;
    const services = app?._services;
    if (!services?.copyToClipboard) throw new Error('Tool source copy service is unavailable');
    const notifications = globalThis.ui?.notifications;
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a page handle the walk re-assigns and deletes; defineProperty would freeze it.
    globalThis.__fabricateToolClipboardProbe = {
      calls: [],
      info: [],
      errors: [],
      services,
      notifications,
      originalCopy: services.copyToClipboard,
      originalInfo: notifications?.info,
      originalError: notifications?.error,
    };
    services.copyToClipboard = async (text) => {
      globalThis.__fabricateToolClipboardProbe.calls.push(text);
    };
    if (notifications) {
      notifications.info = (message) => {
        globalThis.__fabricateToolClipboardProbe.info.push(message);
      };
      notifications.error = (message) => {
        globalThis.__fabricateToolClipboardProbe.errors.push(message);
      };
    }
  });
  let observed;
  try {
    await action();
    await page.waitForFunction(
      () => globalThis.__fabricateToolClipboardProbe?.calls?.length === 1,
      null,
      {
        timeout: 5000,
      }
    );
    observed = await page.evaluate(() => ({
      calls: [...globalThis.__fabricateToolClipboardProbe.calls],
      info: [...globalThis.__fabricateToolClipboardProbe.info],
      errors: [...globalThis.__fabricateToolClipboardProbe.errors],
    }));
  } finally {
    await page
      .evaluate(() => {
        const probe = globalThis.__fabricateToolClipboardProbe;
        if (!probe) return;
        probe.services.copyToClipboard = probe.originalCopy;
        if (probe.notifications) {
          probe.notifications.info = probe.originalInfo;
          probe.notifications.error = probe.originalError;
        }
        delete globalThis.__fabricateToolClipboardProbe;
      })
      .catch(() => {});
  }
  if (JSON.stringify(observed?.calls) !== JSON.stringify([expectedUuid])) {
    throw new Error(
      `Tool source Copy UUID wrote the wrong value or count: ${JSON.stringify(observed)}`
    );
  }
  if (observed.info.length !== 1 || observed.errors.length > 0) {
    throw new Error(
      `Tool source Copy UUID notification was not one honest success: ${JSON.stringify(observed)}`
    );
  }
}

// The foot pager renders ONLY where there is more than one page (issue 1373).
async function assertToolLibraryPagination(
  page,
  { expectedTotal, expectedPage = 1, expectScrollable, expectFooter = true, selectedToolId }
) {
  const browser = page.locator('.fabricate-manager [data-tool-library]').first();
  const list = browser.locator('[data-tool-library-scroll]');
  const slot = browser.locator('[data-tool-browser-pagination]');
  const footer = slot.locator('.manager-pagination');
  // The selection invariant is an identity, NOT A row position.
  if (expectedPage === 1 && !selectedToolId) {
    throw new Error('Tool pagination page-1 checks need the Tool ID the walk selected');
  }
  const selectionRows = browser.locator('.manager-tools-row');
  const assertSelectionRetained = async () => {
    const selectedToolIds = await selectionRows.evaluateAll((rows) =>
      rows
        .filter((candidate) => candidate.classList.contains('is-selected'))
        .map((candidate) => candidate.dataset.managerToolId)
    );
    if (JSON.stringify(selectedToolIds) !== JSON.stringify([selectedToolId])) {
      throw new Error(
        `Tool library did not preserve its selection of ${selectedToolId}: ${JSON.stringify(selectedToolIds)}`
      );
    }
  };
  await list.waitFor({ state: 'visible', timeout: 5000 });
  if (!expectFooter) {
    // The SLOT must still be in the DOM, so that a bar which vanished because the whole browser
    // failed to render cannot be mistaken for the single-page case this asserts.
    if ((await slot.count()) !== 1) {
      throw new Error('Tool pagination slot is missing, so its emptiness proves nothing');
    }
    const drawn = await footer.count();
    if (drawn !== 0) {
      throw new Error(`Tool pagination drew a foot bar on a single page of ${expectedTotal}`);
    }
    if (expectScrollable !== undefined) {
      const scrollable = await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight
      );
      if (scrollable !== expectScrollable) {
        throw new Error(`Tool list scrollability was ${scrollable}; expected ${expectScrollable}`);
      }
    }
    if (expectedPage === 1) await assertSelectionRetained();
    return null;
  }
  await footer.waitFor({ state: 'visible', timeout: 5000 });
  const state = await browser.evaluate((element) => {
    const scroll = element.querySelector('[data-tool-library-scroll]');
    const pagination = element.querySelector('[data-tool-browser-pagination]');
    const summary = pagination?.querySelector('[data-pagination-summary]');
    const nav = pagination?.querySelector('.manager-pagination-nav');
    // Still resolves after issue 1504 converted this control, and deliberately unchanged: the
    // page-size hook rides across onto the `<Select>` trigger through `triggerData`, so this reads
    // a `<button role="combobox">` where it used to read a `<select>`.
    const size = pagination?.querySelector('[data-pagination-size]');
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value
        ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom }
        : null;
    };
    return {
      browser: rect(element),
      scroll: rect(scroll),
      footer: rect(pagination),
      scrollable: scroll ? scroll.scrollHeight > scroll.clientHeight : false,
      ordered: Boolean(
        summary &&
        nav &&
        size &&
        summary.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING &&
        nav.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
    };
  });
  if (
    !state.browser ||
    !state.scroll ||
    !state.footer ||
    Math.abs(state.footer.left - state.browser.left) > 2 ||
    Math.abs(state.footer.right - state.browser.right) > 2 ||
    Math.abs(state.footer.bottom - state.browser.bottom) > 2 ||
    state.scroll.bottom > state.footer.top + 2
  ) {
    throw new Error(
      `Tool pagination is not a full-width bottom-pinned footer: ${JSON.stringify(state)}`
    );
  }
  if (!state.ordered)
    throw new Error('Tool pagination does not match Recipe Studio control ordering');
  if (expectedPage === 1) await assertSelectionRetained();
  if (expectScrollable !== undefined && state.scrollable !== expectScrollable) {
    throw new Error(
      `Tool list scrollability was ${state.scrollable}; expected ${expectScrollable}`
    );
  }
  const summary = await footer.locator('[data-pagination-summary]').textContent();
  const pageText = await footer.locator('[data-pagination-page]').textContent();
  if (!summary?.includes(`of ${expectedTotal}`) || !pageText?.includes(`Page ${expectedPage} of`)) {
    throw new Error(`Tool pagination rendered the wrong dataset/page: ${summary}; ${pageText}`);
  }
  const before = await footer.boundingBox();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const after = await footer.boundingBox();
  if (
    !before ||
    !after ||
    Math.abs(before.y - after.y) > 1 ||
    Math.abs(before.height - after.height) > 1
  ) {
    throw new Error(
      `Tool footer moved when only the result list scrolled: ${JSON.stringify({ before, after })}`
    );
  }
  return after;
}

async function replaceToolStudioTools(page, systemId, tools) {
  await page.evaluate(
    async ({ systemId, tools }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      await csm.updateSystem(systemId, { tools });
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    },
    { systemId, tools }
  );
}

export async function exerciseToolStudioPointerTargets(ctx, { systemId, recipeName, fixture }) {
  const { page, screenshot } = ctx;
  // Request the prototype's outer geometry inside its exact source viewport: ApplicationV2 adds its
  // own frame and V13 clamps it, so capture the settled inner product rectangle rather than
  // fabricating room outside the source. This path is shared by local and CI screenshot profiles.
  let wideGeometry = await setManagerWindowSize(page, {
    width: 1214,
    height: 724,
    sourceViewport: { width: 1280, height: 720 },
  });
  await page.locator(railSelector('manager-nav-tool-rules')).click();
  await page
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const liveManagerApp = await requireSingleLocator(
    page.locator('#fabricate-crafting-system-manager'),
    'live Crafting System Manager app'
  );
  const manager = await requireSingleLocator(
    liveManagerApp.locator('.fabricate-manager'),
    'live Fabricate manager'
  );
  const row = await requireSingleLocator(
    manager.locator(`[data-manager-tool-id="${fixture.toolId}"]`),
    'Tool Studio fixture row'
  );
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  const visibleToolRows = manager.locator('.manager-tools-row');
  const visibleToolRowCount = await visibleToolRows.count();
  if (visibleToolRowCount !== 8) {
    throw new Error(
      `Tool Studio parity library must render exactly 8 rows; found ${visibleToolRowCount}`
    );
  }
  // Name-ascending, not authored order.
  const expectedToolNames = [
    "Alchemist's Supplies",
    'Arcane Forge',
    'Ley-Line Nexus',
    "Master's Anvil",
    'Moonwell',
    "Smith's Hammer",
    'Volcanic Vent',
    'Woodcarving Tools',
  ];
  const readToolNames = () =>
    visibleToolRows.locator('.manager-tools-select-target strong').allTextContents();
  const visibleToolNames = await readToolNames();
  if (JSON.stringify(visibleToolNames) !== JSON.stringify(expectedToolNames)) {
    throw new Error(
      `Tool Studio parity library order drifted: ${JSON.stringify(visibleToolNames)}`
    );
  }
  // Auto-selection is A first-render fact, so it is read here, before this walk touches the library
  // at all.
  if (
    !(await visibleToolRows
      .first()
      .evaluate((element) => element.classList.contains('is-selected')))
  ) {
    throw new Error(
      `Tool Studio parity library did not automatically select its first row (${expectedToolNames[0]})`
    );
  }
  // Drive the direction toggle, so the constant above is a gate on a working sort rather than a
  // record of whatever order the library happened to come back in.
  const sortDirectionToggle = await requireSingleLocator(
    manager.locator('[data-tool-sort-direction]'),
    'Tool Studio sort direction toggle'
  );
  await sortDirectionToggle.click();
  const descendingState = await sortDirectionToggle.getAttribute('data-tool-sort-direction');
  if (descendingState !== 'desc') {
    throw new Error(`Tool Studio sort toggle did not report descending; read "${descendingState}"`);
  }
  const descendingToolNames = await readToolNames();
  if (JSON.stringify(descendingToolNames) !== JSON.stringify(expectedToolNames.toReversed())) {
    throw new Error(
      `Tool Studio descending sort is not the reverse of ascending: ${JSON.stringify(descendingToolNames)}`
    );
  }
  await sortDirectionToggle.click();
  const restoredState = await sortDirectionToggle.getAttribute('data-tool-sort-direction');
  if (restoredState !== 'asc') {
    throw new Error(`Tool Studio sort toggle did not report ascending; read "${restoredState}"`);
  }
  const restoredToolNames = await readToolNames();
  if (JSON.stringify(restoredToolNames) !== JSON.stringify(expectedToolNames)) {
    throw new Error(
      `Tool Studio sort did not restore ascending order: ${JSON.stringify(restoredToolNames)}`
    );
  }
  const selectTarget = row.locator('.manager-tools-select-target');
  const enabledToggle = row.locator('.manager-tools-enabled-toggle');
  // The row's edit control is selected by its data hook, NOT by A class.
  const editButton = row.locator('[data-tool-edit-rules]');
  await assertPointerTarget(
    page,
    selectTarget,
    '.manager-tools-select-target',
    'Tool row selection'
  );
  await assertPointerTarget(
    page,
    enabledToggle,
    '.manager-tools-enabled-toggle',
    'Tool enabled toggle'
  );
  await assertPointerTarget(page, editButton, '[data-tool-edit-rules]', 'Tool Edit');
  // Row two is ONLY how A second tool is picked, NOT how it is addressed.
  const otherToolId = await visibleToolRows.nth(1).getAttribute('data-manager-tool-id');
  if (!otherToolId) throw new Error('Tool Studio alternate row has no Tool ID');
  const otherRow = manager.locator(`[data-manager-tool-id="${otherToolId}"]`);
  const otherSelectTarget = otherRow.locator('.manager-tools-select-target');
  await withSingleToolDraftTransition(
    page,
    otherToolId,
    'Tool alternate-row selection',
    () => otherSelectTarget.click(),
    async () => {
      if (!(await otherRow.evaluate((element) => element.classList.contains('is-selected')))) {
        throw new Error('Tool alternate-row selection did not expose selected state');
      }
    }
  );
  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'Tool parity-row selection',
    () => selectTarget.click(),
    async () => {
      if (!(await row.evaluate((element) => element.classList.contains('is-selected')))) {
        throw new Error('Tool row selection did not expose selected state');
      }
    }
  );
  // One selected row, AND it is the one the walk just clicked.
  const selectedAfterParityClick = await visibleToolRows.evaluateAll((rows) =>
    rows
      .filter((candidate) => candidate.classList.contains('is-selected'))
      .map((candidate) => candidate.dataset.managerToolId)
  );
  if (JSON.stringify(selectedAfterParityClick) !== JSON.stringify([fixture.toolId])) {
    throw new Error(
      `Tool Studio parity row selection did not select exactly the intended Tool: ${JSON.stringify(selectedAfterParityClick)}`
    );
  }
  const inspectorDescription = await manager
    .locator('[data-tool-inspector-description]')
    .textContent();
  if (!inspectorDescription?.includes('well-balanced forge hammer')) {
    throw new Error(
      `Tool Studio parity inspector has the wrong source description: ${inspectorDescription}`
    );
  }
  const parityTools = await page.evaluate(
    (systemId) =>
      foundry.utils.deepClone(
        game.fabricate.getCraftingSystemManager().getSystem(systemId)?.tools || []
      ),
    systemId
  );
  const paginationComponentId = parityTools.find((tool) => tool.componentId)?.componentId;
  if (!paginationComponentId)
    throw new Error('Tool Studio pagination fixture has no managed Component identity');
  await assertToolLibraryPagination(page, {
    expectedTotal: 8,
    expectedPage: 1,
    expectFooter: false,
    selectedToolId: fixture.toolId,
  });
  await setManagerWindowSize(page, {
    width: 1214,
    height: 524,
    sourceViewport: { width: 1280, height: 520 },
  });
  await assertToolLibraryPagination(page, {
    expectedTotal: 8,
    expectedPage: 1,
    expectScrollable: true,
    expectFooter: false,
    selectedToolId: fixture.toolId,
  });
  await setManagerWindowSize(page, {
    width: 1214,
    height: 724,
    sourceViewport: { width: 1280, height: 720 },
  });
  await page.evaluate(
    async ({ systemId, tool }) => {
      await game.fabricate.getCraftingSystemManager().upsertTool(systemId, tool);
      await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
    },
    {
      systemId,
      tool: {
        id: 'smoke-tool-studio-pagination-ninth',
        enabled: true,
        label: 'Zephyr Kiln',
        componentId: paginationComponentId,
        breakage: { mode: 'limitedUses', maxUses: 12 },
        checkBreakable: true,
        onBreak: { mode: 'destroy' },
        prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
        bonus: { enabled: false, expression: '' },
        repairRequirements: [],
      },
    }
  );
  // `8 shown`, NOT `9 shown` (issue 1373).
  await manager
    .locator('[data-tool-result-count]')
    .filter({ hasText: '8 shown' })
    .waitFor({ state: 'visible', timeout: 5000 });
  await assertToolLibraryPagination(page, {
    expectedTotal: 9,
    expectedPage: 1,
    selectedToolId: fixture.toolId,
  });
  await setManagerWindowSize(page, {
    width: 1214,
    height: 524,
    sourceViewport: { width: 1280, height: 520 },
  });
  const firstPageFooter = await assertToolLibraryPagination(page, {
    expectedTotal: 9,
    expectedPage: 1,
    expectScrollable: true,
    selectedToolId: fixture.toolId,
  });
  await manager.locator('[data-tool-browser-pagination] [data-pagination-next]').click();
  const secondPageFooter = await assertToolLibraryPagination(page, {
    expectedTotal: 9,
    expectedPage: 2,
  });
  if (
    Math.abs(firstPageFooter.y - secondPageFooter.y) > 1 ||
    Math.abs(firstPageFooter.width - secondPageFooter.width) > 1 ||
    Math.abs(firstPageFooter.height - secondPageFooter.height) > 1
  ) {
    throw new Error(
      `Tool footer moved when the page changed: ${JSON.stringify({
        firstPageFooter,
        secondPageFooter,
      })}`
    );
  }
  await replaceToolStudioTools(page, systemId, parityTools);
  await setManagerWindowSize(page, {
    width: 1214,
    height: 724,
    sourceViewport: { width: 1280, height: 720 },
  });
  await row.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(
    (toolId) =>
      document
        .querySelector(`[data-manager-tool-id="${CSS.escape(toolId)}"]`)
        ?.classList.contains('is-selected'),
    fixture.toolId,
    { timeout: 5000 }
  );
  const persistedEnabledBefore = await readPersistedToolEnabled(page, systemId, fixture.toolId);
  if ((await enabledToggle.getAttribute('aria-pressed')) !== String(persistedEnabledBefore)) {
    throw new Error('Tool enabled toggle did not initially match persisted state');
  }
  await withSingleToolStoreMutation(
    page,
    'toggleToolEnabled',
    'Tool enabled toggle apply',
    () => enabledToggle.click(),
    () => waitForToolEnabledState(page, systemId, fixture.toolId, !persistedEnabledBefore)
  );
  await withSingleToolStoreMutation(
    page,
    'toggleToolEnabled',
    'Tool enabled toggle restore',
    () => enabledToggle.click(),
    () => waitForToolEnabledState(page, systemId, fixture.toolId, persistedEnabledBefore)
  );
  if (
    (await liveManagerApp.locator('.fabricate-manager[data-manager-view="tool-edit"]').count()) > 0
  ) {
    throw new Error('Tool toggle incorrectly opened the editor');
  }
  await resetToolStudioScroll(page);
  await assertToolStudioLibraryLayout(page);
  await assertNoScreenshotOverlays(page);
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-01-library-1280x720', wideGeometry);
  try {
    await replaceToolStudioTools(page, systemId, []);
    await manager.locator('[data-tool-library-empty]').waitFor({ state: 'visible', timeout: 5000 });
    const emptyInspector = manager.locator('[data-tool-browser-inspector-empty]');
    await emptyInspector.waitFor({ state: 'visible', timeout: 5000 });
    if ((await manager.locator('.manager-tools-row').count()) !== 0) {
      throw new Error('Tool Studio empty-library capture still rendered Tool rows');
    }
    const [emptyInspectorBounds, emptyInspectorContentBounds] = await Promise.all([
      emptyInspector.boundingBox(),
      emptyInspector.locator(':scope > div').boundingBox(),
    ]);
    const inspectorCenterY = emptyInspectorBounds
      ? emptyInspectorBounds.y + emptyInspectorBounds.height / 2
      : NaN;
    const contentCenterY = emptyInspectorContentBounds
      ? emptyInspectorContentBounds.y + emptyInspectorContentBounds.height / 2
      : NaN;
    if (
      !Number.isFinite(inspectorCenterY) ||
      !Number.isFinite(contentCenterY) ||
      Math.abs(inspectorCenterY - contentCenterY) > 2
    ) {
      throw new Error(
        `Tool Studio empty inspector is not vertically centered: ${JSON.stringify({
          emptyInspectorBounds,
          emptyInspectorContentBounds,
        })}`
      );
    }
    await resetToolStudioScroll(page);
    await captureToolStudioProduct(
      ctx,
      'manager-tool-zero-state-empty-library-1280x720',
      wideGeometry
    );
  } finally {
    await replaceToolStudioTools(page, systemId, parityTools);
    await row.waitFor({ state: 'visible', timeout: 5000 });
  }

  await setManagerWindowSize(page, {
    width: 614,
    height: 704,
    sourceViewport: { width: 680, height: 700 },
  });
  await resetToolStudioScroll(page);
  await withSingleToolDraftTransition(
    page,
    otherToolId,
    'Tool 680px alternate-row selection',
    () => otherSelectTarget.click(),
    async () => {
      if (!(await otherRow.evaluate((element) => element.classList.contains('is-selected')))) {
        throw new Error('Tool 680px alternate-row selection did not expose selected state');
      }
    }
  );
  await assertPointerTarget(
    page,
    selectTarget,
    '.manager-tools-select-target',
    'Tool row selection at 680px'
  );
  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'Tool row selection at 680px',
    () => selectTarget.click(),
    async () => {
      if (!(await row.evaluate((element) => element.classList.contains('is-selected')))) {
        throw new Error('Tool row selection at 680px did not expose selected state');
      }
    }
  );
  const selectedToolIds = await visibleToolRows.evaluateAll((rows) =>
    rows
      .filter((candidate) => candidate.classList.contains('is-selected'))
      .map((candidate) => candidate.dataset.managerToolId)
  );
  if (JSON.stringify(selectedToolIds) !== JSON.stringify([fixture.toolId])) {
    throw new Error(
      `Tool row selection at 680px did not select exactly the intended Tool: ${JSON.stringify(selectedToolIds)}`
    );
  }
  const persistedEnabledBefore680 = await readPersistedToolEnabled(page, systemId, fixture.toolId);
  await assertPointerTarget(
    page,
    enabledToggle,
    '.manager-tools-enabled-toggle',
    'Tool enabled toggle at 680px'
  );
  await withSingleToolStoreMutation(
    page,
    'toggleToolEnabled',
    'Tool enabled toggle at 680px apply',
    () => enabledToggle.click(),
    () => waitForToolEnabledState(page, systemId, fixture.toolId, !persistedEnabledBefore680)
  );
  await withSingleToolStoreMutation(
    page,
    'toggleToolEnabled',
    'Tool enabled toggle at 680px restore',
    () => enabledToggle.click(),
    () => waitForToolEnabledState(page, systemId, fixture.toolId, persistedEnabledBefore680)
  );
  await assertPointerTarget(page, editButton, '[data-tool-edit-rules]', 'Tool Edit at 680px');
  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'Tool Edit route at 680px',
    () => editButton.click(),
    () =>
      liveManagerApp
        .locator('.fabricate-manager[data-manager-view="tool-edit"] [data-tool-editor-header] h2')
        .filter({ hasText: "Smith's Hammer" })
        .waitFor({ state: 'visible', timeout: 5000 })
  );
  await liveManagerApp.locator('[data-tool-editor-back]').click();
  await liveManagerApp
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .waitFor({ state: 'visible', timeout: 5000 });
  await setManagerWindowSize(page, {
    width: 1214,
    height: 724,
    sourceViewport: { width: 1280, height: 720 },
  });

  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'Tool Edit route at 1280px',
    () => editButton.click(),
    () =>
      liveManagerApp
        .locator('.fabricate-manager[data-manager-view="tool-edit"]')
        .waitFor({ state: 'visible', timeout: 5000 })
  );
  const editorManager = liveManagerApp.locator('.fabricate-manager[data-manager-view="tool-edit"]');
  await editorManager.waitFor({ state: 'visible', timeout: 5000 });
  // The route transition asks ApplicationV2 to adopt the editor's default size;
  // re-apply the requested window through the live instance and retain V13's
  // truthful viewport-clamped product geometry.
  wideGeometry = await setManagerWindowSize(page, {
    width: 1214,
    height: 724,
    sourceViewport: { width: 1280, height: 720 },
  });
  await requireSingleLocator(editorManager, 'current Tool Studio editor manager');
  const editor = await requireSingleLocator(
    editorManager.locator('[data-tool-edit-view]'),
    'current Tool Studio editor'
  );
  // An Item drop target, its copy-uuid action and the sidebar drag that exercised them are gone
  // from this walk because they are gone from this screen: a crafting system may not re-point which
  // world Item a Tool is.
  await resetToolStudioScroll(page);
  await assertToolStudioEditorLayout(page);
  await assertNoScreenshotOverlays(page);
  await assertSavedToolStudioCapture(editor, 'Tool rules editor opening');
  const enabledInSystem = editor.locator('[data-tool-enabled] .manager-status-toggle');
  await assertPointerTarget(page, enabledInSystem, '[data-tool-enabled]', 'Enabled in system');
  // The per-system display label is a `ToolInheritCard` like every other overridable fact on this
  // tab (issue 1373): blank is the inheriting state, which renders the world name read-only on a
  // globe row and no field at all, and the switch is what opens this system's own copy.
  const labelCard = editor.locator('[data-tool-rule-card="label"]');
  await labelCard.waitFor({ state: 'visible', timeout: 5000 });
  if ((await labelCard.getAttribute('data-tool-rule-state')) === 'inheriting') {
    const labelInheritToggle = editor.locator('[data-scoped-inherit-toggle="label"]');
    await assertPointerTarget(
      page,
      labelInheritToggle,
      '[data-scoped-inherit-toggle="label"]',
      'Tool display-label override switch'
    );
    await labelInheritToggle.click();
  }
  const displayLabel = editor.locator('[data-tool-label]');
  await displayLabel.waitFor({ state: 'visible', timeout: 5000 });
  await displayLabel.fill("Masterwork Smith's Hammer with an Exceptionally Long Display Name");
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-stress-long-name', wideGeometry);
  await displayLabel.fill("Smith's Hammer");
  await saveToolStudioDraftIfDirty(editor);

  // Both are new controls on this tab and both are pointer-tested rather than pressed, and the
  // reason is different for each.
  const breakageCard = editor.locator('[data-tool-rule-card="breakage"][data-tool-rule-state]');
  if ((await breakageCard.count()) !== 1) {
    throw new Error('the Tool breakage section must state exactly one inheritance state');
  }
  const breakageRuleState = await breakageCard.getAttribute('data-tool-rule-state');
  const breakageInheritToggle = editor.locator('[data-scoped-inherit-toggle="breakage"]');
  if (breakageRuleState === 'local') {
    if ((await breakageInheritToggle.count()) !== 0) {
      throw new Error(
        'a Tool with no world record drew an inherit switch with nothing to inherit from'
      );
    }
  } else {
    await breakageInheritToggle.waitFor({ state: 'visible', timeout: 5000 });
    await assertPointerTarget(
      page,
      breakageInheritToggle,
      '[data-scoped-inherit-toggle="breakage"]',
      'Tool breakage inherit switch'
    );
  }
  // Gated on the same fact as the switch above, and for the same reason.
  const removeCallout = editor.locator('[data-tool-remove-from-system]');
  if (breakageRuleState === 'local') {
    if ((await removeCallout.count()) !== 0) {
      throw new Error('a Tool with no membership record offered to remove one');
    }
  } else {
    await scrollToolEditorPanelToReveal(
      page,
      editor,
      '[data-tool-remove-from-system]',
      'Remove from system'
    );
    await assertPointerTarget(
      page,
      removeCallout.locator('button'),
      '[data-tool-remove-from-system] button',
      'Tool remove from system'
    );
  }
  await assertNoScreenshotOverlays(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-02-remove-1280x720', wideGeometry);
  await resetToolStudioScroll(page);

  const tab = (name) => editor.locator(`#tool-tab-${name}`);
  for (const name of ['breakage', 'requirements', 'validation']) {
    await assertPointerTarget(page, tab(name), `#tool-tab-${name}`, `Tool ${name} tab`);
  }
  await clickToolTabAndAssertEffect(
    page,
    editor,
    'requirements',
    'Tool Requirements tab at 1280px'
  );
  await clickToolTabAndAssertEffect(page, editor, 'breakage', 'Tool Breakage tab at 1280px');
  await assertSavedToolStudioCapture(editor, 'Breakage parity');
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-03-breakage-1280x720', wideGeometry);
  const flagBrokenChoice = editor.locator('input[name="tool-on-break"][value="flagBroken"]');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool flag-broken action',
    () => flagBrokenChoice.check(),
    async () => {
      if (!(await flagBrokenChoice.isChecked()))
        throw new Error('Tool flag-broken action did not apply');
    }
  );
  const repairGroups = editor.locator('[data-tool-repair-requirements] [data-recipe-group]');
  const initialRepairGroupCount = await repairGroups.count();
  const addRepairGroup = editor.locator(
    '[data-tool-repair-requirements] [data-recipe-add="tag-requirement"]'
  );
  await assertPointerTarget(
    page,
    addRepairGroup,
    '[data-recipe-add="tag-requirement"]',
    'Tool repair AND control'
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool repair AND add',
    () => addRepairGroup.click(),
    async () => {
      if ((await repairGroups.count()) !== initialRepairGroupCount + 1) {
        throw new Error('Tool repair AND control did not add exactly one group');
      }
    }
  );
  const addedRepairGroupRemove = repairGroups.last().locator('[data-recipe-remove="alternative"]');
  await assertPointerTarget(
    page,
    addedRepairGroupRemove,
    '[data-recipe-remove="alternative"]',
    'Tool repair AND restore'
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool repair AND restore',
    () => addedRepairGroupRemove.click(),
    async () => {
      if ((await repairGroups.count()) !== initialRepairGroupCount) {
        throw new Error('Tool repair AND restore did not remove exactly one group');
      }
    }
  );
  const firstRepairGroup = repairGroups.first();
  const initialRepairOptionCount = await firstRepairGroup.locator('[data-recipe-option]').count();
  const addRepairAlternative = firstRepairGroup.locator(
    '[data-recipe-add="alternative-component"]'
  );
  await assertPointerTarget(
    page,
    addRepairAlternative,
    '[data-recipe-add="alternative-component"]',
    'Tool repair OR add-component control'
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool repair OR add',
    () => addRepairAlternative.click(),
    async () => {
      if (
        (await firstRepairGroup.locator('[data-recipe-option]').count()) !==
        initialRepairOptionCount + 1
      ) {
        throw new Error('Tool repair OR control did not add exactly one alternative');
      }
    }
  );
  const addedRepairAlternativeRemove = firstRepairGroup
    .locator('[data-recipe-option]')
    .last()
    .locator('[data-recipe-remove="alternative"]');
  await assertPointerTarget(
    page,
    addedRepairAlternativeRemove,
    '[data-recipe-remove="alternative"]',
    'Tool repair OR restore'
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool repair OR restore',
    () => addedRepairAlternativeRemove.click(),
    async () => {
      if (
        (await firstRepairGroup.locator('[data-recipe-option]').count()) !==
        initialRepairOptionCount
      ) {
        throw new Error('Tool repair OR restore did not remove exactly one alternative');
      }
    }
  );
  await assertNoScreenshotOverlays(page);
  await scrollToolEditorPanelToReveal(
    page,
    editor,
    '[data-tool-repair-requirements] [data-recipe-group] [data-recipe-add="alternative-component"]',
    'Populated repair'
  );
  await captureToolStudioProduct(ctx, 'manager-tool-stress-repair', wideGeometry);

  const replaceWithChoice = editor.locator('input[name="tool-on-break"][value="replaceWith"]');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool replace-with action',
    () => replaceWithChoice.check(),
    async () => {
      if (!(await replaceWithChoice.isChecked()))
        throw new Error('Tool replace-with action did not apply');
    }
  );
  const replacementGrid = editor.locator('[data-tool-replacement-target]');
  await replacementGrid.waitFor({ state: 'visible', timeout: 5000 });
  const componentTarget = replacementGrid.locator('.manager-tool-replacement-component-trigger');
  await assertPointerTarget(
    page,
    componentTarget,
    '.manager-tool-replacement-component-trigger',
    'Component replacement picker'
  );
  await componentTarget.click();
  const componentOption = page.locator('.manager-travel-popover .manager-travel-option').first();
  await componentOption.waitFor({ state: 'visible', timeout: 5000 });
  const componentLabel = (await componentOption.textContent())?.trim();
  if (!componentLabel)
    throw new Error('Tool Studio Component picker has no managed Component options');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Component replacement selection',
    () => componentOption.click(),
    async () => {
      if (!((await componentTarget.textContent()) || '').includes(componentLabel)) {
        throw new Error('Component replacement selection did not update the draft control');
      }
    }
  );
  await assertNoScreenshotOverlays(page);
  await scrollToolEditorPanelToReveal(
    page,
    editor,
    '[data-tool-replacement-target]',
    'Component replacement'
  );
  await captureToolStudioProduct(ctx, 'manager-tool-stress-replacement', wideGeometry);
  await editor.locator('[data-tool-editor-save]').click();
  await editor
    .locator('[data-tool-editor-dirty]')
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {});
  await editor.locator('[data-tool-editor-back]').click();
  await liveManagerApp
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .waitFor({ state: 'visible', timeout: 5000 });

  const checkDriven = await requireSingleLocator(
    manager.locator('[data-manager-tools-authority] label:has(input[value="checkDriven"])'),
    'check-driven authority control'
  );
  await assertPointerTarget(
    page,
    checkDriven,
    '[data-manager-tools-authority] label',
    'check-driven authority'
  );
  await withSingleToolStoreMutation(
    page,
    'setToolBreakageAuthority',
    'check-driven authority',
    () => checkDriven.click(),
    () => waitForToolBreakageAuthority(page, systemId)
  );
  await requireSingleLocator(manager, 'live Fabricate manager before check-driven Edit');
  const checkDrivenEditButton = await requireSingleLocator(
    manager.locator(`[data-tool-edit-rules="${fixture.toolId}"]`),
    'check-driven Tool Edit button'
  );
  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'check-driven Tool Edit route',
    () => checkDrivenEditButton.click(),
    () => editorManager.waitFor({ state: 'visible', timeout: 5000 })
  );
  await requireSingleLocator(editorManager, 'current check-driven Tool Studio editor manager');
  await requireSingleLocator(editor, 'current check-driven Tool Studio editor');
  // A round trip, because the editor now opens on Breakage.
  await clickToolTabAndAssertEffect(
    page,
    editor,
    'requirements',
    'check-driven Tool Requirements tab'
  );
  await clickToolTabAndAssertEffect(page, editor, 'breakage', 'check-driven Tool Breakage tab');
  const immuneChoice = editor.locator('input[name="tool-check-breakable"][value="immune"]');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'check-driven Immune choice',
    () => immuneChoice.check(),
    async () => {
      if (!(await immuneChoice.isChecked()))
        throw new Error('check-driven Immune choice did not apply');
    }
  );
  const immuneOnBreakFieldset = editor.locator(
    '[data-tool-breakage-tab]:has(input[name="tool-check-breakable"][value="immune"]:checked) [data-tool-on-break-controls]:disabled'
  );
  await immuneOnBreakFieldset.waitFor({ state: 'visible', timeout: 10_000 });
  await requireSingleLocator(immuneOnBreakFieldset, 'check-driven immune on-break fieldset');
  await assertDisabledToolOnBreakFieldset(immuneOnBreakFieldset);
  await assertNoScreenshotOverlays(page);
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-stress-immune', wideGeometry);
  await editor.locator('[data-tool-editor-save]').click();
  await editor.locator('[data-tool-editor-back]').click();
  await liveManagerApp
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .waitFor({ state: 'visible', timeout: 5000 });
  const toolSpecific = manager.locator(
    '[data-manager-tools-authority] label:has(input[value="toolSpecific"])'
  );
  await withSingleToolStoreMutation(
    page,
    'setToolBreakageAuthority',
    'tool-specific authority restore',
    () => toolSpecific.click(),
    () =>
      page.waitForFunction(
        (id) =>
          game.fabricate.getCraftingSystemManager().getSystem(id)?.toolBreakage?.authority ===
          'toolSpecific',
        systemId,
        { timeout: 10_000, polling: 'raf' }
      )
  );
  await withSingleToolDraftTransition(
    page,
    fixture.toolId,
    'tool-specific Tool Edit route',
    () => manager.locator(`[data-tool-edit-rules="${fixture.toolId}"]`).click(),
    () => editorManager.waitFor({ state: 'visible', timeout: 5000 })
  );
  // Same round trip as the check-driven path above: this one also re-enters the editor, which
  // now opens on Breakage, so clicking Breakage would be a click onto the tab it is already on.
  await clickToolTabAndAssertEffect(
    page,
    editor,
    'requirements',
    'tool-specific Tool Requirements tab'
  );
  await clickToolTabAndAssertEffect(page, editor, 'breakage', 'tool-specific Tool Breakage tab');
  const destroyChoice = editor.locator('input[name="tool-on-break"][value="destroy"]');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool destroy action restore',
    () => destroyChoice.check(),
    async () => {
      if (!(await destroyChoice.isChecked()))
        throw new Error('Tool destroy action did not restore');
    }
  );
  await saveToolStudioDraftIfDirty(editor);

  await tab('requirements').click();
  await editor.locator('[data-tool-requirements-tab]').waitFor({ state: 'visible', timeout: 5000 });
  if ((await editor.locator('[data-tool-prerequisite-row]').count()) !== 5) {
    throw new Error('Tool Studio parity Requirements must render exactly 5 prerequisite rows');
  }
  const expectedPrerequisiteNames = [
    'Expert Crafter',
    "Proficient with Smith's Tools",
    'Attuned to the Weave',
    'Strength 13 or higher',
    'Trained in Arcana',
  ];
  // The row's name cell.
  const visiblePrerequisiteNames = await editor
    .locator('[data-tool-prerequisite-row] .manager-modifier-readonly-label')
    .allTextContents();
  if (JSON.stringify(visiblePrerequisiteNames) !== JSON.stringify(expectedPrerequisiteNames)) {
    throw new Error(
      `Tool Studio parity prerequisite order drifted: ${JSON.stringify(visiblePrerequisiteNames)}`
    );
  }
  await assertPointerTarget(
    page,
    editor.locator('[data-tool-prerequisites-enabled]'),
    '[data-tool-prerequisites-enabled]',
    'Tool prerequisite toggle'
  );
  await assertPointerTarget(
    page,
    editor.locator('[data-tool-bonus-enabled]'),
    '[data-tool-bonus-enabled]',
    'Tool bonus toggle'
  );
  await assertNoScreenshotOverlays(page);
  await assertSavedToolStudioCapture(editor, 'Requirements parity');
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-04-requirements-1280x720', wideGeometry);

  await tab('validation').click();
  await editor.locator('[data-tool-validation-tab]').waitFor({ state: 'visible', timeout: 5000 });
  await editor.locator('[data-editor-validation-summary="pass"]').waitFor({
    state: 'visible',
    timeout: 5000,
  });
  if ((await editor.locator('[data-tool-validation-check].is-invalid').count()) !== 0) {
    throw new Error('Tool Studio parity Validation must be the all-pass state');
  }
  await assertSavedToolStudioCapture(editor, 'Validation parity');
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-05-validation-1280x720', wideGeometry);
  await tab('requirements').click();
  const selectedPrerequisite = editor
    .locator('[data-tool-prerequisite-row] input[type="checkbox"]:checked')
    .first();
  const selectedPrerequisiteId = await selectedPrerequisite.getAttribute('value');
  if (!selectedPrerequisiteId)
    throw new Error('Tool Studio invalid-state fixture has no selected prerequisite');
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool invalid prerequisite fixture',
    () => selectedPrerequisite.click(),
    async () => {
      if (
        (await editor
          .locator('[data-tool-prerequisite-row] input[type="checkbox"]:checked')
          .count()) !== 0
      ) {
        throw new Error(
          'Tool invalid prerequisite fixture did not clear the selected prerequisite'
        );
      }
    }
  );
  await tab('validation').click();
  await editor.locator('[data-editor-validation-summary="block"]').waitFor({
    state: 'visible',
    timeout: 5000,
  });
  await editor.locator('[data-tool-validation-check="prerequisites"].is-invalid').waitFor({
    state: 'visible',
    timeout: 5000,
  });
  await assertNoScreenshotOverlays(page);
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-stress-invalid-validation', wideGeometry);
  await tab('requirements').click();
  const prerequisiteToRestore = editor.locator(
    `[data-tool-prerequisite-row] input[type="checkbox"][value="${selectedPrerequisiteId}"]`
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    'Tool prerequisite fixture restore',
    () => prerequisiteToRestore.click(),
    async () => {
      if (!(await prerequisiteToRestore.isChecked())) {
        throw new Error('Tool prerequisite fixture did not restore its selected prerequisite');
      }
    }
  );
  await saveToolStudioDraftIfDirty(editor);
  await tab('breakage').click();
  await editor.locator('[data-tool-breakage-tab]').waitFor({ state: 'visible', timeout: 5000 });
  const narrowGeometry = await setManagerWindowSize(page, {
    width: 834,
    height: 704,
    sourceViewport: { width: 900, height: 700 },
  });
  await editor.locator('[data-tool-editor-header]').waitFor({ state: 'visible', timeout: 5000 });
  await resetToolStudioScroll(page);
  await assertToolStudioEditorLayout(page, { stacked: false });
  await assertNoScreenshotOverlays(page);
  await assertSavedToolStudioCapture(editor, '832px Breakage parity');
  await resetToolStudioScroll(page);
  await captureToolStudioProduct(ctx, 'manager-tool-parity-06-breakage-900x700', narrowGeometry);
  await clickToolTabAndAssertEffect(page, editor, 'requirements', 'Tool Requirements tab at 900px');
  await toggleToolControlAndRestore(
    page,
    editor.locator('[data-tool-bonus-enabled]'),
    'Tool bonus control at 900px'
  );
  await saveToolStudioDraftIfDirty(editor);
  await assertPointerTarget(
    page,
    editor.locator('[data-tool-editor-back]'),
    '[data-tool-editor-back]',
    'Tool Back at 900px'
  );
  await editor.locator('[data-tool-editor-back]').click();
  await liveManagerApp
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .waitFor({ state: 'visible', timeout: 5000 });
  await manager.locator(`[data-tool-edit-rules="${fixture.toolId}"]`).click();
  await editorManager.waitFor({ state: 'visible', timeout: 5000 });
  await clickToolTabAndAssertEffect(
    page,
    editor,
    'requirements',
    'Tool Requirements restore at 900px'
  );

  await setManagerWindowSize(page, {
    width: 614,
    height: 704,
    sourceViewport: { width: 680, height: 700 },
  });
  await resetToolStudioScroll(page);
  await assertToolStudioEditorLayout(page, { stacked: true });
  await clickToolTabAndAssertEffect(page, editor, 'breakage', 'Tool Breakage tab at 680px');
  await clickToolTabAndAssertEffect(page, editor, 'requirements', 'Tool Requirements tab at 680px');
  await toggleToolControlAndRestore(
    page,
    editor.locator('[data-tool-bonus-enabled]'),
    'Tool bonus control at 680px'
  );
  await saveToolStudioDraftIfDirty(editor);
  await clickToolTabAndAssertEffect(
    page,
    editor,
    'breakage',
    'Tool Breakage capture restore at 680px'
  );
  await resetToolStudioScroll(page);
  await screenshot(page, 'manager-tool-stress-wrapping-680', {
    clip: { x: 0, y: 0, width: 680, height: 700 },
  });
  await assertPointerTarget(
    page,
    editor.locator('[data-tool-editor-back]'),
    '[data-tool-editor-back]',
    'Tool Back at 680px'
  );
  await editor.locator('[data-tool-editor-back]').click();
  await liveManagerApp
    .locator('.fabricate-manager[data-manager-view="tools"]')
    .waitFor({ state: 'visible', timeout: 5000 });
  await openManagerRecipeEditor(page, recipeName);
  await page.locator('[data-recipe-tab-button="tools"]').first().click();
  const recipeToolRow = page.locator(`[data-recipe-tool-id="${fixture.toolId}"]`).first();
  await recipeToolRow.waitFor({ state: 'visible', timeout: 5000 });
  if ((await recipeToolRow.locator('select, [data-recipe-tool-bonus-mode]').count()) > 0) {
    throw new Error(
      'Recipe Tools tab must not expose Tool breakage or check-bonus policy controls'
    );
  }
  await assertPointerTarget(
    page,
    recipeToolRow.locator('[data-recipe-remove="tool"]'),
    '[data-recipe-remove="tool"]',
    'recipe Tool remove control'
  );

  if (
    (await page
      .locator(
        '.fabricate-manager[data-manager-view="recipe-edit"] .manager-chip:has-text("Unsaved")'
      )
      .count()) > 0
  ) {
    throw new Error('Recipe Tools policy-removal check unexpectedly dirtied the Recipe draft');
  }

  // The trigger editor is the crafting route's triggers section (issue 1096). The tier-step target
  // is addressed by the OUTCOME ID the Outcomes section renders, so that id is read first: the
  // control is the shared `<Select>` since issue 1510 and its rows exist only while it is open.
  await openChecksActivity(page, 'crafting', 'outcomes');
  const firstOutcomeRow = page.locator('.fabricate-manager [data-outcome-row]').first();
  try {
    // Playwright's own timeout names a selector, not the domain fact, and it fires FIRST, so the
    // id guard below would never be the failure a reader sees.
    await firstOutcomeRow.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error('Crafting check rendered no outcome tier to step to');
  }
  const targetTierId = await firstOutcomeRow.getAttribute('data-outcome-row');
  if (!targetTierId) throw new Error('Crafting check rendered no named outcome tier to step to');
  await openChecksActivity(page, 'crafting', 'triggers');
  // Tier stepping is a per-trigger effect (issue 975), not the check-wide natural-stepping toggle
  // this walk used to round-trip, so exercising it means authoring a trigger.
  const checksSave = page.locator('.fabricate-manager [data-checks-save]').first();
  const triggerCard = page.locator('.fabricate-manager [data-check-triggers]').first();
  await triggerCard.waitFor({ state: 'visible', timeout: 5000 });
  if ((await triggerCard.locator('[data-trigger]').count()) !== 0) {
    throw new Error(
      'Crafting check triggers must start empty for the tier-step walk to restore them'
    );
  }
  await triggerCard.locator('[data-add-trigger]').click();
  const tierStepRow = triggerCard.locator('[data-trigger] [data-trigger-tier-step]').first();
  await tierStepRow.waitFor({ state: 'visible', timeout: 5000 });
  // The mode control's radios are visually hidden by design, so the LABEL segment is what
  // a GM points at and therefore what the hit test must reach.
  const stepUpSegment = tierStepRow.locator('[data-trigger-tier-step-mode="up"]');
  await assertPointerTarget(
    page,
    stepUpSegment,
    '[data-trigger-tier-step]',
    'routed tier-step mode'
  );
  await stepUpSegment.click();
  const stepCount = tierStepRow.locator('[data-trigger-tier-step-steps]');
  await stepCount.waitFor({ state: 'visible', timeout: 5000 });
  await stepCount.fill('2');
  if ((await stepCount.inputValue()) !== '2')
    throw new Error('Tier-step count did not accept a step magnitude');
  await tierStepRow.locator('[data-trigger-tier-step-mode="target"]').click();
  const stepTarget = tierStepRow.locator('[data-trigger-tier-step-target]');
  await stepTarget.waitFor({ state: 'visible', timeout: 5000 });
  // The operand slot SWAPS its contents rather than growing a second control, so the step
  // count must be gone the moment the tier select is up.
  if ((await tierStepRow.locator('[data-trigger-tier-step-steps]').count()) !== 0) {
    throw new Error('Tier-step operand slot kept the step count after switching to target');
  }
  // Addressed BY VALUE rather than positionally: `placeholder=` is the trigger's own text now
  // rather than a leading row, so no index counts from it and the outcome id is what identifies
  // the row a GM would click.
  await chooseSelectOption(page, stepTarget, { value: targetTierId });
  if ((await stepTarget.getAttribute('aria-expanded')) !== 'false') {
    throw new Error('Tier-step target list stayed open after a row was chosen');
  }
  // The read-back is non-empty WHILE THE PLACEHOLDER IS SHOWING, so the placeholder class is what
  // proves the clicked row matched a value and wrote it: without this a click that matched nothing,
  // and therefore fired no `onChange`, read back as a pass.
  const chosenTierValue = stepTarget.locator('.fabricate-select-value');
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- a Playwright Locator: innerText() is rendered text, which textContent() does not preserve.
  const chosenTierLabel = (await chosenTierValue.innerText()).trim();
  if (!chosenTierLabel) throw new Error('Tier-step target control persisted no tier');
  if (
    ((await chosenTierValue.getAttribute('class')) ?? '').includes(
      'fabricate-select-value-placeholder'
    )
  ) {
    throw new Error(
      `Tier-step target still shows its placeholder ("${chosenTierLabel}") after a tier was chosen`
    );
  }
  if (!(await checksSave.isEnabled())) {
    throw new Error('Authoring a tier-step trigger left the Checks draft undirtied');
  }
  await triggerCard.locator('[data-trigger] [data-remove-trigger]').first().click();
  await triggerCard.locator('[data-triggers-empty]').waitFor({ state: 'visible', timeout: 5000 });
  if (await checksSave.isEnabled())
    throw new Error('Tier-step trigger round trip left the Checks draft dirty');
  await page.evaluate(async (id) => {
    await game.settings.set('fabricate', 'lastManagedCraftingSystem', id);
  }, systemId);
}

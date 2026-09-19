/**
 * Tool Studio page primitives: the single-mutation probes, the tab and control assertions, the
 * horizontal-scroll guards and the geometry reads its captures are measured against.
 */

import { assertPointerTarget } from './pageLifecycle.mjs';

/** Open a requirement-rail slot's chooser only if it is not already open (issue 917). */
export async function ensureSlotOpen(slotLocator) {
  await slotLocator.waitFor({ state: 'visible', timeout: 8_000 });
  if (await slotLocator.getAttribute('aria-expanded') === 'true') return;
  await slotLocator.click({ timeout: 5_000 });
}

export function assertSingleToolMutation(report, expectedMethod, label) {
  const matchingCalls = report?.calls?.filter((call) => call.method === expectedMethod) ?? [];
  const unexpectedCalls = report?.calls?.filter((call) => call.method !== expectedMethod) ?? [];
  if (matchingCalls.length !== 1 || unexpectedCalls.length > 0) {
    throw new Error(
      `${label} must dispatch exactly one ${expectedMethod} mutation: ${JSON.stringify(report)}`
    );
  }
}

export async function beginToolStoreMutationProbe(page, methodNames) {
  await page.evaluate((names) => {
    const store = globalThis.__fabricateSmokeManagerApp?._adminStore;
    if (!store) throw new Error('Tool mutation probe could not resolve the live manager store');
    if (globalThis.__fabricateToolMutationProbe) {
      throw new Error('Tool mutation probe was already active');
    }
    const calls = [];
    const restorations = [];
    const systemManager = game?.fabricate?.getCraftingSystemManager?.();
    for (const method of names) {
      const persistentBoundary = {
        toggleToolEnabled: 'upsertTool',
        setToolBreakageAuthority: 'updateSystem',
      }[method];
      if (persistentBoundary) {
        const original = systemManager?.[persistentBoundary];
        if (typeof original !== 'function') {
          throw new Error(`Tool mutation probe could not wrap systemManager.${persistentBoundary}`);
        }
        systemManager[persistentBoundary] = function (...args) {
          calls.push({
            method,
            args: args.map((value) => {
              try {
                return JSON.parse(JSON.stringify(value));
              } catch {
                return String(value);
              }
            }),
          });
          return original.apply(this, args);
        };
        restorations.push(() => {
          systemManager[persistentBoundary] = original;
        });
        continue;
      }
      if (!store.viewState?.subscribe) {
        throw new Error(`Tool mutation probe could not observe store.${method}`);
      }
      let initial = true;
      const unsubscribe = store.viewState.subscribe((state) => {
        if (initial) {
          initial = false;
          return;
        }
        calls.push({
          method,
          args: [{
            toolId: String(state?.toolDraft?.id || ''),
            dirty: state?.toolDraftDirty === true,
          }],
        });
      });
      restorations.push(unsubscribe);
    }
    globalThis.__fabricateToolMutationProbe = { calls, restorations };
  }, methodNames);
}

export async function finishToolStoreMutationProbe(page) {
  return page.evaluate(() => {
    const probe = globalThis.__fabricateToolMutationProbe;
    if (!probe) return { calls: [], missing: true };
    for (const restore of probe.restorations) restore();
    delete globalThis.__fabricateToolMutationProbe;
    return { calls: probe.calls };
  });
}

export async function withSingleToolStoreMutation(page, method, label, action, assertEffect) {
  await beginToolStoreMutationProbe(page, [method]);
  let report;
  try {
    await action();
    await assertEffect();
  } finally {
    report = await finishToolStoreMutationProbe(page);
  }
  assertSingleToolMutation(report, method, label);
}

export async function withSingleToolDraftTransition(page, expectedToolId, label, action, assertEffect) {
  await page.evaluate(() => {
    const store = globalThis.__fabricateSmokeManagerApp?._adminStore;
    if (!store?.viewState?.subscribe) {
      throw new Error('Tool draft transition probe could not resolve the live manager view state');
    }
    if (globalThis.__fabricateToolDraftTransitionProbe) {
      throw new Error('Tool draft transition probe was already active');
    }
    const transitions = [];
    let initial = true;
    const unsubscribe = store.viewState.subscribe((state) => {
      if (initial) {
        initial = false;
        return;
      }
      transitions.push({
        toolId: String(state?.toolDraft?.id || ''),
        dirty: state?.toolDraftDirty === true,
      });
    });
    globalThis.__fabricateToolDraftTransitionProbe = { transitions, unsubscribe };
  });
  let report;
  try {
    await action();
    await assertEffect();
  } finally {
    report = await page.evaluate(() => {
      const probe = globalThis.__fabricateToolDraftTransitionProbe;
      if (!probe) return { transitions: [], missing: true };
      probe.unsubscribe();
      delete globalThis.__fabricateToolDraftTransitionProbe;
      return { transitions: probe.transitions };
    });
  }
  const distinctTransitions = report.transitions.filter((transition, index, transitions) => (
    index === 0
    || transition.toolId !== transitions[index - 1].toolId
    || transition.dirty !== transitions[index - 1].dirty
  ));
  const matching = distinctTransitions.filter(({ toolId }) => toolId === String(expectedToolId));
  if (distinctTransitions.length !== 1 || matching.length !== 1) {
    throw new Error(
      `${label} must publish exactly one distinct Tool draft transition for ${expectedToolId}: ${JSON.stringify({
        ...report,
        distinctTransitions,
      })}`
    );
  }
}

export async function clickToolTabAndAssertEffect(page, editor, name, label) {
  const target = editor.locator(`#tool-tab-${name}`);
  await assertPointerTarget(page, target, `#tool-tab-${name}`, label);
  if (await target.getAttribute('aria-selected') !== 'false') {
    throw new Error(`${label} must begin on a different Tool tab`);
  }
  await target.evaluate((element) => {
    const transitions = [];
    const observer = new MutationObserver(() => {
      transitions.push(element.getAttribute('aria-selected'));
    });
    observer.observe(element, { attributes: true, attributeFilter: ['aria-selected'] });
    element.__fabricateToolTabProbe = { observer, transitions };
  });
  await target.click();
  await editor.locator(`[data-tool-editor-panel="${name}"]`).waitFor({ state: 'visible', timeout: 5_000 });
  const effect = await target.evaluate((element) => {
    const probe = element.__fabricateToolTabProbe;
    probe?.observer?.disconnect();
    delete element.__fabricateToolTabProbe;
    const tablist = element.closest('[role="tablist"]');
    return {
      selected: tablist?.querySelectorAll('[role="tab"][aria-selected="true"]').length ?? 0,
      expectedSelected: element.getAttribute('aria-selected'),
      selectedTransitions: probe?.transitions?.filter((value) => value === 'true').length ?? 0,
      transitions: probe?.transitions ?? [],
    };
  });
  if (
    effect.selected !== 1
    || effect.expectedSelected !== 'true'
    || effect.selectedTransitions !== 1
  ) {
    throw new Error(`${label} did not transition exactly once to ${name}: ${JSON.stringify(effect)}`);
  }
}

export async function toggleToolControlAndRestore(page, locator, label) {
  await assertPointerTarget(page, locator, 'input', label);
  const before = await locator.isChecked();
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    `${label} apply`,
    () => locator.click(),
    async () => {
      if (await locator.isChecked() === before) {
        throw new Error(`${label} did not apply its observable toggle effect`);
      }
    },
  );
  await withSingleToolStoreMutation(
    page,
    'patchToolDraft',
    `${label} restore`,
    () => locator.click(),
    async () => {
      if (await locator.isChecked() !== before) {
        throw new Error(`${label} did not restore its original persisted state`);
      }
    },
  );
}

export async function selectOptionAndAssertSingleChange(
  locator,
  value,
  label,
  { expectRetainedValue = true } = {},
) {
  await locator.evaluate((element) => {
    element.__fabricateSelectChangeCount = 0;
    element.__fabricateSelectChangeListener = () => {
      element.__fabricateSelectChangeCount += 1;
    };
    element.addEventListener('change', element.__fabricateSelectChangeListener);
  });
  await locator.selectOption(value);
  const effect = await locator.evaluate((element) => {
    element.removeEventListener('change', element.__fabricateSelectChangeListener);
    const report = {
      changes: element.__fabricateSelectChangeCount,
      value: element.value,
    };
    delete element.__fabricateSelectChangeCount;
    delete element.__fabricateSelectChangeListener;
    return report;
  });
  if (effect.changes !== 1 || (expectRetainedValue && effect.value !== value)) {
    throw new Error(`${label} did not dispatch exactly one select mutation: ${JSON.stringify(effect)}`);
  }
}

export async function saveToolStudioDraftIfDirty(editor) {
  if (await editor.locator('[data-tool-editor-dirty]').count() === 0) return;
  await editor.locator('[data-tool-editor-save]').click();
  await editor.locator('[data-tool-editor-dirty]').waitFor({
    state: 'detached',
    timeout: 10_000,
  });
}

export async function assertSavedToolStudioCapture(editor, label) {
  if (await editor.locator('[data-tool-editor-dirty]').count() > 0) {
    throw new Error(`${label} must capture a saved Tool draft`);
  }
  const save = editor.locator('[data-tool-editor-save]');
  if (await save.count() !== 1 || !await save.isDisabled()) {
    throw new Error(`${label} must expose the recipe-parity clean state with Save tool disabled`);
  }
}

export async function requireSingleLocator(locator, label) {
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`${label} expected exactly one match, found ${count}`);
  }
  return locator;
}

export async function assertDisabledToolOnBreakFieldset(fieldset) {
  const fieldsetState = await fieldset.evaluate((element) => ({
    disabled: element.disabled === true,
    matchesDisabled: element.matches(':disabled'),
  }));
  if (!fieldsetState.disabled || !fieldsetState.matchesDisabled) {
    throw new Error(`Check-driven immune fieldset did not expose native disabled state: ${JSON.stringify(fieldsetState)}`);
  }
  const controls = fieldset.locator('button, input, select, textarea');
  const controlCount = await controls.count();
  if (controlCount === 0) {
    throw new Error('Check-driven immune fieldset exposed no actionable controls');
  }
  for (let index = 0; index < controlCount; index += 1) {
    if (!(await controls.nth(index).isDisabled())) {
      throw new Error(`Check-driven immune on-break control ${index + 1} remained interactive`);
    }
  }
}

export function assertToolStudioHorizontalScrollSettled(positions, label) {
  const unsettled = (positions || []).filter(({ scrollLeft }) => scrollLeft !== 0);
  if (unsettled.length > 0) {
    throw new Error(`${label} leaked horizontal scroll: ${JSON.stringify(unsettled)}`);
  }
}

export async function readToolStudioHorizontalScroll(page, { reset = false } = {}) {
  return page.evaluate((shouldReset) => {
    const manager = document.querySelector('#fabricate-crafting-system-manager .fabricate-manager');
    if (!manager) return [];
    const explicitSelectors = [
      'html',
      'body',
      '#fabricate-crafting-system-manager',
      '.fabricate-manager',
      '.fabricate-manager .manager-body',
      '.fabricate-manager .manager-main',
      '.fabricate-manager [data-tool-edit-view]',
      '.fabricate-manager .manager-tool-editor-tabs',
      '.fabricate-manager [data-tool-editor-panel]',
      '.fabricate-manager [data-tool-behavior-preview]',
      '.fabricate-manager .manager-inspector',
      '.fabricate-manager .manager-tool-repair',
      '.fabricate-manager [data-tool-repair-requirements] [data-recipe-group]',
    ];
    const elements = new Set([document.scrollingElement]);
    for (const selector of explicitSelectors) {
      for (const element of document.querySelectorAll(selector)) elements.add(element);
    }
    for (const element of manager.querySelectorAll('*')) {
      if (element.scrollWidth > element.clientWidth + 1) elements.add(element);
    }
    const positions = [];
    let index = 0;
    for (const element of elements) {
      if (!element) continue;
      if (shouldReset) element.scrollLeft = 0;
      positions.push({
        index,
        tag: element.tagName,
        id: element.id || '',
        className: String(element.className || ''),
        scrollLeft: element.scrollLeft,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      });
      index += 1;
    }
    return positions;
  }, reset);
}

export async function assertToolStudioHorizontalScroll(page, label) {
  const positions = await readToolStudioHorizontalScroll(page);
  assertToolStudioHorizontalScrollSettled(positions, label);
}

export async function resetToolStudioHorizontalScroll(page, label = 'Tool Studio') {
  await readToolStudioHorizontalScroll(page, { reset: true });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await assertToolStudioHorizontalScroll(page, `${label} horizontal reset`);
}

export async function resetToolStudioScroll(page) {
  const selectors = [
    '.fabricate-manager .manager-body',
    '.fabricate-manager .manager-main',
    '.fabricate-manager [data-tool-editor-panel]',
    '.fabricate-manager [data-tool-behavior-preview]',
    '.fabricate-manager .manager-inspector',
  ];
  await page.evaluate((targets) => {
    for (const selector of targets) {
      for (const element of document.querySelectorAll(selector)) element.scrollTop = 0;
    }
  }, selectors);
  await resetToolStudioHorizontalScroll(page);
  const scroll = await page.evaluate((targets) => targets.flatMap((selector) => (
    Array.from(document.querySelectorAll(selector), (element, index) => ({
      selector,
      index,
      scrollTop: element.scrollTop,
    }))
  )), selectors);
  const unsettled = scroll.filter(({ scrollTop }) => scrollTop !== 0);
  if (unsettled.length > 0) {
    throw new Error(`Tool Studio vertical scroll reset failed: ${JSON.stringify(unsettled)}`);
  }
}

export async function scrollToolEditorPanelToReveal(page, editor, selector, label) {
  const panel = editor.locator('[data-tool-editor-panel]');
  const target = editor.locator(selector);
  const fixedBefore = await editor.evaluate(() => {
    const read = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
    };
    return {
      header: read('[data-tool-editor-header]'),
      tabs: read('.manager-tool-editor-tabs'),
      preview: read('[data-tool-behavior-preview]'),
    };
  });
  await target.evaluate((element) => element.scrollIntoView({
    block: 'center',
    inline: 'nearest',
  }));
  await resetToolStudioHorizontalScroll(page, label);
  const report = await panel.evaluate((element, targetSelector) => {
    const targetElement = element.querySelector(targetSelector);
    if (!targetElement) return null;
    const panelRect = element.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    return {
      scrollTop: element.scrollTop,
      targetVisible: targetRect.top >= panelRect.top && targetRect.bottom <= panelRect.bottom,
      targetContained: targetRect.left >= panelRect.left - 1 && targetRect.right <= panelRect.right + 1,
    };
  }, selector);
  if (!report || report.scrollTop <= 0 || !report.targetVisible || !report.targetContained) {
    throw new Error(`${label} stress control was not visibly scrolled into the editor pane: ${JSON.stringify(report)}`);
  }
  const fixedAfter = await editor.evaluate(() => {
    const read = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
    };
    return {
      header: read('[data-tool-editor-header]'),
      tabs: read('.manager-tool-editor-tabs'),
      preview: read('[data-tool-behavior-preview]'),
    };
  });
  for (const key of ['header', 'tabs', 'preview']) {
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      if (Math.abs((fixedBefore[key]?.[edge] ?? 0) - (fixedAfter[key]?.[edge] ?? 0)) > 1) {
        throw new Error(
          `${label} moved fixed ${key} context while revealing stress content: `
          + `${JSON.stringify({ fixedBefore, fixedAfter })}`
        );
      }
    }
  }
  for (const [identitySelector, identityLabel] of [
    ['[data-tool-editor-header]', 'header'],
    ['.manager-tool-editor-tabs', 'tabs'],
    ['[data-tool-behavior-preview]', 'preview'],
  ]) {
    if (!(await editor.locator(identitySelector).isVisible())) {
      throw new Error(`${label} lost ${identityLabel} identity context`);
    }
  }
}

export async function captureToolStudioProduct(ctx, label, expectedGeometry) {
  const { page, screenshot } = ctx;
  const manager = await requireSingleLocator(
    page.locator('#fabricate-crafting-system-manager .fabricate-manager'),
    `${label} live Tool Studio manager`
  );
  const box = await manager.boundingBox();
  if (!box) throw new Error(`${label} Tool Studio product rectangle is not measurable`);
  const measured = { width: Math.round(box.width), height: Math.round(box.height) };
  const expected = expectedGeometry?.product;
  if (!expected || measured.width !== expected.width || measured.height !== expected.height) {
    throw new Error(
      `${label} Tool Studio product rectangle drifted: ${JSON.stringify({ measured, expectedGeometry })}`
    );
  }
  await assertToolStudioHorizontalScroll(page, `${label} before capture`);
  await screenshot(page, label, {
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  await assertToolStudioHorizontalScroll(page, `${label} after capture`);
}

export async function readToolStudioLayout(page) {
  return page.evaluate(() => {
    const readRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const readType = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: style.lineHeight,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    };
    const readOverflow = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    };
    const readHorizontalOverflow = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        overflowX: style.overflowX,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
      };
    };
    return {
      manager: readRect('.fabricate-manager'),
      body: readRect('.fabricate-manager .manager-body'),
      main: readRect('[data-tool-edit-view]')?.width > 0
        ? readRect('.fabricate-manager .manager-main')
        : readRect('.fabricate-manager .manager-body'),
      inspector: readRect('.fabricate-manager .manager-inspector'),
      libraryRow: readRect('.fabricate-manager [data-manager-tool-id]'),
      editorHeader: readRect('[data-tool-editor-header]'),
      editorActions: readRect('.manager-tool-edit-actions'),
      tabs: readRect('.manager-tool-editor-tabs'),
      tabButtons: Array.from(
        document.querySelectorAll('.manager-tool-editor-tabs > [role="tab"]'),
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.id,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        },
      ),
      tabsOverflow: readHorizontalOverflow('.manager-tool-editor-tabs'),
      composition: readRect('.manager-tool-edit-composition')?.width > 0
        ? readRect('.manager-tool-edit-composition')
        : readRect('.fabricate-manager .manager-body'),
      editorPanel: readRect('[data-tool-editor-panel]'),
      firstSection: readRect('[data-tool-editor-panel] > *'),
      preview: readRect('[data-tool-behavior-preview]'),
      previewIdentity: readRect('[data-tool-preview-identity]'),
      libraryNameType: readType('.manager-tools-library-copy > strong'),
      inspectorNameType: readType('.manager-tool-inspector-hero h2'),
      editorNameType: readType('.manager-tool-edit-identity h2'),
      previewNameType: readType('.manager-tool-preview-identity h3'),
      bodyOverflow: readOverflow('.fabricate-manager .manager-body'),
      mainOverflow: readOverflow('.fabricate-manager .manager-main'),
      panelOverflow: readOverflow('[data-tool-editor-panel]'),
      previewOverflow: readOverflow('[data-tool-behavior-preview]'),
      headerCount: document.querySelectorAll('[data-tool-editor-header]').length,
      genericTitleCount: document.querySelectorAll('.manager-heading > .manager-title, .manager-heading > .manager-subtitle').length,
    };
  });
}

export function assertHorizontalContainment(parent, child, label) {
  if (!parent || !child || child.left < parent.left - 1 || child.right > parent.right + 1) {
    throw new Error(`${label} escapes horizontal containment: ${JSON.stringify({ parent, child })}`);
  }
}

// Three, not four.
export function assertToolStudioTabContainment(report) {
  if (!report?.manager || !report?.tabs || report?.tabButtons?.length !== 3) {
    throw new Error(`Tool editor must render three measurable tabs: ${JSON.stringify(report)}`);
  }
  const overflow = report.tabsOverflow;
  if (
    !overflow
    || overflow.scrollLeft !== 0
    || overflow.scrollWidth > overflow.clientWidth + 1
  ) {
    throw new Error(`Tool editor tabs remain horizontally scrollable: ${JSON.stringify(overflow)}`);
  }
  for (const tab of report.tabButtons) {
    assertHorizontalContainment(report.tabs, tab, `${tab.id} within visible tab list`);
    assertHorizontalContainment(report.manager, tab, `${tab.id} within Tool Studio product root`);
  }
}

export function assertToolStudioTypography(report, pairs) {
  for (const [key, maximum, label] of pairs) {
    const type = report[key];
    if (!type || !Number.isFinite(type.fontSize) || type.fontSize > maximum) {
      throw new Error(`${label} typography is not compact: ${JSON.stringify(type)}`);
    }
    if (type.whiteSpace !== 'nowrap' || !['hidden', 'clip'].includes(type.overflow)) {
      throw new Error(`${label} does not bound long identity copy: ${JSON.stringify(type)}`);
    }
  }
}

export async function assertToolStudioLibraryLayout(page) {
  const report = await readToolStudioLayout(page);
  assertHorizontalContainment(report.body, report.main, 'Tool library center');
  assertHorizontalContainment(report.body, report.inspector, 'Tool library inspector');
  assertHorizontalContainment(report.main, report.libraryRow, 'Tool library row');
  if (!report.inspector || report.inspector.width < 330 || report.inspector.width > 342) {
    throw new Error(`Tool library inspector is not the complete 340px rail: ${JSON.stringify(report.inspector)}`);
  }
  assertToolStudioTypography(report, [
    ['libraryNameType', 14, 'Tool library name'],
    ['inspectorNameType', 17, 'Tool inspector name'],
  ]);
}

export async function assertToolStudioEditorLayout(page, { stacked = false } = {}) {
  const report = await readToolStudioLayout(page);
  if (report.headerCount !== 1 || report.genericTitleCount !== 0) {
    throw new Error(`Tool editor identity chrome drifted: ${JSON.stringify({ headerCount: report.headerCount, genericTitleCount: report.genericTitleCount })}`);
  }
  for (const [parent, child, label] of [
    [report.main, report.editorHeader, 'Tool editor header'],
    [report.editorHeader, report.editorActions, 'Tool editor actions'],
    [report.main, report.tabs, 'Tool editor tabs'],
    [report.composition, report.editorPanel, 'Tool editor panel'],
    [report.composition, report.preview, 'Tool behavior preview'],
    [report.preview, report.previewIdentity, 'Tool preview identity'],
    [report.editorPanel, report.firstSection, 'Tool editor first section'],
  ]) {
    assertHorizontalContainment(parent, child, label);
  }
  assertToolStudioTabContainment(report);
  assertToolStudioTypography(report, [
    ['editorNameType', 20, 'Tool editor name'],
    ['previewNameType', 17, 'Tool preview name'],
  ]);
  if (!stacked) {
    if (!report.preview || report.preview.width < 338 || report.preview.width > 342) {
      throw new Error(`Tool preview is not the complete 340px rail: ${JSON.stringify(report.preview)}`);
    }
    if (report.preview.top < report.composition.top - 1 || report.preview.bottom > report.composition.bottom + 1) {
      throw new Error(`Tool preview escapes wide vertical containment: ${JSON.stringify(report.preview)}`);
    }
    return;
  }
  if (report.preview.height <= 0 || report.preview.top < report.editorPanel.top) {
    throw new Error(`Tool preview is clipped or precedes the editor in stacked reading order: ${JSON.stringify(report.preview)}`);
  }
  if (report.bodyOverflow?.overflowY !== 'auto') {
    throw new Error(`Tool stacked body does not own scrolling: ${JSON.stringify(report.bodyOverflow)}`);
  }
  for (const [key, label] of [
    ['mainOverflow', 'main'],
    ['panelOverflow', 'panel'],
    ['previewOverflow', 'preview'],
  ]) {
    if (['auto', 'scroll'].includes(report[key]?.overflowY)) {
      throw new Error(`Tool stacked ${label} unexpectedly owns nested scrolling: ${JSON.stringify(report[key])}`);
    }
  }
}

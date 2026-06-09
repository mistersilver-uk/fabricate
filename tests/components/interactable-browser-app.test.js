/**
 * Phase 7 — string-shape coverage for the GM Interactable browser app + root,
 * mirroring the `fabricate-app-shell.test.js` convention (the Svelte components
 * are not compiled in the Node test runner, so we assert their source shape).
 *
 * Covers: ApplicationV2 + SvelteApplicationMixin singleton semantics, the
 * services bag reusing the existing per-system Tool/Task library reads, the
 * click-to-place seam routing through the shared spawn pipeline, the drag-source
 * wiring, and the keyboard-actionable place button (a11y).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractableBrowserApp.svelte.js'),
  'utf8'
);
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/InteractableBrowserRoot.svelte'),
  'utf8'
);

describe('InteractableBrowserApp singleton window', () => {
  it('is an ApplicationV2 + SvelteApplicationMixin app keyed by a stable id', () => {
    assert.ok(appSource.includes('SvelteApplicationMixin('), 'uses the SvelteApplicationMixin');
    assert.ok(appSource.includes('foundry.applications.api.ApplicationV2'), 'extends ApplicationV2');
    assert.ok(appSource.includes('static SVELTE_COMPONENT = InteractableBrowserRoot'), 'mounts the browser root');
    assert.ok(appSource.includes("id: 'fabricate-interactable-browser'"), 'stable window id');
  });

  it('tracks a single shared instance and re-focuses on show()', () => {
    assert.ok(appSource.includes('static _instance = null'), 'tracks a single instance');
    assert.ok(appSource.includes('static async show()'), 'exposes a static show()');
    assert.ok(appSource.includes('existing.bringToFront()'), 're-show brings the existing window to front');
    assert.ok(appSource.includes('app.render(true)'), 'a fresh show renders the window');
  });

  it('coalesces concurrent show() calls to a single window (V13 re-entrancy guard)', () => {
    // The scene-control button fires the launch handler 2–3× per activation; a
    // second show() mid-render must NOT construct a competing instance (which
    // collided in ApplicationV2 _updatePosition → "el.parentElement is null").
    assert.ok(appSource.includes('static _renderPromise = null'), 'tracks an in-flight render promise');
    assert.ok(appSource.includes('if (existing) {'), 'show() returns early whenever ANY instance exists');
    assert.ok(appSource.includes('await InteractableBrowserApp._renderPromise'), 'an in-flight render is awaited');
    const newIdx = appSource.indexOf('new InteractableBrowserApp()');
    const guardIdx = appSource.indexOf('if (existing) {');
    assert.ok(newIdx > guardIdx, 'the only construct sits after the existing-instance guard');
  });

  it('clears the singleton on close() and the _onClose safety net', () => {
    const closeIdx = appSource.indexOf('async close(options)');
    const onCloseIdx = appSource.indexOf('_onClose(options)');
    assert.ok(closeIdx >= 0 && onCloseIdx >= 0, 'both close paths exist');
    const closeBody = appSource.slice(closeIdx, onCloseIdx);
    assert.ok(closeBody.includes('InteractableBrowserApp._instance = null;'), 'close() clears the singleton');
    const onCloseBody = appSource.slice(onCloseIdx);
    assert.ok(onCloseBody.includes('InteractableBrowserApp._instance = null;'), '_onClose clears it too');
  });

  it('self-registers via the app factory (no hard import where avoidable)', () => {
    assert.ok(appSource.includes('registerInteractableBrowserApp(InteractableBrowserApp)'), 'registers with the factory');
  });

  it('services bag reuses the existing per-system Tool/Task library reads', () => {
    assert.ok(
      appSource.includes('getCraftingSystemManager?.()?.getSystems?.()'),
      'listSystems reads the live crafting system manager'
    );
    assert.ok(
      appSource.includes('getCraftingSystemManager?.()?.getSystem?.(systemId)') && appSource.includes('system?.tools'),
      'listToolsForSystem reads the per-system Tool library'
    );
    assert.ok(
      appSource.includes('getSetting(SETTING_KEYS.GATHERING_CONFIG)') && appSource.includes("config?.systems?.[systemId]?.tasks"),
      'listTasksForSystem reads the persisted gathering config tasks'
    );
  });

  it('click-to-place routes through the shared InteractableManager spawn pipeline', () => {
    assert.ok(
      appSource.includes('InteractableManager.instance?.placeInteractableAtViewCenter?.('),
      'placeOnScene delegates to the shared spawn pipeline at the view center'
    );
  });

  it('exposes a per-system managed-component lookup (system.components) for tool name/image resolution', () => {
    assert.ok(
      appSource.includes('getComponentForSystem:'),
      'services bag exposes getComponentForSystem'
    );
    assert.ok(
      appSource.includes('Array.isArray(system?.components)'),
      'component lookup reads the same system.components source ToolsBrowserView uses'
    );
    assert.ok(
      appSource.includes('name: component.name') && appSource.includes('img: component.img'),
      'component lookup returns name + img for resolution'
    );
  });
});

describe('InteractableBrowserRoot body', () => {
  it('lists Tools and Gathering Tasks sections', () => {
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.ToolsHeading'), 'renders a Tools section');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.TasksHeading'), 'renders a Gathering Tasks section');
  });

  it('reads the libraries through the injected services bag (no duplicate data access)', () => {
    assert.ok(rootSource.includes('services?.listSystems?.()'), 'systems via services');
    assert.ok(rootSource.includes('services?.listToolsForSystem?.('), 'tools via services');
    assert.ok(rootSource.includes('services?.listTasksForSystem?.('), 'tasks via services');
  });

  it('each row is a drag source emitting the dropCanvasData-compatible payload', () => {
    assert.ok(rootSource.includes("import { dragSource }"), 'imports the net-new drag-source action');
    assert.ok(rootSource.includes('use:dragSource={{ getPayload: () => dragPayload(') , 'rows are drag sources');
    assert.ok(rootSource.includes('buildInteractableDragPayload'), 'the payload is built via the shared builder');
  });

  it('each row exposes a keyboard-actionable Place-on-scene button (a11y fallback)', () => {
    assert.ok(rootSource.includes('class="fab-ib-place"'), 'rows carry the place button');
    assert.ok(rootSource.includes('<button'), 'place affordance is a real button (keyboard-actionable)');
    assert.ok(rootSource.includes("place('tool', tool.id)"), 'tool rows place tools');
    assert.ok(rootSource.includes("place('gatheringTask', task.id)"), 'task rows place gathering tasks');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.PlaceOnScene'), 'localized place label');
  });

  it('resolves a tool row name/image from the managed component when the tool label is empty', () => {
    // Tools have no required name, so an empty `label` must fall back to the
    // managed component's name/img (mirroring ToolsBrowserView), NOT the
    // list-empty title with a single hardcoded icon for every tool.
    assert.ok(
      !rootSource.includes("FABRICATE.Admin.Manager.Tools.EmptyTitle"),
      'does not reuse the list-empty title as a row label'
    );
    assert.ok(
      !rootSource.includes('fa-mortar-pestle fab-ib-row-icon'),
      'no hardcoded mortar-pestle icon rendered identically for every tool'
    );
    assert.ok(
      rootSource.includes('services?.getComponentForSystem?.(selectedSystemId, tool.componentId)'),
      'looks up the managed component via the services bag'
    );
    assert.ok(
      rootSource.includes('const componentName = component?.name;') && rootSource.includes('return String(componentName);'),
      'tool display name falls back to the component name when label is empty'
    );
    assert.ok(
      rootSource.includes('return component?.img || DEFAULT_TOOL_IMAGE;'),
      'tool image resolves from the component img with a sensible default'
    );
    assert.ok(
      rootSource.includes('<img class="fab-ib-row-thumb" src={tool.img}'),
      'tool row renders the resolved component image'
    );
  });

  it('renders a gathering task row image for a custom image, falling back to the leaf for the default/empty placeholder', () => {
    // The tasks $derived mapping must carry `img` (it was discarded before).
    assert.ok(
      rootSource.includes('img: taskCustomImage(task?.img)'),
      'the task mapping carries a resolved custom image'
    );
    // "No image" = empty OR the DEFAULT_GATHERING_TASK_IMG placeholder → leaf.
    assert.ok(
      rootSource.includes("import { DEFAULT_GATHERING_TASK_IMG }"),
      'references the shared default-image constant rather than hardcoding the string'
    );
    assert.ok(
      rootSource.includes('trimmed === DEFAULT_GATHERING_TASK_IMG'),
      'treats the default placeholder as "no image"'
    );
    // The row renders <img> when a custom image is present, else the fa-leaf.
    assert.ok(
      rootSource.includes('{#if task.img}') && rootSource.includes('<img class="fab-ib-row-thumb" src={task.img}'),
      'task row renders <img> for a custom image'
    );
    assert.ok(
      rootSource.includes('{:else}') && rootSource.includes('class="fas fa-leaf fab-ib-row-icon"'),
      'task row falls back to the leaf icon when there is no custom image'
    );
  });

  it('surfaces a search filter and the Alt-override discoverability hint', () => {
    assert.ok(rootSource.includes('type="search"'), 'search input present');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.DropModifierHint'), 'Alt-override hint shown in the browser');
  });
});

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

/**
 * The primitives this window adopted (issue 1520), read so the clauses below can assert the
 * WHOLE chain rather than one end of it.
 *
 * A source-shape suite that only checked what this root PASSES would pass just as happily if
 * the primitive stopped honouring it, and one that only checked the primitive would say nothing
 * about this window. The icon-only and search clauses therefore read both: the props this root
 * writes, and what the primitive turns them into.
 */
const iconButtonSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/components/IconButton.svelte'),
  'utf8'
);
const searchFieldSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/components/ManagerSearchField.svelte'),
  'utf8'
);

/**
 * Every control family this root imports from the shared library.
 *
 * Each is asserted by IMPORT PATH as well as by render site: an adoption that reached for a
 * local copy, or for the manager's own directory, is not this window joining the library.
 */
const ADOPTED_PRIMITIVES = Object.freeze([
  'IconButton',
  'ManagerSearchField',
  'ManagerToolbar',
  'Select',
]);

/**
 * The `fab-ib-*` names that survive the conversion, EXACTLY.
 *
 * Every one is this window's own LAYOUT - the scroll column, the header rhythm, the list and its
 * rows - or the two-tab strip, which this phase deliberately does not convert because it is a
 * tablist KEYBOARD CONTRACT (roving tabindex, arrow/Home/End, aria-controls onto two panels)
 * rather than a radio group. No control family is on this list, and that is the assertion: a
 * hand-rolled button, field or search box re-appearing adds a name, and a name deleted without
 * its markup drops one.
 *
 * The four `fab-ib-tab-*` / `fab-ib-panel-*` entries are ID values rather than classes; they are
 * on the list because the scan reads the prefix wherever it is written, and pinning them is what
 * keeps the `aria-controls` / `aria-labelledby` pairing from being renamed on one side only.
 */
const SURVIVING_LAYOUT_CLASSES = Object.freeze([
  'fab-ib-controls',
  'fab-ib-empty',
  'fab-ib-header',
  'fab-ib-hint',
  'fab-ib-hint-modifier',
  'fab-ib-hint-region',
  'fab-ib-list',
  'fab-ib-panel-tasks',
  'fab-ib-panel-tools',
  'fab-ib-row',
  'fab-ib-row-actions',
  'fab-ib-row-icon',
  'fab-ib-row-label',
  'fab-ib-row-thumb',
  'fab-ib-section',
  'fab-ib-tab',
  'fab-ib-tab-tasks',
  'fab-ib-tab-tools',
  'fab-ib-tabs',
  'fab-ib-title',
]);

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

  it('services bag reuses the SHARED interactableSourceLibrary enumeration (no local re-walk)', () => {
    assert.ok(
      appSource.includes("from './interactableSourceLibrary.js'"),
      'imports the shared source enumeration'
    );
    assert.ok(
      appSource.includes('listSystems: () => listSystemOptions(this._sourceDeps())'),
      'listSystems delegates to the shared system enumeration'
    );
    assert.ok(
      appSource.includes('listToolsForSystem: (systemId) => listSystemTools(this._sourceDeps(), systemId)'),
      'listToolsForSystem delegates to the shared Tool enumeration'
    );
    assert.ok(
      appSource.includes('listTasksForSystem: (systemId) => listSystemTasks(this._sourceDeps(), systemId)'),
      'listTasksForSystem delegates to the shared Task enumeration'
    );
    assert.ok(
      appSource.includes('getCraftingSystemManager: () =>') && appSource.includes('getGatheringConfig: () => getSetting(SETTING_KEYS.GATHERING_CONFIG)'),
      'the shared deps bag wires the live manager + persisted gathering config'
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
      appSource.includes('getSystemComponent(this._sourceDeps(), systemId, componentId)'),
      'component lookup delegates to the shared system.components resolution'
    );
  });
});

describe('InteractableBrowserRoot body', () => {
  it('lists Tools and Gathering Tasks sections', () => {
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.ToolsHeading'), 'renders a Tools section');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.TasksHeading'), 'renders a Gathering Tasks section');
  });

  it('splits Tools and Gathering Tasks into an accessible two-tab switcher', () => {
    // A real tablist of two keyboard-operable <button> tabs, each with
    // aria-selected reflecting the active tab and a controlled tabpanel.
    assert.ok(rootSource.includes("let activeTab = $state('tools')"), 'tracks the active tab in runes state');
    assert.ok(rootSource.includes('role="tablist"'), 'renders a tablist container');
    assert.ok((rootSource.match(/role="tab"/g) || []).length === 2, 'exactly two tabs');
    assert.ok(rootSource.includes("aria-selected={activeTab === 'tools'}"), 'tools tab reflects selection');
    assert.ok(rootSource.includes("aria-selected={activeTab === 'tasks'}"), 'tasks tab reflects selection');
    assert.ok(rootSource.includes('role="tabpanel"'), 'each section is a tabpanel');
    assert.ok(rootSource.includes('onkeydown={onTabKeydown}'), 'tabs are keyboard-operable (arrow/Home/End)');
    assert.ok(rootSource.includes("{#if activeTab === 'tools'}"), 'only the active tab section renders');
  });

  it('filters BOTH tools and tasks by the shared search box', () => {
    // matchesSearch is wired into both derived lists; with tabs the search
    // applies to whichever tab is active (both kinds are filtered).
    assert.ok(
      rootSource.includes('.filter((tool) => tool.id && matchesSearch(tool.label))'),
      'tools list filters by the search term'
    );
    assert.ok(
      rootSource.includes('.filter((task) => task.id && matchesSearch(task.label))'),
      'tasks list filters by the search term'
    );
    assert.ok(
      rootSource.includes('the search box applies to both kinds'),
      'a note records that the search filters both tools and tasks'
    );
  });

  it('reads the libraries through the injected services bag (no duplicate data access)', () => {
    assert.ok(rootSource.includes('services?.listSystems?.()'), 'systems via services');
    assert.ok(rootSource.includes('services?.listToolsForSystem?.('), 'tools via services');
    assert.ok(rootSource.includes('services?.listTasksForSystem?.('), 'tasks via services');
  });

  it('disambiguates same-named systems and defaults to a source-bearing one (issue 346)', () => {
    assert.ok(
      rootSource.includes("from '../util/systemDisambiguation.js'"),
      'uses the shared system-disambiguation helper'
    );
    assert.ok(rootSource.includes('buildSystemLabelMap(systems)'), 'builds the disambiguated label map');
    assert.ok(
      rootSource.includes('systemDisplayLabel(system, systemLabels)'),
      'renders the disambiguated label in the system picker'
    );
    assert.ok(
      rootSource.includes('pickDefaultSystemId(systems, systemHasSources)'),
      'default selection prefers a source-bearing system over an empty duplicate'
    );
  });

  it('each row is a drag source emitting the dropCanvasData-compatible payload', () => {
    assert.ok(rootSource.includes("import { dragSource }"), 'imports the net-new drag-source action');
    assert.ok(rootSource.includes('use:dragSource={{ getPayload: () => dragPayload(') , 'rows are drag sources');
    assert.ok(rootSource.includes('buildInteractableDragPayload'), 'the payload is built via the shared builder');
  });

  it('each row exposes a keyboard-actionable Place-on-scene button (a11y fallback)', () => {
    // The affordance is `<IconButton>` now (issue 1520), which renders a real
    // `<button type="button">` at every one of its sites - so the keyboard clause is asserted
    // against the PRIMITIVE rather than against a `<button>` this file no longer writes.
    assert.ok(
      rootSource.includes('data-interactable-browser-place=""'),
      'rows carry the place button, hooked for the smoke and the lab'
    );
    assert.ok(
      /<button\s+bind:this=\{element\}\s+type="button"/.test(iconButtonSource),
      'the shared icon button is a real button (keyboard-actionable)'
    );
    assert.ok(rootSource.includes("place('tool', tool.id)"), 'tool rows place tools');
    assert.ok(rootSource.includes("place('gatheringTask', task.id)"), 'task rows place gathering tasks');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.PlaceOnScene'), 'localized place label');
  });

  // THE ICON-ONLY RULE, WHICH IS THE SUBSTANCE THIS CLAUSE ALWAYS CARRIED (issue 1520).
  //
  // A control whose only visible content is a glyph has NO accessible name unless one is
  // supplied, and it is IDENTICAL on screen either way - so no frame, no computed-style probe
  // and no `data-*`-keyed assertion can see the defect. That is why this clause exists and why
  // it survives the conversion in substance: what changed is that the name is a REQUIRED-SHAPED
  // PROP on `IconButton` now, gated by its own source contract, rather than a convention this
  // file had to remember.
  it('renders the place buttons icon-only with the localized title + aria-label, no visible text', () => {
    // WHOLE ELEMENTS, not opening tags. The hook is written LAST among the props but the GLYPH
    // is a CHILD, so a block cut at the hook carries the accessible name and not the face, and a
    // block cut forwards FROM the hook carries the face and not the name. Splitting on the
    // component tag and closing at `</IconButton>` is the only cut that holds both, which is
    // what lets one clause assert the icon-only rule end to end.
    const elementsFor = (hook) =>
      rootSource
        .split('<IconButton')
        .slice(1)
        .map((block) => block.slice(0, block.indexOf('</IconButton>')))
        .filter((block) => block.includes(hook));

    const placeTags = elementsFor('data-interactable-browser-place=""');
    assert.ok(placeTags.length === 2, 'exactly two place buttons (tools + tasks rows)');
    const regionTags = elementsFor('data-interactable-browser-place-region=""');
    assert.ok(regionTags.length === 2, 'exactly two region-only buttons (tools + tasks rows)');

    // EVERY KEY PATTERN IS TERMINATED BY ITS CLOSING QUOTE, and that is not tidiness: a key is a
    // PREFIX of a longer key one edit away, so an unterminated pattern matches
    // `…PlaceOnSceneSomethingElse` and reports a renamed key as an unchanged one. Proved by
    // mutation - renaming the key to `PlaceOnSceneX` left the unterminated form green.
    for (const tag of placeTags) {
      assert.ok(
        /title=\{text\(\s*'FABRICATE\.Canvas\.Browser\.PlaceOnScene',/.test(tag),
        'place button uses PlaceOnScene as the tooltip'
      );
      assert.ok(
        /ariaLabel=\{text\(\s*'FABRICATE\.Canvas\.Browser\.PlaceOnScene',/.test(tag),
        'place button uses PlaceOnScene as the accessible name'
      );
      assert.ok(tag.includes('<i class="fas fa-cubes" aria-hidden="true">'), 'face is the cubes icon');
      // The face is a GLYPH and nothing else. `IconButton` renders `children` verbatim, so a
      // stray `<span>{text(...)}</span>` beside the icon would put the label back on the face
      // while every assertion above kept passing.
      assert.ok(!tag.includes('<span'), 'no visible text rendered on the place button face');
    }
    for (const tag of regionTags) {
      assert.ok(
        /ariaLabel=\{text\(\s*'FABRICATE\.Canvas\.Browser\.PlaceRegionOnly',/.test(tag),
        'region-only button uses PlaceRegionOnly as the accessible name'
      );
      assert.ok(
        tag.includes('<i class="fas fa-draw-polygon" aria-hidden="true">'),
        'face is the draw-polygon icon'
      );
      assert.ok(!tag.includes('<span'), 'no visible text rendered on the region-only button face');
    }

    // The primitive's half: `ariaLabel` becomes the name, and an EMPTY one is dropped rather
    // than emitted blank - `aria-label=""` names the control the empty string and suppresses the
    // fallback a screen reader would otherwise derive, which is worse than passing nothing.
    // THE ATTRIBUTE NAME IS ANCHORED AT ITS OWN LINE, not matched as a substring: `aria-label` is
    // a suffix of `data-aria-label`, so `includes` reports a hook renamed onto a `data-*`
    // attribute - which names nothing - as an unchanged accessible name. Proved by mutation.
    assert.ok(
      /\n\s*aria-label=\{accessibleName\}/.test(iconButtonSource),
      'IconButton emits ariaLabel as the accessible name'
    );
    assert.ok(
      iconButtonSource.includes('const accessibleName = $derived(ariaLabel || undefined);'),
      'IconButton drops an empty accessible name rather than emitting it blank'
    );
  });

  it('each row exposes a region-only (no marker) placement affordance routing the same spawn', () => {
    assert.ok(
      rootSource.includes('data-interactable-browser-place-region=""'),
      'rows carry the region-only button'
    );
    assert.ok(rootSource.includes("place('tool', tool.id, 'none')"), 'tool rows can place region-only');
    assert.ok(rootSource.includes("place('gatheringTask', task.id, 'none')"), 'task rows can place region-only');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Browser.PlaceRegionOnly'), 'localized region-only label');
  });

  // THE WINDOW'S STYLING CONTRACT, STATED FORWARD (issue 1520).
  //
  // Every CONTROL family is a shared primitive imported from `src/ui/svelte/components/`, and
  // the `fab-ib-*` names that survive are an EXACT allow-list of this window's own layout plus
  // the one residue this phase declines to convert.
  it('renders the shared control primitives and keeps only its own layout classes', () => {
    assert.ok(
      rootSource.includes('class="fabricate-interactable-browser"'),
      'root element carries the namespaced class'
    );

    for (const primitive of ADOPTED_PRIMITIVES) {
      assert.ok(
        rootSource.includes(`import ${primitive} from '../components/${primitive}.svelte'`),
        `${primitive} is imported from src/ui/svelte/components/`
      );
      // ...and it is RENDERED, because an unused import adopts nothing.
      assert.ok(
        new RegExp(`<${primitive}[\\s/>]`).test(rootSource),
        `${primitive} is rendered by the browser`
      );
    }

    const residue = [...new Set(rootSource.match(/fab-ib-[a-z-]+/g) ?? [])].sort();
    assert.deepEqual(
      residue,
      [...SURVIVING_LAYOUT_CLASSES],
      "the surviving fab-ib-* names are exactly this window's own layout and its tablist residue"
    );
  });

  // THE TWO SCROLL CONTAINERS DECLARE THEIR KEYBOARD FOCUS (issue 1520).
  //
  // Both panels carry a STATIC `tabindex="0"`, which is what puts them - and only them - in
  // `design-system-keyboard-focus.test.js`'s `roleZero` population; the tab buttons above them
  // carry a roving `tabindex` EXPRESSION and land in the disjoint `roving` population instead.
  // Without the declaration, `KeyboardManager#hasFocus` returns false for the focused panel and
  // Foundry keeps its own bindings live over a scroll container a GM has just tabbed into: the
  // arrows pan the canvas underneath and Space pauses the game.
  it('declares keyboard focus on both tabpanel scroll containers', () => {
    const panels = rootSource.split('role="tabpanel"').slice(1);
    assert.ok(panels.length === 2, 'exactly two tabpanels');
    for (const panel of panels) {
      const tag = panel.slice(0, panel.indexOf('>'));
      assert.ok(/tabindex="0"/.test(tag), 'the panel is a static tab stop');
      assert.ok(
        /data-keyboard-focus="true"/.test(tag),
        'the panel declares its keyboard focus so Foundry suspends its own bindings'
      );
    }
  });

  it('threads visualMode through placeOnScene to the shared spawn pipeline', () => {
    assert.ok(
      appSource.includes('visualMode') && appSource.includes('placeInteractableAtViewCenter'),
      'placeOnScene forwards visualMode to the manager placement seam'
    );
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
    // Issue 1119: this surface must ROUTE THROUGH the shared `data-models` requirement-13
    // precedence rather than re-deriving it. The old inline `label → component.name`
    // ordering omitted the registration snapshot, so every item-sourced Tool (which carries
    // `componentId: null` by construction) rendered "Unnamed tool" + the item-bag sentinel.
    assert.ok(
      rootSource.includes("from '../../../models/toolDisplay.js'"),
      'resolves tool identity through the shared display-precedence module'
    );
    assert.ok(
      rootSource.includes('return resolveToolDisplayName('),
      'tool display name delegates to the shared precedence (label → snapshot → component → fallback)'
    );
    assert.ok(
      !rootSource.includes('const componentName = component?.name;'),
      'does not re-derive a component-only display name alongside the shared helper'
    );
    assert.ok(
      rootSource.includes('img: resolveToolDisplayImage(tool, component)'),
      'tool image resolves through the shared precedence (snapshot → component → sentinel)'
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
    // The bare `<input type="search">` is `ManagerSearchField` now (issue 1520), so the input
    // itself is the primitive's - which is why the SHARED field's own markup is read for it.
    // The chain matters in both directions: the caller must NAME the control, because the
    // field's `<label>` wraps a glyph and an input and no text and so contributes no accessible
    // name of its own; and the primitive must still render a search input under that name.
    assert.ok(
      rootSource.includes("ariaLabel={text('FABRICATE.Canvas.Browser.SearchLabel', 'Search')}"),
      'the caller names the search control'
    );
    // THE ELEMENT, not the string. `ManagerSearchField`'s own docblock writes `<input
    // type="search">` twice in prose - describing the CSS convention it replaced and one of the
    // hand-rolled twins it declines to convert - so a bare `includes` reads the documentation and
    // stays green after the markup has been changed to a text input. Proved by mutation.
    assert.ok(
      /<input\n\s+type="search"/.test(searchFieldSource),
      'the shared field renders a search input'
    );
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.DropModifierHint'), 'Alt-override hint shown in the browser');
  });
});

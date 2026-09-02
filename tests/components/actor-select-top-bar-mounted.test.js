/**
 * The shared player top bar, mounted (issue 1475 converted its picker onto `SearchablePopover`).
 *
 * TWO THINGS ABOUT THIS SUITE'S SETUP ARE LOAD-BEARING RATHER THAN TIDYING.
 *
 * It runs on `createMountedComponentHarness` instead of the inlined compile/mount boilerplate it
 * used to carry, because the conversion put five more components and six more modules into this
 * component's static graph. A `.svelte` missing from a hand-rolled allowlist does not fail a
 * mounted suite — it HANGS it, reported as `# cancelled N` and never as `# fail` — whereas the
 * shared harness walks the import closure in `before()` and throws by name.
 *
 * And it mounts into `fabricate-app`, not the harness default of `fabricate-manager`. The picker
 * PORTALS its panel to the nearest application root (`util/overlayHost.js`), so the root the
 * fixture wears decides where the panel actually lands; this component is reachable only from the
 * player window, and it is the first mounted suite in the corpus for which that is true.
 *
 * Every assertion that reads the OPEN panel therefore queries `document`, not `target`: the panel
 * is no longer a descendant of the bar. `.actor-bar-popover` is the hook the bar hands the
 * primitive through `popoverClass`, and is what keeps these queries pointed at THIS picker.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-actorbar-bar-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/gatheringConditionIcons.js'
  ],
  compiledModules: [
    // `SearchablePopover` and the two leaves it renders (issue 1475). The Crafting tab renders
    // `ComponentSourcesBar` in the bar's right slot, so that is in the static graph too — on
    // every tab, not just Crafting.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
    'src/ui/svelte/components/ActorSelectTopBar.svelte'
  ],
  componentPath: 'src/ui/svelte/components/ActorSelectTopBar.svelte',
  rootClass: 'fabricate-app'
});

let target;

/** The picker's trigger, which is `SearchablePopover`'s button wearing this bar's class. */
function barTrigger() {
  return target.querySelector('.actor-bar-trigger');
}

/** The PORTALED panel. Not under `target` — see this file's header. */
function panel() {
  return document.querySelector('.actor-bar-popover');
}

/** The panel's option rows, which are the primitive's. */
function panelOptions() {
  return document.querySelectorAll('.actor-bar-popover [role="option"]');
}

async function openPicker() {
  barTrigger().click();
  flushSync();
  await tick();
  flushSync();
}

// A plain (non-reactive) fake store mirroring the actorBarStore read surface.
// The component is reactive on its own $props/$derived; for these structural
// assertions a snapshot store at mount time is enough.
function fakeStore(overrides = {}) {
  const selectableActors = overrides.selectableActors ?? [];
  const selectedActorId = overrides.selectedActorId ?? '';
  const calls = { selectActor: [] };
  return {
    calls,
    store: {
      selectableActors,
      selectedActorId,
      staminaPool: overrides.staminaPool ?? null,
      conditions: overrides.conditions ?? null,
      conditionVisibility: overrides.conditionVisibility ?? { weather: true, timeOfDay: true },
      realmContext: overrides.realmContext ?? { enabled: false, realms: [] },
      loaded: overrides.loaded ?? true,
      get selectedActor() {
        return selectableActors.find((actor) => actor?.id === selectedActorId) ?? null;
      },
      selectActor: (id) => {
        calls.selectActor.push(id);
      }
    }
  };
}

async function mountBar(props) {
  target = await harness.mount(props);
}

const ACTORS = [
  { id: 'a1', uuid: 'Actor.a1', name: 'Aria the Bold', img: 'icons/a.webp' },
  { id: 'a2', uuid: 'Actor.a2', name: 'Borin', img: null }
];

describe('ActorSelectTopBar mounted behavior', () => {
  before(async () => {
    await harness.setup();
  });

  afterEach(() => {
    harness.remount();
    target = null;
  });

  after(() => {
    harness.teardown();
  });

  it('renders a contextual stamina bar on the gathering tab when a pool is set', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1', staminaPool: { current: 4, max: 10 } });
    await mountBar({ store, activeTab: 'gathering' });

    const bar = target.querySelector('[data-actor-bar-stamina]');
    assert.ok(bar, 'stamina bar renders on the gathering tab');
    assert.ok(bar.textContent.includes('4/10'), 'shows current/max');
    const fill = bar.querySelector('.actor-bar-stamina-fill');
    assert.ok(/width:\s*40%/.test(fill.getAttribute('style') || ''), 'fill width reflects 4/10');
  });

  it('hides the stamina bar when there is no pool or off the gathering tab', async () => {
    const noPool = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1', staminaPool: null });
    await mountBar({ store: noPool.store, activeTab: 'gathering' });
    assert.ok(!target.querySelector('[data-actor-bar-stamina]'), 'no bar without a pool');
    harness.remount();

    const withPool = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1', staminaPool: { current: 4, max: 10 } });
    await mountBar({ store: withPool.store, activeTab: 'crafting' });
    assert.ok(!target.querySelector('[data-actor-bar-stamina]'), 'no bar off the gathering tab');
  });

  it('renders the selected actor portrait image in the trigger', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    const button = barTrigger();
    assert.ok(button, 'trigger renders');
    assert.equal(button.disabled, false, 'trigger enabled with actors');
    // `manager-travel-portrait` is `SearchablePopover`'s tile, not this bar's — the bar hands the
    // image through `triggerImg` and keeps only its own 40px sizing rule.
    const img = button.querySelector('.manager-travel-portrait img');
    assert.ok(img, 'portrait image renders for an actor with img');
    assert.equal(img.getAttribute('src'), 'icons/a.webp');
    assert.ok(button.textContent.includes('Aria the Bold'), 'trigger shows the actor name');
  });

  it('renders a neutral fallback icon (no empty <img>) for a null-img actor', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a2' });
    await mountBar({ store, activeTab: 'crafting' });

    const button = barTrigger();
    assert.ok(!button.querySelector('.manager-travel-portrait'), 'no portrait tile for a null-img actor');
    assert.ok(button.querySelector('i.fa-user'), 'neutral fallback icon renders');
    // Hard guard: never emit an <img src="">. The primitive renders `triggerImg` unconditionally
    // once it is truthy, so passing '' rather than omitting it would reintroduce exactly that.
    const emptyImgs = Array.from(document.querySelectorAll('img')).filter((img) => !img.getAttribute('src'));
    assert.equal(emptyImgs.length, 0, 'no <img src=""> anywhere');
  });

  it('every option carries an image or a fallback glyph, never an empty <img>', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const rows = panelOptions();
    assert.equal(rows.length, 2, 'one option per actor');
    assert.ok(rows[0].querySelector('.manager-travel-portrait img'), 'the img actor gets a portrait');
    assert.ok(!rows[1].querySelector('.manager-travel-portrait'), 'the null-img actor gets no tile');
    assert.ok(rows[1].querySelector('i.fa-user'), 'the null-img actor gets the fallback glyph');
    const emptyImgs = Array.from(document.querySelectorAll('img')).filter((img) => !img.getAttribute('src'));
    assert.equal(emptyImgs.length, 0, 'no <img src=""> anywhere');
  });

  it('opens a popover with a search input over a listbox of options', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const dialog = panel();
    assert.ok(dialog, 'popover dialog opens');
    assert.equal(dialog.getAttribute('role'), 'dialog', 'the panel is a dialog');
    assert.ok(dialog.querySelector('input[type="text"]'), 'search input present');
    const listbox = dialog.querySelector('[role="listbox"]');
    assert.ok(listbox, 'listbox present');
    assert.equal(listbox.querySelectorAll('[role="option"]').length, 2, 'one option per actor');
    assert.equal(barTrigger().getAttribute('aria-expanded'), 'true', 'trigger reports expanded');
  });

  // THE PANEL IS PORTALED NOW (issue 1475), and this is the assertion that says so. The markup is
  // identical whether the portal lands or not, so a query that walked down from `document` would
  // pass either way; what changed is its PARENT. `overlay-portal-host-position.test.js` measures
  // the geometry in a real browser — happy-dom computes no layout — and this pins the structural
  // half in the suite that can see it cheaply.
  it('portals the panel onto the player window frame, out of the bar', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const dialog = panel();
    assert.ok(dialog, 'panel opens');
    // `target` IS the application root here (the harness mounts into `.fabricate-app`), so the
    // discriminating fact is that the panel left the BAR and became a child of that root.
    assert.ok(
      !target.querySelector('.fabricate-app-actor-bar').contains(dialog),
      'the panel is still inside the bar, so the portal did not land and it would be clipped and ' +
        'positioned by the bar rather than by the player window'
    );
    assert.ok(
      dialog.parentElement?.classList.contains('fabricate-app'),
      `the panel hangs off \`${dialog.parentElement?.className}\` rather than the application root`
    );
  });

  // ── THE ARIA CONTRACT, WHICH IS THE BAR THIS CONVERSION IS HELD TO ────────────────────────
  // A DOM comparison cannot stand in for these. A control that keeps its markup and loses a key
  // handler renders byte-identically, so each clause below names a behaviour rather than a node.
  it('announces the widget it opens, and its expanded state, on the trigger', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    const button = barTrigger();
    // `dialog`, not `listbox`: the panel renders a query field, so it IS a dialog containing a
    // listbox. `SearchablePopover` takes this as a prop and defaults to `dialog`, which is what
    // this bar hand-rolled before the conversion.
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog', 'the trigger says a dialog opens');
    assert.equal(button.getAttribute('aria-expanded'), 'false', 'collapsed before opening');
    assert.equal(button.getAttribute('aria-label'), 'Aria the Bold', 'the trigger is named by the selection');
    assert.equal(button.getAttribute('title'), 'Aria the Bold', 'and exposes it as a tooltip');

    await openPicker();
    assert.equal(barTrigger().getAttribute('aria-expanded'), 'true', 'expanded once open');
  });

  it('names both the dialog and the listbox inside it', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const dialog = panel();
    assert.equal(
      dialog.getAttribute('aria-label'),
      'FABRICATE.App.ActorBar.DialogLabel',
      'the dialog carries an accessible name'
    );
    assert.equal(
      dialog.querySelector('[role="listbox"]').getAttribute('aria-label'),
      'FABRICATE.App.ActorBar.DialogLabel',
      'and so does the list inside it — a caller that omits either leaves an unnamed widget'
    );
    assert.equal(
      dialog.querySelector('input[type="text"]').getAttribute('aria-label'),
      'FABRICATE.App.ActorBar.SearchLabel',
      'the query field is named separately from the list it filters'
    );
  });

  it('marks exactly the current selection with aria-selected', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a2' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const selected = Array.from(panelOptions()).map((row) => row.getAttribute('aria-selected'));
    assert.deepEqual(selected, ['false', 'true'], 'single selection, on the row that is the value');
  });

  it('moves keyboard focus into the query field when the panel opens', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();
    // The focus call is queued as a microtask by the primitive, so drain the queue before reading.
    await new Promise((done) => setTimeout(done, 0));

    assert.ok(
      document.activeElement === panel().querySelector('input[type="text"]'),
      'focus lands in the search field, so a keyboard user can type straight away; it is on ' +
        `\`${document.activeElement?.className || document.activeElement?.tagName}\``
    );
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();
    assert.ok(panel(), 'panel open before Escape');

    // Dispatched on the DOCUMENT, because that is where the dismiss action listens — a handler
    // bound to the portaled panel alone would never see a key pressed with focus elsewhere.
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(!panel(), 'Escape closes the panel');
    assert.equal(barTrigger().getAttribute('aria-expanded'), 'false', 'and the trigger reports collapsed');

    // Focus restoration waits on `tick()` inside the primitive, so let its promise settle.
    await new Promise((done) => setTimeout(done, 0));
    assert.ok(
      document.activeElement === barTrigger(),
      'focus returns to the trigger — without this a keyboard user is dropped to <body> and has to ' +
        `tab back through the whole window. It is on \`${document.activeElement?.tagName}\``
    );
  });

  it('returns focus to the trigger after choosing an actor', async () => {
    const { store, calls } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    panelOptions()[1].click();
    flushSync();
    await tick();
    flushSync();
    await new Promise((done) => setTimeout(done, 0));

    assert.deepEqual(calls.selectActor, ['a2'], 'the choice reached the store');
    assert.ok(
      document.activeElement === barTrigger(),
      `focus returns to the trigger after a choice; it is on \`${document.activeElement?.tagName}\``
    );
  });

  it('closes the popover on an outside mousedown', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();
    assert.ok(panel(), 'popover open before outside click');

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(!panel(), 'popover closes on outside mousedown');
    assert.equal(barTrigger().getAttribute('aria-expanded'), 'false', 'trigger reports collapsed after dismiss');
    outside.remove();
  });

  it('keeps the popover open when clicking inside the portaled panel', async () => {
    // The panel is no longer a descendant of the picker root, so "inside" has to be registered
    // with the dismiss action explicitly. The primitive does that; without it every click on a
    // search field or an option would first dismiss the panel that contains it.
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    panel()
      .querySelector('input[type="text"]')
      .dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(panel(), 'clicking the panel does not dismiss it');
  });

  it('closes the popover when clicking elsewhere in the bar (outside the picker)', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();
    assert.ok(panel(), 'popover open');

    // The full-width bar is outside the picker region; a click on it (its empty area /
    // right-side cluster) must dismiss the dropdown.
    const bar = target.querySelector('.fabricate-app-actor-bar');
    bar.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(!panel(), 'clicking the bar outside the picker closes the dropdown');
  });

  it('filters options case-insensitively by name', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const input = panel().querySelector('input[type="text"]');
    input.value = 'BORIN';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    const rows = panelOptions();
    assert.equal(rows.length, 1, 'only the case-insensitive name match remains');
    assert.ok(rows[0].textContent.includes('Borin'));
  });

  it('states the search-miss reason, not the no-player-character-type explanation', async () => {
    // The shipped panel had one empty string and it was the wrong one: the long
    // "ask your GM to add its actor type" copy was the ONLY thing a filtered-to-nothing list
    // could say, while the state it names — zero selectable actors — cannot open the panel at
    // all, because the trigger is disabled there.
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const input = panel().querySelector('input[type="text"]');
    input.value = 'nobody by that name';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    assert.equal(panelOptions().length, 0, 'nothing matches');
    const text = panel().textContent;
    assert.ok(text.includes('FABRICATE.App.ActorBar.NoMatches'), 'the search-miss reason is shown');
    assert.ok(
      !text.includes('FABRICATE.App.ActorBar.NoActors'),
      'and the zero-actor explanation is not, because that is not the state the panel is in'
    );
  });

  it('keeps the no-matches state out of the listbox', async () => {
    // A listbox's only valid children are its options, so the empty panel must be a SIBLING of
    // the list rather than a row inside it.
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    const input = panel().querySelector('input[type="text"]');
    input.value = 'zzz';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    assert.ok(!panel().querySelector('[role="listbox"]'), 'no listbox is rendered over an empty list');
    assert.ok(panel().querySelector('[role="status"]'), 'the empty reason is announced as a status');
  });

  it('clicking an option calls store.selectActor and closes the popover', async () => {
    const { store, calls } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });
    await openPicker();

    panelOptions()[1].click();
    flushSync();

    assert.deepEqual(calls.selectActor, ['a2'], 'selectActor called with the chosen id');
    assert.ok(!panel(), 'popover closes after selection');
  });

  it('notifies the host of the chosen actor id', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    const changed = [];
    await mountBar({ store, activeTab: 'crafting', onActorChange: (id) => changed.push(id) });
    await openPicker();

    panelOptions()[1].click();
    flushSync();

    assert.deepEqual(changed, ['a2'], 'onActorChange receives the id, not the option object');
  });

  it('disables the trigger and shows the empty state when there are zero selectable actors', async () => {
    const { store } = fakeStore({ selectableActors: [], selectedActorId: '' });
    await mountBar({ store, activeTab: 'crafting' });

    const button = barTrigger();
    assert.equal(button.disabled, true, 'trigger disabled with no actors');
    assert.ok(button.textContent.includes('FABRICATE.App.ActorBar.Trigger'), 'placeholder label shown');
    // A disabled trigger does not open; assert no popover after a click attempt.
    button.click();
    flushSync();
    assert.ok(!panel(), 'disabled trigger does not open');
  });

  it('truncates long names with title on both trigger and options', async () => {
    const longName = 'Archmagister Seraphina Aurelius Valdraconis the Third of the Sunlit Spires';
    const actors = [{ id: 'a1', uuid: 'Actor.a1', name: longName, img: null }];
    const { store } = fakeStore({ selectableActors: actors, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    // The full name rides on the BUTTON's own `title` now rather than on a nested span's. The
    // bar used to set both, which put a tooltip inside a tooltip; the primitive takes one.
    assert.equal(barTrigger().getAttribute('title'), longName, 'the trigger exposes the full name via title');
    assert.ok(
      target.querySelector('.actor-bar-trigger-label').textContent.includes(longName),
      'and the ellipsised label still carries the text it truncates'
    );

    await openPicker();
    assert.equal(
      panelOptions()[0].getAttribute('title'),
      longName,
      'option exposes the full name via title'
    );
  });

  it('shows weather and time-of-day on the gathering tab', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right, 'gathering tab shows the right-side context');
    // Fixed category icons matching the GM gathering-settings UI (not per-value icons).
    assert.ok(right.querySelector('.actor-bar-weather i.fa-cloud-sun'), 'fixed weather category icon renders');
    assert.ok(right.textContent.includes('FABRICATE.App.ActorBar.Weather.clear'), 'weather value label');
    assert.ok(right.querySelector('.actor-bar-time i.fa-clock'), 'fixed time-of-day category icon renders');
    assert.ok(right.textContent.includes('FABRICATE.App.ActorBar.TimeOfDay.dusk'), 'time-of-day value label');
    // The realm chip only appears when the region/travel subsystem is enabled
    // (realmContext.enabled); it stays hidden for a plain conditions-only store.
    assert.ok(!right.querySelector('.actor-bar-realm'), 'realm chip hidden when realms disabled');
  });

  it('shows the current region on the gathering tab when regions/travel is enabled', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: { enabled: true, realms: [{ id: 'r1', label: 'Whispering Wood', placeholder: false }] }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const realm = target.querySelector('.actor-bar-realm');
    assert.ok(realm, 'realm chip renders when realms enabled');
    assert.ok(realm.querySelector('i.fa-map-location-dot'), 'realm uses the map-location icon');
    assert.ok(realm.textContent.includes('Whispering Wood'), 'shows the current realm name');
    assert.equal(realm.getAttribute('title'), 'Whispering Wood', 'realm name exposed via title');
  });

  it('shows "No current realm" when regions are enabled but none is resolved', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: { enabled: true, realms: [] }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const realm = target.querySelector('.actor-bar-realm');
    assert.ok(realm, 'realm chip still renders with no resolved realm');
    // #357: the no-current-realm placeholder reuses the Realm.None key, whose
    // value is now "No current realm" (the realm is GM/travel-driven, not
    // player-selected).
    assert.ok(realm.textContent.includes('FABRICATE.App.ActorBar.Realm.None'), 'shows the no-current-realm label');
  });

  // #357: the realm chip is the player's primary diagnostic signal in the all-
  // locked / no-current-realm state, so it carries an accessible name and sits in
  // a polite live region that announces its appearance and value changes.
  it('gives the realm chip an accessible name and a polite live region', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: { enabled: true, realms: [{ id: 'r1', label: 'Whispering Wood', placeholder: false }] }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const slot = target.querySelector('.actor-bar-realm-slot');
    assert.ok(slot, 'realm chip sits in a dedicated slot');
    assert.equal(slot.getAttribute('aria-live'), 'polite', 'slot announces politely');
    const realm = slot.querySelector('.actor-bar-realm');
    const ariaLabel = realm.getAttribute('aria-label');
    assert.ok(ariaLabel, 'chip carries an accessible name');
    assert.ok(ariaLabel.includes('FABRICATE.App.ActorBar.Realm.Label'), 'aria-label leads with the Realm label');
    assert.ok(ariaLabel.includes('Whispering Wood'), 'aria-label includes the realm value');
  });

  it('keeps the polite realm live region mounted even when no realm chip shows', async () => {
    // The live region must persist across the chip appearing so the appearance is
    // announced (matching the tool-chip-slot pattern).
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: { enabled: false, realms: [] }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const slot = target.querySelector('.actor-bar-realm-slot');
    assert.ok(slot, 'realm slot persists even when the chip is hidden');
    assert.equal(slot.getAttribute('aria-live'), 'polite');
    assert.ok(!slot.querySelector('.actor-bar-realm'), 'no chip child when the subsystem is off');
  });

  it('redacts a secret undiscovered current region to the placeholder label', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: {
        enabled: true,
        realms: [{ id: null, placeholder: true, labelKey: 'FABRICATE.Gathering.Realm.UndiscoveredPlaceholder' }]
      }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const realm = target.querySelector('.actor-bar-realm');
    assert.ok(realm.textContent.includes('FABRICATE.Gathering.Realm.UndiscoveredPlaceholder'), 'placeholder label shown for a redacted realm');
  });

  it('hides the realm chip on the gathering tab when regions/travel is disabled', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      realmContext: { enabled: false, realms: [] }
    });
    await mountBar({ store, activeTab: 'gathering' });

    assert.ok(!target.querySelector('.actor-bar-realm'), 'no realm chip when the subsystem is off');
  });

  it('hides the weather chip when weather is disabled for the active system', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      conditionVisibility: { weather: false, timeOfDay: true }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(!right.querySelector('.actor-bar-weather'), 'weather chip hidden when disabled');
    assert.ok(right.querySelector('.actor-bar-time'), 'time-of-day chip still shown');
  });

  it('hides the time-of-day chip when time of day is disabled for the active system', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' },
      conditionVisibility: { weather: true, timeOfDay: false }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(!right.querySelector('.actor-bar-time'), 'time-of-day chip hidden when disabled');
    assert.ok(right.querySelector('.actor-bar-weather'), 'weather chip still shown');
  });

  it('falls back to the clock + Unknown label when timeOfDay is missing', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear' }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right.querySelector('.actor-bar-time i.fa-clock'), 'fallback clock icon renders');
    assert.ok(right.textContent.includes('FABRICATE.App.ActorBar.TimeOfDay.Unknown'), 'unknown label');
  });

  it('renders the component-sources bar on the alchemy tab', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'alchemy' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right, 'the alchemy tab surfaces the right-side context cluster');
    assert.ok(right.querySelector('[data-crafting-sources]'), 'the component-sources bar renders on the alchemy tab');
  });

  it('hides the gathering-only context on tabs with no right-side context', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'day' }
    });
    // The Journal tab carries no right-side context (the Crafting tab now hosts
    // the component-sources bar, so it is no longer an "empty right" tab).
    await mountBar({ store, activeTab: 'journal' });

    assert.ok(!target.querySelector('.actor-bar-right'), 'no right-side context on a tab without it');
  });

  it('exposes data-actor-bar-state=ready once loaded with conditions', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      loaded: true,
      conditions: { weather: 'clear', timeOfDay: 'day' }
    });
    await mountBar({ store, activeTab: 'crafting' });

    assert.equal(
      target.querySelector('.fabricate-app-actor-bar').getAttribute('data-actor-bar-state'),
      'ready'
    );
  });

  it('reports loading state until conditions arrive', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1', loaded: true, conditions: null });
    await mountBar({ store, activeTab: 'crafting' });

    assert.equal(
      target.querySelector('.fabricate-app-actor-bar').getAttribute('data-actor-bar-state'),
      'loading'
    );
  });

  it('renders the active station-tool chip in the right context cluster, before the conditions', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'dusk' }
    });
    await mountBar({
      store,
      activeTab: 'gathering',
      activeCanvasTool: { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' }
    });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right, 'right context cluster renders');
    const chip = right.querySelector('.actor-bar-tool-chip');
    assert.ok(chip, 'tool chip renders inside the right cluster');
    assert.ok(chip.querySelector('i.fa-screwdriver-wrench'), 'chip uses the screwdriver-wrench icon');
    assert.ok(chip.textContent.includes('Forge Anvil'), 'chip surfaces the tool label');
    assert.ok(chip.querySelector('[aria-live="polite"]') || right.querySelector('[aria-live="polite"]'), 'chip lives in an aria-live region');
    assert.equal(chip.getAttribute('title'), 'Forge Anvil', 'chip exposes the tool label via title');

    // The chip sits at the leading edge of the right cluster, before the weather condition.
    const weather = right.querySelector('.actor-bar-weather');
    assert.ok(weather, 'weather condition still renders');
    // DOCUMENT_POSITION_FOLLOWING (0x04): weather follows the chip in document order.
    assert.ok(
      chip.compareDocumentPosition(weather) & 0x04,
      'the chip precedes the gathering conditions'
    );
  });

  it('falls back to the localized label when the active tool carries no name', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1', conditions: { weather: 'clear', timeOfDay: 'day' } });
    await mountBar({
      store,
      activeTab: 'gathering',
      activeCanvasTool: { componentId: 'comp-x', systemId: 'sysA', toolId: 'tool-2', label: '   ' }
    });

    const chip = target.querySelector('.actor-bar-tool-chip');
    assert.ok(chip, 'chip renders even without a tool name');
    assert.ok(chip.textContent.includes('FABRICATE.App.ActiveTool.Label'), 'falls back to the localized label');
  });

  it('omits the tool chip when no active canvas tool is set', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      conditions: { weather: 'clear', timeOfDay: 'day' }
    });
    await mountBar({ store, activeTab: 'gathering', activeCanvasTool: null });

    assert.ok(!target.querySelector('.actor-bar-tool-chip'), 'no chip without an active tool');
    // The gathering conditions remain untouched.
    assert.ok(target.querySelector('.actor-bar-weather'), 'gathering conditions still render');
  });

  it('surfaces the tool chip in the otherwise-empty right cluster on a non-gathering tab', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({
      store,
      activeTab: 'crafting',
      activeCanvasTool: { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge Anvil' }
    });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right, 'right cluster renders on crafting when a tool is active');
    assert.ok(right.querySelector('.actor-bar-tool-chip'), 'chip renders on the non-gathering tab');
    // No gathering conditions on a non-gathering tab.
    assert.ok(!right.querySelector('.actor-bar-weather'), 'no gathering conditions off the gathering tab');
  });
});

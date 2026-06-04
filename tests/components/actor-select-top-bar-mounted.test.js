import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let ActorSelectTopBar;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function copyModule(sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
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
      region: overrides.region ?? '',
      conditions: overrides.conditions ?? null,
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
  target = document.createElement('div');
  target.className = 'fabricate-app';
  document.body.appendChild(target);
  mounted = mount(ActorSelectTopBar, { target, props });
  flushSync();
  await tick();
  flushSync();
}

const ACTORS = [
  { id: 'a1', uuid: 'Actor.a1', name: 'Aria the Bold', img: 'icons/a.webp' },
  { id: 'a2', uuid: 'Actor.a2', name: 'Borin', img: null }
];

describe('ActorSelectTopBar mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key, data) => `${key}:${JSON.stringify(data)}`
      }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-actorbar-bar-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    copyModule('src/ui/svelte/util/foundryBridge.js');
    copyModule('src/ui/svelte/util/gatheringConditionIcons.js');
    copyModule('src/ui/svelte/actions/dismissOnOutsideClick.js');

    writeCompiledSvelte('src/ui/svelte/components/ActorSelectTopBar.svelte');

    ActorSelectTopBar = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/components/ActorSelectTopBar.svelte.js'
    )))).default;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('renders the selected actor portrait image in the trigger', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    const trigger = target.querySelector('.actor-bar-trigger');
    assert.ok(trigger, 'trigger renders');
    assert.equal(trigger.disabled, false, 'trigger enabled with actors');
    const img = trigger.querySelector('.actor-bar-portrait img');
    assert.ok(img, 'portrait image renders for an actor with img');
    assert.equal(img.getAttribute('src'), 'icons/a.webp');
    assert.ok(trigger.textContent.includes('Aria the Bold'), 'trigger shows the actor name');
  });

  it('renders a neutral fallback icon (no empty <img>) for a null-img actor', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a2' });
    await mountBar({ store, activeTab: 'crafting' });

    const trigger = target.querySelector('.actor-bar-trigger');
    assert.equal(trigger.querySelector('.actor-bar-portrait img'), null, 'no <img> for a null-img actor');
    assert.ok(trigger.querySelector('.actor-bar-portrait i.fa-user'), 'neutral fallback icon renders');
    // Hard guard: never emit an <img src="">.
    const emptyImgs = Array.from(target.querySelectorAll('img')).filter((img) => !img.getAttribute('src'));
    assert.equal(emptyImgs.length, 0, 'no <img src=""> anywhere');
  });

  it('opens a popover with a search input over a listbox of options', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    target.querySelector('.actor-bar-trigger').click();
    flushSync();
    await tick();
    flushSync();

    const popover = document.querySelector('.actor-bar-popover[role="dialog"]');
    assert.ok(popover, 'popover dialog opens');
    assert.ok(popover.querySelector('.actor-bar-search input'), 'search input present');
    const listbox = popover.querySelector('[role="listbox"]');
    assert.ok(listbox, 'listbox present');
    assert.equal(listbox.querySelectorAll('[role="option"]').length, 2, 'one option per actor');
    assert.equal(
      target.querySelector('.actor-bar-trigger').getAttribute('aria-expanded'),
      'true',
      'trigger reports expanded'
    );
  });

  it('closes the popover on an outside mousedown', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    target.querySelector('.actor-bar-trigger').click();
    flushSync();
    await tick();
    flushSync();
    assert.ok(document.querySelector('.actor-bar-popover'), 'popover open before outside click');

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();

    assert.equal(document.querySelector('.actor-bar-popover'), null, 'popover closes on outside mousedown');
    assert.equal(
      target.querySelector('.actor-bar-trigger').getAttribute('aria-expanded'),
      'false',
      'trigger reports collapsed after dismiss'
    );
    outside.remove();
  });

  it('filters options case-insensitively by name', async () => {
    const { store } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    target.querySelector('.actor-bar-trigger').click();
    flushSync();
    await tick();
    flushSync();

    const input = document.querySelector('.actor-bar-search input');
    input.value = 'BORIN';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    const options = document.querySelectorAll('.actor-bar-popover [role="option"]');
    assert.equal(options.length, 1, 'only the case-insensitive name match remains');
    assert.ok(options[0].textContent.includes('Borin'));
  });

  it('clicking an option calls store.selectActor and closes the popover', async () => {
    const { store, calls } = fakeStore({ selectableActors: ACTORS, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    target.querySelector('.actor-bar-trigger').click();
    flushSync();
    await tick();
    flushSync();

    const options = document.querySelectorAll('.actor-bar-popover [role="option"]');
    options[1].click();
    flushSync();

    assert.deepEqual(calls.selectActor, ['a2'], 'selectActor called with the chosen id');
    assert.equal(document.querySelector('.actor-bar-popover'), null, 'popover closes after selection');
  });

  it('disables the trigger and shows the empty state when there are zero selectable actors', async () => {
    const { store } = fakeStore({ selectableActors: [], selectedActorId: '' });
    await mountBar({ store, activeTab: 'crafting' });

    const trigger = target.querySelector('.actor-bar-trigger');
    assert.equal(trigger.disabled, true, 'trigger disabled with no actors');
    assert.ok(trigger.textContent.includes('FABRICATE.App.ActorBar.Trigger'), 'placeholder label shown');
    // A disabled trigger does not open; assert no popover after a click attempt.
    trigger.click();
    flushSync();
    assert.equal(document.querySelector('.actor-bar-popover'), null, 'disabled trigger does not open');
  });

  it('truncates long names with title on both trigger and options', async () => {
    const longName = 'Archmagister Seraphina Aurelius Valdraconis the Third of the Sunlit Spires';
    const actors = [{ id: 'a1', uuid: 'Actor.a1', name: longName, img: null }];
    const { store } = fakeStore({ selectableActors: actors, selectedActorId: 'a1' });
    await mountBar({ store, activeTab: 'crafting' });

    const triggerLabel = target.querySelector('.actor-bar-trigger-label');
    assert.equal(triggerLabel.getAttribute('title'), longName, 'trigger label exposes the full name via title');

    target.querySelector('.actor-bar-trigger').click();
    flushSync();
    await tick();
    flushSync();
    const option = document.querySelector('.actor-bar-popover [role="option"]');
    assert.equal(option.getAttribute('title'), longName, 'option exposes the full name via title');
  });

  it('shows time-of-day and region on the gathering tab', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      region: 'Greenvale',
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
    assert.ok(right.querySelector('.actor-bar-region i.fa-map-location-dot'), 'region uses the map icon (not a text label)');
    assert.ok(right.textContent.includes('Greenvale'), 'region value shown');
  });

  it('falls back to the clock + Unknown label when timeOfDay is missing', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      region: '',
      conditions: { weather: 'clear' }
    });
    await mountBar({ store, activeTab: 'gathering' });

    const right = target.querySelector('.actor-bar-right');
    assert.ok(right.querySelector('.actor-bar-time i.fa-clock'), 'fallback clock icon renders');
    assert.ok(right.textContent.includes('FABRICATE.App.ActorBar.TimeOfDay.Unknown'), 'unknown label');
    assert.ok(right.textContent.includes('FABRICATE.App.ActorBar.Region.None'), 'no-region placeholder');
  });

  it('hides the gathering-only context on non-gathering tabs', async () => {
    const { store } = fakeStore({
      selectableActors: ACTORS,
      selectedActorId: 'a1',
      region: 'Greenvale',
      conditions: { weather: 'clear', timeOfDay: 'day' }
    });
    await mountBar({ store, activeTab: 'crafting' });

    assert.equal(target.querySelector('.actor-bar-right'), null, 'no right-side context off the gathering tab');
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
});

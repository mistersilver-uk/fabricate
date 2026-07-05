import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// GatheringEnvironmentList mounts the shared Pagination + EnvironmentCard tree.
// EnvironmentCard pulls in the scene-image, gathering-format, and image-default
// helpers; every rendered `.svelte`/`.js` must be in the harness allowlist or
// the mount HANGS (reported as `# cancelled`, never `# fail`).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-env-hide-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/sceneImages.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/gatheringImageDefaults.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/gathering/EnvironmentCard.svelte',
    'src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte'
});

function environment(overrides = {}) {
  return {
    id: 'env-meadow',
    name: 'Sunlit Meadow',
    img: 'icons/svg/sun.svg',
    description: 'A gently rolling field.',
    locked: false,
    selectionMode: 'targeted',
    revealPolicy: 'never',
    discoveredTaskCount: 0,
    composedTaskCount: 0,
    biomeTags: [],
    ...overrides
  };
}

// A services stub that records the hide-toggle getter seed and every setter call.
function makeServices(initialHide = false) {
  const calls = { set: [] };
  return {
    calls,
    getHideOutOfReachEnvironments: () => initialHide,
    setHideOutOfReachEnvironments: (value) => calls.set.push(value)
  };
}

function ids(target) {
  return Array.from(target.querySelectorAll('[data-environment-id]'))
    .map((card) => card.getAttribute('data-environment-id'));
}

function toggle(target) {
  return target.querySelector('[data-gathering-env-hide-toggle]');
}

// A mixed listing: one available, one disabled-locked, one out-of-realm-locked,
// one blind-but-locked, and one merely-blind (masked, reachable, NOT locked).
function mixedListing() {
  return [
    environment({ id: 'env-open', name: 'Open Field' }),
    environment({ id: 'env-disabled', name: 'Sealed Grove', locked: true }),
    environment({
      id: 'env-realm',
      name: 'Far Vale',
      locked: true,
      location: { gated: true, available: false, currentRealms: [], guidance: null },
      blockedReasons: [{ code: 'NO_CURRENT_REALM', message: 'No party realm set.' }]
    }),
    environment({
      id: 'env-blind-locked',
      name: 'Hidden Vault',
      locked: true,
      selectionMode: 'blind',
      revealPolicy: 'onAttempt'
    }),
    environment({
      id: 'env-blind-open',
      name: 'Whispering Grove',
      locked: false,
      selectionMode: 'blind',
      revealPolicy: 'onAttempt'
    })
  ];
}

describe('GatheringEnvironmentList hide-out-of-reach toggle', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders available and locked cards together when the toggle is off', async () => {
    const { calls, ...services } = makeServices(false);
    const target = await harness.mount({ environments: mixedListing(), services });

    assert.equal(toggle(target).checked, false, 'toggle starts off (getter seeded false)');
    assert.deepEqual(
      ids(target).sort(),
      ['env-blind-locked', 'env-blind-open', 'env-disabled', 'env-open', 'env-realm'],
      'every environment (available + locked) renders when the toggle is off'
    );
    assert.equal(calls.set.length, 0, 'no setter call on a passive render');
  });

  it('seeds the initial toggle from the services getter and hides locked cards when on', async () => {
    // Getter returns true -> the derived visible list drops locked===true up front,
    // with no interaction, proving the getter direction seeds $state.
    const { ...services } = makeServices(true);
    const target = await harness.mount({ environments: mixedListing(), services });

    assert.equal(toggle(target).checked, true, 'checkbox reflects the seeded-on state');
    assert.deepEqual(
      ids(target).sort(),
      ['env-blind-open', 'env-open'],
      'toggle-on hides disabled + out-of-realm + blind-locked, keeps available + merely-blind'
    );
    // No locked teaser survives.
    assert.equal(target.querySelector('[data-locked="true"]'), null, 'no locked card renders when hidden');
  });

  it('invokes the services setter and hides locked cards when the checkbox is toggled on', async () => {
    const { calls, ...services } = makeServices(false);
    const target = await harness.mount({ environments: mixedListing(), services });

    const checkbox = toggle(target);
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(calls.set, [true], 'setter direction invoked through the services stub with true');
    assert.deepEqual(
      ids(target).sort(),
      ['env-blind-open', 'env-open'],
      'locked cards drop out of the view after toggling on'
    );
  });

  it('defaults to off (shows all) when mounted with no services prop', async () => {
    const target = await harness.mount({ environments: mixedListing() });

    assert.equal(toggle(target).checked, false, 'no services bag -> default-off checkbox');
    assert.equal(ids(target).length, 5, 'all cards render with no services (nothing hidden)');
  });

  it('shows the cause-specific all-out-of-reach empty state (distinct from no-matches) with a recovery control', async () => {
    // Every environment is locked; with the toggle seeded on, the filtered set is
    // non-empty but the visible set is empty -> the toggle-emptied branch.
    const { calls, ...services } = makeServices(true);
    const lockedOnly = [
      environment({ id: 'env-a', name: 'Sealed A', locked: true }),
      environment({ id: 'env-b', name: 'Sealed B', locked: true })
    ];
    const target = await harness.mount({ environments: lockedOnly, services });

    assert.equal(ids(target).length, 0, 'no cards render when every environment is hidden');
    const empty = target.querySelector('[data-gathering-env-empty="all-out-of-reach"]');
    assert.ok(empty, 'the toggle-emptied empty state carries the all-out-of-reach marker');
    assert.equal(
      target.querySelector('[data-gathering-env-empty="no-matches"]'),
      null,
      'the search no-matches branch is NOT used when the toggle emptied the list'
    );

    // The in-place recovery control flips the toggle back off.
    const recover = target.querySelector('[data-gathering-env-show-out-of-reach]');
    assert.ok(recover, 'the all-out-of-reach empty state renders a recovery control');
    recover.click();
    flushSync();

    assert.deepEqual(calls.set, [false], 'recovery control invokes the setter with false');
    assert.deepEqual(ids(target).sort(), ['env-a', 'env-b'], 'hidden cards return after recovery');
    assert.equal(
      target.querySelector('[data-gathering-env-empty="all-out-of-reach"]'),
      null,
      'the empty state clears once the toggle is off again'
    );
  });

  it('shows the no-matches empty state (not all-out-of-reach) when a search matches nothing', async () => {
    const { ...services } = makeServices(false);
    const target = await harness.mount({
      environments: [environment({ id: 'env-a', name: 'Alpha' })],
      services
    });

    const search = target.querySelector('.gathering-env-search input');
    search.value = 'zzzznomatch';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    assert.ok(
      target.querySelector('[data-gathering-env-empty="no-matches"]'),
      'a zero-result search uses the no-matches marker'
    );
    assert.equal(
      target.querySelector('[data-gathering-env-empty="all-out-of-reach"]'),
      null,
      'search-zero does not use the toggle-emptied branch'
    );
  });
});

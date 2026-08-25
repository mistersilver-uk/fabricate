import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { rewriteClientImports } from '../helpers/rewriteClientImports.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let Component;
let mounted;
let target;


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

function taskEntry(overrides = {}) {
  return {
    id: 'mine-ore',
    kind: 'task',
    compositionState: 'includedByMatch',
    runtimeState: 'available',
    evidence: null,
    dropRateAdjustmentRows: [],
    record: { name: 'Mine Ore', img: 'icons/ore.webp', nodes: { enabled: true, max: 5, current: 5 } },
    ...overrides
  };
}

async function render(props = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(Component, {
    target,
    props: {
      kind: 'task',
      environment: { id: 'environment-a', nodeRuntime: {} },
      entry: taskEntry(),
      onUpdateEnvironment: () => {},
      ...props
    }
  });
  flushSync();
  await tick();
  flushSync();
}

function nodeSection() {
  return target.querySelector('[data-record-inspector-section="nodes"]');
}

function countText() {
  return nodeSection()?.querySelector('[data-node-count]')?.textContent.replace(/\s+/g, ' ').trim();
}

describe('RecordInspector available-node stepper', () => {
  before(async () => {
    setupDOM();
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-record-inspector-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    for (const component of [
      // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
      // harness omits HANGS the suite (# cancelled) rather than failing it.
      'src/ui/svelte/apps/manager/Chip.svelte',
      'src/ui/svelte/apps/manager/environment/RecordInspector.svelte',
      'src/ui/svelte/apps/manager/environment/CompositionStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/RuntimeStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/MatchingEvidenceChips.svelte'
    ]) {
      writeCompiledSvelte(component);
    }
    copyModule('src/ui/svelte/util/foundryBridge.js');
    copyModule('src/gatheringImageDefaults.js');
    // The per-state tone / glyph / copy map (issue 1321), extracted out of
    // `CompositionStatePill.svelte`'s own `<script>` so the composition-state vocabulary can
    // be asserted against it. The pill is compiled into this tree above, so this is a STATIC
    // import of the mounted graph; the map is import-free by design, which is why this chip
    // does not grow a `src/systems/` dependency and this single entry closes the edge. This
    // suite hand-rolls its compile loop with NO dependency validator, so omitting it does not
    // fail a test: the whole file is reported as `# cancelled` behind one
    // ERR_MODULE_NOT_FOUND in the hook. Its sibling
    // `tests/components/record-inspector-node-max.test.js` registers the same module through
    // `createMountedComponentHarness`, whose closure validator names the missing file
    // instead — the asymmetry is why an omission here is more dangerous.
    copyModule('src/ui/svelte/apps/manager/environment/compositionStateMeta.js');
    Component = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/manager/environment/RecordInspector.svelte.js'
    )).href)).default;
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
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('shows current/max from the stored runtime pool', async () => {
    await render({ environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 2 } } } });
    assert.ok(nodeSection(), 'node section renders for a node-economy task');
    assert.equal(countText(), '2 / 5');
  });

  it('seeds current = max when this environment has no stored pool yet', async () => {
    await render({ environment: { id: 'environment-a', nodeRuntime: {} } });
    assert.equal(countText(), '5 / 5');
  });

  it('increments and decrements via onUpdateEnvironment with a clamped current', async () => {
    const patches = [];
    await render({
      environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 2 } } },
      onUpdateEnvironment: (patch) => patches.push(patch)
    });

    nodeSection().querySelector('[data-node-count-inc]').click();
    flushSync();
    assert.equal(patches.at(-1).nodeRuntime['mine-ore'].current, 3);

    nodeSection().querySelector('[data-node-count-dec]').click();
    flushSync();
    assert.equal(patches.at(-1).nodeRuntime['mine-ore'].current, 1);
  });

  it('disables decrement at 0 and increment at max', async () => {
    await render({ environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 0 } } } });
    assert.equal(nodeSection().querySelector('[data-node-count-dec]').disabled, true);
    assert.equal(nodeSection().querySelector('[data-node-count-inc]').disabled, false);

    unmount(mounted);
    mounted = null;
    target.remove();

    await render({ environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 5 } } } });
    assert.equal(nodeSection().querySelector('[data-node-count-inc]').disabled, true);
    assert.equal(nodeSection().querySelector('[data-node-count-dec]').disabled, false);
  });

  it('hides the section for a task with no node config', async () => {
    await render({ entry: taskEntry({ record: { name: 'Forage', img: 'icons/forage.webp' } }) });
    assert.equal(nodeSection(), null);
  });

  it('hides the section for events', async () => {
    await render({
      kind: 'event',
      entry: taskEntry({ kind: 'event', record: { name: 'Cave-in', img: 'icons/cave.webp', nodes: { enabled: true, max: 5, current: 5 } } })
    });
    assert.equal(nodeSection(), null);
  });

  // issue 301: a nonRegenerating pool can never be restocked, so the GM restock/step
  // controls are removed entirely — the count is shown read-only with a permanence hint.
  it('removes the step controls and shows a read-only count plus the no-restock hint for a nonRegenerating pool', async () => {
    await render({
      entry: taskEntry({ record: { name: 'Vein', img: 'icons/ore.webp', nodes: { enabled: true, max: 5, current: 2, respawn: { policy: 'nonRegenerating' } } } }),
      environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 2, respawn: { policy: 'nonRegenerating' } } } }
    });
    // Neither the increment nor the decrement control renders for a permanent pool.
    assert.equal(nodeSection().querySelector('[data-node-count-inc]'), null, 'increment control is absent for a permanently depletable pool');
    assert.equal(nodeSection().querySelector('[data-node-count-dec]'), null, 'decrement control is absent for a permanently depletable pool');
    // The read-only count is still shown via the data-node-count hook.
    const count = nodeSection().querySelector('[data-node-count]');
    assert.ok(count, 'the read-only count still renders');
    assert.equal(count.textContent.replace(/\s+/g, ' ').trim(), '2 / 5', 'count reads current / max');
    assert.ok(nodeSection().querySelector('[data-node-no-restock-hint]'), 'the cannot-restock hint renders');
  });

  it('keeps the increment control enabled for manual and overTime pools (regression)', async () => {
    for (const policy of ['manual', 'overTime']) {
      await render({
        entry: taskEntry({ record: { name: 'Vein', img: 'icons/ore.webp', nodes: { enabled: true, max: 5, current: 2, respawn: { policy } } } }),
        environment: { id: 'environment-a', nodeRuntime: { 'mine-ore': { max: 5, current: 2, respawn: { policy } } } }
      });
      assert.equal(nodeSection().querySelector('[data-node-count-inc]').disabled, false, `increment stays enabled for ${policy}`);
      assert.equal(nodeSection().querySelector('[data-node-no-restock-hint]'), null, `no restock hint for ${policy}`);
      unmount(mounted);
      mounted = null;
      target.remove();
    }
  });
});

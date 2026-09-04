/**
 * The Component Rules editor's identity callout (issue 676, AC3; rebuilt for issue 1371's
 * maintainer parity round 4).
 *
 * -- WHAT THIS SUITE USED TO BE, AND WHY IT IS NOT THAT ANY MORE --------------------------
 * It asserted the strip's SOURCE CAPABILITIES per capability - drop-to-replace, right-click
 * unlink, open-sheet on the name, the overflow's two commands, and the two negative states -
 * because AC3 demands per-capability assertions rather than "reachable" in aggregate.
 *
 * Every one of those controls is GONE from this screen (`rebuild-spec.md` D3, gap-list row 129).
 * Under epic 1357 the record that names the source Item is world catalogue data, so it is
 * authored on the world Component entry, and the reference draws ONE info-soft callout here:
 * the chip, the name, a `World catalogue` pill, the attribution note, and one exit. Deleting
 * those cases without stating the removal would leave the reference's own anatomy unasserted, so
 * this suite now pins THAT - including the two smoke hooks, which survive the rebuild and abort
 * Phase D0 if either goes missing.
 *
 * The structural trap the last describe guards is unchanged and is still the point: source
 * actions must COMMIT IMMEDIATELY and must never be staged into the editor draft.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { COMPONENT_SCOPE_LEAF_MODULES } from '../helpers/componentScopeMountModules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-identity-strip-',
  rawModules: [
    // The callout writes the attribution sentence itself, so the component-scope model is in its
    // static graph. A missing entry HANGS this suite (`# cancelled`) rather than failing it.
    ...COMPONENT_SCOPE_LEAF_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/componentCategories.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the harness omits
    // HANGS the suite rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
});

const LINKED = {
  id: 'c1',
  name: 'Iron Ore',
  img: 'icons/commodities/metal/ore-chunk-grey.webp',
  description: 'Unrefined metal.',
  registeredItemUuidDisplay: 'Compendium.fabricate.items.iron-ore',
  hasRegisteredItemUuid: true,
  sourceMissing: false,
};

function track(overrides = {}) {
  const opened = [];
  return {
    opened,
    props: {
      component: { ...LINKED },
      hasWorldEntry: true,
      memberCount: 3,
      systemName: 'Mythwright Forge',
      onOpenWorldEntry: (id) => opened.push(id),
      ...overrides,
    },
  };
}

describe('ComponentIdentityStrip — the reference callout (issue 1371, parity round 4)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('preserves BOTH data-component-edit-section hooks the smoke harness hard-waits on', async () => {
    // `scripts/foundry-test-run.mjs:10274-10275` waits on "identity" AND "source". The "source"
    // wait aborts Phase D0 before EVERY downstream frame, and a failing smoke step is never
    // waivable. None of this is visible to `npm test` — hence this pin.
    const { props } = track();
    const target = await harness.mount(props);
    assert.ok(target.querySelector('[data-component-edit-section="identity"]'));
    assert.ok(target.querySelector('[data-component-edit-section="source"]'));
    harness.remount();
  });

  it('resolves the "source" hook in the state that WITHHOLDS the exit', async () => {
    // The half of the hook contract a happy-path fixture cannot see. The exit is withheld for a
    // component with no catalogue entry, so a hook parked on that button would resolve in the
    // common case and abort Phase D0 the first time a legacy world reached this screen.
    const { props } = track({ hasWorldEntry: false });
    const target = await harness.mount(props);
    assert.ok(
      !target.querySelector('[data-component-edit-action="open-world-entry"]'),
      'the exit really is absent in this state — otherwise the assertion below is vacuous'
    );
    assert.ok(target.querySelector('[data-component-edit-section="source"]'));
    harness.remount();
  });

  it('draws ONE callout: the name, the World catalogue pill, the note and one exit', async () => {
    // Gap-list rows 129 and 131. Two stacked cards became one, and the pill reads
    // `World catalogue` rather than `World definition`.
    const { props } = track();
    const target = await harness.mount(props);

    assert.equal(
      target.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Iron Ore'
    );
    assert.equal(
      target.querySelector('[data-component-world-pill]').textContent.trim(),
      'World catalogue'
    );
    assert.match(
      target.querySelector('[data-component-identity-note]').textContent,
      /2 other systems[\s\S]*Mythwright Forge alone/,
      'the attribution sentence clamps to OTHER systems and names the one being edited'
    );
    assert.equal(
      target.querySelectorAll('[data-component-edit-action="open-world-entry"]').length,
      1,
      'and the card has exactly one exit'
    );
    harness.remount();
  });

  it('has no source drop target, no source kebab and no premise note', async () => {
    // The removal, stated. Every one of these was a per-capability case in this suite before
    // parity round 4; the source Item is authored on the world entry now.
    const { props } = track();
    const target = await harness.mount(props);
    assert.ok(!target.querySelector('[data-component-edit-action="replace-source"]'));
    assert.ok(!target.querySelector('[data-component-source-dropzone]'));
    assert.ok(!target.querySelector('.manager-component-overflow-trigger'));
    assert.ok(!target.querySelector('[data-component-identity-premise]'));
    assert.ok(
      !target.querySelector('[data-component-edit-action="open-source"]'),
      'and the name is no longer a control that opens the linked Item sheet'
    );
    harness.remount();
  });

  it('its exit invokes the navigation prop with the component id', async () => {
    // The prop defaults to a no-op at the call site, so an unwired exit is silently inert rather
    // than an error — a source assertion alone cannot say the click reaches it.
    const { opened, props } = track();
    const target = await harness.mount(props);
    target.querySelector('[data-component-edit-action="open-world-entry"]').click();
    assert.deepEqual(opened, ['c1']);
    assert.ok(Boolean(target), 'the click was dispatched against a real mount');
    harness.remount();
  });

  it('withholds the pill, the note and the exit with no catalogue entry, and says so', async () => {
    const { props } = track({ hasWorldEntry: false });
    const target = await harness.mount(props);
    assert.ok(!target.querySelector('[data-component-world-pill]'));
    assert.ok(!target.querySelector('[data-component-identity-note]'));
    assert.match(
      target.querySelector('[data-component-identity-unlinked-hint]').textContent,
      /Mythwright Forge’s own/,
      'a component the world corpus has no record of is not claimed to be shared'
    );
    harness.remount();
  });

  it('reads the LIVE prop, so a world-side identity edit re-renders here', async () => {
    // `ComponentEditView` re-seeds its drafts only when `componentKey` changes, and a catalogue
    // edit moves neither the id nor the option counts. Seed the name into `$state` here and a
    // successful edit one route away would leave this card showing the old one.
    const { props } = track();
    const first = await harness.mount(props);
    assert.equal(
      first.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Iron Ore',
      'the control reading, before the swap'
    );
    const swapped = await harness.mount({
      ...props,
      component: { ...LINKED, name: 'Silver Ore' },
    });
    assert.equal(
      swapped.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Silver Ore',
      'the callout follows the live prop'
    );
    harness.remount();
  });
});

describe('ComponentIdentityStrip — source fields never enter the draft (issue 676, AC3)', () => {
  it('the editor never carries source fields through isDirty/draftSignature/buildUpdates', () => {
    // A SOURCE-TEXT assertion on purpose. The failure this guards is invisible at
    // runtime: staging a swap into the draft still "works" — it just skips the durable
    // identity restamping, and nothing observable breaks until crafting misbehaves in
    // an unrelated surface later.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte'),
      'utf8'
    );
    const script = source.split('</script>')[0] || source;

    for (const sourceField of [
      'registeredItemUuid',
      'originItemUuid',
      'aliasItemUuids',
      'sourceMissing',
      'hasRegisteredItemUuid',
    ]) {
      assert.ok(
        !script.includes(sourceField),
        `the component editor's script must not touch the source field '${sourceField}' — ` +
          'source actions commit immediately through services.on*, they are never staged'
      );
    }

    // buildUpdates emits exactly the AUTHORED fields, and no source among them.
    const buildUpdates = script.slice(
      script.indexOf('function buildUpdates()'),
      script.indexOf('function buildDraftSummary()')
    );
    assert.ok(buildUpdates.length > 0, 'expected to locate buildUpdates');
    for (const emitted of ['updates.category', 'updates.tags', 'updates.essences', 'updates.salvage']) {
      assert.ok(buildUpdates.includes(emitted), `buildUpdates should emit ${emitted}`);
    }
    assert.ok(
      !/updates\.(name|img|description|registeredItemUuid|originItemUuid)/.test(buildUpdates),
      'buildUpdates must never emit a source-owned or item-owned field'
    );
  });
});

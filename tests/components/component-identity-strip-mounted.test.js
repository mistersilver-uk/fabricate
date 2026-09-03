/**
 * Issue 676 — the component editor's identity strip (AC3).
 *
 * The strip replaces `ComponentSourceInspector`, which lived in the right rail decision
 * 4 removed. AC3 demands PER-CAPABILITY assertions rather than "reachable" in
 * aggregate, because the failure modes are individual and silent.
 *
 * The structural trap this suite exists for: source actions must COMMIT IMMEDIATELY and
 * must never be staged into the editor draft. `replaceItemSource` restamps the durable
 * roles map and saves; routing a swap through `updateItem` instead would skip the
 * restamping and strand `flags.fabricate.roles[systemId].componentId` on the OLD item —
 * component identity would silently degrade to the raw-reference tier, no test would
 * fail, and crafting would go wrong later in a different surface.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-identity-strip-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/overlayHost.js',
    // `ActionMenu`'s pure placement helper (issue 1477). It replaced `iconPickerPopover.js` here
    // when the overflow stopped being a `SearchablePopover`: a picker's layout DECIDES the panel
    // width, and an overflow menu's width is its longest verb.
    'src/ui/svelte/util/actionMenuLayout.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    // THE shared overflow action menu and the icon-only button it renders as its trigger
    // (issue 1477). They replaced `SearchablePopover` and its `EmptyState` here: the strip's
    // source actions are COMMANDS, and the picker announced them as selectable options.
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ActionMenu.svelte',
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

function track(componentOverrides = {}) {
  const calls = { replaced: [], unlinked: [], opened: [], copied: [] };
  return {
    calls,
    props: {
      component: { ...LINKED, ...componentOverrides },
      onReplaceSource: (itemId, data) => calls.replaced.push({ itemId, data }),
      onUnlinkSource: (itemId) => calls.unlinked.push(itemId),
      onOpenSource: (uuid) => calls.opened.push(uuid),
      onCopySourceUuid: (uuid) => calls.copied.push(uuid),
    },
  };
}

// The overflow is PORTALED to escape the scrolling column's `overflow: hidden`, so its rows are
// not descendants of the strip. The mount target IS an application root, so they land inside it.
function overflowItem(target, label) {
  return Array.from(target.querySelectorAll('[role="menuitem"]')).find((button) =>
    button.textContent.includes(label)
  );
}

async function openOverflow(target) {
  target.querySelector('.manager-component-overflow-trigger').click();
  await flushRender();
}

describe('ComponentIdentityStrip — source capabilities (issue 676, AC3)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('preserves BOTH data-component-edit-section hooks the smoke harness hard-waits on', async () => {
    // `scripts/foundry-test-run.mjs` waits on "identity" AND "source". The "source"
    // wait aborts Phase D0 before EVERY downstream frame, and a failing smoke step is
    // never waivable. None of this is visible to `npm test` — hence this pin.
    const { props } = track();
    const target = await harness.mount(props);
    assert.ok(target.querySelector('[data-component-edit-section="identity"]'));
    assert.ok(target.querySelector('[data-component-edit-section="source"]'));
    harness.remount();
  });

  it('drop-to-replace delegates to onReplaceSource with the component id', async () => {
    const { calls, props } = track();
    const target = await harness.mount(props);

    const dropEvent = new target.ownerDocument.defaultView.Event('drop', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.replacement' }) },
    });
    target.querySelector('[data-component-edit-action="replace-source"]').dispatchEvent(dropEvent);
    await flushRender();

    assert.deepEqual(calls.replaced, [
      { itemId: 'c1', data: { type: 'Item', uuid: 'Item.replacement' } },
    ]);
    harness.remount();
  });

  it('right-click unlinks', async () => {
    const { calls, props } = track();
    const target = await harness.mount(props);
    target
      .querySelector('[data-component-source-linked]')
      .dispatchEvent(
        new target.ownerDocument.defaultView.MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
        })
      );
    await flushRender();
    assert.deepEqual(calls.unlinked, ['c1']);
    harness.remount();
  });

  it('open-sheet is ON THE SOURCE NAME, not buried in the overflow', async () => {
    // The common action keeps its affordance. The prototype renders it this way too,
    // and it is where it already lives today.
    const { calls, props } = track();
    const target = await harness.mount(props);
    const name = target.querySelector('[data-component-edit-action="open-source"]');
    assert.ok(name, 'the source name is the open-sheet control');
    assert.equal(name.textContent.trim(), 'Iron Ore');
    name.click();
    await flushRender();
    assert.deepEqual(calls.opened, ['Compendium.fabricate.items.iron-ore']);
    harness.remount();
  });

  it('the overflow carries unlink + copy UUID, and NOT open-sheet', async () => {
    const { calls, props } = track();
    const target = await harness.mount(props);
    await openOverflow(target);

    assert.ok(overflowItem(target, 'Unlink Source Item'), 'unlink is in the kebab');
    assert.ok(overflowItem(target, 'Copy source UUID'), 'copy UUID is in the kebab');
    assert.equal(
      overflowItem(target, 'Open Source Item'),
      undefined,
      'open-sheet is NOT duplicated into the kebab'
    );

    overflowItem(target, 'Copy source UUID').click();
    await flushRender();
    assert.deepEqual(calls.copied, ['Compendium.fabricate.items.iron-ore']);
    harness.remount();
  });

  it('1477 the source actions are announced as a MENU, and the listbox announcement is GONE', async () => {
    // THE POINT OF ISSUE 1477, and both halves are asserted. Presence alone would pass on a tree
    // that rendered a menu INSIDE a listbox, which is a shape a conversion can plausibly leave
    // behind; the absence clauses are what make this a change of widget rather than an addition.
    //
    // None of this is visible in a frame. A kebab over two rows looks identical whether a screen
    // reader is told "menu, two items" or "listbox, two options, none selected", which is why the
    // defect survived the adjudication (issue 1458) that was written to prevent it.
    const { props } = track();
    const target = await harness.mount(props);

    const trigger = target.querySelector('.manager-component-overflow-trigger');
    assert.ok(Boolean(trigger), 'the strip renders its overflow trigger');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(
      trigger.className,
      'manager-icon-button manager-component-overflow-trigger',
      'the rendered class attribute is byte-identical to the one the picker trigger carried, ' +
        'because `<ActionMenu>` renders `<IconButton>` and that primitive writes the shared class'
    );

    await openOverflow(target);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');

    const panel = target.querySelector('[role="menu"]');
    assert.ok(Boolean(panel), 'the panel is a menu');
    assert.ok(
      Boolean(panel.getAttribute('aria-label')),
      'the panel is named — a portaled panel has no ancestor to take a name from'
    );

    const items = [...panel.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent.trim()),
      ['Copy source UUID', 'Unlink Source Item'],
      'both commands are menu items, in the order the strip declares them'
    );
    for (const item of items) {
      assert.ok(!item.hasAttribute('aria-selected'), 'a command is not selected or unselected');
      assert.equal(item.getAttribute('tabindex'), '-1');
      assert.equal(item.getAttribute('data-keyboard-focus'), 'true');
    }

    // THE OLD ANNOUNCEMENT, asserted GONE rather than merely not looked for.
    assert.ok(!target.querySelector('[role="listbox"]'), 'no listbox anywhere in the strip');
    assert.ok(!target.querySelector('[role="option"]'), 'no options anywhere in the strip');
    assert.ok(!target.querySelector('[aria-selected]'), 'nothing in the strip is selectable');
    assert.ok(
      !target.querySelector('[aria-haspopup="dialog"]'),
      'and the trigger no longer promises a dialog'
    );
    harness.remount();
  });

  it('1477 Escape closes the menu and returns focus to the trigger', async () => {
    // THE KEYBOARD CONTRACT IS THE BAR, NOT THE DOM. A build that dropped the focus restore and
    // the Escape branch would render byte-identical markup in both states, so nothing structural
    // can see it — this clause can.
    const { props } = track();
    const target = await harness.mount(props);
    const doc = target.ownerDocument;
    const trigger = target.querySelector('.manager-component-overflow-trigger');

    await openOverflow(target);
    const items = [...target.querySelectorAll('[role="menuitem"]')];
    assert.ok(doc.activeElement === items[0], 'opening moves focus TO the first item');

    doc.dispatchEvent(
      new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flushRender();

    assert.ok(!target.querySelector('[role="menu"]'), 'Escape closes the menu');
    assert.ok(doc.activeElement === trigger, 'and focus returns to the trigger');
    harness.remount();
  });

  it('unlink from the overflow delegates to onUnlinkSource', async () => {
    const { calls, props } = track();
    const target = await harness.mount(props);
    await openOverflow(target);
    overflowItem(target, 'Unlink Source Item').click();
    await flushRender();
    assert.deepEqual(calls.unlinked, ['c1']);
    harness.remount();
  });

  it('NEGATIVE STATE 1 — sourceMissing renders its hint and no open-sheet control', async () => {
    const { props } = track({ sourceMissing: true });
    const target = await harness.mount(props);
    assert.ok(target.querySelector('[data-component-source-unresolved]'), 'the unresolved label renders');
    assert.ok(target.querySelector('[data-component-source-missing-hint]'), 'and its hint');
    assert.equal(
      target.querySelector('[data-component-edit-action="open-source"]'),
      null,
      'there is nothing to open'
    );
    // The strip's premise ("name/image/description follow the linked item") is not
    // asserted while the link is broken.
    assert.equal(target.querySelector('[data-component-identity-premise]'), null);
    harness.remount();
  });

  it('NEGATIVE STATE 2 — the UNLINKED state is dropzone-forward with no premise and no overflow', async () => {
    // The state previously missing from acceptance. The strip's whole premise is
    // MEANINGLESS when unlinked, and an all-inert overflow would be a dead affordance.
    const { props } = track({
      hasRegisteredItemUuid: false,
      registeredItemUuidDisplay: '',
      sourceMissing: false,
    });
    const target = await harness.mount(props);

    assert.ok(target.querySelector('[data-component-source-dropzone]'), 'dropzone-forward');
    assert.equal(
      target.querySelector('[data-component-identity-premise]'),
      null,
      'the premise note is suppressed — there is no linked item to follow'
    );
    assert.ok(
      target.querySelector('[data-component-identity-unlinked-hint]'),
      'and is replaced by copy that explains the state'
    );
    assert.equal(
      target.querySelector('.manager-component-overflow-trigger'),
      null,
      'the overflow is hidden rather than rendered all-inert'
    );
    harness.remount();
  });

  it('the strip reads the LIVE prop, never a seeded copy', async () => {
    // `ComponentEditView` re-seeds only when `componentKey`
    // (`id|tagOptions.length|essenceOptions.length`) changes. A source swap changes
    // name/img/uuid but NOT the id or the option counts, so the key does NOT change —
    // seed identity into `$state` here and a SUCCESSFUL swap would not re-render, and
    // the GM would conclude the drop failed.
    const { props } = track();
    const target = await harness.mount(props);
    assert.equal(
      target.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Iron Ore'
    );

    // Same id, new identity — exactly what a swap produces. Every displayed value here
    // is `$derived` off the prop, so re-rendering with the swapped component shows the
    // new item. A `$state` seed keyed on the (unchanged) id would still show Iron Ore.
    harness.remount();
    const swapped = await harness.mount({
      ...props,
      component: {
        ...LINKED,
        name: 'Silver Ore',
        description: 'Lustrous metal.',
        registeredItemUuidDisplay: 'Compendium.fabricate.items.silver-ore',
      },
    });
    assert.equal(
      swapped.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Silver Ore',
      'the strip follows the live prop'
    );
    assert.equal(
      swapped.querySelector('[data-component-edit-field="description"]').textContent.trim(),
      'Lustrous metal.'
    );
    assert.equal(
      swapped.querySelector('[data-component-edit-action="open-source"]').textContent.trim(),
      'Silver Ore',
      'and so does the open-sheet control'
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

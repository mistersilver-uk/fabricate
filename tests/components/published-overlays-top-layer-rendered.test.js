/**
 * Each published overlay entry inside a `<dialog>` opened with `showModal()` (issue 2884), as a
 * Foundry DialogV2 with `modal: true` is, mounted live through a fresh seam by
 * `tests/fixtures/published-top-layer/`: the panel is drawn inside the dialog, so it is not inert,
 * `elementFromPoint` reaches it, Chromium's accessibility tree holds its rows, and Escape and a
 * press elsewhere in the dialog close it; a dialog opened with `show()` keeps working, and an
 * `overlayHost` outside the dialog, the old placement, is inert, the negative control.
 * Limit: Chromium only; Foundry's DialogV2 chrome and its Escape keybinding are not loaded.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@top-layer-styles/' });
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** How each entry is opened, what its panel is, and the rows Chromium names inside it. */
const ENTRIES = Object.freeze({
  Select: { opener: '.fixture-target button', panel: '[role="listbox"]', role: 'option' },
  IconPicker: { opener: '.fixture-target button', panel: '[role="listbox"]', role: 'option' },
  ActionMenu: { opener: '.fixture-target button', panel: '[role="menu"]', role: 'menuitem' },
  Typeahead: { opener: '.fixture-target input', panel: '[role="listbox"]', role: 'option' },
  Popover: { opener: '#fixture-anchor', panel: '.fabricate-popover', role: 'textbox' },
  Modal: { opener: '#fixture-anchor', panel: '[data-manager-modal]', role: 'button' },
});

const settled = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/** A page with `entry` mounted in a dialog opened as `scene` states. */
async function opened(entry, scene = {}) {
  const page = await fixtureServer.newPage({ viewport: VIEWPORT });
  await page.goto(fixtureServer.url('/tests/fixtures/published-top-layer/index.html'));
  await page.waitForFunction(() => globalThis.__topLayerReady === true);
  await page.evaluate((given) => globalThis.__topLayer.open(given), {
    entry,
    modal: true,
    ...scene,
  });
  await page.waitForSelector(ENTRIES[entry].opener);
  return page;
}

async function within(entry, scene, body) {
  const page = await opened(entry, scene);
  try {
    return await body(page);
  } finally {
    await page.close();
  }
}

/** Opens the panel with a real pointer press on its opener, which focus enters, and waits for it. */
async function openPanel(page, entry) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.click(ENTRIES[entry].opener);
  await page.waitForSelector(ENTRIES[entry].panel);
  await settled(page);
}

/** Where the panel is drawn and whether the pointer reaches it at its centre and near its top. */
function placement(selector) {
  const panel = document.querySelector(selector);
  const dialog = document.querySelector('dialog');
  const { left, top, width, height } = panel.getBoundingClientRect();
  const reaches = (x, y) => panel.contains(document.elementFromPoint(x, y));
  return {
    inDialog: dialog.contains(panel),
    drawn: width > 0 && height > 0,
    hit: reaches(left + width / 2, top + height / 2) && reaches(left + width / 2, top + 8),
  };
}

/** The names of the unignored `role` nodes in Chromium's accessibility tree. */
async function namedInTree(page, role) {
  const client = await page.context().newCDPSession(page);
  try {
    const { nodes } = await client.send('Accessibility.getFullAXTree');
    return nodes
      .filter((node) => !node.ignored && node.role?.value === role)
      .map((node) => node.name?.value ?? '');
  } finally {
    await client.detach();
  }
}

const panelGone = (page, entry) =>
  page.evaluate((selector) => !document.querySelector(selector), ENTRIES[entry].panel);

/** Clicks the dialog's backdrop, away from the panel, which Chromium hits as the dialog itself. */
async function pressAway(page) {
  await page.mouse.click(4, 4);
  await settled(page);
}

/** The panel's placement and tree, then whether Escape, and a press in the dialog, close it. */
async function probe(page, entry) {
  await openPanel(page, entry);
  const drawn = await page.evaluate(placement, ENTRIES[entry].panel);
  const named = await namedInTree(page, ENTRIES[entry].role);
  await page.keyboard.press('Escape');
  await settled(page);
  const escaped = await panelGone(page, entry);
  const dialogOpen = await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const { open } = dialog;
    if (!open) dialog.showModal();
    return open;
  });
  await openPanel(page, entry);
  await pressAway(page);
  return { ...drawn, named, escaped, dialogOpen, pressedAway: await panelGone(page, entry) };
}

const NAMED = Object.freeze({
  Select: ['Alpha', 'Beta', 'Gamma'],
  ActionMenu: ['Rename', 'Delete'],
  Typeahead: ['Alpha', 'Beta', 'Gamma'],
  Popover: ['Score'],
  Modal: ['Close', 'Save'],
});

describe('a published overlay entry in a dialog opened with showModal()', () => {
  for (const entry of Object.keys(ENTRIES)) {
    it(`draws the ${entry}’s panel inside the dialog, reachable, in the tree, and closed by Escape and a press away`, async () => {
      const result = await within(entry, {}, (page) => probe(page, entry));
      const { inDialog, drawn, hit, escaped, pressedAway, named } = result;
      assert.deepEqual(
        { inDialog, drawn, hit, escaped, pressedAway },
        { inDialog: true, drawn: true, hit: true, escaped: true, pressedAway: true },
        JSON.stringify(result)
      );
      if (NAMED[entry]) {
        for (const name of NAMED[entry]) assert.ok(named.includes(name), `${name} in ${named}`);
      } else {
        assert.ok(named.length > 0, `the ${entry}’s rows are in the tree`);
      }
    });
  }

  // A pinned known limit (issue 2917): these panels close on Escape without preventing it, so
  // Chromium closes the modal dialog too; the fix for that issue flips this case.
  for (const entry of ['Select', 'IconPicker', 'ActionMenu']) {
    it(`known limit: closes the dialog too when Escape closes a ${entry} panel in it`, async () => {
      const result = await within(entry, {}, (page) => probe(page, entry));
      assert.equal(result.dialogOpen, false);
    });
  }

  for (const entry of ['Popover', 'Typeahead']) {
    it(`keeps the dialog open when Escape closes a ${entry} panel in it, as the ${entry} prevents the key`, async () => {
      const result = await within(entry, {}, (page) => probe(page, entry));
      assert.equal(result.dialogOpen, true);
    });
  }

  it('removes the in-dialog layer with the last panel it holds', async () => {
    const layers = await within('Select', {}, async (page) => {
      await openPanel(page, 'Select');
      const open = await page.evaluate(
        () => document.querySelectorAll('dialog .fabricate-standalone-overlay').length
      );
      await page.keyboard.press('Escape');
      await settled(page);
      const closed = await page.evaluate(
        () => document.querySelectorAll('.fabricate-standalone-overlay').length
      );
      return { open, closed };
    });
    assert.deepEqual(layers, { open: 1, closed: 0 });
  });
});

describe('a Fabricate window root and a modal dialog', () => {
  /** The class of the element the open Select list is drawn in, and whether that is in the dialog. */
  const hostOfList = (page) =>
    page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]');
      const host = list.closest('.fabricate-standalone-overlay, .fabricate-app');
      return { host: host.className, inDialog: document.querySelector('dialog').contains(host) };
    });

  it('draws the list on a layer in the dialog when the root holds the dialog, so the root is inert', async () => {
    const result = await within('Select', { root: 'around' }, async (page) => {
      await openPanel(page, 'Select');
      return {
        ...(await hostOfList(page)),
        ...(await page.evaluate(placement, '[role="listbox"]')),
      };
    });
    assert.equal(result.inDialog, true);
    assert.match(result.host, /fabricate-standalone-overlay/u);
    assert.equal(result.hit, true);
  });
});

describe('a Popover whose anchor is in a modal dialog and whose target is not', () => {
  it('draws the panel in the anchor’s dialog, reachable and in the tree', async () => {
    const result = await within('Popover', { targetOutside: true }, (page) =>
      probe(page, 'Popover')
    );
    const { inDialog, hit, escaped, pressedAway, named } = result;
    assert.deepEqual(
      { inDialog, hit, escaped, pressedAway, named },
      { inDialog: true, hit: true, escaped: true, pressedAway: true, named: ['Score'] }
    );
  });
});

describe('the controls for a published overlay entry in a dialog', () => {
  it('draws a Select’s list reachable in a dialog opened with show(), as before', async () => {
    const result = await within('Select', { modal: false }, (page) => probe(page, 'Select'));
    assert.equal(result.hit, true);
    assert.deepEqual(result.named, NAMED.Select);
  });

  it('leaves a Select’s list inert under a modal dialog when its overlayHost is outside the dialog', async () => {
    const result = await within('Select', { outsideHost: true }, async (page) => {
      await openPanel(page, 'Select');
      return {
        ...(await page.evaluate(placement, ENTRIES.Select.panel)),
        named: await namedInTree(page, 'option'),
      };
    });
    assert.deepEqual(result, { inDialog: false, drawn: true, hit: false, named: [] });
  });
});

/** Issue 2420 — the library's `<AppTitleBar>`: the manager's title band, its mark and its caption. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const APP_TITLE_BAR = 'src/ui/svelte/components/AppTitleBar.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-app-title-bar-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [APP_TITLE_BAR],
  componentPath: APP_TITLE_BAR,
});

/** Non-English copy, so each fixed word is proved to be read from its key. */
const WORDS = {
  'FABRICATE.Admin.Manager.Titlebar.Premium': 'PRÄMIE',
  'FABRICATE.Admin.Manager.Titlebar.PremiumStatus': 'Fabricate Premium ist installiert',
  'FABRICATE.Admin.Manager.Titlebar.Status': 'Auflösung des gewählten Systems',
};

const barOf = (root) => root.querySelector('.manager-titlebar[data-manager-titlebar]');
const markOf = (root) => barOf(root).querySelector('[data-manager-titlebar-premium]');
const statusOf = (root) => barOf(root).querySelector('[data-manager-titlebar-status]');
const captionOf = (root) => statusOf(root).querySelector('.manager-titlebar-status-text');

describe('AppTitleBar', () => {
  before(async () => {
    await harness.setup();
    globalThis.game.i18n.localize = (key) => WORDS[key] ?? key;
  });
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws the strip alone at rest', async () => {
    const root = await harness.mount({});
    const bar = barOf(root);
    assert.ok(Boolean(bar), 'the strip renders with its class and hook');
    assert.ok(bar.parentElement === root, 'it is the mount target’s direct child');
    assert.equal(bar.children.length, 0, 'no mark and no status line');
  });

  it('draws the PREMIUM mark as a bare span with a hidden name that is also its title', async () => {
    const root = await harness.mount({ premiumInstalled: true });
    const mark = markOf(root);
    assert.equal(mark.tagName, 'SPAN', 'the mark is a bare span, not a Chip');
    assert.ok(mark.classList.contains('manager-titlebar-badge'), 'it rides the gold badge rule');
    assert.equal(mark.children.length, 2, 'the word and its hidden name, nothing else');
    const [word, name] = mark.children;
    assert.equal(word.getAttribute('aria-hidden'), 'true', 'the visible word is not read');
    assert.equal(word.textContent, WORDS['FABRICATE.Admin.Manager.Titlebar.Premium']);
    assert.ok(name.classList.contains('visually-hidden'), 'the read name is hidden text');
    assert.equal(name.textContent, WORDS['FABRICATE.Admin.Manager.Titlebar.PremiumStatus']);
    assert.equal(mark.getAttribute('title'), name.textContent, 'the title is the read name');
  });

  it('draws a caller’s caption verbatim after a hidden prefix and an information glyph', async () => {
    const caption = 'routed BY check · 3 Outcome tiers';
    const root = await harness.mount({ statusLabel: caption });
    const status = statusOf(root);
    assert.ok(status.classList.contains('manager-titlebar-status'));
    const [prefix, glyph, text] = status.children;
    assert.ok(prefix.classList.contains('visually-hidden'), 'the status is named by hidden text');
    assert.equal(prefix.textContent, WORDS['FABRICATE.Admin.Manager.Titlebar.Status']);
    assert.ok(glyph.matches('i.fa-circle-info.manager-titlebar-status-icon[aria-hidden="true"]'));
    assert.ok(text.classList.contains('manager-titlebar-status-text'));
    assert.equal(status.children.length, 3);
    assert.equal(text.textContent, caption, 'the caption is not re-cased');
    assert.equal(status.getAttribute('title'), caption);
  });

  it('draws the mark before the status, and names nothing with aria-label', async () => {
    const root = await harness.mount({ premiumInstalled: true, statusLabel: 'Simple' });
    const bar = barOf(root);
    assert.deepEqual(
      [...bar.children].map((child) => child.className),
      ['manager-titlebar-badge', 'manager-titlebar-status']
    );
    assert.equal(bar.querySelectorAll('[aria-label]').length, 0, 'no node carries aria-label');
    assert.ok(!bar.hasAttribute('aria-label'), 'nor does the bar itself');
  });

  it('follows its props: the caption and title update, and the mark comes and goes', async () => {
    const root = await harness.mount({ statusLabel: 'Simple' });
    await harness.setProps({ statusLabel: 'Routed by check · 1 outcome tier' });
    assert.equal(captionOf(root).textContent, 'Routed by check · 1 outcome tier');
    assert.equal(statusOf(root).getAttribute('title'), 'Routed by check · 1 outcome tier');
    assert.ok(!markOf(root), 'no mark before a companion is installed');
    await harness.setProps({ premiumInstalled: true });
    assert.ok(Boolean(markOf(root)), 'the mark appears');
    await harness.setProps({ premiumInstalled: false });
    assert.ok(!markOf(root), 'and is removed');
  });

  describe('with no localizer', () => {
    let localizedGame;
    before(() => {
      localizedGame = globalThis.game;
      delete globalThis.game;
    });
    after(() => {
      Object.assign(globalThis, { game: localizedGame });
    });

    it('draws the three English fallbacks', async () => {
      const root = await harness.mount({ premiumInstalled: true, statusLabel: 'Simple' });
      const [word, name] = markOf(root).children;
      assert.equal(word.textContent, 'PREMIUM');
      assert.equal(name.textContent, 'Fabricate Premium is installed and connected');
      assert.equal(statusOf(root).firstElementChild.textContent, 'Selected system resolution');
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/FabricateAppRoot.svelte'),
  'utf8'
);
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/SvelteFabricateApp.svelte.js'),
  'utf8'
);

describe('FabricateAppRoot shell', () => {
  it('renders the planned navigation tabs', () => {
    for (const id of ['crafting', 'alchemy', 'gathering', 'journal', 'inventory']) {
      assert.ok(rootSource.includes(`id: '${id}'`), `nav should include the ${id} tab`);
    }
    for (const key of ['FABRICATE.App.Nav.Crafting', 'FABRICATE.App.Nav.Alchemy', 'FABRICATE.App.Nav.Gathering', 'FABRICATE.App.Nav.Journal', 'FABRICATE.App.Nav.Inventory']) {
      assert.ok(rootSource.includes(key), `nav should localize ${key}`);
    }
  });

  it('gates the Alchemy tab behind the showAlchemy prop', () => {
    assert.ok(rootSource.includes('showAlchemy = false'), 'shell should accept a showAlchemy prop');
    assert.ok(rootSource.includes("requires: 'alchemy'"), 'the alchemy tab should be marked conditional');
    assert.ok(
      rootSource.includes("tab.requires !== 'alchemy' || showAlchemy"),
      'the alchemy tab should only render when showAlchemy is true'
    );
  });

  it('exposes an accessible tablist driven by host state', () => {
    assert.ok(rootSource.includes('role="tablist"'), 'left nav should be a tablist');
    assert.ok(rootSource.includes('activeTab === tab.id'), 'active state should derive from the activeTab prop');
    assert.ok(rootSource.includes('onSelectTab?.(tab.id)'), 'clicks should delegate selection to the host');
  });
});

describe('SvelteFabricateApp shell window', () => {
  it('is a single shared window keyed by a stable id', () => {
    assert.ok(appSource.includes("id: 'fabricate-app'"), 'window id should be fabricate-app');
    assert.ok(appSource.includes('static _instance'), 'a single shared instance should be tracked');
  });

  it('opens or re-focuses on the requested tab', () => {
    assert.ok(appSource.includes('static async show(tab'), 'show should accept a tab argument');
    assert.ok(appSource.includes('bringToFront()'), 'an already-open window should be brought to front');
    assert.ok(appSource.includes('updateProps({ activeTab'), 'tab switches should update props reactively');
  });

  it('only accepts the known tabs', () => {
    assert.ok(
      appSource.includes("['crafting', 'alchemy', 'gathering', 'journal', 'inventory']"),
      'valid tabs should be constrained to the known nav tabs'
    );
    assert.ok(appSource.includes('VALID_TABS.has(tab)'), '_selectTab should guard against unknown tabs');
  });

  it('computes and live-refreshes Alchemy tab availability', () => {
    assert.ok(appSource.includes('isAlchemyTabAvailable'), 'shell should derive Alchemy availability from the shared helper');
    assert.ok(appSource.includes('showAlchemy:'), 'showAlchemy should be passed to the component');
    assert.ok(appSource.includes("Hooks.on('fabricate.craftingSystemsChanged'"), 'should re-evaluate when systems change');
    assert.ok(appSource.includes("Hooks.on('fabricate.recipesChanged'"), 'should re-evaluate when recipes change');
    assert.ok(appSource.includes("this._activeTab === 'alchemy'"), 'should fall back off the Alchemy tab when it disappears');
  });
});

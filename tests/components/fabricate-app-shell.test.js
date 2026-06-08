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

  it('shows a "Coming soon" hint in each tab placeholder', () => {
    assert.ok(rootSource.includes('FABRICATE.App.ComingSoon'), 'placeholder should localize a coming-soon hint');
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

  describe('activeCanvasTool session context (Phase 4)', () => {
    it('show accepts a two-arg { activeCanvasTool } options bag without breaking single-arg callers', () => {
      assert.ok(
        appSource.includes('static async show(tab = DEFAULT_TAB, { activeCanvasTool } = {})'),
        'show should be the two-arg form with an options default so single-arg callers stay valid'
      );
      // existing single-arg call sites pass no options → activeCanvasTool undefined → null.
      assert.ok(appSource.includes('const nextCanvasTool = activeCanvasTool ?? null;'), 'undefined options collapse to null');
    });

    it('show SETS the active canvas tool on a fresh open and REPLACES it on re-show', () => {
      assert.ok(
        appSource.includes('existing._activeCanvasTool = nextCanvasTool;'),
        're-show of the live singleton replaces the active canvas tool'
      );
      assert.ok(
        appSource.includes('new SvelteFabricateApp({ activeTab: initialTab, activeCanvasTool: nextCanvasTool })'),
        'a fresh open seeds the active canvas tool through the constructor'
      );
    });

    it('a plain show(tab) CLEARS any existing active canvas tool (no stale station inherit)', () => {
      // nextCanvasTool is null when no options are supplied, and re-show assigns it
      // unconditionally — so a plain re-open clears a prior station context.
      assert.ok(appSource.includes('const nextCanvasTool = activeCanvasTool ?? null;'), 'plain show resolves to null');
    });

    it('exposes the active canvas tool through the services bag', () => {
      assert.ok(
        appSource.includes('getActiveCanvasTool: () => this._activeCanvasTool ?? null'),
        '_buildServices should expose getActiveCanvasTool'
      );
    });

    it('clears the active canvas tool on close() and the _onClose safety net', () => {
      const closeIdx = appSource.indexOf('async close(options)');
      const onCloseIdx = appSource.indexOf('_onClose(options)');
      assert.ok(closeIdx >= 0 && onCloseIdx >= 0, 'both close paths exist');
      const closeBody = appSource.slice(closeIdx, onCloseIdx);
      assert.ok(closeBody.includes('this._activeCanvasTool = null;'), 'close() clears the session context');
      const onCloseBody = appSource.slice(onCloseIdx);
      assert.ok(onCloseBody.includes('this._activeCanvasTool = null;'), '_onClose clears the session context too');
    });

    it('derives a system-scoped presentTools payload from the active canvas tool', () => {
      assert.ok(
        appSource.includes("const componentId = this._activeCanvasTool?.componentId;"),
        'the threading boundary derives the present set from the active tool componentId'
      );
      assert.ok(
        appSource.includes("const systemId = this._activeCanvasTool?.systemId;"),
        'the threading boundary also reads the active tool systemId for scoping'
      );
      assert.ok(
        appSource.includes('return componentId && systemId ? { systemId, componentIds: [componentId] } : null;'),
        'the payload carries both systemId and componentIds so matching is system-scoped'
      );
    });

    it('passes the active canvas tool through to the Svelte props', () => {
      assert.ok(
        appSource.includes('activeCanvasTool: this._activeCanvasTool'),
        '_prepareSvelteProps should surface the active canvas tool reactively'
      );
    });
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

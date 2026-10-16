/**
 * The Premium crafting-icons advert's visibility predicate and its dismissal setting (issue 2220;
 * `ui-extension-points/spec.md` §Premium Crafting Icons Advert).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
  WORLD_SCOPED_SETTING_KEYS,
  registerFabricateSettings,
} from '../src/config/settings.js';
import {
  PREMIUM_ICONS_AD_DISMISSED_KEY,
  PREMIUM_ICONS_AD_ROUTES,
  PREMIUM_PATREON_URL,
  isPremiumIconsAdVisible,
} from '../src/ui/svelte/apps/manager/premiumIconsAdModel.js';

import { byCodePoint } from './helpers/codePointOrder.js';

/** Every gate open, on the advert's first route; each case below closes one. */
const OPEN = Object.freeze({
  currentView: 'components',
  experimentalFeaturesEnabled: true,
  premiumInstalled: false,
  dismissed: false,
});

describe('the Premium crafting-icons advert model', () => {
  it('shows on the world Component catalogue and the Component Rules list, and nowhere else', () => {
    assert.deepEqual([...PREMIUM_ICONS_AD_ROUTES].sort(byCodePoint), [
      'components',
      'world-components',
    ]);
    for (const currentView of ['components', 'world-components']) {
      assert.equal(isPremiumIconsAdVisible({ ...OPEN, currentView }), true, currentView);
    }
    // The two editors beside them are the routes a widened predicate would reach first.
    for (const currentView of [
      'component-edit',
      'world-component-entry',
      'systems',
      'recipes',
      'world-essences',
      'world-downtime',
      '',
    ]) {
      assert.equal(isPremiumIconsAdVisible({ ...OPEN, currentView }), false, currentView);
    }
  });

  it('hides with the experimental gate shut, with Premium installed, and once dismissed', () => {
    assert.equal(isPremiumIconsAdVisible({ ...OPEN, experimentalFeaturesEnabled: false }), false);
    assert.equal(
      isPremiumIconsAdVisible({ ...OPEN, experimentalFeaturesEnabled: undefined }),
      false
    );
    assert.equal(isPremiumIconsAdVisible({ ...OPEN, premiumInstalled: true }), false);
    assert.equal(isPremiumIconsAdVisible({ ...OPEN, dismissed: true }), false);
    assert.equal(isPremiumIconsAdVisible(OPEN), true, 'the open case is what the others close');
  });

  it('links to the Patreon call to action the Downtime route already uses', () => {
    assert.equal(PREMIUM_PATREON_URL, 'https://www.patreon.com/c/mistersilver');
  });
});

describe('the advert dismissal setting', () => {
  const originalGame = globalThis.game;
  afterEach(() => {
    Reflect.set(globalThis, 'game', originalGame);
  });

  it('is the registry key the model writes', () => {
    assert.equal(PREMIUM_ICONS_AD_DISMISSED_KEY, SETTING_KEYS.PREMIUM_ICONS_AD_DISMISSED);
  });

  it('is a hidden world Boolean defaulting to false, so a player can never write it', () => {
    const registrations = new Map();
    Reflect.set(globalThis, 'game', {
      settings: {
        register: (namespace, key, definition) =>
          registrations.set(`${namespace}.${key}`, definition),
        registerMenu: () => {},
        get: () => undefined,
      },
    });
    registerFabricateSettings();

    const definition = registrations.get(
      `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.PREMIUM_ICONS_AD_DISMISSED}`
    );
    assert.ok(definition, 'the setting was never registered');
    assert.equal(definition.scope, 'world');
    assert.equal(definition.config, false);
    assert.equal(definition.type, Boolean);
    assert.equal(definition.default, false);
    assert.ok(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.PREMIUM_ICONS_AD_DISMISSED));
  });
});

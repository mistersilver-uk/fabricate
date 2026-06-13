import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

globalThis.game = {
  settings: {
    register: () => {},
    get: () => undefined,
    set: async () => undefined
  }
};

const {
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
  registerFabricateSettings
} = await import('../src/config/settings.js');
const {
  DEFAULT_FABRICATE_THEME,
  FABRICATE_THEME_ATTRIBUTE,
  FABRICATE_THEME_CHOICES,
  FABRICATE_THEME_IDS,
  applyCurrentFabricateTheme,
  applyFabricateTheme,
  normalizeFabricateTheme
} = await import('../src/ui/theme.js');

const REMOVED_MODULE_SETTING_KEYS = [
  'enabled',
  'showSimpleRecipesOnly',
  'autoCraft'
];

describe('Fabricate theme management', () => {
  beforeEach(setupDOM);
  afterEach(teardownDOM);

  it('registers a global configurable theme dropdown with Fabricate as the default', () => {
    const registrations = [];
    globalThis.game.settings.register = (namespace, key, definition) => {
      registrations.push({ namespace, key, definition });
    };

    registerFabricateSettings();

    const registeredKeys = registrations.map(entry => entry.key);
    for (const removedKey of REMOVED_MODULE_SETTING_KEYS) {
      assert.ok(!registeredKeys.includes(removedKey), `${removedKey} should not be registered`);
    }

    const configurableKeys = registrations
      .filter(entry => entry.definition.config === true)
      .map(entry => entry.key)
      .sort();
    assert.deepEqual(configurableKeys, [
      SETTING_KEYS.EXPERIMENTAL_FEATURES,
      SETTING_KEYS.INTERACTION_PROMPT_POSITION,
      SETTING_KEYS.THEME
    ].sort());

    const theme = registrations.find(entry => entry.key === SETTING_KEYS.THEME);
    assert.ok(theme, 'theme setting should be registered');
    assert.equal(theme.namespace, FABRICATE_SETTINGS_NAMESPACE);
    assert.equal(theme.definition.scope, 'world');
    assert.equal(theme.definition.config, true);
    assert.equal(theme.definition.type, String);
    assert.equal(theme.definition.default, DEFAULT_FABRICATE_THEME);
    assert.deepEqual(FABRICATE_THEME_IDS, {
      FABRICATE: 'fabricate',
      MYTHWRIGHT: 'mythwright',
      IRONBLOOD_FORGE: 'ironblood-forge',
      HEARTH_HERB: 'hearth-herb',
      STARGLASS_ARCANA: 'starglass-arcana',
      FOUNDRY_NATIVE: 'foundry-native'
    });
    assert.deepEqual(FABRICATE_THEME_CHOICES, {
      fabricate: 'Fabricate',
      mythwright: 'Mythwright',
      'ironblood-forge': 'Ironblood Forge',
      'hearth-herb': 'Hearth & Herb',
      'starglass-arcana': 'Starglass Arcana',
      'foundry-native': 'Foundry Native'
    });
    assert.deepEqual(theme.definition.choices, FABRICATE_THEME_CHOICES);

    const experimental = registrations.find(entry => entry.key === SETTING_KEYS.EXPERIMENTAL_FEATURES);
    assert.ok(experimental, 'experimental features setting should be registered');
    assert.equal(experimental.namespace, FABRICATE_SETTINGS_NAMESPACE);
    assert.equal(experimental.definition.scope, 'world');
    assert.equal(experimental.definition.config, true);
    assert.equal(experimental.definition.type, Boolean);
    assert.equal(experimental.definition.default, false);
  });

  it('applies theme changes through the registered setting onChange callback and stamps open Fabricate app roots', () => {
    let themeDefinition;
    globalThis.game.settings.register = (_namespace, key, definition) => {
      if (key === SETTING_KEYS.THEME) themeDefinition = definition;
    };
    document.body.innerHTML = `
      <section class="fabricate" data-appid="crafting"></section>
      <section class="fabricate" data-appid="manager">
        <div class="fabricate-manager"></div>
      </section>
      <section class="fabricate-manager" data-appid="surface-only"></section>
    `;

    registerFabricateSettings();
    themeDefinition.onChange(FABRICATE_THEME_IDS.STARGLASS_ARCANA);

    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.STARGLASS_ARCANA);
    for (const appRoot of document.querySelectorAll('.fabricate')) {
      assert.equal(
        appRoot.getAttribute(FABRICATE_THEME_ATTRIBUTE),
        FABRICATE_THEME_IDS.STARGLASS_ARCANA
      );
    }
    assert.equal(
      document.querySelector('[data-appid="surface-only"]').getAttribute(FABRICATE_THEME_ATTRIBUTE),
      null
    );
  });

  it('applies the current stored theme after settings registration', () => {
    document.body.innerHTML = '<section class="fabricate" data-appid="gathering"></section>';
    const applied = applyCurrentFabricateTheme(
      key => key === SETTING_KEYS.THEME ? FABRICATE_THEME_IDS.IRONBLOOD_FORGE : undefined,
      SETTING_KEYS.THEME
    );

    assert.equal(applied, FABRICATE_THEME_IDS.IRONBLOOD_FORGE);
    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.IRONBLOOD_FORGE);
    assert.equal(
      document.querySelector('[data-appid="gathering"]').getAttribute(FABRICATE_THEME_ATTRIBUTE),
      FABRICATE_THEME_IDS.IRONBLOOD_FORGE
    );
  });

  it('normalizes supported theme ids and safely falls back for unknown values', () => {
    for (const themeId of Object.values(FABRICATE_THEME_IDS)) {
      assert.equal(normalizeFabricateTheme(themeId), themeId);
    }

    for (const invalidThemeId of [undefined, null, '', 'unknown', {}, []]) {
      assert.equal(normalizeFabricateTheme(invalidThemeId), FABRICATE_THEME_IDS.FABRICATE);
    }

    const applied = applyFabricateTheme('unknown');
    assert.equal(applied, FABRICATE_THEME_IDS.FABRICATE);
    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.FABRICATE);
  });
});

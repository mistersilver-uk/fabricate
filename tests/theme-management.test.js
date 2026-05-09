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

describe('Fabricate theme management', () => {
  beforeEach(setupDOM);
  afterEach(teardownDOM);

  it('registers a global configurable theme dropdown with Fabricate as the default', () => {
    const registrations = [];
    globalThis.game.settings.register = (namespace, key, definition) => {
      registrations.push({ namespace, key, definition });
    };

    registerFabricateSettings();

    const theme = registrations.find(entry => entry.key === SETTING_KEYS.THEME);
    assert.ok(theme, 'theme setting should be registered');
    assert.equal(theme.namespace, FABRICATE_SETTINGS_NAMESPACE);
    assert.equal(theme.definition.scope, 'world');
    assert.equal(theme.definition.config, true);
    assert.equal(theme.definition.type, String);
    assert.equal(theme.definition.default, DEFAULT_FABRICATE_THEME);
    assert.deepEqual(theme.definition.choices, FABRICATE_THEME_CHOICES);
  });

  it('applies theme changes through the registered setting onChange callback', () => {
    let themeDefinition;
    globalThis.game.settings.register = (_namespace, key, definition) => {
      if (key === SETTING_KEYS.THEME) themeDefinition = definition;
    };

    registerFabricateSettings();
    themeDefinition.onChange(FABRICATE_THEME_IDS.MYTHWRIGHT);

    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.MYTHWRIGHT);
  });

  it('applies the current stored theme after settings registration', () => {
    const applied = applyCurrentFabricateTheme(
      key => key === SETTING_KEYS.THEME ? FABRICATE_THEME_IDS.MYTHWRIGHT : undefined,
      SETTING_KEYS.THEME
    );

    assert.equal(applied, FABRICATE_THEME_IDS.MYTHWRIGHT);
    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.MYTHWRIGHT);
  });

  it('normalizes invalid theme ids to the Fabricate default', () => {
    assert.equal(normalizeFabricateTheme('unknown'), FABRICATE_THEME_IDS.FABRICATE);

    const applied = applyFabricateTheme('unknown');
    assert.equal(applied, FABRICATE_THEME_IDS.FABRICATE);
    assert.equal(document.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE), FABRICATE_THEME_IDS.FABRICATE);
  });
});

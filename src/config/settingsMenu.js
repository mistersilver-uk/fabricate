/**
 * Shared shell for a Fabricate settings-menu entry that OPENS A DIALOG rather than a
 * window.
 *
 * Foundry's `registerMenu` always instantiates and renders an `ApplicationV2`, so
 * "just run this action" is expressed by overriding `render()`. That shape was first
 * written for the "Repair Item Data" button; issue 1024 adds a second one, so it is
 * extracted here and `repairItemData.js` is converted onto it in the same change —
 * extracting a primitive obliges converting the existing site.
 *
 * Note precisely what `restricted: true` does. `registerMenu` never checks it;
 * `SettingsConfig._prepareCategoryData` hides the entry from users lacking
 * `SETTINGS_MODIFY`. It is a DISPLAY gate. The real write gate is
 * `BaseSetting.#canModify` -> `user.hasPermission('SETTINGS_MODIFY')`, whose
 * `defaultRole` is `ASSISTANT` and which a GM may grant to any role. So this is
 * "SETTINGS_MODIFY only", not "GM only".
 *
 * Foundry globals are referenced lazily inside the function so importing this module
 * never evaluates a `class extends foundry…` at load time.
 */

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a
// settings <-> menu import cycle.
const NAMESPACE = 'fabricate';

/**
 * Register a settings-menu button whose only behaviour is to run `open()`.
 *
 * No-op (returning `false`) when Foundry's settings-menu API or `ApplicationV2` is
 * unavailable — e.g. under the test harness. A caller asserting on the registered
 * payload therefore has to stub `ApplicationV2` or its assertion passes vacuously
 * against a menu that was never registered.
 *
 * @param {object} options
 * @param {string} options.key Setting-menu key, unique within the namespace.
 * @param {string} options.name i18n key for the menu label.
 * @param {string} options.label i18n key for the button text.
 * @param {string} [options.hint] i18n key for the hint text.
 * @param {string} [options.icon] Font Awesome classes for the button icon.
 * @param {() => (void|Promise<void>)} options.open Action run when the button is clicked.
 * @param {string} [options.id] DOM id for the shell application; defaults to
 *   `fabricate-<key>`.
 * @returns {boolean} `true` when the menu was registered.
 */
export function registerDialogSettingsMenu({ key, name, label, hint, icon, open, id = null } = {}) {
  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!ApplicationV2 || typeof globalThis.game?.settings?.registerMenu !== 'function') {
    return false;
  }
  if (!key || typeof open !== 'function') return false;

  const applicationId = id || `fabricate-${key}`;

  // Defined lazily so `extends ApplicationV2` only evaluates when Foundry is present.
  // Overriding render() turns the menu button into a direct action rather than a
  // window that opens.
  class FabricateDialogSettingsMenu extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: applicationId };

    async render() {
      await open();
      return this;
    }
  }

  globalThis.game.settings.registerMenu(NAMESPACE, key, {
    name,
    label,
    hint,
    icon,
    type: FabricateDialogSettingsMenu,
    restricted: true,
  });
  return true;
}

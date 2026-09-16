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

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a settings <-> menu
// import cycle.
const NAMESPACE = 'fabricate';

/** Register a settings-menu button whose only behaviour is to run `open()`. */
export function registerDialogSettingsMenu({ key, name, label, hint, icon, open, id = null } = {}) {
  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!ApplicationV2 || typeof globalThis.game?.settings?.registerMenu !== 'function') {
    return false;
  }
  if (!key || typeof open !== 'function') return false;

  const applicationId = id || `fabricate-${key}`;

  // Defined lazily so `extends ApplicationV2` only evaluates when Foundry is present.
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

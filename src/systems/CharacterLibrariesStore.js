import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';
import { cloneJson } from '../utils/scalars.js';

import { normalizeCharacterPrerequisiteList } from './characterPrerequisites.js';
import { normalizeModifierLibrary } from './modifierLibrary.js';
import { SettingsBackedStore } from './SettingsBackedStore.js';

/**
 * Persists the world character libraries to the `characterLibraries` world setting (issue 1308):
 * the character-prerequisite library and the modifier library.
 *
 * They are world scope because both resolve against the acting CHARACTER, not against any one
 * crafting system. A world with three crafting systems used to maintain three copies of the same
 * "Medicine proficiency at least 1" and three copies of the same `@abilities.med.mod`. Unlike
 * currency and travel, NOTHING stays per crafting system — there is no participation flag,
 * because an unreferenced entry already costs nothing.
 *
 * IT HOLDS TWO INDEPENDENT LIBRARIES, not one aggregate. They share no key, no reference, no
 * invariant and no reader; nothing in the corpus reads both. The single setting key is a
 * persistence economy — see `SETTING_KEYS.CHARACTER_LIBRARIES` — and the two lists are therefore
 * normalized, merged and reasoned about SEPARATELY everywhere, including on import, where a
 * single object-level merge would let a destination holding only prerequisites silently discard
 * every incoming modifier.
 *
 * **Persistence is not gated on validity, deliberately**, exactly as `CurrencyConfigStore` is
 * not: a GM authors a library incrementally, so the moment they add an entry and before they
 * type its expression the library is transiently incomplete. Rejecting those writes would make
 * the editor unusable.
 *
 * It is a persistence shell and nothing more: read, normalize, write. The list EDITS — add,
 * update, delete, reorder, seed presets — live in `adminStore`, which is where the currency and
 * realm list edits live too, composed from the same shared helpers.
 */
export class CharacterLibrariesStore extends SettingsBackedStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
  } = {}) {
    super({ getSetting, setSetting, settingKey: SETTING_KEYS.CHARACTER_LIBRARIES });
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.libraries = null;
    this.seeded = { characterPrerequisites: false, modifiers: false };
  }

  _setCache(value) {
    this.libraries = value;
  }

  /**
   * READ, RECORD KEY PRESENCE, THEN NORMALIZE — and the order is the whole point.
   *
   * `game.settings.get` on a world setting that has never been written returns the REGISTERED
   * DEFAULT rather than anything the GM authored (Foundry V13/V14
   * `client/helpers/client-settings.mjs`, `ClientSettings#get`). So a world that has not run the
   * 1.28.0 migration reads `{}` here, normalizes to two empty arrays, and reports `loaded: true`
   * — byte-identical, at this class's API, to a GM who deliberately emptied both libraries.
   *
   * Those two states must NOT be treated alike, because `CraftingSystemManager` prunes reference
   * ids against these libraries. "GM emptied it" means prune; "never written" means the basis is
   * UNKNOWN and nothing may be pruned. Normalizing destroys the distinction, so it is captured
   * from the RAW payload first and published as `isSeeded()`.
   *
   * That is not a theoretical state. Migrations run on the ACTIVE GM only (`src/main.js`), so
   * every player and every assistant GM boots against an unmigrated setting; and a migration pass
   * can defer or abort while startup continues normally. An assistant GM holds `SETTINGS_MODIFY`,
   * so without this distinction their next system save would write the whole corpus back with
   * every tool prerequisite and every `defaultModifierIds` pruned — permanent, world-wide, and
   * silent.
   *
   * GUARDED, unlike `CurrencyConfigStore.load()`. A throw here would propagate through
   * `_normalizeSystem` into `hydrate` and out of `initialize()`, which is the issue-970 failure
   * mode where the manager never initializes at all. An unreadable setting must degrade to an
   * UNKNOWN basis, not take the module down.
   */
  load() {
    const raw = this._readSettingGuarded();
    this.seeded = _carriedLibraryKeys(raw);
    this._publish(this._normalize(raw));
    return cloneJson(this.libraries);
  }

  _normalize(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      characterPrerequisites: normalizeCharacterPrerequisiteList(
        source.characterPrerequisites,
        this.randomID
      ),
      modifiers: normalizeModifierLibrary(source.modifiers),
    };
  }

  /** @returns {{ characterPrerequisites: object[], modifiers: object[] }} */
  get() {
    this._ensureLoaded();
    return cloneJson(this.libraries);
  }

  /**
   * Whether the setting has ever actually been written, as against reading back the registered
   * default. This is the predicate that makes a destructive prune decidable — see `load()`.
   *
   * PER LIBRARY when given a key, because the two are independent: a payload carrying only
   * `modifiers` says nothing about whether the GM has ever authored a prerequisite, and treating
   * one aggregate flag as the answer for both would hand a caller a real, empty, PRUNABLE basis
   * derived from a key that is simply absent. With no key it answers the aggregate question,
   * which is the right one for "has this world migrated at all".
   *
   * @param {'characterPrerequisites'|'modifiers'|null} [key]
   * @returns {boolean}
   */
  isSeeded(key = null) {
    this._ensureLoaded();
    if (!key) return this.seeded.characterPrerequisites || this.seeded.modifiers;
    return this.seeded[key] === true;
  }

  /** The world's character-prerequisite library. */
  listCharacterPrerequisites() {
    this._ensureLoaded();
    return cloneJson(this.libraries.characterPrerequisites);
  }

  /** The world's modifier library. */
  listModifiers() {
    this._ensureLoaded();
    return cloneJson(this.libraries.modifiers);
  }

  async _persist(next) {
    // A write is by definition a real payload, so the setting is seeded from here on. Without
    // this the store would keep reporting UNKNOWN until the next reload and go on refusing to
    // prune ids the GM has just deliberately removed.
    this.seeded = { characterPrerequisites: true, modifiers: true };
    await this._publishThenWrite(next, cloneJson(next));
    return cloneJson(next);
  }

  /** Replace the character-prerequisite library wholesale. */
  async saveCharacterPrerequisites(list) {
    this._ensureLoaded();
    return this._persist({
      ...this.libraries,
      characterPrerequisites: normalizeCharacterPrerequisiteList(list, this.randomID),
    });
  }

  /** Replace the modifier library wholesale. */
  async saveModifiers(list) {
    this._ensureLoaded();
    return this._persist({
      ...this.libraries,
      modifiers: normalizeModifierLibrary(list),
    });
  }

  /** Replace both libraries at once. */
  async save(libraries) {
    this._ensureLoaded();
    return this._persist(this._normalize(libraries));
  }
}

/**
 * Which of the two library keys the raw payload actually carries — i.e. which halves have been
 * WRITTEN, as against synthesised from the registered default. An array or a scalar is not a
 * payload this store ever wrote, so both read as unseeded.
 *
 * @param {unknown} raw
 * @returns {{ characterPrerequisites: boolean, modifiers: boolean }}
 */
function _carriedLibraryKeys(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    characterPrerequisites: Object.prototype.hasOwnProperty.call(source, 'characterPrerequisites'),
    modifiers: Object.prototype.hasOwnProperty.call(source, 'modifiers'),
  };
}

import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import { normalizeCharacterPrerequisiteList } from './characterPrerequisites.js';
import { normalizeModifierLibrary } from './modifierLibrary.js';

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
export class CharacterLibrariesStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.libraries = null;
    this.loaded = false;
    this.seeded = { characterPrerequisites: false, modifiers: false };
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
    let raw;
    try {
      raw = this.getSetting(SETTING_KEYS.CHARACTER_LIBRARIES);
    } catch {
      raw = null;
    }
    this.seeded = _carriedLibraryKeys(raw);
    this.libraries = this._normalize(raw);
    this.loaded = true;
    return cloneJson(this.libraries);
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
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

  /**
   * PUBLISH THE CACHE BEFORE AWAITING THE WRITE, not after — the rule `CurrencyConfigStore`
   * documents, for the same reason and with more at stake here.
   *
   * Callers read-modify-write: `adminStore` reads `get()`, mutates one list, and saves. The
   * editor fires one of those per keystroke on a label field, so a second edit routinely starts
   * while the first `setSetting` is still in flight. Publish after the await and that second edit
   * reads the pre-first-edit libraries and clobbers them — the GM's typing silently disappears.
   *
   * The stake is higher here than for currency because ONE key carries TWO libraries: a stale
   * read taken during a modifier keystroke would write back a stale `characterPrerequisites`
   * alongside it, losing an edit in a list the GM was not even touching.
   *
   * The cost is a cache briefly ahead of the setting if the write rejects — recoverable on the
   * next `load()`, which the replication bridge calls whenever the setting changes. A lost
   * update is not recoverable at all.
   */
  async _persist(next) {
    this.libraries = next;
    this.loaded = true;
    // A write is by definition a real payload, so the setting is seeded from here on. Without
    // this the store would keep reporting UNKNOWN until the next reload and go on refusing to
    // prune ids the GM has just deliberately removed.
    this.seeded = { characterPrerequisites: true, modifiers: true };
    await this.setSetting(SETTING_KEYS.CHARACTER_LIBRARIES, cloneJson(next));
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

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

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
 * Persists the world `characterLibraries` setting (issue 1308): two independent libraries, the
 * character prerequisites and the modifiers, which share no key, invariant or reader, so they are
 * normalized and merged separately everywhere, import included. Writes are not gated on
 * validity, because a GM authors a library incrementally. It is a persistence shell only; the
 * list edits live in `adminStore`.
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
   * Record raw key presence before normalizing: an unwritten world setting reads back as the
   * registered default (`ClientSettings#get`, V13 and V14), which normalizes exactly like a
   * deliberately emptied library, and a prune against that unknown basis would wipe references
   * world-wide (DOMAIN.md "Modifier Library" and "Valid Id Basis"). Guarded: an unreadable
   * setting degrades to an unknown basis instead of failing `initialize()` (issue 970).
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

  /** Whether the setting was ever written (see `load()`); per library given a key, since a payload
   *  carrying one key says nothing of the other. No key asks whether the world migrated at all. */
  isSeeded(key = null) {
    this._ensureLoaded();
    if (!key) return this.seeded.characterPrerequisites || this.seeded.modifiers;
    return this.seeded[key] === true;
  }

  listCharacterPrerequisites() {
    this._ensureLoaded();
    return cloneJson(this.libraries.characterPrerequisites);
  }

  listModifiers() {
    this._ensureLoaded();
    return cloneJson(this.libraries.modifiers);
  }

  async _persist(next) {
    // A write is a real payload, so both halves count as seeded from here on.
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

/** Which library keys the raw payload carries; an array or a scalar carries neither. */
function _carriedLibraryKeys(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    characterPrerequisites: Object.prototype.hasOwnProperty.call(source, 'characterPrerequisites'),
    modifiers: Object.prototype.hasOwnProperty.call(source, 'modifiers'),
  };
}

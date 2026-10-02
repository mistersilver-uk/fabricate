import { cloneJson } from '../utils/scalars.js';

import { SettingsBackedStore } from './SettingsBackedStore.js';
import { normalizeWorldVocabularyEntries, WORLD_VOCABULARY_KINDS } from './worldVocabulary.js';

/**
 * The persistence shell behind `fabricate.worldVocabulary` (issue 1392): one key,
 * `{ componentCategories, componentTags, recipeCategories }`, each a list of `{id, name}`. Unlike
 * the scope stores it persists only the kinds ever written, so "never authored" and "emptied" stay
 * distinct across a reload; a world setting keeps key absence, unlike `setFlag`. `_normalize` is
 * an allowlist rebuild over `WORLD_VOCABULARY_KINDS`, so a new sub-key must extend it too.
 *
 * As in `ScopedDefinitionStore`: the setting seams are injected, the cache is published before the
 * write is awaited, `load()` never throws, saves are never gated on validity, and the corpus is
 * replaced wholesale. A rejected write leaves the cache ahead of the setting until reload, since no
 * setting hook fires, so `worldScopeActions` gates a cascade's second write on the first and
 * `tests/world-vocabulary-actions.test.js` asserts on the persisted payload.
 */

/**
 * The owned setting key, restated to avoid importing `src/config/settings.js`;
 * `tests/world-vocabulary-store.test.js` pins it to `SETTING_KEYS.WORLD_VOCABULARY`.
 */
export const WORLD_VOCABULARY_SETTING_KEY = 'worldVocabulary';

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Which kinds the raw payload carries; an array or a scalar carries none. */
function carriedKinds(raw) {
  const source = plainObject(raw);
  const carried = {};
  for (const kind of WORLD_VOCABULARY_KINDS) {
    carried[kind] = Object.prototype.hasOwnProperty.call(source, kind);
  }
  return carried;
}

/** Build the world vocabulary store; `settingKey` is overridable for tests. */
export function createWorldVocabularyStore({
  getSetting,
  setSetting,
  settingKey = WORLD_VOCABULARY_SETTING_KEY,
} = {}) {
  return new WorldVocabularyStore({ getSetting, setSetting, settingKey });
}

/** @see createWorldVocabularyStore */
class WorldVocabularyStore extends SettingsBackedStore {
  constructor({ getSetting, setSetting, settingKey }) {
    super({ getSetting, setSetting, settingKey });
    this._corpus = null;
    this.seeded = {};
    for (const kind of WORLD_VOCABULARY_KINDS) this.seeded[kind] = false;
  }

  _setCache(corpus) {
    this._corpus = corpus;
  }

  /** Read raw, record key presence, then normalize; never throws. */
  load() {
    const raw = this._readSettingGuarded();
    this.seeded = carriedKinds(raw);
    this._publish(this._normalize(raw));
    return this._corpus;
  }

  _normalize(raw) {
    const source = plainObject(raw);
    const corpus = {};
    for (const kind of WORLD_VOCABULARY_KINDS) {
      corpus[kind] = normalizeWorldVocabularyEntries(kind, source[kind]);
    }
    return corpus;
  }

  /** The corpus by reference; a caller that edits uses {@link WorldVocabularyStore#get}. */
  corpus() {
    this._ensureLoaded();
    return this._corpus;
  }

  /** One vocabulary, by reference. */
  list(kind) {
    const corpus = this.corpus();
    return Array.isArray(corpus?.[kind]) ? corpus[kind] : [];
  }

  /**
   * Whether a kind was ever written; with no kind, whether any was. An unknown kind answers
   * `false`, never a throw: `worldScopeProjection`'s shared `readCorpus` asks this store for the
   * scope sub-keys and turns a throw into a silently blank screen.
   */
  isSeeded(kind = null) {
    this._ensureLoaded();
    if (!kind) return WORLD_VOCABULARY_KINDS.some((known) => this.seeded[known] === true);
    return this.seeded[kind] === true;
  }

  /** A deep copy of the persisted shape, which omits an unwritten kind. */
  get() {
    this._ensureLoaded();
    return cloneJson(this._persistedShape(this._corpus, this.seeded));
  }

  _persistedShape(corpus, seeded) {
    const payload = {};
    for (const kind of WORLD_VOCABULARY_KINDS) {
      if (seeded[kind] === true) payload[kind] = corpus[kind];
    }
    return payload;
  }

  async _persist(next, seeded) {
    const payload = cloneJson(this._persistedShape(next, seeded));
    this.seeded = seeded;
    await this._publishThenWrite(next, payload);
    return this._corpus;
  }

  /**
   * Replace the whole vocabulary, ungated. Seededness is what was seeded plus what the payload
   * carries, so an emptied kind persists as `[]` and a never-written one stays absent.
   */
  async save(raw) {
    this._ensureLoaded();
    const carried = carriedKinds(raw);
    const seeded = {};
    for (const kind of WORLD_VOCABULARY_KINDS) {
      seeded[kind] = this.seeded[kind] === true || carried[kind] === true;
    }
    return this._persist(this._normalize(raw), seeded);
  }
}

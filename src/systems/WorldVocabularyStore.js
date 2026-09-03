import { normalizeWorldVocabularyEntries, WORLD_VOCABULARY_KINDS } from './worldVocabulary.js';

/**
 * The persistence shell behind `fabricate.worldVocabulary` (issue 1392, epic 1357, PR 7a).
 *
 * ONE KEY, THREE VOCABULARIES:
 *
 * ```jsonc
 * {
 *   "componentCategories": [{ "id": "reagent", "name": "Reagent" }],
 *   "componentTags":       [{ "id": "herb",    "name": "herb" }],
 *   "recipeCategories":    [{ "id": "potions", "name": "Potions" }]
 * }
 * ```
 *
 * ## Why ONE key here and THREE for the scoped entities
 *
 * `settings.js` records why `componentScope` / `essenceScope` / `toolScope` could not share a
 * key: on a shared key `isSeeded()` cannot be honest per entity type, because a store writes the
 * whole object and one type's first write persists the others as EMPTY — converting an UNKNOWN
 * prune basis into a real, empty, PRUNABLE one in a single keystroke.
 *
 * This store closes that hole from the other end instead, and that is the ONE place it departs
 * from both shipped shells. `ScopedDefinitionStore._persist` and `CharacterLibrariesStore._persist`
 * mark EVERY sub-key seeded on ANY write. This one persists ONLY the kinds that have actually been
 * written, and re-derives seededness from raw key presence on the next `load()` — so "never
 * authored" and "authored and then emptied" stay distinguishable across a reload, on one key, for
 * all three vocabularies. A world setting preserves key absence (unlike `setFlag`, whose merge
 * resurrects a removed key), and `type: Object` applies no schema, so the absence survives on
 * disk rather than only in memory.
 *
 * Nothing destructive rides on that predicate today — `CraftingSystemManager._vocabularyBasis`
 * deliberately does not consult this store (`## World Vocabulary` requirement 6) — but the shape
 * is what makes issue 1411 able to add an `optOuts` sub-key later with no migration and no
 * round-trip loss.
 *
 * ## The rules it shares with `ScopedDefinitionStore`
 *
 * - THE SEAMS ARE INJECTED, NOT IMPORTED. `getSetting` / `setSetting` are constructor parameters
 *   with no module-level default, so this module does not import `src/config/settings.js` —
 *   which transitively pulls in `src/ui/theme.js`. `src/main.js` is the composition root that
 *   binds the real accessors.
 * - PUBLISH THE CACHE BEFORE AWAITING THE WRITE. A GM authoring incrementally fires one write
 *   per add, so a second edit routinely starts while the first is in flight; publishing after
 *   the await would have that second edit read the pre-first-edit corpus and clobber it.
 * - `load()` IS GUARDED AND NEVER THROWS. An unreadable setting must degrade to an empty
 *   vocabulary, not take the manager's publish down.
 * - PERSISTENCE IS NEVER GATED ON VALIDITY. The normalizer is total, so a transiently odd
 *   payload is cleaned rather than refused.
 * - ONE STABLE CORPUS, REPLACED WHOLESALE. `projectWorldVocabulary` builds NEW row objects into
 *   NEW arrays per kind precisely because this object is the store's cache: decorating the
 *   corpus's own arrays in place would write the projection's per-row fields into it.
 *
 * ## The recorded cost of publish-before-await
 *
 * A REJECTED write leaves the in-memory cache ahead of the setting, and unlike a landed write no
 * `createSetting` / `updateSetting` fires — so the replication bridge's `load()` does not run and
 * the divergence persists until reload. That is why the deletion cascade in `worldScopeActions`
 * gates its second write on the first's success, and why `tests/world-vocabulary-actions.test.js`
 * asserts on the PERSISTED payload read back through the seam rather than on `store.get()`.
 */

/**
 * The world setting key this store owns.
 *
 * RESTATED rather than imported, because importing `src/config/settings.js` is exactly what the
 * injected-seams rule exists to avoid. It is a mirror, so it is guarded:
 * `tests/world-vocabulary-store.test.js` asserts it equals `SETTING_KEYS.WORLD_VOCABULARY`.
 *
 * @type {string}
 */
export const WORLD_VOCABULARY_SETTING_KEY = 'worldVocabulary';

/**
 * A plain object, or `{}` for anything that cannot be one.
 *
 * @param {unknown} value
 * @returns {object}
 */
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Which of the three kinds the RAW payload actually carries — i.e. which have been WRITTEN, as
 * against synthesized from the registered default. An array or a scalar is not a payload this
 * store ever wrote, so every kind reads as unseeded.
 *
 * @param {unknown} raw
 * @returns {Record<string, boolean>}
 */
function carriedKinds(raw) {
  const source = plainObject(raw);
  const carried = {};
  for (const kind of WORLD_VOCABULARY_KINDS) {
    carried[kind] = Object.prototype.hasOwnProperty.call(source, kind);
  }
  return carried;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Build the world vocabulary store.
 *
 * @param {object} seams
 * @param {(key: string) => unknown} seams.getSetting
 * @param {(key: string, value: unknown) => Promise<unknown>} seams.setSetting
 * @param {string} [seams.settingKey] Overridable for tests; defaults to
 *   {@link WORLD_VOCABULARY_SETTING_KEY}.
 * @returns {WorldVocabularyStore}
 */
export function createWorldVocabularyStore({
  getSetting,
  setSetting,
  settingKey = WORLD_VOCABULARY_SETTING_KEY,
} = {}) {
  return new WorldVocabularyStore({ getSetting, setSetting, settingKey });
}

/** @see createWorldVocabularyStore */
class WorldVocabularyStore {
  constructor({ getSetting, setSetting, settingKey }) {
    this.settingKey = settingKey;
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    /** @type {Record<string, Array<{id: string, name: string}>>|null} */
    this._corpus = null;
    this.loaded = false;
    this.seeded = {};
    for (const kind of WORLD_VOCABULARY_KINDS) this.seeded[kind] = false;
  }

  /**
   * Read, record raw key presence, then normalize — and the ORDER is the whole point, exactly as
   * it is in `ScopedDefinitionStore#load`: normalizing first would make every kind look present.
   *
   * GUARDED. An unreadable setting degrades to an empty vocabulary rather than taking the
   * module down.
   *
   * @returns {object} The published corpus.
   */
  load() {
    let raw;
    try {
      raw = this.getSetting?.(this.settingKey);
    } catch {
      raw = null;
    }
    this.seeded = carriedKinds(raw);
    this._publish(this._normalize(raw));
    return this._corpus;
  }

  /**
   * Replace the published corpus wholesale.
   *
   * @param {object} corpus
   * @returns {void}
   * @private
   */
  _publish(corpus) {
    this._corpus = corpus;
    this.loaded = true;
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  /**
   * @param {unknown} raw
   * @returns {Record<string, Array<{id: string, name: string}>>}
   * @private
   */
  _normalize(raw) {
    const source = plainObject(raw);
    const corpus = {};
    for (const kind of WORLD_VOCABULARY_KINDS) {
      corpus[kind] = normalizeWorldVocabularyEntries(kind, source[kind]);
    }
    return corpus;
  }

  /**
   * The published vocabulary corpus, BY REFERENCE.
   *
   * Deliberately not a clone: `buildWorldScopeState` reads it on every publish, and the
   * projection already builds new row objects into new arrays, so a per-call clone here would
   * be pure waste. Callers that intend to EDIT use {@link WorldVocabularyStore#get}.
   *
   * @returns {Record<string, Array<{id: string, name: string}>>}
   */
  corpus() {
    this._ensureLoaded();
    return this._corpus;
  }

  /** One vocabulary, by reference. @param {string} kind @returns {Array<object>} */
  list(kind) {
    const corpus = this.corpus();
    return Array.isArray(corpus?.[kind]) ? corpus[kind] : [];
  }

  /**
   * Whether a vocabulary has ever actually been WRITTEN, as against reading back the registered
   * default.
   *
   * PER KIND when given one, and `false` — NEVER A THROW — for a kind this store does not carry.
   * That refusal-by-answer is deliberate and is the one place a throw would be actively harmful:
   * `worldScopeProjection`'s `readCorpus` is shared with the three scoped-entity legs and asks
   * THIS store `isSeeded('entities')`, `isSeeded('defaults')` and `isSeeded('membership')` inside
   * a `try`/`catch` that converts any throw into `{corpus: null}` — which publishes as
   * `{available: false, total: 0}`, a legitimate shape, with no error and no red test. So a
   * throwing `isSeeded` would silently blank the whole screen and its badge. The refusal of an
   * unknown kind belongs on the WRITE path, where `worldScopeActions` answers `false`.
   *
   * With no kind it answers the aggregate question — has this world authored any vocabulary at
   * all — which is what the screen's own empty state asks.
   *
   * @param {string|null} [kind]
   * @returns {boolean}
   */
  isSeeded(kind = null) {
    this._ensureLoaded();
    if (!kind) return WORLD_VOCABULARY_KINDS.some((known) => this.seeded[known] === true);
    return this.seeded[kind] === true;
  }

  /**
   * A deep copy of the PERSISTED shape — which omits a kind that has never been written — for a
   * caller that intends to edit.
   *
   * @returns {Record<string, Array<{id: string, name: string}>>}
   */
  get() {
    this._ensureLoaded();
    return cloneJson(this._persistedShape(this._corpus, this.seeded));
  }

  /**
   * The persisted projection of a normalized corpus: the seeded kinds only.
   *
   * @param {object} corpus
   * @param {Record<string, boolean>} seeded
   * @returns {object}
   * @private
   */
  _persistedShape(corpus, seeded) {
    const payload = {};
    for (const kind of WORLD_VOCABULARY_KINDS) {
      if (seeded[kind] === true) payload[kind] = corpus[kind];
    }
    return payload;
  }

  /**
   * PUBLISH THE CACHE BEFORE AWAITING THE WRITE — see the module note, including its recorded
   * cost when the write rejects.
   *
   * @param {object} next A normalized corpus.
   * @param {Record<string, boolean>} seeded
   * @returns {Promise<object>}
   * @private
   */
  async _persist(next, seeded) {
    this._publish(next);
    this.seeded = seeded;
    await this.setSetting?.(this.settingKey, cloneJson(this._persistedShape(next, seeded)));
    return this._corpus;
  }

  /**
   * Replace the whole vocabulary wholesale.
   *
   * NOT GATED ON VALIDITY, deliberately, exactly as `ScopedDefinitionStore#save` is not.
   *
   * SEEDEDNESS IS THE UNION of what was already seeded and what this payload CARRIES, which is
   * what keeps an emptied vocabulary distinguishable from an unauthored one: deleting the last
   * component category writes `componentCategories: []`, and the key's presence says the GM
   * authored that emptiness. A kind absent from the payload and never written before stays
   * absent on disk.
   *
   * @param {unknown} raw
   * @returns {Promise<object>}
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

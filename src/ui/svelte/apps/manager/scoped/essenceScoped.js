/**
 * The ESSENCE-ONLY world-scope presentation leaf (issue 1372, epic 1357).
 *
 * `scoped/scopedStudio.js` is shared with the concurrent component (6a) and tool (6c) lanes, so
 * essence-only presentation lands HERE rather than widening a file three branches are editing at
 * once. What it owns is the small set of answers the two essence world screens and the two
 * system-scope essence screens all need and none of the other four screens do: the three-state
 * per-system cell, the world-default inherit line, the per-section note, and the ADDRESSABILITY
 * filter the world-defaults `effectSource` picker is built on.
 *
 * ## IT IMPORTS NOTHING, DELIBERATELY
 *
 * The same reason `scopedEntryRoutes.js` states for itself: the manager's compiled module graph is
 * copied file-by-file into hand-rolled mounted test trees, and an omission there does not fail —
 * it HANGS, reported as `# cancelled`. An import-free leaf closes its own graph in one line, and
 * every caller supplies its own `text` / `format` localizer rather than this module reaching for
 * `foundryBridge`.
 *
 * ## THE THREE-STATE CELL IS THE POINT OF THE FILE
 *
 * An essence membership record carries `enabled`, and `enabled: false` KEEPS the record and its
 * overrides (`openspec/specs/data-models/spec.md` `### Essence scope`). So a per-system indicator
 * modelled on a component's member / not-member pair cannot express what a GM authored: "not a
 * member" and "a member that is switched off" are different states with different consequences,
 * and only one of them is reversible by a toggle. The three states are named here once and read
 * from here everywhere.
 */

/**
 * The three states one `(essence, system)` cell can be in, in the order a legend lists them.
 *
 * @type {readonly string[]}
 */
export const ESSENCE_SYSTEM_STATES = Object.freeze(['absent', 'disabled', 'enabled']);

/**
 * The state of one `(essence, system)` cell, from the projection's joined row.
 *
 * READ FROM `member` FIRST, never from `enabled` alone. `buildSystemRow` omits `enabled` for a
 * type that has none and answers `false` for a NON-member — so a cell that tested `enabled`
 * first would paint every non-member as "disabled", which is the one reading a GM cannot act on:
 * a disabled member is re-enabled by a toggle and a non-member is not.
 *
 * @param {{member?: boolean, enabled?: boolean}|null|undefined} row a projected system row.
 * @returns {string} one of {@link ESSENCE_SYSTEM_STATES}.
 */
export function essenceSystemState(row) {
  if (row?.member !== true) return 'absent';
  return row?.enabled === true ? 'enabled' : 'disabled';
}

/**
 * How many member systems INHERIT one section, and how many override it locally.
 *
 * MEMBERS ONLY, on both halves. A system with no membership record does not have the essence, so
 * editing the world default changes nothing for it and counting it as "inheriting" overstates the
 * reach of the edit a GM is about to make. `membershipCount` is the projection's own member total
 * and `inheritCounts[section]` its own per-section inheriting total, so the override count is the
 * difference rather than a second walk that could disagree with either.
 *
 * @param {{membershipCount?: number, inheritCounts?: {[section: string]: number}}|null} entry
 * @param {string} section
 * @returns {{members: number, inheriting: number, overriding: number}}
 */
export function essenceInheritCounts(entry, section) {
  const members = Number(entry?.membershipCount) || 0;
  const inheriting = Math.min(members, Number(entry?.inheritCounts?.[section]) || 0);
  return { members, inheriting, overriding: Math.max(0, members - inheriting) };
}

/**
 * The world-entry inherit line: how many systems take this default, and how many do not.
 *
 * THE NO-MEMBER CASE IS ITS OWN SENTENCE rather than "0 of 0 systems inherit this default", which
 * is arithmetically true and tells a GM nothing about why. The prototype states it as a fallback
 * for exactly that reason.
 *
 * The override clause is APPENDED only when there is one, so the common case reads as one
 * statement instead of one statement and a zero.
 *
 * @param {object|null} entry the projected world entry.
 * @param {string} section
 * @param {(key: string, fallback: string, data: object) => string} format
 * @returns {string}
 */
export function essenceInheritLine(entry, section, format) {
  const { members, inheriting, overriding } = essenceInheritCounts(entry, section);
  if (members === 0) {
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoSystemRules',
      'No crafting system has rules for this essence yet, so nothing reads this default.',
      {}
    );
  }
  const head = format(
    'FABRICATE.Admin.Manager.Scoped.Essence.InheritLine',
    '{inheriting} of {members} systems inherit this default',
    { inheriting, members }
  );
  if (overriding === 0) return head;
  const tail = format(
    'FABRICATE.Admin.Manager.Scoped.Essence.OverrideLine',
    '{overriding} override it locally',
    { overriding }
  );
  return `${head} · ${tail}`;
}

/**
 * The one-line note under a system-scope inherit row: what the section WILL resolve to.
 *
 * `InheritRow` never reads a section VALUE — section values are opaque everywhere in this model —
 * so without a note supplied from here a row says "Effect source · Inherited" and never says what
 * is being inherited, and a row-count assertion passes green over every note empty.
 *
 * The copy says "fall back", never "discard", because `setSectionInheritance` RETAINS the dormant
 * local override when a switch goes back on.
 *
 * @param {object} options
 * @param {boolean} options.inherited whether the section is currently inherited.
 * @param {string} [options.worldName] the world default's display name, `''` when unset.
 * @param {(key: string, fallback: string, data: object) => string} options.format
 * @returns {string}
 */
export function essenceSectionNote({ inherited, worldName = '', format }) {
  const name = String(worldName || '').trim();
  if (inherited) {
    return name
      ? format('FABRICATE.Admin.Manager.Scoped.Essence.NoteInheriting', 'World default: {name}', {
          name,
        })
      : format(
          'FABRICATE.Admin.Manager.Scoped.Essence.NoteInheritingUnset',
          'The world default is unset, so this section resolves to nothing.',
          {}
        );
  }
  return format(
    'FABRICATE.Admin.Manager.Scoped.Essence.NoteOverridden',
    'Overridden for this system. Turn the switch back on to fall back to {name}.',
    {
      name:
        name ||
        format('FABRICATE.Admin.Manager.Scoped.Essence.TheWorldDefault', 'the world default', {}),
    }
  );
}

/**
 * The inspector's value SUFFIX: where the value on screen actually came from.
 *
 * A resolved value is rendered identically whether the system inherited it or authored it, and
 * the difference is the whole subject of these screens — so the suffix is what makes one readout
 * two facts rather than one.
 *
 * @param {boolean} inherited
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function essenceValueSuffix(inherited, text) {
  return inherited
    ? text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixWorldDefault', 'world default')
    : text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixOverridden', 'overridden here');
}

/**
 * Whether a string is a Foundry DOCUMENT UUID rather than a bare record id.
 *
 * ── WHY THE SHAPE TEST RATHER THAN A RESOLVE ────────────────────────────────────────────────
 * Resolving needs `await fromUuid`, which a pure leaf must not do and a picker cannot wait for
 * per candidate. What this answers is ADDRESSABILITY — can a system other than the one a GM is
 * looking at name this thing at all — and that is decidable from the form.
 *
 * A UUID names its document type in its first segment (`Item.abc123`, `Actor.x.Item.y`) or opens
 * with `Compendium.`. A system-local component id is a bare token with no dot, which is exactly
 * the value `### Essence scope` requirement 5 bars from a world default: it addresses a record
 * inside ONE crafting system, so every OTHER system that adopts the entity inherits a dangling
 * reference.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDocumentUuid(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate === '' || !candidate.includes('.')) return false;
  const segments = candidate.split('.');
  if (candidate.startsWith('Compendium.')) return segments.length >= 4;
  if (segments.length % 2 !== 0) return false;
  // Every EVEN-indexed segment is a document NAME and every odd one its id, so `Item.abc` and
  // `Actor.abc.Item.def` both qualify and `sm-c-iron` does not.
  return segments.every((segment, index) =>
    index % 2 === 0 ? /^[A-Z][A-Za-z]*$/.test(segment) : segment.length > 0
  );
}

/**
 * Whether one candidate referent may be written as a WORLD default `effectSource`.
 *
 * @param {unknown} value the candidate's id or uuid.
 * @param {Set<string>|string[]} worldEntityIds the world component catalogue's own ids.
 * @returns {boolean}
 */
export function isWorldAddressableEffectSource(value, worldEntityIds = []) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate === '') return false;
  const known = worldEntityIds instanceof Set ? worldEntityIds : new Set(worldEntityIds);
  return known.has(candidate) || isDocumentUuid(candidate);
}

/**
 * The referents a WORLD-DEFAULTS `effectSource` picker may offer.
 *
 * ── THE ENFORCEMENT POINT IS THIS FUNCTION, AND NOTHING BELOW IT ────────────────────────────
 * `worldScopeActions.updateWorldDefaultSection` writes the section value OPAQUELY by design, and
 * `normalizeWorldDefaults` coerces SHAPE rather than addressability — so neither the store nor the
 * normalizer can refuse a system-local component id. `### Essence scope` requirement 5 binds a
 * world default's `effectSource` to a world-addressable referent, and the only place that
 * obligation can be met is where the value is CHOSEN. Getting it wrong bakes a dangling reference
 * into every system that later adopts the entity, and nothing downstream reds.
 *
 * Order is the caller's, unchanged: a picker's option order is a vocabulary decision.
 *
 * @param {Array<{id?: string, name?: string}>} candidates
 * @param {Array<{id?: string}>|Set<string>} worldEntities the world component catalogue.
 * @returns {Array<object>} a new array; the input is not mutated.
 */
export function worldAddressableEffectSources(candidates, worldEntities = []) {
  const ids =
    worldEntities instanceof Set
      ? worldEntities
      : new Set(
          (Array.isArray(worldEntities) ? worldEntities : [])
            .map((entity) => (typeof entity?.id === 'string' ? entity.id : ''))
            .filter(Boolean)
        );
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    isWorldAddressableEffectSource(candidate?.id, ids)
  );
}

/**
 * Mint the id for a NEW world essence, from the name a GM typed.
 *
 * ── DERIVED FROM THE NAME, NOT MINTED AT RANDOM, AND THE REASON IS NOT AESTHETIC ────────────
 * `foundry.utils.randomID()` is unavailable to a pure leaf and `Math.random()` is a SonarCloud
 * VULNERABILITY (S2245) that fails the quality gate outright. A slug is neither, and it is also
 * the better answer here: an essence id is a durable reference every membership record and every
 * component quantity addresses, `## EssenceDefinition` never re-keys one, and a GM reading a
 * component's stored essence map gets `iron` rather than `kTz9QpLm2xR4vB1a`.
 *
 * COLLISIONS ARE RESOLVED BY SUFFIX rather than refused, because `createEntity` refuses a
 * duplicate id and reports nothing: a GM who names a second essence "Ash" would get a button
 * that silently did nothing. An empty or wholly non-alphanumeric name falls back to `essence`,
 * so the caller's own name validation stays the only thing that can reject a create.
 *
 * @param {string} name
 * @param {Array<{id?: string}>|Set<string>} existing the world roster.
 * @returns {string}
 */
export function mintEssenceId(name, existing = []) {
  const taken =
    existing instanceof Set
      ? existing
      : new Set(
          (Array.isArray(existing) ? existing : [])
            .map((entity) => (typeof entity?.id === 'string' ? entity.id : ''))
            .filter(Boolean)
        );
  const stem =
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'essence';
  if (!taken.has(stem)) return stem;
  let suffix = 2;
  while (taken.has(`${stem}-${suffix}`)) suffix += 1;
  return `${stem}-${suffix}`;
}

/**
 * The display name for one world-default section value, with the UNSET state left as `''` so a
 * caller can say "not set" in its own words rather than printing a blank.
 *
 * @param {unknown} value the stored section value; a string id/uuid or `{id, name}`.
 * @param {Array<{id?: string, name?: string}>} [catalogue] the referents the caller can name.
 * @returns {string} `''` when nothing is set.
 */
export function essenceSectionValueName(value, catalogue = []) {
  if (value && typeof value === 'object') {
    const named = typeof value.name === 'string' ? value.name.trim() : '';
    if (named) return named;
    return typeof value.id === 'string' ? value.id.trim() : '';
  }
  const id = typeof value === 'string' ? value.trim() : '';
  if (id === '') return '';
  const match = (Array.isArray(catalogue) ? catalogue : []).find((entry) => entry?.id === id);
  const name = typeof match?.name === 'string' ? match.name.trim() : '';
  return name || id;
}

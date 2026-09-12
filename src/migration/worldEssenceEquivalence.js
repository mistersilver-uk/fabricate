/**
 * 1.34.0 — THE EQUIVALENCE DECISION CORE for merging duplicated WORLD ESSENCES (issue 1654).
 *
 * This module answers four questions and nothing else, so the migration that consumes it can be
 * read as an ordering of writes rather than as an algorithm:
 *
 *   1. WHICH world essences are semantically the SAME essence;
 *   2. WHICH of them SURVIVES a merge, deterministically and re-derived;
 *   3. WHICH old essence ids each system must rewrite, or whether the merge is REFUSED;
 *   4. WHAT each retired id carried, so the id can never be silently reissued.
 *
 * It is modelled on `worldScopeEntityGrouping.js` and holds the same contract:
 * TOTAL AND NON-THROWING — a non-array corpus, a malformed system, a null definition and a
 * self-referential record all answer an empty or partial result rather than raising, because a
 * migration that throws aborts the whole pass — and FULLY DETERMINED BY ITS INPUT, so a re-run
 * produces a byte-identical answer. It writes nothing and rewrites no reference.
 *
 * ## WHY THIS EXISTS, and what `1.30.0` actually assumed (`#### D1`)
 *
 * `1.30.0` grouped essences by trimmed `id` on the stated premise that "ids are stable semantic
 * slugs, so two systems' `fire` are intended to be one essence"
 * (`worldScopeEntityGrouping.js`, `## Grouping`). THAT PREMISE IS FALSE FOR GM-AUTHORED
 * ESSENCES. Ids are minted PER SYSTEM, by two different routes that agree on nothing:
 * `adminStore.addEssence` mints a `crypto.randomUUID()`, and `mintEssenceId` mints a name-derived
 * slug uniquified against the LIVE roster only. So two systems' "Iron" arrive as two unrelated
 * ids, `1.30.0` lifted one world essence per system, and the world roster carries duplicates —
 * which is what issue 1654 reports.
 *
 * ## The canonical key (`#### D1`)
 *
 * Two world essences are equivalent when their canonicalised `(name, macro, effectSource)`
 * triples are equal.
 *
 *   - NAME is trimmed and case-folded. The authoring surface's same-name guard is ALREADY
 *     case-insensitive (`adminStore._essenceNameKey` / `_essenceNameTaken`), so this AGREES with
 *     the rule a GM is already held to rather than inventing a second one.
 *   - MACRO is the resolved `macro` section: a document-UUID string or `null`, trimmed, with `''`
 *     reading as `null`.
 *   - EFFECTSOURCE is the resolved `effectSource` section rendered as the three-field block
 *     {@link ESSENCE_EFFECT_SOURCE_FIELDS}, each value trimmed-or-`null`, in a FIXED key order.
 *     So `{}`, an ABSENT block and an ALL-`null` block all compare EQUAL. That is issue 1654's
 *     "irrelevant or generated metadata differences" clause taken literally: key order and
 *     absence-versus-`null` are non-behavioural, and every reader of the block already treats all
 *     three the same way.
 *
 * **FOR THE MODAL ESSENCE THE KEY IS THE NAME ALONE, AND THAT IS DELIBERATE.** A normalized
 * essence with no property macro and no active-effect source canonicalises to
 * `(name, null, all-null)`, and `CraftingSystemManager._normalizeEssenceDefinition` always emits
 * all four of those fields defaulted to `null`. That is the commonest essence there is, so the
 * common case of this whole pass is "same name, nothing else authored, merge". Stating it here
 * rather than leaving a reader to derive it is the point: anyone reviewing a merge report will see
 * name-only matches and must know they are the designed outcome and not a degenerate one.
 *
 * `enabled` IS DELIBERATELY NOT IN THE KEY. No world default carries it (`resolveEssence` answers
 * it from the membership record alone), and every member keeps its own across a merge, so two
 * essences that differ only in which systems have switched them off are still the same essence.
 *
 * THE EFFECT-SOURCE REFERENCE IS COMPARED, NEVER THE RESOLVED ITEM'S ACTIVE EFFECTS. Those live
 * on a document this migration cannot read — a startup migration runs on raw settings, with no
 * guarantee the referenced Item or compendium is even loaded — so the reference is the only fact
 * available, and a comparison that pretended otherwise would be a comparison of `undefined`.
 *
 * ## Candidacy, and THE ZERO POINT (`#### D2`)
 *
 * A world essence is a CANDIDATE only when its `(macro, effectSource)` pair is UNANIMOUS across
 * every one of its LIVE membership records, compared on the **RESOLVED** value through the
 * shipped {@link resolveEssence}.
 *
 * RESOLVED, NOT STORED, and the difference is not theoretical. At `1.30.0` every membership record
 * is created fully overriding, so on a freshly migrated world the stored and resolved values agree
 * and the distinction costs nothing. But a GM who later cleared an inherit switch resolves that
 * section through the WORLD DEFAULT, and reading the stored block there would compare a value
 * nobody resolves. An ABSENT world default reads as "no opinion", never as disagreement — which
 * falls out of the resolver for free, since an inheriting section with no world value resolves to
 * absence and absence canonicalises like `null`.
 *
 * **THE ZERO POINT.** Unanimity over an EMPTY member list is VACUOUSLY TRUE. So a world essence
 * with zero live membership records would sail through the unanimity test as a candidate whose
 * behaviour nobody resolves, and — canonicalising to an all-`null` block — would match every
 * same-name essence with an absent block, anywhere in the world. THE MEMBER COUNT IS THEREFORE
 * TESTED EXPLICITLY rather than left to the loop: such an essence is NOT a candidate, is left
 * exactly as it is, and is reported as `orphaned`. A world essence whose members DISAGREE is
 * reported as `declined`, with the sections they disagreed on.
 *
 * ## The third candidacy gate: THE FALSE-MERGE TRAP (`#### D1`)
 *
 * `sourceComponentId` is a SYSTEM-SCOPED id. Comparing it across two systems is meaningful only
 * because `1.30.0` re-keyed it into world space before building the scope payloads. **For a
 * `(system, 'components')` pair `1.30.0` REFUSED, it never was** — `partition` excludes a refused
 * pair outright, so no lift, no re-key and no membership record happened and the id on that
 * system's essences is still a raw system-local string. Two refused systems whose essences happen
 * to carry an equal `sourceComponentId` would canonicalise EQUAL and merge on a coincidence.
 *
 * So a group whose canonical `effectSource` names a component id is a candidate only when that id
 * is a WORLD component id FOR EVERY MEMBER SYSTEM. The refusal is recorded as
 * `unresolvedEffectSourceComponent`.
 *
 * THE "WAS NOT REFUSED" HALF IS DECIDED FROM THE COMPONENT SCOPE'S MEMBERSHIP MAP, because that is
 * the fact the corpus still holds at `1.34.0`: `1.30.0`'s refusal list was reported to the GM and
 * never persisted, and re-deriving it from a post-migration corpus would answer a different
 * question. A refused `(system, 'components')` pair produced NO membership records, and a lifted
 * one produced a record for every one of its own components, so
 * `componentScope.membership[key(componentId, systemId)]` is present exactly when that system's
 * components were lifted AND this id names one of them. That is strictly stronger than checking
 * the roster alone, which a refused system's coincidentally-equal id can pass.
 *
 * ## Survivor election (`#### D3`)
 *
 * Deterministic, and RE-DERIVED. It is NEVER read off `essenceScope.entities` array order:
 * `readScopePayload` round-trips whatever was persisted, and an already-migrated world has had GM
 * edits, deletions and copy-import appends since, so array order is exactly the fact that has
 * rotted. "A world already partially or fully migrated" is an explicit acceptance criterion of
 * this change, so that is not a hypothetical corpus.
 *
 * Order of consultation:
 *
 *   1. **SLUG PREFERENCE.** An id the world catalogue would mint for the group's case-folded name
 *      wins, so a merge never retires a readable `iron` in favour of a `kTz9QpLm2xR4vB1a` — the
 *      readability `mintEssenceId` exists to provide. `mintEssenceId` can answer either the bare
 *      stem or `<stem>-<n>`, so those are the two shapes that rank, bare stem first.
 *   2. **CORPUS POSITION** among ids that are equally slug-shaped or equally not: `1.30.0`'s
 *      `byCorpusPosition` semantics — oldest system first, then stored index within that system —
 *      RE-DERIVED from the live `craftingSystems` corpus rather than taken from any stored order.
 *   3. **ARRAY POSITION** in `essenceScope.entities`, and only as the final tie-break, for a world
 *      essence with no surviving in-system member at all. It is the one order-dependence left, it
 *      is reachable only for an essence the corpus can say nothing else about, and — like
 *      `1.30.0`'s own declared corpus-order exception — every id it decides is REPORTED by name.
 *
 * THE PARTITION ITSELF IS PERMUTATION-INVARIANT: it is keyed on canonicalised content, so a
 * shuffled `entities` array produces a set-equal partition. Only step 3 sees array order.
 *
 * ## The map, and its THREE refusal invariants (`#### D4`)
 *
 *   - **DISJOINTNESS** — the map's image must not intersect its key set, or a single simultaneous
 *     lookup is not idempotent and a second application re-keys a re-keyed id.
 *   - **OUTPUT UNIQUENESS** — the ids a `(system, 'essences')` pair emits must be unique.
 *     `_normalizeEssenceDefinition` uniquifies IDS but does NOT enforce NAME uniqueness — only the
 *     UI store does, via `_essenceNameTaken` — so an imported or hand-edited corpus can legally
 *     hold two equivalent same-name essences inside ONE system, and merging them collides.
 *   - **MEMBERSHIP-KEY UNIQUENESS**, and it is a POST-CONDITION rather than a pre-condition. The
 *     first two are evaluated over `systems[].essenceDefinitions` — that is what `1.30.0`'s
 *     `findRefusals` reads — so NEITHER can see a world essence holding a membership record for a
 *     system with NO in-system definition row. Merging two of those collides
 *     `membershipKey(survivorId, systemId)`, and the loser's record is silently last-wins:
 *     that system's authored overrides vanish with no refusal and no report. So the rebuilt
 *     membership keys are checked directly, and a collision refuses with
 *     `membershipKeyCollision`.
 *
 * A failing group is REFUSED ENTIRELY — no merge, no retirement, no map entry — and reported.
 *
 * **NO FIXED POINT IS NEEDED, AND THAT IS ASSERTED RATHER THAN ASSUMED.** `1.30.0` iterates
 * because refusing a `(system, entityType)` pair removes definitions from groups and can re-elect
 * another system's identity donor. Here election is over WORLD essences, a refusal removes a WHOLE
 * group, and every refusal is attributable to exactly one group, so removing one cannot create a
 * new one. The derivation is still run as a bounded loop whose SECOND iteration is the assertion:
 * on every input this pass can construct it finds nothing, and if it ever did, the group would be
 * refused rather than shipped.
 *
 * ## The report names things (`#### D9`)
 *
 * EVERY REPORT LEG CARRIES A `name`, not only the two keyed by essence id. `mergedGroups` and
 * `refusals` carry the SURVIVOR's display name, `declined` and `orphaned` carry the essence's own,
 * and all four take it from the STORED record rather than from the canonical fold — the canonical
 * name decides equality, and a GM reads the name. See {@link displayNameOf} for why the producer
 * owns this rather than the notice that renders it.
 *
 * ## The tombstone leg (`#### D12`)
 *
 * `retired` is why a merged id can never come back. `mintEssenceId` suffixes collisions against
 * the LIVE roster ONLY, and the create path passes a fixed placeholder name, so the shipped id
 * sequence is `new-essence`, `new-essence-2`, … — dense and FULLY RECLAIMABLE the moment a hole
 * opens in it. A reissued id would turn a deliberately-unremapped
 * `flags.fabricate.fabricate.essences` override key from a reference that contributes NOTHING into
 * one that contributes the WRONG essence, on an actor nobody edited. The leg is never cleared.
 *
 * It also snapshots the four identity fields the merge destroys — through `1.30.0`'s own
 * {@link identityOf}, so there is ONE list of them and not two — which are otherwise gone the
 * instant the loser entity is deleted and a GM undoing a bad merge has nothing to restore from.
 */

import { resolveEssence } from '../systems/essenceScope.js';
import { membershipKey } from '../systems/scopedDefinitions.js';
import { subKeyEntries } from '../systems/scopedDefinitionStore.js';

import { isPlainObject } from './migrationHelpers.js';
import { isWorldAddressable } from './worldScopeDefaults.js';
import {
  ENTITY_TYPE_FIELDS,
  ESSENCE_EFFECT_SOURCE_FIELDS,
  identityOf,
} from './worldScopeEntityGrouping.js';

/** The `craftingSystem` array essences are stored under, read from the ONE list that names it. */
const ESSENCE_DEFINITIONS_FIELD = ENTITY_TYPE_FIELDS.essences;

/** The entity-type leg every map this module emits is written under. */
const ESSENCES = 'essences';

/**
 * The fallback stem `mintEssenceId` uses for an empty or wholly non-alphanumeric name.
 *
 * @type {string}
 */
const FALLBACK_SLUG_STEM = 'essence';

/**
 * Every reason this pass can refuse a merge group, so a caller matches on a shared token rather
 * than on a string literal it spelled itself.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ESSENCE_MERGE_REFUSAL_REASONS = Object.freeze({
  unresolvedEffectSourceComponent: 'unresolvedEffectSourceComponent',
  nonDisjointMap: 'nonDisjointMap',
  outputIdCollision: 'outputIdCollision',
  membershipKeyCollision: 'membershipKeyCollision',
});

/**
 * Every reason this pass can decline a world essence's candidacy.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ESSENCE_DECLINE_REASONS = Object.freeze({
  sectionDisagreement: 'sectionDisagreement',
  uncanonicalisableKey: 'uncanonicalisableKey',
});

/**
 * The answer a canonicaliser gives for a value NO WRITER PRODUCES and no reading of which is safe.
 *
 * It exists so totality does not become a silent equality claim. The alternative — folding junk
 * into the `null` branch — would make a hand-edited `effectSource: "Item.abc"` compare EQUAL to
 * an essence with no source at all and merge the two. A world essence carrying one is DECLINED
 * instead and left exactly as it is, which is the conservative answer and the only one that
 * cannot lose data.
 */
const UNCANONICALISABLE = Symbol('uncanonicalisable');

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// The canonicalisers (`#### D1`)
// ---------------------------------------------------------------------------

/**
 * The case-folded comparison key for an essence NAME, or {@link UNCANONICALISABLE}.
 *
 * `toLowerCase` rather than `toLocaleLowerCase`, for TWO independent reasons that happen to agree.
 * The authoring guard this key exists to match — `adminStore._essenceNameKey` — spells it
 * `toLowerCase`, and so does `mintEssenceId`'s stem derivation; and a locale-sensitive fold would
 * make a MIGRATION'S answer depend on the host's locale, so the same world would merge differently
 * on a Turkish client (where `I` folds to `ı`) than on an English one. A migration whose output is
 * not fully determined by its input is not re-runnable, which is the contract at the top of this
 * file.
 *
 * An EMPTY name is uncanonicalisable rather than a key of its own: two essences named nothing are
 * not provably the same essence, and merging them would be a silent irreversible content change
 * made on a guess — `1.30.0`'s own rule for two unlinked definitions, applied here.
 *
 * @param {unknown} value
 * @returns {string|symbol}
 */
function canonicalEssenceName(value) {
  if (value !== null && value !== undefined && typeof value !== 'string') return UNCANONICALISABLE;
  const name = String(value ?? '')
    .trim()
    .toLowerCase();
  return name === '' ? UNCANONICALISABLE : name;
}

/**
 * The canonical `macro` section value: a trimmed document UUID or `null`.
 *
 * `''` READS AS `null`, because every reader of the section treats an empty string and an absent
 * macro identically — neither runs anything — so the difference is exactly the "irrelevant
 * metadata difference" this pass is asked to see through.
 *
 * @param {unknown} value The RESOLVED section value.
 * @returns {string|null|symbol}
 */
function canonicalEssenceMacro(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return UNCANONICALISABLE;
  return value.trim() || null;
}

/**
 * The canonical `effectSource` section value: the three-field block in a FIXED key order, each
 * value trimmed-or-`null`.
 *
 * `{}`, an ABSENT block and an ALL-`null` block therefore all canonicalise identically, which is
 * the whole point: `_normalizeEssenceDefinition` emits all three fields defaulted to `null`,
 * `buildMembershipRecord` writes only the fields the record actually carried, and a world default
 * omits an unauthored one entirely. Three writers, three shapes, ONE behaviour.
 *
 * @param {unknown} value The RESOLVED section value.
 * @returns {Record<string, string|null>|symbol}
 */
function canonicalEssenceEffectSource(value) {
  if (value === null || value === undefined) return blankEffectSource();
  if (!isPlainObject(value)) return UNCANONICALISABLE;
  const block = {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
    const raw = value[field];
    if (raw === null || raw === undefined) {
      block[field] = null;
      continue;
    }
    if (typeof raw !== 'string') return UNCANONICALISABLE;
    block[field] = raw.trim() || null;
  }
  return block;
}

/** The all-`null` block an absent `effectSource` canonicalises to. */
function blankEffectSource() {
  const block = {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) block[field] = null;
  return block;
}

/**
 * The equivalence key for one canonicalised triple.
 *
 * Serialised as an ARRAY rather than an object so the key never depends on property enumeration
 * order, and the block's fields are emitted through {@link ESSENCE_EFFECT_SOURCE_FIELDS} so the
 * order is the one shared list's.
 *
 * @param {string} name
 * @param {string|null} macro
 * @param {Record<string, string|null>} effectSource
 * @returns {string}
 */
function equivalenceKey(name, macro, effectSource) {
  return JSON.stringify([
    name,
    macro,
    ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => effectSource[field]),
  ]);
}

/**
 * The id stem the world catalogue would mint for a name.
 *
 * **THE DUPLICATION OF `mintEssenceId`'S STEM DERIVATION IS DELIBERATE.** That function lives in
 * `src/ui/svelte/apps/manager/scoped/essenceScoped.js`, and a startup migration must not import a
 * UI leaf: it would drag the Svelte app's import graph into a code path that runs before any
 * application exists, and it would make the data layer depend on the presentation layer in the one
 * direction this repository's boundaries never run. Only the STEM is duplicated — not the
 * collision-suffixing, which is the part that reads the live roster — and the two are pinned
 * together by a test that asserts this function agrees with `mintEssenceId` on a shared name set.
 * The spelling differs in one place: `unicorn/prefer-string-replace-all` is on for `src/migration`
 * and off for `src/ui`, so this reads `replaceAll` where the original reads `replace`. The two are
 * identical for a global-flagged pattern, and the pin test is what says so rather than this
 * sentence.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function essenceSlugStem(name) {
  return (
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '') || FALLBACK_SLUG_STEM
  );
}

/**
 * How slug-shaped an id is for a given name: `0` for the bare stem, `1` for the `<stem>-<n>` form
 * `mintEssenceId` produces on a collision, `2` for anything else.
 *
 * Three ranks rather than a boolean because both shapes are READABLE and the bare stem is the more
 * readable of the two, so a group holding `iron` and `iron-2` retires `iron-2` rather than letting
 * corpus position decide between two equally-good ids.
 *
 * @param {string} id
 * @param {string} stem
 * @returns {number}
 */
function slugRank(id, stem) {
  if (id === stem) return 0;
  const suffix = id.startsWith(`${stem}-`) ? id.slice(stem.length + 1) : '';
  if (suffix !== '' && /^\d+$/.test(suffix)) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Reading the inputs
// ---------------------------------------------------------------------------

/**
 * The corpus facts election and the refusal invariants need: system age, each system's essence
 * definition rows, and where each id first appears.
 *
 * A DUPLICATE SYSTEM ID keeps the FIRST system's age and ACCUMULATES both systems' rows. First-wins
 * matches every other de-duplication in this family, and accumulating the rows is the strictly
 * safer half: the refusal invariants must see every row that pair emits, and dropping the second
 * system's rows would hide a collision rather than refuse it.
 *
 * @param {unknown} systems The raw `craftingSystems` setting.
 * @returns {{order: Map<string, number>, rowsBySystem: Map<string, Array<{id: string,
 *   index: number}>>, positionById: Map<string, {systemIndex: number, index: number}>,
 *   systemsByRowId: Map<string, Set<string>>}}
 */
function readSystemsCorpus(systems) {
  const order = new Map();
  const rowsBySystem = new Map();
  const positionById = new Map();
  const systemsByRowId = new Map();
  for (const [systemIndex, system] of arrayOf(systems).entries()) {
    if (!isPlainObject(system)) continue;
    const systemId = trimmedString(system.id);
    if (!systemId) continue;
    if (!order.has(systemId)) order.set(systemId, systemIndex);
    if (!rowsBySystem.has(systemId)) rowsBySystem.set(systemId, []);
    const rows = rowsBySystem.get(systemId);
    for (const [index, record] of arrayOf(system[ESSENCE_DEFINITIONS_FIELD]).entries()) {
      if (!isPlainObject(record)) continue;
      const id = trimmedString(record.id);
      if (!id) continue;
      rows.push({ id, index });
      if (!positionById.has(id)) positionById.set(id, { systemIndex, index });
      if (!systemsByRowId.has(id)) systemsByRowId.set(id, new Set());
      systemsByRowId.get(id).add(systemId);
    }
  }
  return { order, rowsBySystem, positionById, systemsByRowId };
}

/**
 * The essence scope payload, read TOLERANTLY of both the persisted MAP shape and the published
 * ARRAY shape through the store's own {@link subKeyEntries}, and de-duplicated exactly as the
 * shipped normalizers de-duplicate: entities first-wins on id, memberships first-wins on the
 * `(entityId, systemId)` pair.
 *
 * EVERY KEY IS DERIVED FROM THE RECORD, never trusted from the map key it was filed under, for the
 * same reason `ScopedDefinitionStore` re-derives it: a hand-edited or imported payload whose key
 * and record disagree must not produce a lookup that finds the wrong record.
 *
 * A membership record is LIVE when its entity is on the roster AND its system is in the corpus.
 * A record naming a deleted system is a leftover that resolves for nobody, so counting it would
 * let a wholly dead essence look like a live one at the zero point.
 *
 * @param {unknown} essenceScope
 * @param {Map<string, number>} systemOrder
 * @returns {{entities: Array<{id: string, arrayIndex: number, record: object}>,
 *   defaultsById: Map<string, object>, membershipsByEntity: Map<string, Array<object>>}}
 */
function readEssenceScope(essenceScope, systemOrder) {
  const source = isPlainObject(essenceScope) ? essenceScope : {};
  const entities = [];
  const byId = new Set();
  for (const entry of subKeyEntries(source.entities)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (!id || byId.has(id)) continue;
    byId.add(id);
    entities.push({ id, arrayIndex: entities.length, record: entry });
  }

  const defaultsById = new Map();
  for (const entry of subKeyEntries(source.defaults)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (!id || defaultsById.has(id)) continue;
    defaultsById.set(id, entry);
  }

  const membershipsByEntity = new Map();
  const seen = new Set();
  for (const entry of subKeyEntries(source.membership)) {
    if (!isPlainObject(entry)) continue;
    const entityId = trimmedString(entry.entityId);
    const systemId = trimmedString(entry.systemId);
    if (!entityId || !systemId) continue;
    if (!byId.has(entityId) || !systemOrder.has(systemId)) continue;
    const key = membershipKey(entityId, systemId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!membershipsByEntity.has(entityId)) membershipsByEntity.set(entityId, []);
    membershipsByEntity.get(entityId).push(entry);
  }
  // Sorted by SYSTEM AGE so every downstream list — the unanimity walk, the reported system ids,
  // the tombstone's `systems` — is ordered by a corpus fact rather than by payload insertion.
  for (const records of membershipsByEntity.values()) {
    records.sort(
      (left, right) =>
        systemOrder.get(trimmedString(left.systemId)) -
        systemOrder.get(trimmedString(right.systemId))
    );
  }
  return { entities, defaultsById, membershipsByEntity };
}

/**
 * The component-scope facts the false-merge gate needs: the world component roster, and the
 * `(componentId, systemId)` membership keys that prove a system's components were LIFTED rather
 * than refused.
 *
 * @param {unknown} componentScope
 * @returns {{ids: Set<string>, memberships: Set<string>}}
 */
function readComponentScope(componentScope) {
  const source = isPlainObject(componentScope) ? componentScope : {};
  const ids = new Set();
  for (const entry of subKeyEntries(source.entities)) {
    if (!isPlainObject(entry)) continue;
    const id = trimmedString(entry.id);
    if (id) ids.add(id);
  }
  const memberships = new Set();
  for (const entry of subKeyEntries(source.membership)) {
    if (!isPlainObject(entry)) continue;
    const entityId = trimmedString(entry.entityId);
    const systemId = trimmedString(entry.systemId);
    if (entityId && systemId) memberships.add(membershipKey(entityId, systemId));
  }
  return { ids, memberships };
}

// ---------------------------------------------------------------------------
// Candidacy (`#### D2`)
// ---------------------------------------------------------------------------

/**
 * The resolved, canonicalised `(macro, effectSource)` pair one membership record answers.
 *
 * @param {object|null} worldDefault
 * @param {object} membership
 * @returns {{macro: string|null|symbol, effectSource: object|symbol}}
 */
function canonicalSectionsOf(worldDefault, membership) {
  const resolved = resolveEssence(worldDefault, membership);
  return {
    macro: canonicalEssenceMacro(resolved.macro),
    effectSource: canonicalEssenceEffectSource(resolved.effectSource),
  };
}

/**
 * Whether two canonicalised section values are equal.
 *
 * The block is compared through its serialised form so the comparison cannot depend on key
 * enumeration order — which is exactly the metadata difference this pass exists to see through.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function sectionsEqual(left, right) {
  if (left === right) return true;
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return (
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => left[field])) ===
    JSON.stringify(ESSENCE_EFFECT_SOURCE_FIELDS.map((field) => right[field]))
  );
}

/**
 * The DISPLAY name one world essence record carries, as a fragment to spread into a report entry.
 *
 * **EVERY REPORT LEG CARRIES A NAME, AND IT IS THE STORED ONE — never the canonical fold.** The
 * canonical name decides EQUALITY and is trimmed and case-folded for that job alone; a GM reads
 * the name. `## World scope notices` requirement 13 binds the merge notice to name a group by NAME
 * rather than by id pair, and it binds for a concrete reason: most ids this pass retires are
 * `crypto.randomUUID()` output, and the channel is a corner toast, so an enumeration of UUID pairs
 * is unreadable exactly where readability is the whole point.
 *
 * **THE PRODUCER OWNS IT.** A consumer resolving a name from `retired` — or worse, falling back to
 * the raw id — would be a second implementation of "what is this group called", and the two drift
 * the first time this shape changes. So the name travels with the entry.
 *
 * ABSENCE-PRESERVING, and the rule is {@link identityOf}'s verbatim: an `undefined` name emits NO
 * KEY, while a stored `null` is preserved as `null`. A world essence that never carried a name
 * must not gain a minted one here — a report is a description of what is, and the notice lane's
 * own fallback is the right place to decide what to print for a nameless essence.
 *
 * @param {object|undefined} record The world essence's roster entry.
 * @returns {{name?: unknown}}
 */
function displayNameOf(record) {
  const name = record?.name;
  return name === undefined ? {} : { name };
}

/**
 * Split the world roster into merge candidates, declined essences and orphans.
 *
 * @param {object} scope The read essence scope.
 * @param {object} corpus The read systems corpus.
 * @returns {{candidates: Array<object>, declined: Array<object>, orphaned: Array<object>}}
 */
function classifyCandidates(scope, corpus) {
  const candidates = [];
  const declined = [];
  const orphaned = [];
  const decline = (entity, sections, reason) => {
    declined.push({
      essenceId: entity.id,
      ...displayNameOf(entity.record),
      sections,
      reason,
    });
  };

  for (const entity of scope.entities) {
    const members = scope.membershipsByEntity.get(entity.id) ?? [];
    // THE ZERO POINT, tested explicitly: unanimity over no members is vacuously true, so without
    // this line an essence nobody resolves would be the most mergeable essence in the world.
    if (members.length === 0) {
      orphaned.push({ essenceId: entity.id, ...displayNameOf(entity.record) });
      continue;
    }

    const name = canonicalEssenceName(entity.record?.name);
    if (name === UNCANONICALISABLE) {
      decline(entity, ['name'], ESSENCE_DECLINE_REASONS.uncanonicalisableKey);
      continue;
    }

    const worldDefault = scope.defaultsById.get(entity.id) ?? null;
    const first = canonicalSectionsOf(worldDefault, members[0]);
    const unreadable = [];
    const disagreed = [];
    for (const member of members) {
      const sections = canonicalSectionsOf(worldDefault, member);
      for (const section of ['macro', 'effectSource']) {
        if (sections[section] === UNCANONICALISABLE) {
          if (!unreadable.includes(section)) unreadable.push(section);
          continue;
        }
        if (!sectionsEqual(sections[section], first[section]) && !disagreed.includes(section)) {
          disagreed.push(section);
        }
      }
    }

    if (unreadable.length > 0) {
      decline(entity, unreadable, ESSENCE_DECLINE_REASONS.uncanonicalisableKey);
      continue;
    }
    if (disagreed.length > 0) {
      decline(entity, disagreed, ESSENCE_DECLINE_REASONS.sectionDisagreement);
      continue;
    }

    const stem = essenceSlugStem(name);
    candidates.push({
      id: entity.id,
      record: entity.record,
      arrayIndex: entity.arrayIndex,
      key: equivalenceKey(name, first.macro, first.effectSource),
      effectSource: first.effectSource,
      slugRank: slugRank(entity.id, stem),
      corpusPosition: corpus.positionById.get(entity.id) ?? null,
      memberSystemIds: members.map((member) => trimmedString(member.systemId)),
    });
  }

  return { candidates, declined, orphaned };
}

// ---------------------------------------------------------------------------
// Election (`#### D3`)
// ---------------------------------------------------------------------------

/**
 * The election order: slug preference, then corpus position, then array position.
 *
 * A candidate with NO corpus position sorts after every candidate that has one, because step 3 is
 * reached only "for a world essence with no surviving in-system member at all".
 *
 * @param {object} left
 * @param {object} right
 * @returns {number}
 */
function byElectionOrder(left, right) {
  if (left.slugRank !== right.slugRank) return left.slugRank - right.slugRank;
  const leftPosition = left.corpusPosition;
  const rightPosition = right.corpusPosition;
  if (leftPosition && !rightPosition) return -1;
  if (!leftPosition && rightPosition) return 1;
  if (leftPosition && rightPosition) {
    if (leftPosition.systemIndex !== rightPosition.systemIndex) {
      return leftPosition.systemIndex - rightPosition.systemIndex;
    }
    if (leftPosition.index !== rightPosition.index) return leftPosition.index - rightPosition.index;
  }
  return left.arrayIndex - right.arrayIndex;
}

/**
 * Partition the candidates into equivalence groups, each ordered so the SURVIVOR is first.
 *
 * The candidates are sorted ONCE by the election order and then bucketed, so `group[0]` is the
 * elected survivor by construction — `1.30.0`'s donor-is-first idiom — and the GROUP order is the
 * order their survivors were elected in, which is itself deterministic.
 *
 * @param {Array<object>} candidates
 * @returns {Array<Array<object>>}
 */
function partitionCandidates(candidates) {
  const ordered = [...candidates].sort(byElectionOrder);
  const groups = new Map();
  for (const candidate of ordered) {
    if (!groups.has(candidate.key)) groups.set(candidate.key, []);
    groups.get(candidate.key).push(candidate);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

// ---------------------------------------------------------------------------
// The map and its refusals (`#### D4`)
// ---------------------------------------------------------------------------

/**
 * Every system one candidate is PRESENT in: the systems it holds a live membership record for,
 * plus the systems whose `essenceDefinitions` carry its id — in corpus age order.
 *
 * PRESENCE, NOT REACHABILITY, and the narrowness is the decision. A system that is not a member
 * and carries no row may still name this id somewhere — in a component's `essences` map, say —
 * but that reference resolves to NOTHING today, and rewriting it would convert a dangling
 * reference into a live contribution of the survivor's weight. That is precisely the failure the
 * tombstone leg exists to prevent, so this pass must not commit it itself.
 *
 * @param {object} candidate
 * @param {object} corpus
 * @returns {string[]}
 */
function presenceSystemsOf(candidate, corpus) {
  const present = new Set(candidate.memberSystemIds);
  for (const systemId of corpus.systemsByRowId.get(candidate.id) ?? []) present.add(systemId);
  return [...present].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

/**
 * The per-system merge map one set of accepted groups produces.
 *
 * @param {Array<Array<object>>} groups
 * @param {object} corpus
 * @returns {{[systemId: string]: {essences: {[loserId: string]: string}}}}
 */
function buildMergeMap(groups, corpus) {
  const mergeMap = {};
  for (const group of groups) {
    const [survivor, ...losers] = group;
    for (const loser of losers) {
      for (const systemId of presenceSystemsOf(loser, corpus)) {
        const perSystem = (mergeMap[systemId] ??= {});
        const perType = (perSystem[ESSENCES] ??= {});
        perType[loser.id] = survivor.id;
      }
    }
  }
  return mergeMap;
}

/**
 * The systems in which a group's canonical `effectSource` names a component id that is NOT a world
 * component id for that system — the false-merge trap of `#### D1`.
 *
 * The check runs over `sourceComponentId` AND `associatedSystemItemId`, which are the TWO
 * SPELLINGS OF ONE SYSTEM-SCOPED ID (`_normalizeEssenceDefinition` writes the second as a
 * transitional alias of the first). `sourceItemUuid` is excluded because it holds a document UUID,
 * which is globally addressable and carries no system scope to mis-compare.
 *
 * @param {Array<object>} group
 * @param {{ids: Set<string>, memberships: Set<string>}} worldComponents
 * @param {object} corpus
 * @returns {string[]} the offending system ids, in corpus age order.
 */
function unresolvedEffectSourceSystems(group, worldComponents, corpus) {
  const references = ['sourceComponentId', 'associatedSystemItemId']
    .map((field) => group[0].effectSource[field])
    .filter((value) => trimmedString(value));
  if (references.length === 0) return [];

  const offending = new Set();
  for (const candidate of group) {
    for (const systemId of candidate.memberSystemIds) {
      for (const reference of references) {
        if (namesWorldComponentIn(reference, systemId, worldComponents)) continue;
        offending.add(systemId);
      }
    }
  }
  return [...offending].sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
}

/**
 * Whether one component reference is addressable AT WORLD SCOPE from one system.
 *
 * Two conditions, and the second is the one `1.30.0`'s own addressability check does not make:
 * the id must be on the world component roster, AND this system must hold a membership record for
 * it. A `(system, 'components')` pair `1.30.0` REFUSED wrote no membership record at all, so its
 * essences still carry raw system-local ids — and one of those can coincide with an unrelated
 * world component id minted from another system.
 *
 * @param {string} reference
 * @param {string} systemId
 * @param {{ids: Set<string>, memberships: Set<string>}} worldComponents
 * @returns {boolean}
 */
function namesWorldComponentIn(reference, systemId, worldComponents) {
  if (!isWorldAddressable(reference, worldComponents.ids)) return false;
  // `isWorldAddressable` passes a DOCUMENT UUID unconditionally, so anything that got past it
  // without being on the roster is globally addressable and carries no system scope.
  if (!worldComponents.ids.has(reference)) return true;
  return worldComponents.memberships.has(membershipKey(reference, systemId));
}

/**
 * The groups whose merge map would break DISJOINTNESS.
 *
 * **THIS CANNOT CURRENTLY ANSWER ANYTHING, AND SAYING SO IS THE POINT.** Groups partition the
 * world roster, so every id is a survivor or a loser of exactly ONE group and no survivor is ever
 * a key. The check is kept because that argument rests on the partition, and a future change that
 * elected per SYSTEM rather than per WORLD ESSENCE — or that let a group be re-elected after a
 * refusal, as `1.30.0` does — would break it silently: a non-disjoint map is not idempotent, and
 * applying it twice re-keys a re-keyed id with no error anywhere.
 *
 * @param {object} mergeMap
 * @param {Array<Array<object>>} groups
 * @returns {Array<{group: Array<object>, systemIds: string[], reason: string}>}
 */
function findNonDisjointGroups(mergeMap, groups) {
  const findings = new Map();
  for (const [systemId, legs] of Object.entries(mergeMap)) {
    const map = legs[ESSENCES] ?? {};
    const keys = new Set(Object.keys(map));
    for (const survivorId of Object.values(map)) {
      if (!keys.has(survivorId)) continue;
      for (const group of groups) {
        if (group.every((candidate) => candidate.id !== survivorId)) continue;
        if (!findings.has(group)) findings.set(group, new Set());
        findings.get(group).add(systemId);
      }
    }
  }
  return [...findings].map(([group, systemIds]) => ({
    group,
    systemIds: [...systemIds],
    reason: ESSENCE_MERGE_REFUSAL_REASONS.nonDisjointMap,
  }));
}

/**
 * The groups whose merge map would make a `(system, 'essences')` pair emit a DUPLICATE id.
 *
 * Evaluated over `systems[].essenceDefinitions` exactly as `1.30.0`'s `findRefusals` evaluates it,
 * because that array is what both index builders read and a duplicate there is silently last-wins:
 * one definition simply becomes unreachable, with no error.
 *
 * A NATIVE duplicate the corpus already carried is judged exactly as `1.30.0` judges one. When a
 * group OWNS one of the colliding ids, that group is refused — `1.30.0`'s reason is that "such a
 * system already has an unreachable definition and must not have a lift layered on top of it", and
 * a merge INTO an id that is already duplicated is the same layering. When NO group owns it, the
 * collision is left alone: this pass did not cause it, and refusing an unrelated merge would not
 * fix it.
 *
 * @param {object} mergeMap
 * @param {Array<Array<object>>} groups
 * @param {object} corpus
 * @returns {Array<{group: Array<object>, systemIds: string[], reason: string}>}
 */
function findOutputCollisionGroups(mergeMap, groups, corpus) {
  const findings = new Map();
  for (const [systemId, rows] of corpus.rowsBySystem) {
    const map = mergeMap[systemId]?.[ESSENCES] ?? {};
    const sourcesByOutput = new Map();
    for (const row of rows) {
      const output = map[row.id] ?? row.id;
      if (!sourcesByOutput.has(output)) sourcesByOutput.set(output, []);
      sourcesByOutput.get(output).push(row.id);
    }
    for (const [output, sources] of sourcesByOutput) {
      if (sources.length < 2) continue;
      const involved = new Set([output, ...sources]);
      for (const group of groups) {
        if (group.every((candidate) => !involved.has(candidate.id))) continue;
        if (!findings.has(group)) findings.set(group, new Set());
        findings.get(group).add(systemId);
      }
    }
  }
  return [...findings].map(([group, systemIds]) => ({
    group,
    systemIds: [...systemIds],
    reason: ESSENCE_MERGE_REFUSAL_REASONS.outputIdCollision,
  }));
}

/**
 * The groups whose merge would collide two MEMBERSHIP KEYS.
 *
 * A POST-CONDITION over the REBUILT keys, and it is the only one of the three that can see the
 * failure it describes. The other two read `systems[].essenceDefinitions`, so a world essence
 * holding a membership record for a system with NO in-system definition row is invisible to both —
 * and merging two of those collides `membershipKey(survivorId, systemId)`, dropping the loser's
 * authored overrides for that system with no refusal and no report. That shape is not exotic: a
 * membership record outlives the in-system row whenever a GM deletes the row without leaving the
 * system, and copy-import can append one directly.
 *
 * @param {Array<Array<object>>} groups
 * @param {object} corpus
 * @returns {Array<{group: Array<object>, systemIds: string[], reason: string}>}
 */
function findMembershipCollisionGroups(groups, corpus) {
  const findings = [];
  for (const group of groups) {
    const counts = new Map();
    for (const candidate of group) {
      for (const systemId of candidate.memberSystemIds) {
        counts.set(systemId, (counts.get(systemId) ?? 0) + 1);
      }
    }
    const systemIds = [...counts]
      .filter(([, count]) => count > 1)
      .map(([systemId]) => systemId)
      .sort((left, right) => corpus.order.get(left) - corpus.order.get(right));
    if (systemIds.length > 0) {
      findings.push({
        group,
        systemIds,
        reason: ESSENCE_MERGE_REFUSAL_REASONS.membershipKeyCollision,
      });
    }
  }
  return findings;
}

/**
 * Every refusal one candidate map exhibits, in a FIXED reason order so the report is stable.
 *
 * @param {object} mergeMap
 * @param {Array<Array<object>>} groups
 * @param {object} corpus
 * @returns {Array<{group: Array<object>, systemIds: string[], reason: string}>}
 */
function findGroupRefusals(mergeMap, groups, corpus) {
  return [
    ...findNonDisjointGroups(mergeMap, groups),
    ...findOutputCollisionGroups(mergeMap, groups, corpus),
    ...findMembershipCollisionGroups(groups, corpus),
  ];
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Decide which WORLD ESSENCES are semantically equivalent, which survives each merge, which ids
 * every system must rewrite, and what each retired id carried.
 *
 * TOTAL AND NON-THROWING, and fully determined by its input: a re-run on the same corpus produces
 * a byte-identical answer. It MUTATES NOTHING — neither its arguments nor the records inside them
 * — and applies nothing; the migration that consumes `mergeMap` and `retired` owns every write.
 *
 * @param {object} [input]
 * @param {unknown} [input.systems] The raw `craftingSystems` setting.
 * @param {unknown} [input.essenceScope] The persisted essence scope payload
 *   (`{entities, defaults, membership}`), in either the stored MAP or the published ARRAY shape.
 * @param {unknown} [input.componentScope] The persisted component scope payload, read for the
 *   world component roster and its membership keys.
 * @returns {{
 *   mergeMap: {[systemId: string]: {essences: {[loserId: string]: string}}},
 *   retired: {[loserId: string]: {name?: unknown, icon?: unknown, colorToken?: unknown,
 *     description?: unknown, systems: string[]}},
 *   mergedGroups: Array<{survivorId: string, name?: unknown, loserIds: string[],
 *     systemIds: string[]}>,
 *   refusals: Array<{survivorId: string, name?: unknown, loserIds: string[],
 *     systemIds: string[], reason: string}>,
 *   declined: Array<{essenceId: string, name?: unknown, sections: string[], reason: string}>,
 *   orphaned: Array<{essenceId: string, name?: unknown}>
 * }}
 */
export function buildWorldEssenceEquivalence({ systems, essenceScope, componentScope } = {}) {
  const corpus = readSystemsCorpus(systems);
  const scope = readEssenceScope(essenceScope, corpus.order);
  const worldComponents = readComponentScope(componentScope);

  const { candidates, declined, orphaned } = classifyCandidates(scope, corpus);
  const allGroups = partitionCandidates(candidates);

  const refusals = [];
  const refused = new Set();
  const recordRefusal = (group, systemIds, reason) => {
    if (refused.has(group)) return;
    refused.add(group);
    refusals.push({
      survivorId: group[0].id,
      // The SURVIVOR's display name, because a refusal names the same group a merge would have.
      ...displayNameOf(group[0].record),
      loserIds: group.slice(1).map((candidate) => candidate.id),
      systemIds,
      reason,
    });
  };

  // THE FALSE-MERGE TRAP first, because it is a candidacy gate rather than a map invariant: a
  // group it removes never contributes a map entry for the other three to read.
  for (const group of allGroups) {
    const offending = unresolvedEffectSourceSystems(group, worldComponents, corpus);
    if (offending.length > 0) {
      recordRefusal(
        group,
        offending,
        ESSENCE_MERGE_REFUSAL_REASONS.unresolvedEffectSourceComponent
      );
    }
  }

  // The bound is stated as a literal guard rather than trusted, because a migration that spins is
  // indistinguishable from a hung world. In practice this settles on the FIRST pass and the second
  // is the assertion described in the module note: every refusal is attributable to exactly one
  // group, so removing a group cannot create a new refusal for another.
  const bound = allGroups.length + 1;
  let accepted = allGroups.filter((group) => !refused.has(group));
  let mergeMap = buildMergeMap(accepted, corpus);
  for (let iteration = 0; iteration <= bound; iteration += 1) {
    const found = findGroupRefusals(mergeMap, accepted, corpus).filter(
      (finding) => !refused.has(finding.group)
    );
    if (found.length === 0) break;
    for (const finding of found) recordRefusal(finding.group, finding.systemIds, finding.reason);
    accepted = accepted.filter((group) => !refused.has(group));
    mergeMap = buildMergeMap(accepted, corpus);
  }

  const mergedGroups = [];
  const retired = {};
  for (const group of accepted) {
    const [survivor, ...losers] = group;
    const systemIds = new Set();
    for (const candidate of group) {
      for (const systemId of presenceSystemsOf(candidate, corpus)) systemIds.add(systemId);
    }
    mergedGroups.push({
      survivorId: survivor.id,
      // The SURVIVOR's display name: it is the name the merged essence will still be called, so it
      // is the one a GM can act on. Every loser's own name is preserved in `retired`.
      ...displayNameOf(survivor.record),
      loserIds: losers.map((loser) => loser.id),
      systemIds: [...systemIds].sort(
        (left, right) => corpus.order.get(left) - corpus.order.get(right)
      ),
    });
    for (const loser of losers) {
      // `identityOf` is ABSENCE-PRESERVING, which is right for a tombstone: it records what the
      // retired entity CARRIED, and a field it never carried is not one a restore should mint.
      retired[loser.id] = {
        ...identityOf(loser.record, ESSENCES),
        systems: presenceSystemsOf(loser, corpus),
      };
    }
  }

  return { mergeMap, retired, mergedGroups, refusals, declined, orphaned };
}

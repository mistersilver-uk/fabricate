/**
 * Essence-only world-scope presentation (issue 1372, epic 1357): the three-state per-system cell,
 * the world-default inherit line, the per-section note, and the world-addressability filter.
 */

/** The three states one `(essence, system)` cell can be in, in the order a legend lists them. */
export const ESSENCE_SYSTEM_STATES = Object.freeze(['absent', 'disabled', 'enabled']);

/**
 * The state of one `(essence, system)` cell. READ `member` FIRST: `buildSystemRow` answers
 * `enabled: false` for a NON-member too, and only a disabled MEMBER has a toggle to act on.
 */
export function essenceSystemState(row) {
  if (row?.member !== true) return 'absent';
  return row?.enabled === true ? 'enabled' : 'disabled';
}

/** How many MEMBER systems inherit one section and how many override it; non-members have none. */
export function essenceInheritCounts(entry, section) {
  const members = Number(entry?.membershipCount) || 0;
  const inheriting = Math.min(members, Number(entry?.inheritCounts?.[section]) || 0);
  return { members, inheriting, overriding: Math.max(0, members - inheriting) };
}

/** The world-entry inherit line; the no-member case is its own sentence, never "0 of 0". */
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
 * The note under a system-scope inherit row: what the section resolves to today, and what the
 * switch beside it would change that to. The copy says "fall back", never "discard", because
 * `setSectionInheritance` RETAINS the dormant override; the clause is per-section because the
 * verb is — a macro is run and an effect source is used.
 */
export function essenceSectionNote({ inherited, worldName = '', section = '', format }) {
  const name = String(worldName || '').trim();
  if (inherited) {
    if (!name)
      return format(
        'FABRICATE.Admin.Manager.Scoped.Essence.NoteInheritingUnset',
        'The world default is unset, so this section resolves to nothing.',
        {}
      );
    const head = format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoteInheriting',
      'World default: {name}',
      { name }
    );
    const action = inheritActionClause(section, true, format);
    return action ? `${head}. ${action}` : head;
  }
  const fallbackName =
    name ||
    format('FABRICATE.Admin.Manager.Scoped.Essence.TheWorldDefault', 'the world default', {});
  const head = overrideHeadClause(section, format);
  const tail = format(
    'FABRICATE.Admin.Manager.Scoped.Essence.NoteOverriddenTail',
    'Turn off to fall back to {name}.',
    { name: fallbackName }
  );
  return `${head} ${tail}`;
}

/** The "turn it the other way" clause of an inherit note, or `''` for an unknown section. */
function inheritActionClause(section, inherited, format) {
  if (!inherited) return '';
  if (section === 'macro')
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoteInheritingMacroAction',
      'Turn on to run a different macro here.',
      {}
    );
  if (section === 'effectSource')
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoteInheritingSourceAction',
      'Turn on to use a different effect source here.',
      {}
    );
  return '';
}

/** The first clause of an OVERRIDDEN note: what this system resolves the section to today. */
function overrideHeadClause(section, format) {
  if (section === 'macro')
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoteOverriddenMacro',
      'This system uses its own macro.',
      {}
    );
  if (section === 'effectSource')
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.NoteOverriddenSource',
      'This system uses its own effect source.',
      {}
    );
  return format(
    'FABRICATE.Admin.Manager.Scoped.Essence.NoteOverriddenGeneric',
    'This system overrides the world default.',
    {}
  );
}

/** The bold head line of an inherit row: which way the switch is set, not the section's name. */
export function essenceInheritHeading({ inherited, systemName = '', format }) {
  if (inherited)
    return format(
      'FABRICATE.Admin.Manager.Scoped.Essence.HeadInheriting',
      'Inheriting the world default',
      {}
    );
  const system = String(systemName || '').trim();
  return system
    ? format('FABRICATE.Admin.Manager.Scoped.Essence.HeadOverriddenIn', 'Overridden for {system}', {
        system,
      })
    : format(
        'FABRICATE.Admin.Manager.Scoped.Essence.HeadOverridden',
        'Overridden for this system',
        {}
      );
}

/** The inspector's value suffix: where the value came from, which these screens are about. */
export function essenceValueSuffix(inherited, text) {
  return inherited
    ? text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixWorldDefault', 'world default')
    : text('FABRICATE.Admin.Manager.Scoped.Essence.SuffixOverridden', 'overridden here');
}

/**
 * Whether a string is a Foundry document UUID rather than a bare record id — a SHAPE test, since
 * resolving needs `await fromUuid`. A bare dotless token is system-local, which `### Essence
 * scope` requirement 5 bars from a world default.
 */
export function isDocumentUuid(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate === '' || !candidate.includes('.')) return false;
  const segments = candidate.split('.');
  if (candidate.startsWith('Compendium.')) return segments.length >= 4;
  if (segments.length % 2 !== 0) return false;
  // Every even-indexed segment is a document NAME and every odd one its id.
  return segments.every((segment, index) =>
    index % 2 === 0 ? /^[A-Z][A-Za-z]*$/.test(segment) : segment.length > 0
  );
}

/**
 * The colour caption: the token's display name plus the value the theme resolves it to. The hex
 * is READ from the live cascade, never written — this tree may carry no raw colour value in a
 * declaration or a comment (`theme-colour-contract.test.js` scans both), and a literal would go
 * stale on a theme switch. Resolved at `.fabricate`, where the tokens are declared.
 */
export function essenceColourCaption(token) {
  const label = essenceColourName(token);
  if (label === '') return '';
  const name = String(token ?? '').trim();
  const target = globalThis.document?.querySelector?.('.fabricate') ?? null;
  if (!target || typeof globalThis.getComputedStyle !== 'function') return label;
  let value = '';
  try {
    // Called on `globalThis`, never detached: a detached reference would throw, silently caught.
    value = globalThis.getComputedStyle(target).getPropertyValue(`--fab-tag-${name}`).trim();
  } catch {
    // A document that cannot be styled. The name alone is still true.
    return label;
  }
  return value ? `${label} \u00b7 ${value.toUpperCase()}` : label;
}

/** The display name of a `--fab-tag-*` colour token, with no hex. No literal, here or above. */
export function essenceColourName(token) {
  const name = String(token ?? '').trim();
  if (name === '') return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A display trim of a document-UUID prefix, not a resolution; a plain name is untouched. */
export function essenceShortValueName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!isDocumentUuid(name)) return name;
  const segments = name.split('.');
  return segments[segments.length - 1];
}

/** The referent an `effectSource` names. That section is a BLOCK, not the usual scalar. */
export function essenceEffectSourceReferent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return typeof value === 'string' ? value.trim() : '';
  }
  for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
    const referent = typeof value[field] === 'string' ? value[field].trim() : '';
    if (referent) return referent;
  }
  return '';
}

/** Whether one candidate referent may be written as a WORLD default `effectSource`. */
export function isWorldAddressableEffectSource(value, worldEntityIds = []) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate === '') return false;
  const known = worldEntityIds instanceof Set ? worldEntityIds : new Set(worldEntityIds);
  return known.has(candidate) || isDocumentUuid(candidate);
}

/** The id set behind a roster; a given Set is returned as-is, so callers must not write to it. */
function worldEntityIdSet(source) {
  if (source instanceof Set) return source;
  const ids = new Set();
  for (const entry of Array.isArray(source) ? source : []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (typeof id === 'string' && id !== '') ids.add(id);
  }
  return ids;
}

/**
 * The referents a WORLD-DEFAULTS `effectSource` picker may offer, and the enforcement point for
 * `### Essence scope` requirement 5: the store writes the section opaquely and the normalizer
 * coerces shape only, so nothing below here can refuse a system-local id. Order is the caller's.
 */
export function worldAddressableEffectSources(candidates, worldEntities = []) {
  const ids = worldEntityIdSet(worldEntities);
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    isWorldAddressableEffectSource(candidate?.id, ids)
  );
}

/**
 * Mint the id for a NEW world essence from the name a GM typed. A slug, not a random id:
 * `foundry.utils.randomID()` is unavailable to a pure leaf and `Math.random()` fails SonarCloud
 * S2245. Retired ids stay taken for the life of the world (§ Equivalent World Essence Merge,
 * `openspec/specs/destructive-changes-and-migrations/spec.md`); collisions take a suffix.
 */
export function mintEssenceId(name, existing = [], retired = []) {
  const live = worldEntityIdSet(existing);
  const tombstoned = worldEntityIdSet(retired);
  const isTaken = (candidate) => live.has(candidate) || tombstoned.has(candidate);
  const stem =
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'essence';
  if (!isTaken(stem)) return stem;
  let suffix = 2;
  while (isTaken(`${stem}-${suffix}`)) suffix += 1;
  return `${stem}-${suffix}`;
}

/** One world-default section value's display name; `''` when unset, so callers word it. */
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

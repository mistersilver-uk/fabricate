/**
 * Character prerequisites (DOMAIN.md "Character Prerequisite"): world-scoped pass/fail
 * conditions, each a dotted `path` into the acting actor's roll data, a comparison `op` and, for
 * a non-valueless operator, a `value`. Foundry-free; callers pass `actor.getRollData()`. What
 * that object holds is the game system's choice: dnd5e spreads `system` onto it, so
 * `skills.arc.value` resolves, while pf2e returns `{ actor }` alone, so a pf2e path is rooted at
 * `actor.` and resolves only against live `getRollData()` output, never a clone or the
 * `actor.system` fallback. An unknown path never throws: it reads `0` or `false`, a warning
 * except under `exists`.
 */

/** Ordered operator metadata: `symbol` is what the preview and dropdown render, and a
 *  `valueless` operator hides the value field and omits the comparand from the preview. */
export const PREREQUISITE_OPERATORS = Object.freeze(
  [
    { id: 'eq', symbol: '=', label: 'equals', valueless: false, kind: 'number' },
    { id: 'neq', symbol: '≠', label: 'not equals', valueless: false, kind: 'number' },
    { id: 'gt', symbol: '>', label: 'greater than', valueless: false, kind: 'number' },
    { id: 'gte', symbol: '≥', label: 'at least', valueless: false, kind: 'number' },
    { id: 'lt', symbol: '<', label: 'less than', valueless: false, kind: 'number' },
    { id: 'lte', symbol: '≤', label: 'at most', valueless: false, kind: 'number' },
    { id: 'isTrue', symbol: 'is true', label: 'is true', valueless: true, kind: 'boolean' },
    { id: 'isFalse', symbol: 'is false', label: 'is false', valueless: true, kind: 'boolean' },
    { id: 'exists', symbol: 'exists', label: 'exists', valueless: true, kind: 'existence' },
  ].map((entry) => Object.freeze(entry))
);

const OPERATOR_BY_ID = new Map(PREREQUISITE_OPERATORS.map((entry) => [entry.id, entry]));

/** Default operator for a fresh or malformed prerequisite. */
export const DEFAULT_PREREQUISITE_OPERATOR = 'gte';

/** Default Font Awesome glyph for a prerequisite with no explicit icon. */
export const DEFAULT_PREREQUISITE_ICON = 'fa-solid fa-user-shield';

export function isValuelessOperator(op) {
  return OPERATOR_BY_ID.get(op)?.valueless === true;
}

export function operatorMeta(op) {
  return OPERATOR_BY_ID.get(op) || null;
}

function resolveOperatorId(op) {
  return OPERATOR_BY_ID.has(op) ? op : DEFAULT_PREREQUISITE_OPERATOR;
}

function cleanPath(path) {
  return String(path ?? '')
    .trim()
    .replace(/^@+/, '');
}

/** A never-throwing `getProperty`: a leading `@` is stripped; a missing segment is `undefined`. */
export function resolveRollDataPath(rollData, path) {
  const clean = cleanPath(path);
  if (!clean || rollData == null) return;
  let current = rollData;
  for (const key of clean.split('.')) {
    if (current == null || typeof current !== 'object') return;
    current = current[key];
  }
  return current;
}

function coerceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['', 'false', '0', 'no'].includes(normalized);
  }
  if (value == null) return false;
  return true;
}

/**
 * Compare with one of the six numeric operator ids; a valueless or unknown id answers `false`,
 * so a caller offering a numeric comparison filters with `isValuelessOperator`. Every
 * number-against-comparand gate reads this one table.
 */
export function compareNumbersByOperatorId(actual, op, expected) {
  switch (op) {
    case 'eq': {
      return actual === expected;
    }
    case 'neq': {
      return actual !== expected;
    }
    case 'gt': {
      return actual > expected;
    }
    case 'gte': {
      return actual >= expected;
    }
    case 'lt': {
      return actual < expected;
    }
    case 'lte': {
      return actual <= expected;
    }
    default: {
      return false;
    }
  }
}

function defaultWarn(path) {
  console.warn(
    `Fabricate | character prerequisite path did not resolve: "${path}" — treating as 0/false.`
  );
}

/** `warn` (default `console.warn`) hears an unresolved path, except under `exists`. */
export function evaluatePrerequisite(rollData, prereq, { warn = defaultWarn } = {}) {
  const op = resolveOperatorId(prereq?.op);
  const path = cleanPath(prereq?.path);
  const raw = resolveRollDataPath(rollData, path);
  const resolved = raw !== undefined && raw !== null;

  if (!resolved && op !== 'exists' && typeof warn === 'function') {
    warn(path);
  }

  switch (op) {
    case 'exists': {
      return resolved;
    }
    case 'isTrue': {
      return coerceBoolean(raw) === true;
    }
    case 'isFalse': {
      return coerceBoolean(raw) === false;
    }
    default: {
      return compareNumbersByOperatorId(coerceNumber(raw), op, coerceNumber(prereq?.value));
    }
  }
}

/** AND semantics; `failures` lists each failing entry with a preview for messaging. */
export function evaluatePrerequisites(rollData, prereqs, options = {}) {
  const list = Array.isArray(prereqs) ? prereqs.filter(Boolean) : [];
  const failures = [];
  for (const prereq of list) {
    if (!evaluatePrerequisite(rollData, prereq, options)) {
      failures.push({
        id: prereq.id ?? null,
        name: String(prereq.name ?? '').trim(),
        preview: prerequisitePreview(prereq),
      });
    }
  }
  return { passed: failures.length === 0, failures };
}

/** The `@path op value` preview, e.g. `@skills.arc.value ≥ 1` or `@flags.attuned is true`. */
export function prerequisitePreview(prereq) {
  const op = resolveOperatorId(prereq?.op);
  const meta = OPERATOR_BY_ID.get(op);
  const path = cleanPath(prereq?.path);
  const at = path ? `@${path}` : '@…';
  if (meta.valueless) return `${at} ${meta.symbol}`;
  const value = prereq?.value ?? '';
  return `${at} ${meta.symbol} ${value}`.trim();
}

/** The canonical stored shape, shared so every normalizer agrees on defaults: a valueless operator
 *  or an empty string stores `value: null`, and an entry that cannot be given an id is `null`. */
export function normalizeCharacterPrerequisite(entry, randomID = () => '') {
  const source = entry && typeof entry === 'object' ? entry : {};
  const id = String(source.id || '').trim() || String(randomID() || '').trim();
  if (!id) return null;
  const op = resolveOperatorId(source.op);
  const name = String(source.name ?? '').trim() || 'Prerequisite';
  const icon = String(source.icon ?? '').trim() || DEFAULT_PREREQUISITE_ICON;
  const path = cleanPath(source.path);
  let value = null;
  if (!isValuelessOperator(op)) {
    value = source.value ?? null;
    if (typeof value === 'string') value = value.trim();
    if (value === '') value = null;
  }
  return { id, name, icon, path, op, value };
}

/** Drops any entry that cannot be assigned an id. */
export function normalizeCharacterPrerequisiteList(entries, randomID = () => '') {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => normalizeCharacterPrerequisite(entry, randomID)).filter(Boolean);
}

/**
 * Character prerequisites — reusable, system-scoped pass/fail conditions the GM
 * authors on the System Settings page and attaches to gate actions (this PR:
 * learning a recipe). A prerequisite is a dotted `path` into the acting actor's
 * prepared roll data, a comparison `op`, and (for non-valueless operators) a
 * `value` comparand.
 *
 * This module is intentionally Foundry-free so it can be unit-tested in
 * isolation. At runtime the caller passes `actor.getRollData()` as `rollData`;
 * Foundry has already resolved the system's shortcut keys (`skills.cra.rank` in
 * pf2e, `skills.arc.value` in dnd5e) onto that object. A mistyped or unknown
 * path never throws — it degrades to `0` (numeric operators) or `false`
 * (boolean/existence operators) and logs a single console warning.
 */

/**
 * Ordered operator metadata. `symbol` is what the collapsed-header preview and
 * the operator dropdown render (a math glyph for numeric operators, a phrase
 * for the valueless ones); `valueless` operators hide the value field in the
 * editor and omit the comparand from the preview.
 *
 * @type {ReadonlyArray<{id: string, symbol: string, label: string, valueless: boolean, kind: 'number'|'boolean'|'existence'}>}
 */
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

/**
 * @param {string} op Operator id.
 * @returns {boolean} `true` when the operator takes no comparand (`isTrue`,
 *   `isFalse`, `exists`) and the editor must hide the value field.
 */
export function isValuelessOperator(op) {
  return OPERATOR_BY_ID.get(op)?.valueless === true;
}

/**
 * @param {string} op Operator id.
 * @returns {object|null} The frozen operator metadata, or `null` when unknown.
 */
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

/**
 * Safely read a dotted path out of prepared roll data. Mirrors the traversal
 * semantics of `foundry.utils.getProperty` but never throws and has no Foundry
 * dependency. A leading `@` (the UI affordance) is tolerated and stripped.
 *
 * @param {object} rollData Prepared actor roll data (`actor.getRollData()`).
 * @param {string} path Dotted path, with or without a leading `@`.
 * @returns {*} The resolved value, or `undefined` when any segment is missing.
 */
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

function compareNumbers(actual, expected, op) {
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

/**
 * Evaluate a single prerequisite against prepared roll data.
 *
 * @param {object} rollData Prepared actor roll data (`actor.getRollData()`).
 * @param {{path?: string, op?: string, value?: *}} prereq The prerequisite.
 * @param {{warn?: (path: string) => void}} [options] Injectable warning sink
 *   (defaults to `console.warn`); pass a spy in tests.
 * @returns {boolean} `true` when the condition passes.
 */
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
      return compareNumbers(coerceNumber(raw), coerceNumber(prereq?.value), op);
    }
  }
}

/**
 * Evaluate a list of prerequisites with AND semantics.
 *
 * @param {object} rollData Prepared actor roll data.
 * @param {Array<object>} prereqs The prerequisites to check (all must pass).
 * @param {{warn?: (path: string) => void}} [options] Injectable warning sink.
 * @returns {{passed: boolean, failures: Array<{id: string|null, name: string, preview: string}>}}
 *   `passed` is `true` only when every prerequisite passes; `failures` lists the
 *   ones that did not, with a human-readable preview for messaging.
 */
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

/**
 * Render the collapsed-header / message preview string, e.g.
 * `@skills.cra.rank ≥ 2` or (valueless) `@flags.attuned is true`.
 *
 * @param {{path?: string, op?: string, value?: *}} prereq The prerequisite.
 * @returns {string} The `@path op value` preview.
 */
export function prerequisitePreview(prereq) {
  const op = resolveOperatorId(prereq?.op);
  const meta = OPERATOR_BY_ID.get(op);
  const path = cleanPath(prereq?.path);
  const at = path ? `@${path}` : '@…';
  if (meta.valueless) return `${at} ${meta.symbol}`;
  const value = prereq?.value ?? '';
  return `${at} ${meta.symbol} ${value}`.trim();
}

/**
 * Normalize one raw prerequisite into the canonical stored shape. Shared by the
 * crafting-system normalizer and the admin store so both agree on defaults.
 * Valueless operators force `value` to `null`; an empty-string value becomes
 * `null`.
 *
 * @param {*} entry Raw prerequisite.
 * @param {() => string} [randomID] Id generator used only when the entry has no id.
 * @returns {object|null} Canonical prerequisite, or `null` when no id can be assigned.
 */
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

/**
 * Normalize a list of raw prerequisites, dropping any that cannot be assigned an id.
 *
 * @param {*} entries Raw prerequisite list.
 * @param {() => string} [randomID] Id generator.
 * @returns {Array<object>} Canonical prerequisites.
 */
export function normalizeCharacterPrerequisiteList(entries, randomID = () => '') {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => normalizeCharacterPrerequisite(entry, randomID)).filter(Boolean);
}

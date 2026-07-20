/**
 * Per-tool crafting-check bonuses (issue: prepared-crafter tool bonuses).
 *
 * A library Tool may carry an optional `bonusExpression` (a Roll expression
 * evaluated against the crafting actor's `getRollData()` — the same safe
 * evaluation pattern as gathering character modifiers), an optional
 * `prerequisites` list (the shared characterPrerequisites shape), and a
 * `gateMode`:
 *  - `'bonus'` (default): failed prerequisites leave the tool USABLE (it still
 *    satisfies the recipe/salvage tool requirement) but it contributes NO bonus.
 *  - `'usability'`: failed prerequisites mean the tool does not count as present
 *    at all — the same missing-tool feedback path fires.
 *
 * A recipe may carry `toolBonusModes` (`{ [toolId]: 'always'|'never'|'highestOnly' }`,
 * missing entries default to `'always'`). At check time the bonus term is
 *   sum(bonuses of 'always' tools) + max(bonuses of 'highestOnly' tools)
 * with `'never'` tools ignored. Salvage has no per-entry config, so every
 * salvage tool is treated as `'always'`.
 *
 * Each contributing tool becomes a LABELED numeric term appended to the check
 * formula (`… + 2[Smith's Tools]`), so the rolled chat card / resolved-formula
 * display names each tool's contribution. This module is intentionally
 * Foundry-light (the Roll dependency is injectable) so it unit-tests headless,
 * mirroring `characterPrerequisites.js`.
 */

import { evaluatePrerequisites } from './characterPrerequisites.js';

/** Valid tool gate modes; unknown/missing → `'bonus'`. */
export const TOOL_GATE_MODES = Object.freeze(['bonus', 'usability']);

/** Valid per-recipe catalyst bonus modes; unknown/missing → `'always'`. */
export const TOOL_BONUS_MODES = Object.freeze(['always', 'never', 'highestOnly']);

/**
 * Normalize a tool `gateMode` value. Only the exact `'usability'` token opts into
 * presence gating; everything else (including legacy tools with no field) is the
 * backward-compatible `'bonus'`.
 *
 * @param {*} raw
 * @returns {'bonus'|'usability'}
 */
export function normalizeToolGateMode(raw) {
  return raw === 'usability' ? 'usability' : 'bonus';
}

/**
 * Normalize a recipe's `toolBonusModes` map (`toolId → mode`). Unknown modes and
 * empty ids are dropped; a missing/malformed map is `{}` (every tool `'always'`).
 *
 * @param {*} raw
 * @returns {Record<string, 'always'|'never'|'highestOnly'>}
 */
export function normalizeToolBonusModes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [rawId, mode] of Object.entries(raw)) {
    const id = String(rawId ?? '').trim();
    if (!id || !TOOL_BONUS_MODES.includes(mode)) continue;
    out[id] = mode;
  }
  return out;
}

/**
 * Whether a tool's character prerequisites pass for the given prepared roll
 * data. A tool with no prerequisites always passes. Reuses the shared
 * {@link evaluatePrerequisites} machinery (AND semantics, degrade-to-0/false on
 * unknown paths).
 *
 * @param {object|null} tool
 * @param {object} rollData Prepared actor roll data (`actor.getRollData()`).
 * @param {{warn?: (path: string) => void}} [options] Injectable warning sink.
 * @returns {boolean}
 */
export function toolPrerequisitesPass(tool, rollData, options = {}) {
  const prereqs = Array.isArray(tool?.prerequisites) ? tool.prerequisites : [];
  if (prereqs.length === 0) return true;
  return evaluatePrerequisites(rollData || {}, prereqs, options).passed;
}

/**
 * Whether a tool is BLOCKED from counting as present: `gateMode === 'usability'`
 * AND its prerequisites fail against the crafting actor's roll data. A
 * `'bonus'`-gated tool is never blocked (it just loses its bonus).
 *
 * @param {object|null} tool
 * @param {object|null} actor The CRAFTING actor (roll-data source).
 * @returns {boolean}
 */
export function isToolUsabilityBlocked(tool, actor) {
  if (normalizeToolGateMode(tool?.gateMode) !== 'usability') return false;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  return !toolPrerequisitesPass(tool, rollData);
}

/**
 * Default bonus-expression evaluator: Foundry `Roll` against the actor's
 * prepared roll data (the gathering character-modifier pattern —
 * `allowInteractive: false` so an automated evaluation never surfaces a manual
 * roll-fulfilment dialog). Headless (no `Roll`): a bare numeric literal still
 * resolves; anything else is null.
 *
 * @param {{expression: *, actor: object|null}} payload
 * @returns {Promise<number|null>}
 */
async function evaluateBonusExpression({ expression, actor }) {
  if ([null, undefined, ''].includes(expression)) return null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  if (typeof globalThis.Roll === 'function') {
    const roll = new globalThis.Roll(String(expression), rollData);
    const evaluated = await roll.evaluate({ allowInteractive: false });
    return evaluated?.total ?? evaluated?.result ?? null;
  }
  const numeric = Number(expression);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Evaluate the labeled bonus terms a set of present, eligible tools contribute
 * to a check roll.
 *
 * Per tool: `'never'`-mode tools and tools with no `bonusExpression` contribute
 * nothing; a tool whose prerequisites fail contributes 0 (its `gateMode` decided
 * presence upstream — by the time a `'usability'` tool reaches this function it
 * passed, but the prerequisites are re-checked defensively so a stale pair can
 * never leak a bonus). A failed or non-numeric expression evaluation contributes
 * 0 with a `console.warn` (never throws, never blocks the craft).
 *
 * Composition: every contributing `'always'` tool emits its own term (the sum);
 * of the `'highestOnly'` tools only the single highest value emits a term.
 * Zero-valued terms are dropped (they would only add `+ 0` noise to the roll).
 *
 * @param {object} params
 * @param {Array<object>} params.tools Present, eligible library Tool objects.
 * @param {Record<string, string>} [params.bonusModes] Recipe `toolBonusModes`
 *   map (`toolId → mode`); missing entries default to `'always'`. Pass `{}` (or
 *   omit) for salvage, whose tools are all `'always'`.
 * @param {object|null} params.actor The crafting actor (roll-data source).
 * @param {(tool: object) => string} [params.resolveLabel] Display-label resolver
 *   for the flavor annotation; defaults to `label`/`name`/`'Tool'`.
 * @param {Function} [params.evaluateExpression] Injectable async evaluator
 *   `({expression, actor}) => number|null` (tests); defaults to the Roll-based
 *   evaluator above.
 * @param {{warn?: Function}} [params.prereqOptions] Threaded to prerequisite
 *   evaluation (test spy).
 * @returns {Promise<Array<{toolId: string|null, label: string, value: number}>>}
 */
export async function evaluateToolBonusTerms({
  tools,
  bonusModes = {},
  actor = null,
  resolveLabel = (tool) => tool?.label || tool?.name || 'Tool',
  evaluateExpression = evaluateBonusExpression,
  prereqOptions = {},
} = {}) {
  const list = Array.isArray(tools) ? tools.filter(Boolean) : [];
  if (list.length === 0) return [];
  const modes = normalizeToolBonusModes(bonusModes);
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};

  const alwaysTerms = [];
  let highestTerm = null;
  for (const tool of list) {
    const mode = modes[tool?.id] ?? 'always';
    if (mode === 'never') continue;
    const expression = typeof tool?.bonusExpression === 'string' ? tool.bonusExpression.trim() : '';
    if (!expression) continue;
    // Failed prerequisites → no bonus (gateMode 'bonus'); 'usability' tools were
    // gated out of presence upstream, so this re-check is a defensive no-op there.
    if (!toolPrerequisitesPass(tool, rollData, prereqOptions)) continue;

    let value = 0;
    try {
      const raw = await evaluateExpression({ expression, actor });
      const numeric = raw === null || raw === undefined ? NaN : Number(raw);
      if (Number.isFinite(numeric)) {
        value = numeric;
      } else {
        console.warn(
          `Fabricate | Tool bonus expression did not evaluate to a number ("${expression}") — treating as 0.`
        );
      }
    } catch (error) {
      console.warn(
        `Fabricate | Tool bonus expression failed to evaluate ("${expression}") — treating as 0.`,
        error
      );
    }

    const term = { toolId: tool?.id ?? null, label: String(resolveLabel(tool) ?? 'Tool'), value };
    if (mode === 'highestOnly') {
      // Max of the highestOnly tools; ties keep the first (author order) — deterministic.
      if (highestTerm === null || term.value > highestTerm.value) highestTerm = term;
    } else {
      alwaysTerms.push(term);
    }
  }

  // Drop zero-valued terms: they change nothing and would only render "+ 0[Tool]".
  const terms = [...alwaysTerms, ...(highestTerm ? [highestTerm] : [])];
  return terms.filter((term) => term.value !== 0);
}

/**
 * Append labeled bonus terms to a check roll formula as flavored numeric terms
 * (`base + 2[Smith's Tools] - 1[Rusty Saw]`), the Foundry-native way to carry a
 * per-term label through the roll, its tooltip, and the resolved-formula
 * display. Flavor text is sanitized (brackets stripped) so a user-authored tool
 * name can never break the formula parse. An empty base formula or empty term
 * list returns the base unchanged.
 *
 * @param {string} formula
 * @param {Array<{label: string, value: number}>} terms
 * @returns {string}
 */
export function appendBonusTermsToFormula(formula, terms) {
  const base = String(formula || '').trim();
  const list = Array.isArray(terms) ? terms.filter((term) => Number.isFinite(term?.value)) : [];
  if (!base || list.length === 0) return base;
  let out = base;
  for (const term of list) {
    const label = String(term.label ?? '')
      .replaceAll(/[[\]]/g, '')
      .trim();
    const magnitude = Math.abs(term.value);
    const sign = term.value < 0 ? '-' : '+';
    out += ` ${sign} ${magnitude}${label ? `[${label}]` : ''}`;
  }
  return out;
}

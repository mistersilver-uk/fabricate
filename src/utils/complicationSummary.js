/**
 * The ONE localized trigger sentence for a component complication (issue 1286).
 *
 * The prototype generates a single line — *"When the award is missed or 1d20 = 1 · rolls
 * 2d6, runs Shrapnel Burst"* — and renders it in THREE places (the Component Studio's
 * authoring row, the Component Studio's read-only salvage strip and the Recipe Studio's
 * stage strip). Three call sites joining clauses by hand is three chances to disagree
 * about the conjunction, the operator glyph and the no-trigger case, so the sentence is
 * built here once.
 *
 * ## Why the translator is injected
 *
 * This module sits under `src/utils/` beside `componentComplications.js` and must stay
 * loadable outside a live world — `node --test`, the View Lab and the Vite build all
 * import it. `game.i18n` is not reachable from any of those, so the caller passes a
 * `translate(key, fallback)` that returns a TEMPLATE, and the substitution of `{expr}`,
 * `{value}` and friends happens here. That split matters: `game.i18n.format(key, data)`
 * returns garbage for a key the language file does not declare, whereas asking for the
 * template and filling it here degrades to the English fallback intact.
 *
 * ## Why the operator glyph comes from the prerequisite table
 *
 * `PREREQUISITE_OPERATORS` already declares a `symbol` per operator id — the math glyph
 * the prerequisite editor and its collapsed-header preview render — and a complication's
 * comparator vocabulary IS that table's six numeric entries. Restating `{eq: '='}` here
 * would be the drift the shared table exists to prevent, and it would silently disagree
 * the moment a symbol is retuned.
 *
 * ## What this sentence is NOT
 *
 * It is a GM-FACING sentence. It states the conditions under which a complication fires,
 * which is exactly the fact a player must not be handed — the player surfaces render the
 * authored `description` instead. `ComplicationSummaryRow` enforces that by typing its
 * body slot per variant rather than accepting one interchangeable string.
 */

import { operatorMeta } from '../systems/characterPrerequisites.js';

/**
 * Every string this builder reads, as `[key, fallback]` pairs.
 *
 * FULL key literals rather than a shared prefix plus a suffix, deliberately.
 * `tests/ui-lang-keys-resolve.test.js` can only check a key it can see written down: a
 * `` `${PREFIX}${name}` `` composition is a namespace BASE, which that guard admits without
 * ever resolving the leaves, so a typo'd or missing clause key would ship silently and
 * `game.i18n.localize` would hand the dotted path back as the sentence. The
 * key-then-fallback ARRAY shape below is one of the four that guard's leaf assertion reads,
 * so every clause is proved to resolve to a STRING rather than merely to something.
 *
 * Exported so the section that renders the sentence, and any suite that pins it, name the
 * same strings rather than re-typing them.
 * @type {Readonly<Record<string, readonly [string, string]>>}
 */
export const COMPLICATION_SUMMARY_STRINGS = Object.freeze({
  StageMissed: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.StageMissed',
    'the award is missed',
  ],
  StagePartial: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.StagePartial',
    'the award is only partly covered',
  ],
  StageAwarded: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.StageAwarded',
    'the award is granted',
  ],
  CheckTrigger: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.CheckTrigger',
    'a check trigger fires',
  ],
  CheckTriggerNamed: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.CheckTriggerNamed',
    '{name} fires',
  ],
  RollCondition: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.RollCondition',
    '{expr} {operator} {value}',
  ],
  JoinAny: ['FABRICATE.Admin.Manager.Component.Complications.Summary.JoinAny', ' or '],
  JoinAll: ['FABRICATE.Admin.Manager.Component.Complications.Summary.JoinAll', ' and '],
  Sentence: ['FABRICATE.Admin.Manager.Component.Complications.Summary.Sentence', 'When {clauses}'],
  SentenceWithEffects: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.SentenceWithEffects',
    'When {clauses} · {effects}',
  ],
  EffectJoin: ['FABRICATE.Admin.Manager.Component.Complications.Summary.EffectJoin', ', '],
  EffectRoll: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.EffectRoll',
    'rolls {expr}',
  ],
  EffectMacro: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.EffectMacro',
    'runs {name}',
  ],
  EffectMacroUnnamed: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.EffectMacroUnnamed',
    'runs a macro',
  ],
  NoTrigger: [
    'FABRICATE.Admin.Manager.Component.Complications.Summary.NoTrigger',
    'No trigger set — never fires',
  ],
});

/**
 * The translator used when a caller passes none: the English fallback, verbatim. It keeps
 * this module callable from a unit test and from the View Lab without a Foundry global.
 * @param {string} _key
 * @param {string} fallback
 * @returns {string}
 */
function englishTemplate(_key, fallback) {
  return fallback;
}

/**
 * Substitute `{name}` placeholders, in ONE pass over the TEMPLATE.
 *
 * One pass is what makes "authored text is never rescanned" true rather than merely
 * intended. An authored dice expression may legitimately contain braces (a system's
 * shorthand might), and a loop that replaced one placeholder at a time re-exposed whatever
 * it had just written to every LATER placeholder: filling `{expr}` with the literal text
 * `{value}` and then filling `{value}` rewrote the expression the GM authored into the
 * comparand beside it.
 *
 * A placeholder the data does not name is left ALONE rather than emptied, so a localized
 * template that reaches for a slot this builder does not supply degrades to visible text
 * instead of silently losing a word.
 *
 * @param {string} template
 * @param {Record<string, string>} [data]
 * @returns {string}
 */
function fill(template, data = {}) {
  return String(template ?? '').replaceAll(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(data, name) ? String(data[name] ?? '') : placeholder
  );
}

/**
 * The comparator's rendered glyph. An unknown comparator renders as its own id rather than
 * disappearing: the normalizer PRESERVES a malformed operand precisely so the GM can see
 * and fix it, and a sentence that silently dropped the comparison would hide it again.
 * @param {string} cmp
 * @returns {string}
 */
function comparatorSymbol(cmp) {
  const id = String(cmp ?? '').trim();
  return operatorMeta(id)?.symbol || id;
}

/**
 * The one-line, GM-facing trigger sentence for a complication.
 *
 * @param {object} complication a NORMALIZED complication (`authoredComplications`' shape)
 * @param {object} [options]
 * @param {(key: string, fallback: string) => string} [options.translate] returns the
 *   TEMPLATE for a key — localized when a language file declares it, else the fallback.
 * @param {string} [options.macroName] the resolved macro name, when the caller has one.
 *   Absent renders the unnamed tail rather than a raw uuid, which names nothing a GM
 *   recognises.
 * @param {string} [options.triggerName] the named check trigger's label, when it resolves.
 * @returns {string} never empty — a complication with nothing enabled says so.
 */
export function complicationSummary(complication, options = {}) {
  const { translate = englishTemplate, macroName = '', triggerName = '' } = options;
  const key = (name) => translate(...COMPLICATION_SUMMARY_STRINGS[name]);

  const when = complication?.when || {};
  const clauses = [];
  // Prototype clause order: missed, partial, awarded, trigger, roll condition.
  if (when.stageMissed === true) clauses.push(key('StageMissed'));
  if (when.stagePartial === true) clauses.push(key('StagePartial'));
  if (when.stageAwarded === true) clauses.push(key('StageAwarded'));
  if (when.checkTrigger) {
    clauses.push(
      triggerName ? fill(key('CheckTriggerNamed'), { name: triggerName }) : key('CheckTrigger')
    );
  }
  const rollCondition = complication?.rollCondition || {};
  if (rollCondition.enabled === true) {
    clauses.push(
      fill(key('RollCondition'), {
        expr: rollCondition.expr,
        operator: comparatorSymbol(rollCondition.cmp),
        value: rollCondition.value,
      })
    );
  }

  if (clauses.length === 0) return key('NoTrigger');

  const join = complication?.match === 'all' ? key('JoinAll') : key('JoinAny');
  const effects = [];
  const effectRoll = complication?.effectRoll || {};
  if (effectRoll.enabled === true) {
    effects.push(fill(key('EffectRoll'), { expr: effectRoll.expr }));
  }
  if (complication?.macroUuid) {
    effects.push(
      macroName ? fill(key('EffectMacro'), { name: macroName }) : key('EffectMacroUnnamed')
    );
  }

  const joined = clauses.join(join);
  return effects.length === 0
    ? fill(key('Sentence'), { clauses: joined })
    : fill(key('SentenceWithEffects'), {
        clauses: joined,
        effects: effects.join(key('EffectJoin')),
      });
}

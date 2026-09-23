/**
 * The ONE localized trigger sentence for a component complication (issue 1286), built here because
 * three surfaces render it. The translator is INJECTED and returns a TEMPLATE, so the module stays
 * loadable outside a live world and a missing key degrades to the English fallback instead of
 * `game.i18n.format`'s garbage. The operator glyph comes from `PREREQUISITE_OPERATORS`, never a
 * local table. It is GM-FACING: player surfaces render the authored `description` instead.
 */

import { operatorMeta } from '../../systems/characterPrerequisites.js';

/** Every string this builder reads, as `[key, fallback]` pairs. */
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

/** The translator used when a caller passes none: the English fallback, verbatim. */
function englishTemplate(_key, fallback) {
  return fallback;
}

/** Substitute `{name}` placeholders, in ONE pass over the TEMPLATE. */
function fill(template, data = {}) {
  return String(template ?? '').replaceAll(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(data, name) ? String(data[name] ?? '') : placeholder
  );
}

/** The comparator's rendered glyph. */
function comparatorSymbol(cmp) {
  const id = String(cmp ?? '').trim();
  return operatorMeta(id)?.symbol || id;
}

/** The one-line, GM-facing trigger sentence for a complication. */
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

/** Checks readiness for roll-under and character-value targets (issue 2003). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  evaluateCheckReadiness,
  sectionForIssue,
} from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  CHECK_ISSUE_TITLES,
  checkIssueText,
  checkTickCopy,
} from '../src/ui/svelte/apps/manager/checks/checksCopy.js';

const attribute = (expression, extra = {}) => ({
  product: 'sum',
  direction: 'under',
  target: { source: 'attribute', expression, adjustmentKind: 'multiply', ...extra },
});
const IDRIN = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };
const VOSK = { name: 'Vosk', rollData: { skills: {} } };

const ids = (list) => list.map((issue) => issue.id);
const issue = (result, id) => [...result.issues, ...result.transient].find((row) => row.id === id);
const tick = (result, id) => result.checks.find((row) => row.id === id);
const english = (_key, fallback) => fallback;
const sentence = (entry) => checkIssueText(entry.id, entry.data, english).detail;

const ROUTED_MULTIPLY = {
  rollFormula: '1d100',
  evaluation: attribute('@skills.craft.value', { baseAdjustment: 1 }),
  type: 'relative',
  relativeOutcomes: [
    { id: 'o', name: 'Failure', adjustment: null, success: false },
    { id: 'r', name: 'Regular', adjustment: 1, success: true },
    { id: 'h', name: 'Hard', adjustment: 0.5, success: true },
  ],
};

/** The id's severity, section, tick label and sentence, from one evaluated issue. */
function described(result, id, tickId) {
  const entry = issue(result, id);
  assert.ok(entry, `${id} is raised`);
  return {
    severity: entry.severity,
    section: sectionForIssue(id),
    tick: tickId ? checkTickCopy(tickId).fallback : null,
    satisfied: tickId ? tick(result, tickId)?.satisfied : null,
    sentence: sentence(entry),
  };
}

describe('target readiness raises each id with its copy, section and severity', () => {
  it('attributeTargetMissing', () => {
    const result = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: attribute('') },
      { mode: 'simple' }
    );
    assert.deepEqual(described(result, 'attributeTargetMissing', 'attributeTargetSet'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Has a character value to measure against',
      satisfied: false,
      sentence:
        'This check measures against a character value but names none. Enter a number or a character path.',
    });
  });

  it('attributeTargetInvalid, judged with every path neutralized', () => {
    for (const expression of ['@skills.craft.value + 1d6', '@skills.craft.value +']) {
      const result = evaluateCheckReadiness(
        { rollFormula: '1d20', evaluation: attribute(expression) },
        { mode: 'simple', previewActor: IDRIN }
      );
      assert.deepEqual(described(result, 'attributeTargetInvalid', 'attributeTargetReadable'), {
        severity: 'critical',
        section: 'roll',
        tick: 'The character value can be worked out',
        satisfied: false,
        sentence:
          "This check's character value uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
      });
      assert.deepEqual(ids(result.transient), [], 'a static fault is not the actor’s');
    }
    const clean = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: attribute('@skills.craft.value * 2') },
      { mode: 'simple' }
    );
    assert.equal(tick(clean, 'attributeTargetReadable').satisfied, true);
  });

  it('attributeTierWithoutAdjustment, for crafting recipe tiers only', () => {
    const check = {
      rollFormula: '1d20',
      evaluation: attribute('@x', { baseAdjustment: 1 }),
      tiers: [
        { id: 'a', name: 'Hard', adjustment: 0.5 },
        { id: 'b', name: 'Plain', adjustment: null },
        { id: 'c', name: 'Easy', adjustment: '' },
      ],
    };
    const result = evaluateCheckReadiness(check, { mode: 'simple', activity: 'crafting' });
    assert.deepEqual(
      described(result, 'attributeTierWithoutAdjustment', 'recipeTiersSetAdjustment'),
      {
        severity: 'critical',
        section: 'roll',
        tick: 'Every recipe tier sets an adjustment',
        satisfied: false,
        sentence:
          'Plain, Easy set no difficulty adjustment, so they use the base adjustment and are no harder than the default. Give each tier its own adjustment.',
      }
    );
    const salvage = evaluateCheckReadiness(check, { mode: 'simple', activity: 'salvage' });
    assert.equal(issue(salvage, 'attributeTierWithoutAdjustment'), undefined);
  });

  it('adjustmentInvalidForKind names the base, tiers and multiplied outcomes', () => {
    const result = evaluateCheckReadiness(
      {
        ...ROUTED_MULTIPLY,
        evaluation: attribute('@x', { baseAdjustment: 0 }),
        tiers: [{ id: 't', name: 'Grim', adjustment: -1 }],
        relativeOutcomes: [
          ...ROUTED_MULTIPLY.relativeOutcomes,
          { id: 'z', name: 'Zeroed', adjustment: 0, success: true },
        ],
      },
      { mode: 'routed', activity: 'crafting' }
    );
    assert.deepEqual(described(result, 'adjustmentInvalidForKind', 'adjustmentsSuitKind'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Every adjustment suits its kind',
      satisfied: false,
      sentence:
        'An added adjustment must be a finite number and a multiplier must be above zero; Base adjustment, Grim, Zeroed is not.',
    });
    const { data } = issue(result, 'adjustmentInvalidForKind');
    assert.deepEqual(data, { names: 'Grim, Zeroed', baseAdjustment: true }, 'no English in the data');
    const german = (key, fallback) =>
      key.endsWith('.RecordBaseAdjustment') ? 'Grundanpassung' : fallback;
    assert.match(
      checkIssueText('adjustmentInvalidForKind', data, german).detail,
      /; Grundanpassung, Grim, Zeroed is not\.$/u,
      'the copy layer names the base adjustment in the reader’s language'
    );
    const added = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: attribute('@x', { adjustmentKind: 'add', baseAdjustment: -4 }) },
      { mode: 'simple' }
    );
    assert.equal(tick(added, 'adjustmentsSuitKind').satisfied, true, 'any finite number adds');
  });

  it('adjustmentInvalidForKind also names an invalid salvage or gathering task override', () => {
    const check = { rollFormula: '1d20', evaluation: attribute('@x', { baseAdjustment: 1 }) };
    const salvage = evaluateCheckReadiness(check, {
      mode: 'simple',
      activity: 'salvage',
      components: [
        { id: 'c1', name: 'Iron Longsword', salvage: { enabled: true, adjustmentOverride: -2 } },
        { id: 'c2', name: 'Whetstone', salvage: { enabled: false, adjustmentOverride: -3 } },
        { id: 'c3', name: 'Rope', salvage: { enabled: true, adjustmentOverride: 0.5 } },
      ],
    });
    assert.equal(
      issue(salvage, 'adjustmentInvalidForKind').data.names,
      'Iron Longsword',
      'a disabled salvage and a valid override are both excluded'
    );

    const gathering = evaluateCheckReadiness(check, {
      mode: 'routed',
      activity: 'gathering',
      gatheringTasks: [
        { id: 't1', name: 'Prospect for Ore', resolutionMode: 'routed', adjustmentOverride: -2 },
        { id: 't2', name: 'Chop Wood', resolutionMode: 'd100', adjustmentOverride: -3 },
        { id: 't3', name: 'Forage', resolutionMode: 'routed', adjustmentOverride: 0.5 },
      ],
    });
    assert.equal(
      issue(gathering, 'adjustmentInvalidForKind').data.names,
      'Prospect for Ore',
      'a d100 task and a valid override are both excluded'
    );

    const clean = evaluateCheckReadiness(check, {
      mode: 'simple',
      activity: 'salvage',
      components: [
        { id: 'c1', name: 'Iron Longsword', salvage: { enabled: true, adjustmentOverride: 0.5 } },
      ],
    });
    assert.equal(issue(clean, 'adjustmentInvalidForKind'), undefined, 'a valid override raises nothing');
  });

  it('otherwiseTierMissing and multipleOtherwiseTiers share one tick', () => {
    const none = evaluateCheckReadiness(
      {
        ...ROUTED_MULTIPLY,
        relativeOutcomes: ROUTED_MULTIPLY.relativeOutcomes.filter((row) => row.id !== 'o'),
      },
      { mode: 'routed' }
    );
    assert.deepEqual(described(none, 'otherwiseTierMissing', 'singleOtherwiseTier'), {
      severity: 'critical',
      section: 'outcomes',
      tick: 'Exactly one Otherwise tier',
      satisfied: false,
      sentence:
        'No outcome tier is marked Otherwise, so a roll that meets no multiplied threshold has nowhere to go. Leave exactly one tier without a multiplier.',
    });
    const two = evaluateCheckReadiness(
      {
        ...ROUTED_MULTIPLY,
        relativeOutcomes: [
          ...ROUTED_MULTIPLY.relativeOutcomes,
          { id: 'b', name: 'Botch', adjustment: null, success: false },
        ],
      },
      { mode: 'routed' }
    );
    assert.deepEqual(described(two, 'multipleOtherwiseTiers', 'singleOtherwiseTier'), {
      severity: 'critical',
      section: 'outcomes',
      tick: 'Exactly one Otherwise tier',
      satisfied: false,
      sentence: 'Failure, Botch are all marked Otherwise. Leave exactly one tier without a multiplier.',
    });
    const one = evaluateCheckReadiness(ROUTED_MULTIPLY, { mode: 'routed' });
    assert.equal(tick(one, 'singleOtherwiseTier').satisfied, true);
    assert.deepEqual(ids(one.issues), []);
  });

  it('progressiveUnderUnsupported, for a summed check only', () => {
    const result = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: { product: 'sum', direction: 'under' } },
      { mode: 'progressive' }
    );
    assert.deepEqual(
      described(result, 'progressiveUnderUnsupported', 'progressiveHigherIsBetter'),
      {
        severity: 'critical',
        section: 'roll',
        tick: 'Progressive checks use Higher is better',
        satisfied: false,
        sentence:
          'A progressive check spends its total as a budget, so Lower is better cannot apply. Switch this check to Higher is better.',
      }
    );
    const count = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: { product: 'count', direction: 'under' } },
      { mode: 'progressive' }
    );
    assert.equal(issue(count, 'progressiveUnderUnsupported'), undefined, 'count/under is valid');
  });
});

describe('the two transient warnings name the Preview-as actor and nothing counts them', () => {
  it('attributePathUnresolvedForPreview', () => {
    const result = evaluateCheckReadiness(ROUTED_MULTIPLY, { mode: 'routed', previewActor: VOSK });
    assert.deepEqual(described(result, 'attributePathUnresolvedForPreview'), {
      severity: 'warning',
      section: 'roll',
      tick: null,
      satisfied: null,
      sentence: 'Vosk has no value at @skills.craft.value, so this check cannot roll for them.',
    });
    assert.deepEqual(ids(result.issues), [], 'never in the counted issues');
  });

  it('attributeValueNotNumeric', () => {
    const words = { name: 'Wren', rollData: { skills: { craft: { value: 'high' } } } };
    const result = evaluateCheckReadiness(ROUTED_MULTIPLY, { mode: 'routed', previewActor: words });
    assert.deepEqual(described(result, 'attributeValueNotNumeric'), {
      severity: 'warning',
      section: 'roll',
      tick: null,
      satisfied: null,
      sentence:
        'The value this check reads from Wren is not a number, so this check cannot roll for them.',
    });
  });

  it('is raised only when an actor is chosen and cannot read the value', () => {
    assert.deepEqual(ids(evaluateCheckReadiness(ROUTED_MULTIPLY, { mode: 'routed' }).transient), []);
    const idrin = evaluateCheckReadiness(ROUTED_MULTIPLY, { mode: 'routed', previewActor: IDRIN });
    assert.deepEqual(ids(idrin.transient), []);
  });
});

describe('readiness validates only what the active mode reads', () => {
  it('says nothing new about a roll-over fixed check, and changes none of its rows', () => {
    const check = { rollFormula: '1d20', dc: 12, tiers: [{ id: 't', name: 'Hard', dc: 15 }] };
    const result = evaluateCheckReadiness(check, { mode: 'simple', activity: 'crafting' });
    assert.deepEqual(result.checks.map((row) => row.id), ['hasRollFormula']);
    assert.deepEqual(result.transient, []);
  });

  it('treats a progressive or fixed-range target source as inert', () => {
    const progressive = evaluateCheckReadiness(
      { rollFormula: '1d20', evaluation: { ...attribute(''), direction: 'over' } },
      { mode: 'progressive', previewActor: VOSK }
    );
    assert.deepEqual([ids(progressive.issues), ids(progressive.transient)], [[], []]);
    const fixedRanges = evaluateCheckReadiness(
      {
        rollFormula: '1d20',
        evaluation: attribute(''),
        type: 'fixed',
        fixedOutcomes: [{ id: 'a', name: 'All', start: 1, end: 20, success: true }],
      },
      { mode: 'routed', previewActor: VOSK }
    );
    assert.deepEqual([ids(fixedRanges.issues), ids(fixedRanges.transient)], [[], []]);
  });

  it('a progressive mode is inert to an invalid kept salvage or gathering task override too', () => {
    const check = { rollFormula: '1d20', evaluation: attribute('@x', { baseAdjustment: 1 }) };
    const salvage = evaluateCheckReadiness(check, {
      mode: 'progressive',
      activity: 'salvage',
      components: [
        { id: 'c1', name: 'Iron Longsword', salvage: { enabled: true, adjustmentOverride: -2 } },
      ],
    });
    assert.equal(issue(salvage, 'adjustmentInvalidForKind'), undefined);

    const gathering = evaluateCheckReadiness(check, {
      mode: 'progressive',
      activity: 'gathering',
      gatheringTasks: [
        { id: 't1', name: 'Prospect for Ore', resolutionMode: 'routed', adjustmentOverride: -2 },
      ],
    });
    assert.equal(issue(gathering, 'adjustmentInvalidForKind'), undefined);
  });
});

describe('the new issues render a title over their sentence', () => {
  it('titles each new issue and keeps its sentence as the detail', () => {
    const data = { actor: 'Vosk', path: '@skills.craft.value' };
    assert.deepEqual(checkIssueText('attributePathUnresolvedForPreview', data, english), {
      title: 'A character path does not resolve',
      detail: 'Vosk has no value at @skills.craft.value, so this check cannot roll for them.',
    });
  });

  it('localizes every title under the Validation namespace, as its fallback reads', () => {
    const en = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
    const validation = en.FABRICATE.Admin.Manager.Checks.Validation;
    for (const [id, [key, fallback]] of Object.entries(CHECK_ISSUE_TITLES)) {
      assert.equal(validation[key], fallback, `${id} resolves to ${key}`);
    }
  });

  // Issue 2082: the older issues take the same shape, a short title over their sentence.
  it('titles an older issue over its sentence rather than making the sentence its title', () => {
    assert.deepEqual(checkIssueText('noRollFormula', undefined, english), {
      title: 'The check has no roll formula',
      detail: 'Nothing is rolled, so this check cannot resolve until you enter a formula.',
    });
    assert.deepEqual(checkIssueText('rangeOverlap', undefined, english), {
      title: 'Two bands overlap',
      detail: 'Bands must not overlap — a roll in the overlap has two possible tiers.',
    });
  });

  it('degrades an id with no title to the id itself rather than throwing', () => {
    assert.deepEqual(checkIssueText('notAnIssue', undefined, english), {
      title: 'notAnIssue',
      detail: 'notAnIssue',
    });
  });
});

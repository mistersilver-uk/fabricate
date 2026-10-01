/** Checks readiness for success-counting pools (issue 2004). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECK_ISSUE_CONTROLS,
  CHECK_READINESS_ISSUE_IDS,
  countCeilingIssues,
  evaluateCheckReadiness,
  issueControl,
  sectionForIssue,
} from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  checkIssueSentence,
  checkIssueText,
  checkTickCopy,
} from '../src/ui/svelte/apps/manager/checks/checksCopy.js';

const text = (_key, fallback) => fallback;
const count = (pool = {}, direction = 'over') => ({
  product: 'count',
  direction,
  pool: { die: 10, base: '2', threshold: '8', required: 1, ...pool },
});
const check = (pool, extra = {}) => ({ rollFormula: '', evaluation: count(pool), ...extra });
const from = (value, once = false) => ({ enabled: true, faces: { kind: 'from', value }, once });

const ids = (list) => list.map((issue) => issue.id);
const issue = (result, id) => [...result.issues, ...result.transient].find((row) => row.id === id);
const tick = (result, id) => result.checks.find((row) => row.id === id);

/** The id's severity, section, tick label and sentence, from one evaluated issue. */
function described(result, id, tickId) {
  const entry = issue(result, id);
  assert.ok(entry, `${id} is raised`);
  return {
    severity: entry.severity,
    section: sectionForIssue(id),
    tick: tickId ? checkTickCopy(tickId).fallback : null,
    satisfied: tickId ? tick(result, tickId)?.satisfied : null,
    sentence: checkIssueSentence(id, entry.data, text),
  };
}

/** The lab's faults crafting check: two d20s, four recipe tiers, additional dice switched on. */
const FAULTS = check(
  {
    die: 20,
    base: '2',
    threshold: '13',
    required: 2,
    additionalDice: { enabled: true, source: 'path', path: 'system.resources.momentum.value', max: 1 },
  },
  {
    tiers: [
      { id: 'complex', name: 'Complex Work', successes: 2 },
      { id: 'arcane', name: 'Arcane Work', successes: 3 },
      { id: 'impossible', name: 'Impossible Work', successes: 4 },
      { id: 'unset', name: 'Unset Work', successes: null },
    ],
  }
);

describe('a count check’s retained formula is inert', () => {
  it('raises no formula issue or tick, and its modifiers reach a roll', () => {
    const modifierContext = {
      catalogue: [{ id: 'ok', label: 'Ok', expression: '1' }],
      systemPolicy: 'addAll',
      defaultModifierIds: ['ok'],
    };
    const result = evaluateCheckReadiness(check({}, { rollFormula: '1d20 * @craftingmod' }), {
      mode: 'simple',
      modifierContext,
    });
    assert.ok(!tick(result, 'hasRollFormula'), 'no formula tick');
    for (const id of [
      'noRollFormula',
      'retiredPlaceholderBreaksFormula',
      'modifiersInertNoFormula',
    ]) {
      assert.equal(issue(result, id), undefined, `${id} is not raised`);
    }
    assert.deepEqual(ids(result.issues), []);
  });

  it('still reports the formula of a summed check (the negative control)', () => {
    const result = evaluateCheckReadiness({ rollFormula: '' }, { mode: 'simple' });
    assert.deepEqual(ids(result.issues), ['noRollFormula']);
  });
});

describe('count readiness raises each id with its copy, section and severity', () => {
  it('countPoolInvalid, for a blank or dice-bearing base', () => {
    for (const base of ['', '2d4', '@skills.smith.rank +']) {
      const result = evaluateCheckReadiness(check({ base }), { mode: 'simple' });
      assert.deepEqual(described(result, 'countPoolInvalid', 'countPoolReadable'), {
        severity: 'critical',
        section: 'roll',
        tick: 'The base pool can be worked out',
        satisfied: false,
        sentence:
          "This check's base pool uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
      });
    }
    const clean = evaluateCheckReadiness(check({ base: '@skills.smith.rank + 2' }), { mode: 'simple' });
    assert.equal(tick(clean, 'countPoolReadable').satisfied, true);
  });

  it('countThresholdInvalid', () => {
    const result = evaluateCheckReadiness(check({ threshold: '1d4 + 6' }), { mode: 'simple' });
    assert.deepEqual(described(result, 'countThresholdInvalid', 'countThresholdReadable'), {
      severity: 'critical',
      section: 'roll',
      tick: 'The success threshold can be worked out',
      satisfied: false,
      sentence:
        "This check's success threshold uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
    });
  });

  it('countFaceBeyondDie names the rule, the face, the die and what follows', () => {
    const sentenceFor = (pool, direction) => {
      const result = evaluateCheckReadiness(
        { rollFormula: '', evaluation: count(pool, direction) },
        { mode: 'simple' }
      );
      return described(result, 'countFaceBeyondDie', 'countFacesOnDie');
    };
    assert.deepEqual(sentenceFor({ explode: from(12) }), {
      severity: 'warning',
      section: 'roll',
      tick: 'Explode and cancel faces are on the die',
      satisfied: false,
      sentence: 'The explode face 12 is not on a d10, so it never explodes. Pick a face the die can show.',
    });
    assert.equal(
      sentenceFor({ cancel: from(12) }).sentence,
      'The cancel face 12 is not on a d10, so every face cancels. Pick a face the die can show.'
    );
    assert.equal(
      sentenceFor({ cancel: from(12) }, 'under').sentence,
      'The cancel face 12 is not on a d10, so no face cancels. Pick a face the die can show.'
    );
    const onDie = evaluateCheckReadiness(check({ explode: from(9) }), { mode: 'simple' });
    assert.equal(tick(onDie, 'countFacesOnDie').satisfied, true);
  });

  it('localizes the face rule’s kind and effect through the Studio’s text', () => {
    const localized = checkIssueSentence(
      'countFaceBeyondDie',
      { kind: 'explode', face: 12, die: 10, effect: 'neverExplodes' },
      (key, fallback) => (key.endsWith('FaceKindExplode') ? 'EXPLODE' : fallback)
    );
    assert.match(localized, /^The EXPLODE face 12/);
  });

  it('countExplodeUnbounded, which a once-exploding die never raises', () => {
    const result = evaluateCheckReadiness(check({ explode: from(1) }), { mode: 'simple' });
    assert.deepEqual(described(result, 'countExplodeUnbounded', 'countExplosionStops'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Explosion can stop',
      satisfied: false,
      sentence:
        'Every face on this die explodes, so the roll would never stop. Pick a face that does not explode.',
    });
    const once = evaluateCheckReadiness(check({ explode: from(1, true) }), { mode: 'simple' });
    assert.equal(issue(once, 'countExplodeUnbounded'), undefined);
  });

  it('countTierWithoutSuccesses, for crafting recipe tiers only', () => {
    const result = evaluateCheckReadiness(FAULTS, { mode: 'simple', activity: 'crafting' });
    assert.deepEqual(described(result, 'countTierWithoutSuccesses', 'countTiersSetSuccesses'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Every recipe tier sets its successes needed',
      satisfied: false,
      sentence:
        "Unset Work set no successes needed, so they use the check's 2 and are no harder than the default. Set successes needed on each tier before enabling.",
    });
    const salvage = evaluateCheckReadiness(FAULTS, { mode: 'simple', activity: 'salvage' });
    assert.equal(issue(salvage, 'countTierWithoutSuccesses'), undefined);
  });

  it('countRequiredExceedsMaxPool, the ceiling being the base plus the additional-dice max', () => {
    const result = evaluateCheckReadiness(FAULTS, { mode: 'simple', activity: 'crafting' });
    assert.deepEqual(
      described(result, 'countRequiredExceedsMaxPool', 'countRequiredWithinMaxPool'),
      {
        severity: 'critical',
        section: 'roll',
        tick: 'Successes needed fit within the most dice this check allows',
        satisfied: false,
        sentence:
          'The successes needed by Impossible Work exceed the 3 dice this check allows before any explode, so an attempt succeeds only when dice explode or are added. Lower the successes needed or allow more dice.',
      }
    );
    assert.deepEqual(
      described(result, 'countRequiredExceedsBasePool', 'countRequiredWithinBasePool'),
      {
        severity: 'warning',
        section: 'roll',
        tick: 'Successes needed fit within the base pool',
        satisfied: false,
        sentence:
          'The successes needed by Arcane Work exceed the base pool of 2 dice, so an attempt succeeds only when dice explode or are added to the pool.',
      }
    );
    const fits = evaluateCheckReadiness(check({ base: '4.5', required: 4 }), { mode: 'simple' });
    assert.equal(tick(fits, 'countRequiredWithinMaxPool').satisfied, true, 'a 4.5 base rolls 4');
    const over = evaluateCheckReadiness(check({ base: '3.9', required: 4 }), { mode: 'simple' });
    assert.ok(issue(over, 'countRequiredExceedsMaxPool'), 'a 3.9 base rounds down to 3');
  });

  it('keeps the ceiling at the base while additional dice are off, whatever max they retain', () => {
    const off = (max) => ({
      ...FAULTS,
      evaluation: count({
        ...FAULTS.evaluation.pool,
        additionalDice: { ...FAULTS.evaluation.pool.additionalDice, enabled: false, max },
      }),
    });
    for (const max of [1, 5]) {
      const result = evaluateCheckReadiness(off(max), { mode: 'simple', activity: 'crafting' });
      const entry = issue(result, 'countRequiredExceedsMaxPool');
      assert.deepEqual(entry.data, { names: 'Arcane Work, Impossible Work', ceiling: 2 }, `max ${max}`);
      assert.equal(issue(result, 'countRequiredExceedsBasePool'), undefined, `max ${max}`);
    }
  });

  it('floors a literal base as the runtime does: float noise, the one-die minimum, no negative dice', () => {
    const raises = (pool) => issue(evaluateCheckReadiness(check(pool), { mode: 'simple' }), 'countRequiredExceedsMaxPool');
    assert.ok(!raises({ base: '0', required: 1, zeroPoolFails: false }), 'a pool that cannot empty rolls one die');
    for (const base of ['0.7 + 0.2 + 0.1', '0.3 + 0.3 + 0.3 + 0.1']) {
      assert.ok(!raises({ base, required: 1 }), `${base} rolls one die, not none`);
    }
    const negative = raises({ base: '-2', required: 1 });
    assert.ok(negative, 'a pool below zero cannot meet one success');
    const sentence = checkIssueSentence(negative.id, negative.data, text);
    assert.ok(!/[-−]2 dice/.test(sentence), `no negative dice: ${sentence}`);
  });

  it('countPoolTooLarge, for a literal base above the dice Foundry rolls at once', () => {
    const result = evaluateCheckReadiness(check({ base: '1000', required: 1 }), { mode: 'progressive' });
    assert.deepEqual(described(result, 'countPoolTooLarge'), {
      severity: 'critical',
      section: 'roll',
      tick: null,
      satisfied: null,
      sentence:
        "This check's base pool is more than the 999 dice Foundry can roll at once, so the check cannot roll. Use a smaller pool.",
    });
    assert.ok(!issue(result, 'countRequiredExceedsMaxPool'), 'no ceiling row for a pool that cannot roll');
    for (const base of ['999', '@skills.smith.rank * 1000']) {
      const fits = evaluateCheckReadiness(check({ base, required: 1 }), { mode: 'simple' });
      assert.ok(!issue(fits, 'countPoolTooLarge'), `${base} raises nothing`);
    }
  });

  it('countRequiredExceedsBasePool, reachable once a ceiling rises above the base', () => {
    const requirements = [
      { defaultRecord: true, required: 2 },
      { name: 'Arcane Work', required: 3 },
      { name: 'Impossible Work', required: 4 },
    ];
    assert.deepEqual(countCeilingIssues({ base: 2, ceiling: 3, requirements }), {
      overMax: { names: 'Impossible Work' },
      overBase: { names: 'Arcane Work' },
    });
    assert.deepEqual(countCeilingIssues({ base: 2, ceiling: 2, requirements }), {
      overMax: { names: 'Arcane Work, Impossible Work' },
      overBase: { names: '' },
    });
    assert.deepEqual(countCeilingIssues({ base: 1, ceiling: 2, requirements }).overBase, {
      names: '',
      defaultRecord: true,
    });
    assert.equal(
      checkIssueSentence('countRequiredExceedsBasePool', { names: 'Arcane Work', base: 2 }, text),
      'The successes needed by Arcane Work exceed the base pool of 2 dice, so an attempt succeeds only when dice explode or are added to the pool.'
    );
  });

  it('names the default record in the reader’s language, before the tiers', () => {
    const draft = check({ base: '1', required: 2 }, { tiers: [{ id: 'arcane', name: 'Arcane Work', successes: 3 }] });
    const entry = issue(evaluateCheckReadiness(draft, { mode: 'simple', activity: 'crafting' }), 'countRequiredExceedsMaxPool');
    const german = (key, fallback) => (key.endsWith('PreviewAs.DefaultRecord') ? 'Standard' : fallback);
    assert.match(checkIssueSentence(entry.id, entry.data, text), /^The successes needed by Default, Arcane Work exceed/);
    assert.match(checkIssueSentence(entry.id, entry.data, german), /^The successes needed by Standard, Arcane Work exceed/);
  });

  it('raises no ceiling for a base that reads the character, and ticks why', () => {
    const result = evaluateCheckReadiness(check({ base: '@skills.smith.rank', required: 20 }), {
      mode: 'simple',
    });
    assert.equal(tick(result, 'countPoolCharacterDependent').satisfied, true);
    assert.equal(
      checkTickCopy('countPoolCharacterDependent').fallback,
      'The base pool reads the character, so it is compared with the successes needed only when a character rolls.'
    );
    assert.deepEqual(ids(result.issues), []);
  });

  it('grades no required count for fixed ranges or a progressive check', () => {
    for (const [mode, extra] of [
      ['progressive', {}],
      ['routed', { type: 'fixed', fixedOutcomes: [{ id: 'a', name: 'All', start: 0, end: 9, success: true }] }],
    ]) {
      const result = evaluateCheckReadiness({ ...FAULTS, ...extra }, { mode, activity: 'crafting' });
      assert.deepEqual(ids(result.issues), [], `${mode} raises no required-count row`);
    }
  });
});

describe('every count issue carries a title over its sentence', () => {
  it('titles each id, the prototype’s own where it draws one', () => {
    const titles = {
      countPoolInvalid: 'The base pool cannot be worked out',
      countThresholdInvalid: 'The success threshold cannot be worked out',
      countFaceBeyondDie: 'A face is not on the die',
      countExplodeUnbounded: 'The dice would explode forever',
      countTierWithoutSuccesses: 'A recipe tier sets no successes needed',
      countRequiredExceedsMaxPool: 'Successes needed above the most dice that can be rolled',
      countRequiredExceedsBasePool: 'Successes needed above the base pool',
      countPoolTooLarge: 'The base pool is too large to roll',
      countPathUnresolvedForPreview: 'A character path does not resolve',
      countValueNotNumericForPreview: 'A character value is not a number',
    };
    for (const [id, title] of Object.entries(titles)) {
      const data = { names: 'Arcane Work', actor: 'Vosk', path: '@x', ceiling: 2, base: 2, max: 999 };
      const words = checkIssueText(id, data, text);
      assert.equal(words.title, title, `${id} is titled`);
      assert.equal(words.detail, checkIssueSentence(id, data, text), `${id} keeps its sentence as detail`);
    }
  });
});

describe('the count transient warnings name the Preview-as actor and nothing counts them', () => {
  const pooled = check({ base: '@skills.smith.rank + 2', threshold: '@abilities.int.value' });

  it('countPathUnresolvedForPreview names every path the actor lacks', () => {
    const vosk = { name: 'Vosk', rollData: { skills: {} } };
    const result = evaluateCheckReadiness(pooled, { mode: 'simple', previewActor: vosk });
    assert.deepEqual(described(result, 'countPathUnresolvedForPreview'), {
      severity: 'warning',
      section: 'roll',
      tick: null,
      satisfied: null,
      sentence:
        'Vosk has no value at @skills.smith.rank, @abilities.int.value, so this check cannot roll for them.',
    });
    assert.deepEqual(ids(result.issues), [], 'never in the counted issues');
  });

  it('countValueNotNumericForPreview', () => {
    const wren = {
      name: 'Wren',
      rollData: { skills: { smith: { rank: 'high' } }, abilities: { int: { value: 3 } } },
    };
    const result = evaluateCheckReadiness(pooled, { mode: 'simple', previewActor: wren });
    assert.deepEqual(described(result, 'countValueNotNumericForPreview'), {
      severity: 'warning',
      section: 'roll',
      tick: null,
      satisfied: null,
      sentence:
        'The value this check reads from Wren is not a number, so this check cannot roll for them.',
    });
  });

  it('is raised only for a chosen actor who cannot read a pool without a fault of its own', () => {
    assert.deepEqual(ids(evaluateCheckReadiness(pooled, { mode: 'simple' }).transient), []);
    const idrin = {
      name: 'Idrin',
      rollData: { skills: { smith: { rank: 4 } }, abilities: { int: { value: 3 } } },
    };
    assert.deepEqual(ids(evaluateCheckReadiness(pooled, { mode: 'simple', previewActor: idrin }).transient), []);
    const broken = check({ base: '@skills.smith.rank + 1d4' });
    const vosk = { name: 'Vosk', rollData: {} };
    assert.deepEqual(ids(evaluateCheckReadiness(broken, { mode: 'simple', previewActor: vosk }).transient), []);
  });
});

// ── Issue 2006: the count ids' controls, and the three new rules ─────────────────────────────

describe('every count id names the control that clears it (N25)', () => {
  it('maps each registered count id, by kind or input where it has two', () => {
    const counted = CHECK_READINESS_ISSUE_IDS.filter((id) => id.startsWith('count'));
    assert.deepEqual(
      counted.filter((id) => !CHECK_ISSUE_CONTROLS[id]),
      [],
      'a count id with no control stays route-only once its control exists'
    );
    const control = (id, data) => issueControl({ id, data });
    assert.equal(control('countPoolInvalid'), 'checks-count-base');
    assert.equal(control('countPoolTooLarge'), 'checks-count-base');
    assert.equal(control('countThresholdInvalid'), 'checks-count-threshold');
    assert.equal(control('countExplodeUnbounded'), 'checks-count-explode');
    assert.equal(control('countFaceBeyondDie', { kind: 'explode' }), 'checks-count-explode-face');
    assert.equal(control('countFaceBeyondDie', { kind: 'cancel' }), 'checks-count-cancel-face');
    assert.equal(control('countFaceMissing', { kind: 'cancel' }), 'checks-count-cancel-face');
    assert.equal(control('countTierWithoutSuccesses'), 'checks-count-tier-successes');
    assert.equal(control('countRequiredExceedsMaxPool'), 'checks-count-required');
    assert.equal(control('countRequiredExceedsBasePool'), 'checks-count-required');
    assert.equal(control('countPathUnresolvedForPreview', { input: 'threshold' }), 'checks-count-threshold');
    assert.equal(control('countValueNotNumericForPreview', { input: 'base' }), 'checks-count-base');
    assert.equal(control('countTriggerGroupUnreachable'), 'checks-triggers');
    assert.equal(control('freeTextCountingFormula'), 'checks-roll-formula');
    assert.equal(control('unnamedOutcome'), undefined, 'an Outcomes tier stays route-only');
  });

  it('names the field a Preview-as actor cannot read', () => {
    const vosk = { name: 'Vosk', rollData: {} };
    const read = (pool) =>
      evaluateCheckReadiness(check(pool), { mode: 'simple', previewActor: vosk }).transient[0];
    assert.equal(issueControl(read({ base: '@skills.smith.rank' })), 'checks-count-base');
    assert.equal(issueControl(read({ threshold: '@abilities.int.value' })), 'checks-count-threshold');
  });
});

describe('countTierWithoutSuccesses blocks, and only with a tier present (N25)', () => {
  it('is critical with one null tier and silent with none', () => {
    const tiers = [{ id: 'unset', name: 'Unset Work', successes: null }];
    const routed = (list) => ({
      ...check({ required: 1 }),
      type: 'relative',
      relativeOutcomes: [{ id: 'a', name: 'Pass', success: true, dc: 0 }],
      tiers: list,
    });
    const one = evaluateCheckReadiness(routed(tiers), { mode: 'routed', activity: 'crafting' });
    assert.equal(issue(one, 'countTierWithoutSuccesses').severity, 'critical');
    const none = evaluateCheckReadiness(routed([]), { mode: 'routed', activity: 'crafting' });
    assert.equal(issue(none, 'countTierWithoutSuccesses'), undefined);
    assert.equal(tick(none, 'countTiersSetSuccesses'), undefined, 'no tick without a tier');
  });
});

describe('countFaceMissing blocks a from face with no value (ruling R2, N26)', () => {
  const missing = { enabled: true, faces: { kind: 'from', value: null } };

  it('is critical, names the rule and reads the approved sentence', () => {
    const explode = evaluateCheckReadiness(check({ explode: missing }), { mode: 'simple' });
    assert.deepEqual(described(explode, 'countFaceMissing', 'countFacesSet'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Explode and cancel faces are set',
      satisfied: false,
      sentence: 'Choose the face to explode from. Without one, this check cannot roll.',
    });
    assert.deepEqual(issue(explode, 'countFaceMissing').data, { kind: 'explode' });
    const cancel = evaluateCheckReadiness(check({ cancel: missing }), { mode: 'simple' });
    assert.equal(
      described(cancel, 'countFaceMissing').sentence,
      'Choose the face to cancel from. Without one, this check cannot roll.'
    );
  });

  it('raises one issue per missing face under one countFacesSet tick', () => {
    const both = evaluateCheckReadiness(check({ explode: missing, cancel: missing }), { mode: 'simple' });
    const raised = both.issues.filter((entry) => entry.id === 'countFaceMissing');
    assert.deepEqual(
      raised.map((entry) => [entry.severity, entry.data]),
      [
        ['critical', { kind: 'explode' }],
        ['critical', { kind: 'cancel' }],
      ]
    );
    assert.deepEqual(
      both.checks.filter((entry) => entry.id === 'countFacesSet'),
      [{ id: 'countFacesSet', satisfied: false }]
    );
  });

  it('is silent for a set face, an extreme face or a rule switched off', () => {
    for (const rule of [
      from(9),
      { enabled: true, faces: { kind: 'best', value: null } },
      { ...missing, enabled: false },
    ]) {
      const result = evaluateCheckReadiness(check({ explode: rule }), { mode: 'simple' });
      assert.equal(issue(result, 'countFaceMissing'), undefined, JSON.stringify(rule));
    }
    const set = evaluateCheckReadiness(check({ explode: from(9) }), { mode: 'simple' });
    assert.equal(tick(set, 'countFacesSet').satisfied, true);
    const extreme = evaluateCheckReadiness(check({}), { mode: 'simple' });
    assert.equal(tick(extreme, 'countFacesSet'), undefined, 'no tick without a from face');
  });
});

describe('countTriggerGroupUnreachable warns about dead dice triggers (ruling R3, N27)', () => {
  const dice = (id, groupId, aggregate, operator, value) => ({
    id,
    condition: { type: 'diceGroup', groupId, aggregate, operator, value },
    outcome: 'failure',
  });
  const withTriggers = (triggers, evaluation = count({ die: 10 })) => ({
    rollFormula: '1d20 + 1d6',
    evaluation,
    checkBreakage: { triggers },
  });
  const triggers = [
    dice('second', 1, 'anyDie', '==', 6),
    dice('twelve', 0, 'anyDie', '>=', 12),
    dice('ten', 0, 'anyDie', '==', 10),
    dice('sum', 0, 'total', '>=', 30),
    { id: 'net', condition: { type: 'rollTotal', operator: '<', value: 0 }, outcome: 'failure' },
  ];

  it('names each trigger that cannot fire against its own formula, quoted, outside the enable gate', () => {
    const draft = withTriggers(triggers);
    const before = structuredClone(draft);
    const result = evaluateCheckReadiness(draft, { mode: 'simple' });
    assert.deepEqual(described(result, 'countTriggerGroupUnreachable', 'countTriggersReachable'), {
      severity: 'warning',
      section: 'triggers',
      tick: 'Every dice trigger can fire on the pool',
      satisfied: false,
      sentence:
        'The triggers “Any die of 1d6 is exactly 6”, “Any die of 1d20 is at least 12” read dice this pool never rolls, so they cannot fire while the check counts successes. They are kept and work again if the check adds the dice.',
    });
    assert.deepEqual(draft, before, 'the triggers are neither rewritten nor removed');
    assert.ok(
      result.issues.every((entry) => entry.id !== 'countTriggerGroupUnreachable' || entry.severity !== 'critical'),
      'it never feeds the blocking tally'
    );
  });

  it('names one trigger in the singular, a repeated die by its ordinal and a lost group by number', () => {
    const sentence = (rollFormula, list) =>
      checkIssueSentence(
        'countTriggerGroupUnreachable',
        issue(evaluateCheckReadiness({ ...withTriggers(list), rollFormula }, { mode: 'simple' }), 'countTriggerGroupUnreachable').data,
        text
      );
    assert.equal(
      sentence('1d20 + 1d6', triggers.slice(0, 1)),
      'The trigger “Any die of 1d6 is exactly 6” reads dice this pool never rolls, so it cannot fire while the check counts successes. It is kept and works again if the check adds the dice.'
    );
    assert.match(sentence('1d6 + 1d6', triggers.slice(0, 1)), /^The trigger “Any die of 1d6 #2 is exactly 6” reads/);
    assert.match(sentence('1d20', triggers.slice(0, 1)), /^The trigger “Any die of dice group 2 is exactly 6” reads/);
  });

  it('is silent while the check adds the dice, and for triggers the pool can fire', () => {
    const summing = withTriggers(triggers, { product: 'sum' });
    assert.equal(issue(evaluateCheckReadiness(summing, { mode: 'simple' }), 'countTriggerGroupUnreachable'), undefined);
    const live = withTriggers(triggers.slice(2));
    const result = evaluateCheckReadiness(live, { mode: 'simple' });
    assert.equal(issue(result, 'countTriggerGroupUnreachable'), undefined);
    assert.equal(tick(result, 'countTriggersReachable').satisfied, true);
  });
});

describe('freeTextCountingFormula is a summing warning only (N24)', () => {
  const summed = (rollFormula, evaluation = { product: 'sum' }) => ({ rollFormula, dc: 2, evaluation });

  it('warns on a summing counting formula, never while the check counts', () => {
    const result = evaluateCheckReadiness(summed('6d10cs>=8'), { mode: 'simple' });
    assert.deepEqual(described(result, 'freeTextCountingFormula', 'summedFormulaCountsNothing'), {
      severity: 'warning',
      section: 'roll',
      tick: 'No summing formula counts successes',
      satisfied: false,
      sentence:
        'The total of 6d10cs>=8 is a count, so every bonus and DC here is measured against the wrong number.',
    });
    const counting = evaluateCheckReadiness(summed('6d10cs>=8', count()), { mode: 'simple' });
    assert.equal(issue(counting, 'freeTextCountingFormula'), undefined);
  });

  it('raises nothing, not even a tick, for a formula that does not count', () => {
    for (const formula of ['2d20kh1', '1d20 + 5']) {
      const result = evaluateCheckReadiness(summed(formula), { mode: 'simple' });
      assert.equal(issue(result, 'freeTextCountingFormula'), undefined, formula);
      assert.equal(tick(result, 'summedFormulaCountsNothing'), undefined, formula);
    }
  });

  it('says what Convert keeps, leaves behind and cannot copy', () => {
    const sentence = (data) => checkIssueSentence('freeTextCountingFormula', { formula: '2d20cs<=10', ...data }, text);
    assert.match(sentence({ convertible: true, dynamic: true }), /Converting keeps the macro, and its return is then read as the successes needed\.$/);
    assert.match(
      sentence({ convertible: true, overrides: 'Iron, Tin' }),
      /Iron, Tin override the DC but not the successes needed, so after converting they use the check's successes needed\.$/
    );
    assert.match(sentence({ convertible: false, outOfRange: 21 }), /It cannot be converted: it would need 21 successes, outside 0 to 20\.$/);
    assert.match(sentence({ convertible: false, outOfRange: -1 }), /need −1 successes/);
  });
});

describe('the three new ids carry titles', () => {
  it('titles each over its sentence', () => {
    assert.equal(checkIssueText('freeTextCountingFormula', { formula: 'x' }, text).title, 'This formula counts successes, but the check adds the dice');
    assert.equal(checkIssueText('countFaceMissing', { kind: 'cancel' }, text).title, 'A face to explode or cancel from is not chosen');
    assert.equal(checkIssueText('countTriggerGroupUnreachable', { triggers: [] }, text).title, 'A trigger reads dice the pool never rolls');
  });
});

// ── Issue 2008: the additional-dice rows ──────────────────────────────────────────────────────

const PATH = 'system.resources.momentum.value';
const extra = (additionalDice, pool = {}) =>
  check({ ...pool, additionalDice: { enabled: true, source: 'path', path: PATH, max: 1, ...additionalDice } });
const macros = (readMacroUuid, spendMacroUuid) =>
  extra({ source: 'macro', path: '', readMacroUuid, spendMacroUuid });

/** `fromUuidSync` as core answers it, restored after the test; `calls` records each lookup. */
function stubFromUuidSync(t, answers) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'fromUuidSync');
  const calls = [];
  const value = (uuid, options) => {
    calls.push([uuid, options]);
    const answer = answers[uuid];
    if (answer instanceof Error) throw answer;
    return answer === undefined ? null : answer;
  };
  Object.defineProperty(globalThis, 'fromUuidSync', { value, configurable: true, writable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'fromUuidSync', previous);
    else delete globalThis.fromUuidSync;
  });
  return calls;
}

describe('countAdditionalDiceSourceMissing blocks additional dice with nothing to pay for them', () => {
  it('is critical, ticks, and reads frame 22’s title over its sentence', () => {
    const result = evaluateCheckReadiness(extra({ path: '  ' }), { mode: 'simple' });
    assert.deepEqual(described(result, 'countAdditionalDiceSourceMissing', 'countAdditionalDiceSourceSet'), {
      severity: 'critical',
      section: 'roll',
      tick: 'Additional dice have a source to pay for them',
      satisfied: false,
      sentence:
        'Set the value on the crafting character or the macro pair that pays for them, or turn additional dice off.',
    });
    assert.equal(
      checkIssueText('countAdditionalDiceSourceMissing', { input: 'path' }, text).title,
      'Additional dice are allowed but have no source'
    );
    assert.equal(issueControl(issue(result, 'countAdditionalDiceSourceMissing')), 'checks-additional-dice-path');
  });

  it('names the first missing macro, read before spend', (t) => {
    stubFromUuidSync(t, { 'Macro.read': { documentName: 'Macro', type: 'script' } });
    const control = (draft) =>
      issueControl(issue(evaluateCheckReadiness(draft, { mode: 'simple' }), 'countAdditionalDiceSourceMissing'));
    assert.equal(control(macros('', '')), 'checks-additional-dice-read-macro');
    assert.equal(control(macros('', 'Macro.read')), 'checks-additional-dice-read-macro');
    assert.equal(control(macros('Macro.read', ' ')), 'checks-additional-dice-spend-macro');
  });

  it('is satisfied by a path, or by both macros, whichever source pays', (t) => {
    stubFromUuidSync(t, { 'Macro.read': { documentName: 'Macro', type: 'script' } });
    for (const draft of [extra({}), macros('Macro.read', 'Macro.read'), extra({ readMacroUuid: '' })]) {
      const result = evaluateCheckReadiness(draft, { mode: 'simple' });
      assert.equal(issue(result, 'countAdditionalDiceSourceMissing'), undefined);
      assert.equal(tick(result, 'countAdditionalDiceSourceSet').satisfied, true);
    }
  });
});

describe('countAdditionalDicePathInvalid blocks a value that is not a stored path', () => {
  it('flags an expression, a roll-data reference, a list entry or a numeric segment', () => {
    for (const path of [
      '@resources.momentum.value',
      'system.resources.momentum.value + 1',
      'system.items[0].value',
      'system.items.0.value',
      'system resources',
      'system..value',
      'flags.my-module',
    ]) {
      const result = evaluateCheckReadiness(extra({ path }), { mode: 'simple' });
      assert.deepEqual(
        described(result, 'countAdditionalDicePathInvalid', 'countAdditionalDicePathStored'),
        {
          severity: 'critical',
          section: 'roll',
          tick: 'The additional-dice value is a stored path on the character',
          satisfied: false,
          sentence:
            'The value that pays for additional dice must be a path on the character, such as system.resources.momentum.value, not an expression or a list entry.',
        },
        path
      );
      assert.equal(issueControl(issue(result, 'countAdditionalDicePathInvalid')), 'checks-additional-dice-path');
    }
  });

  it('passes a dotted path of identifiers, trimmed', () => {
    for (const path of [PATH, ` ${PATH} `, 'system.attributes.ki_2.value']) {
      const result = evaluateCheckReadiness(extra({ path }), { mode: 'simple' });
      assert.equal(issue(result, 'countAdditionalDicePathInvalid'), undefined, path);
      assert.equal(tick(result, 'countAdditionalDicePathStored').satisfied, true, path);
    }
  });

  it('leaves a blank path to the source row', () => {
    const result = evaluateCheckReadiness(extra({ path: '' }), { mode: 'simple' });
    assert.equal(issue(result, 'countAdditionalDicePathInvalid'), undefined);
    assert.equal(tick(result, 'countAdditionalDicePathStored'), undefined);
  });
});

describe('countAdditionalDiceMacroInvalid reads each linked macro synchronously', () => {
  const INDEX_ENTRY = {
    _id: 'idx',
    uuid: 'Compendium.world.macros.Macro.idx',
    pack: 'world.macros',
    name: 'Spend momentum',
    img: 'icons/svg/dice-target.svg',
    sort: 0,
    folder: null,
  };
  const ANSWERS = {
    'Macro.script': { documentName: 'Macro', type: 'script', name: 'Momentum' },
    'Macro.chat': { documentName: 'Macro', type: 'chat', name: 'Say' },
    'Actor.vosk': { documentName: 'Actor', type: 'character', name: 'Vosk' },
    'Item.script': { documentName: 'Item', type: 'script', name: 'A system item type' },
    'JournalEntry.notes': { documentName: 'JournalEntry', name: 'Notes' },
    'Compendium.world.macros.Macro.idx': INDEX_ENTRY,
    'Macro.throws': new Error('malformed'),
  };

  it('flags a missing uuid, a loaded non-Macro document and a non-script macro', (t) => {
    const calls = stubFromUuidSync(t, ANSWERS);
    for (const uuid of ['Macro.gone', 'Actor.vosk', 'Item.script', 'JournalEntry.notes', 'Macro.chat']) {
      const result = evaluateCheckReadiness(macros(uuid, 'Macro.script'), { mode: 'simple' });
      assert.deepEqual(
        described(result, 'countAdditionalDiceMacroInvalid', 'countAdditionalDiceMacrosScript'),
        {
          severity: 'critical',
          section: 'roll',
          tick: 'Both additional-dice macros are script macros',
          satisfied: false,
          sentence:
            'The read macro is missing or is not a script macro, so players cannot buy additional dice. Link a script macro.',
        },
        uuid
      );
      assert.equal(issueControl(issue(result, 'countAdditionalDiceMacroInvalid')), 'checks-additional-dice-read-macro');
    }
    assert.ok(calls.length > 0 && calls.every(([, options]) => options?.strict === false), 'non-strict');
    const spend = evaluateCheckReadiness(macros('Macro.script', 'Macro.chat'), { mode: 'simple' });
    const entry = issue(spend, 'countAdditionalDiceMacroInvalid');
    assert.equal(issueControl(entry), 'checks-additional-dice-spend-macro');
    assert.match(checkIssueSentence(entry.id, entry.data, text), /^The spend macro is missing/);
    const both = evaluateCheckReadiness(macros('Macro.chat', 'Actor.vosk'), { mode: 'simple' });
    assert.deepEqual(
      both.issues.filter((row) => row.id === 'countAdditionalDiceMacroInvalid').map((row) => row.data),
      [{ kind: 'read' }, { kind: 'spend' }]
    );
  });

  it('raises nothing for a script macro, a compendium index entry or a lookup that throws', (t) => {
    stubFromUuidSync(t, ANSWERS);
    for (const uuid of ['Macro.script', 'Compendium.world.macros.Macro.idx', 'Macro.throws']) {
      const result = evaluateCheckReadiness(macros(uuid, uuid), { mode: 'simple' });
      assert.equal(issue(result, 'countAdditionalDiceMacroInvalid'), undefined, uuid);
      assert.equal(tick(result, 'countAdditionalDiceMacrosScript').satisfied, true, uuid);
    }
  });

  it('localizes which macro through the Studio’s text', () => {
    const spendWord = (key, fallback) => (key.endsWith('MacroKindSpend') ? 'SPEND' : fallback);
    const localized = checkIssueSentence('countAdditionalDiceMacroInvalid', { kind: 'spend' }, spendWord);
    assert.match(localized, /^The SPEND macro is missing/);
  });
});

describe('the additional-dice rows stay silent while additional dice cannot apply', () => {
  const ROW_IDS = new Set([
    'countAdditionalDiceSourceMissing',
    'countAdditionalDicePathInvalid',
    'countAdditionalDiceMacroInvalid',
    'countAdditionalDicePathUnresolvedForPreview',
  ]);
  const raised = (result) => [...ids(result.issues), ...ids(result.transient)].filter((id) => ROW_IDS.has(id));
  const vosk = { name: 'Vosk', rollData: {}, readStored: () => ({ value: undefined, overridden: false }) };

  it('raises no row and no tick with the toggle off', (t) => {
    stubFromUuidSync(t, {});
    for (const additionalDice of [
      { enabled: false, path: '' },
      { enabled: false, path: '@momentum' },
      { enabled: false, path: PATH },
      { enabled: false, source: 'macro', readMacroUuid: 'Macro.gone', spendMacroUuid: '' },
    ]) {
      const result = evaluateCheckReadiness(extra(additionalDice), { mode: 'simple', previewActor: vosk });
      assert.deepEqual(raised(result), [], JSON.stringify(additionalDice));
      assert.ok(result.checks.every((row) => !row.id.startsWith('countAdditionalDice')));
    }
  });

  it('raises no row on a summing check', (t) => {
    stubFromUuidSync(t, {});
    for (const additionalDice of [
      { enabled: true, source: 'path', path: '' },
      { enabled: true, source: 'macro', readMacroUuid: 'Macro.gone' },
    ]) {
      const summing = { rollFormula: '1d20', evaluation: { product: 'sum', pool: { additionalDice } } };
      const result = evaluateCheckReadiness(summing, { mode: 'simple', previewActor: vosk });
      assert.deepEqual(raised(result), [], JSON.stringify(additionalDice));
    }
  });
});

describe('countAdditionalDicePathUnresolvedForPreview names the Preview-as actor, and nothing counts it', () => {
  const actor = (value, overridden = false) => ({
    name: 'Vosk',
    rollData: {},
    readStored: (path) => (path === PATH ? { value, overridden } : { value: undefined, overridden: false }),
  });
  const read = (previewActor, draft = extra({})) => evaluateCheckReadiness(draft, { mode: 'simple', previewActor });

  it('warns when the stored value is not a finite number', () => {
    for (const value of [undefined, '3', NaN, null]) {
      const result = read(actor(value));
      assert.deepEqual(
        described(result, 'countAdditionalDicePathUnresolvedForPreview', null),
        {
          severity: 'warning',
          section: 'roll',
          tick: null,
          satisfied: null,
          sentence: `Vosk has no stored number at ${PATH}, so no dice can be added for them.`,
        },
        String(value)
      );
      assert.deepEqual(ids(result.issues), [], 'never in the counted issues');
      assert.equal(issueControl(result.transient[0]), 'checks-additional-dice-path');
    }
  });

  it('warns when an active effect overrides the stored value', () => {
    const result = read(actor(2, true));
    assert.equal(
      described(result, 'countAdditionalDicePathUnresolvedForPreview', null).sentence,
      `An active effect changes Vosk's ${PATH}, so no dice can be added for them.`
    );
  });

  it('is silent for a stored number, with no actor, or for a path no row lets it read', () => {
    assert.deepEqual(ids(read(actor(2)).transient), []);
    assert.deepEqual(ids(read(actor(0)).transient), []);
    assert.deepEqual(ids(read(null).transient), []);
    assert.deepEqual(ids(read(actor(undefined), extra({ path: '@momentum' })).transient), []);
    assert.deepEqual(ids(read(actor(undefined), extra({ path: '' })).transient), []);
  });

  it('titles each additional-dice row', () => {
    const titles = {
      countAdditionalDiceSourceMissing: 'Additional dice are allowed but have no source',
      countAdditionalDicePathInvalid: 'The additional-dice value is not a stored path',
      countAdditionalDiceMacroInvalid: 'An additional-dice macro is not a script macro',
      countAdditionalDicePathUnresolvedForPreview: 'The additional-dice value cannot be spent',
    };
    for (const [id, title] of Object.entries(titles)) {
      assert.equal(checkIssueText(id, { actor: 'Vosk', path: PATH, kind: 'read' }, text).title, title, id);
    }
  });
});

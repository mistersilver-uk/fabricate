/** Checks readiness for success-counting pools (issue 2004). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  countCeilingIssues,
  evaluateCheckReadiness,
  sectionForIssue,
} from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  checkIssueSentence,
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
      severity: 'warning',
      section: 'roll',
      tick: 'Every recipe tier sets its successes needed',
      satisfied: false,
      sentence:
        "Unset Work set no successes needed, so they use the check's 2 and are no harder than the default. Set successes needed on each tier.",
    });
    const salvage = evaluateCheckReadiness(FAULTS, { mode: 'simple', activity: 'salvage' });
    assert.equal(issue(salvage, 'countTierWithoutSuccesses'), undefined);
  });

  it('countRequiredExceedsMaxPool, the ceiling being the base while additional dice wait', () => {
    const result = evaluateCheckReadiness(FAULTS, { mode: 'simple', activity: 'crafting' });
    assert.deepEqual(
      described(result, 'countRequiredExceedsMaxPool', 'countRequiredWithinMaxPool'),
      {
        severity: 'critical',
        section: 'roll',
        tick: 'Successes needed fit within the most dice this check allows',
        satisfied: false,
        sentence:
          'The successes needed by Arcane Work, Impossible Work exceed the 2 dice this check allows before any explode, so an attempt succeeds only when dice explode or are added. Lower the successes needed or allow more dice.',
      }
    );
    assert.equal(issue(result, 'countRequiredExceedsBasePool'), undefined);
    const fits = evaluateCheckReadiness(check({ base: '4.5', required: 4 }), { mode: 'simple' });
    assert.equal(tick(fits, 'countRequiredWithinMaxPool').satisfied, true, 'a 4.5 base rolls 4');
    const over = evaluateCheckReadiness(check({ base: '3.9', required: 4 }), { mode: 'simple' });
    assert.ok(issue(over, 'countRequiredExceedsMaxPool'), 'a 3.9 base rounds down to 3');
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

  it('countRequiredExceedsBasePool, reachable once a ceiling rises above the base', () => {
    const requirements = [
      { name: 'Default', required: 2 },
      { name: 'Arcane Work', required: 3 },
      { name: 'Impossible Work', required: 4 },
    ];
    assert.deepEqual(countCeilingIssues({ base: 2, ceiling: 3, requirements }), {
      overMax: 'Impossible Work',
      overBase: 'Arcane Work',
    });
    assert.deepEqual(countCeilingIssues({ base: 2, ceiling: 2, requirements }), {
      overMax: 'Arcane Work, Impossible Work',
      overBase: '',
    });
    assert.equal(
      checkIssueSentence('countRequiredExceedsBasePool', { names: 'Arcane Work', base: 2 }, text),
      'The successes needed by Arcane Work exceed the base pool of 2 dice, so an attempt succeeds only when dice explode or are added to the pool.'
    );
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

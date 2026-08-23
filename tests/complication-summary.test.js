/**
 * `src/utils/complicationSummary.js` — the ONE localized trigger sentence a component
 * complication describes itself with (issue 1286).
 *
 * It is a pure leaf, and until this suite existed it had no suite: it was reached only
 * incidentally, by two mounted Svelte suites that assert the sentence appears in a row
 * body and not what the sentence says. Four separate mutations survived a full green run
 * under that arrangement, and every one of them is a sentence that lies to a GM:
 *
 *  1. ignoring `match: 'all'` — an all-clauses complication describing itself as any-clause,
 *     which inverts the firing rule the GM authored;
 *  2. rendering an unknown comparator as `''` — the malformed operand the normalizer
 *     deliberately PRESERVES so the GM can see and fix it, made invisible again;
 *  3. rendering a NAMED check trigger as the unnamed clause, which makes
 *     `CheckTriggerNamed` dead;
 *  4. returning `''` when nothing is enabled, which kills the one string that tells a GM
 *     their complication can never fire.
 *
 * The GM-facing/player-facing split is enforced elsewhere (`ComplicationSummaryRow` types
 * its body slot per variant), so nothing here asserts it; what it does assert is that this
 * sentence STATES the conditions, which is exactly the fact that split exists to contain.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPLICATION_SUMMARY_STRINGS,
  complicationSummary,
} from '../src/utils/complicationSummary.js';
import { authoredComplications } from '../src/utils/componentComplications.js';

let minted = 0;

/**
 * One complication in its NORMALIZED shape — the shape this builder documents as its
 * input — rather than a hand-written literal. A literal would let the summary read a key
 * the normalizer does not actually produce, and both defects the comparator tests below
 * turn on are properties of what the normalizer PRESERVES.
 */
function complication(overrides = {}) {
  const { complications } = authoredComplications([overrides], () => `cx${++minted}`);
  return complications[0];
}

/**
 * A translator that returns a DISTINGUISHABLE template per key, so an assertion cannot be
 * satisfied by the English fallback of some other clause. It also proves the injection
 * point: the caller passes a template and the substitution happens in the module.
 */
function tagged(overrides = {}) {
  const byKey = new Map(
    Object.entries(COMPLICATION_SUMMARY_STRINGS).map(([name, [key, fallback]]) => [
      key,
      overrides[name] ?? fallback,
    ])
  );
  return (key, fallback) => byKey.get(key) ?? fallback;
}

describe('complicationSummary: the clauses, and the conjunction that joins them', () => {
  it('renders the prototype clause order: missed, partial, awarded, trigger, roll', () => {
    const sentence = complicationSummary(
      complication({
        // Deliberately authored out of order: the ORDER is the builder's, not the record's.
        when: { checkTrigger: 'trig-1', stageAwarded: true, stagePartial: true, stageMissed: true },
        rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
      }),
      { triggerName: '' }
    );

    assert.equal(
      sentence,
      'When the award is missed or the award is only partly covered or the award is granted ' +
        'or a check trigger fires or 1d20 = 1'
    );
  });

  it('joins with AND for `match: "all"` and with OR for `match: "any"`', () => {
    const clauses = { when: { stageMissed: true, stageAwarded: true } };
    const all = complicationSummary(complication({ ...clauses, match: 'all' }));
    const any = complicationSummary(complication({ ...clauses, match: 'any' }));

    assert.equal(all, 'When the award is missed and the award is granted');
    assert.equal(any, 'When the award is missed or the award is granted');
    assert.notEqual(all, any, 'ignoring `match` describes an all-clauses complication as any');
  });

  it('joins with OR for a complication whose `match` the normalizer defaulted', () => {
    // `any` IS the default, so the ANY case is the one a wrong-by-default reading gets
    // right. Pinned separately from the explicit `any` above so the two cannot be conflated.
    const defaulted = complication({
      match: 'constructor',
      when: { stageMissed: true, stageAwarded: true },
    });
    assert.equal(defaulted.match, 'any', 'the normalizer clamps an unknown mode');
    assert.equal(
      complicationSummary(defaulted),
      'When the award is missed or the award is granted'
    );
  });

  it('joins a single clause with nothing at all', () => {
    for (const match of ['any', 'all']) {
      assert.equal(
        complicationSummary(complication({ match, when: { stageAwarded: true } })),
        'When the award is granted',
        `a lone clause takes no conjunction under match=${match}`
      );
    }
  });
});

describe('complicationSummary: the check-trigger clause', () => {
  it('NAMES the trigger when the caller resolved a name for it', () => {
    assert.equal(
      complicationSummary(complication({ when: { checkTrigger: 'trig-1' } }), {
        triggerName: 'Natural 1',
      }),
      'When Natural 1 fires'
    );
  });

  it('falls back to the unnamed clause when the id resolves to nothing', () => {
    // A trigger the GM deleted still has its id on the complication; the row cannot name
    // it, and "a check trigger fires" is the honest sentence for that.
    const authored = complication({ when: { checkTrigger: 'trig-gone' } });
    assert.equal(complicationSummary(authored), 'When a check trigger fires');
    assert.equal(complicationSummary(authored, { triggerName: '' }), 'When a check trigger fires');
    assert.notEqual(
      complicationSummary(authored, { triggerName: 'Natural 1' }),
      complicationSummary(authored),
      'the named and unnamed forms must differ, or the named clause is dead'
    );
  });

  it('renders no trigger clause at all for a complication that names none', () => {
    const sentence = complicationSummary(
      complication({ when: { stageAwarded: true, checkTrigger: '   ' } }),
      { triggerName: 'Natural 1' }
    );
    assert.equal(sentence, 'When the award is granted');
    assert.equal(
      sentence.includes('Natural 1'),
      false,
      'a name the caller happens to hold cannot invent a clause the record does not carry'
    );
  });
});

describe('complicationSummary: the roll condition', () => {
  it('renders the expression, the operator GLYPH and the comparand', () => {
    assert.equal(
      complicationSummary(
        complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'gte', value: '15' } })
      ),
      'When 1d20 ≥ 15'
    );
  });

  it('takes the glyph from the shared prerequisite table, for every numeric comparator', () => {
    const glyphs = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].map((cmp) =>
      complicationSummary(
        complication({ rollCondition: { enabled: true, expr: '1d20', cmp, value: '5' } })
      )
    );
    assert.deepEqual(glyphs, [
      'When 1d20 = 5',
      'When 1d20 ≠ 5',
      'When 1d20 > 5',
      'When 1d20 ≥ 5',
      'When 1d20 < 5',
      'When 1d20 ≤ 5',
    ]);
  });

  it('renders an UNKNOWN comparator as its own id rather than as nothing', () => {
    // The normalizer preserves a malformed comparator verbatim precisely so a GM can see
    // and fix it (only the closed vocabularies clamp). A sentence that dropped it would
    // read "When 1d20 15" — a comparison with no comparison in it — and hide the very
    // thing preservation exists to surface.
    const authored = complication({
      rollCondition: { enabled: true, expr: '1d20', cmp: 'roughly', value: '15' },
    });
    assert.equal(authored.rollCondition.cmp, 'roughly', 'the normalizer preserved it');
    assert.equal(complicationSummary(authored), 'When 1d20 roughly 15');
  });

  it('renders the prototype `ne` alias through the same glyph as `neq`', () => {
    assert.equal(
      complicationSummary(
        complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'ne', value: '1' } })
      ),
      'When 1d20 ≠ 1'
    );
  });

  it('renders nothing for a roll condition that is authored but not enabled', () => {
    assert.equal(
      complicationSummary(
        complication({
          when: { stageAwarded: true },
          rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
        })
      ),
      'When the award is granted'
    );
  });
});

describe('complicationSummary: the effects tail', () => {
  it('names the effect roll and the macro, in that order, on one sentence', () => {
    assert.equal(
      complicationSummary(
        complication({
          when: { stageMissed: true },
          effectRoll: { enabled: true, expr: '2d6' },
          macroUuid: 'Macro.shrapnel',
        }),
        { macroName: 'Shrapnel Burst' }
      ),
      'When the award is missed · rolls 2d6, runs Shrapnel Burst'
    );
  });

  it('renders the UNNAMED macro tail rather than a uuid the GM recognises nothing in', () => {
    assert.equal(
      complicationSummary(
        complication({ when: { stageMissed: true }, macroUuid: 'Macro.shrapnel' })
      ),
      'When the award is missed · runs a macro'
    );
  });

  it('drops the effects half entirely when there is nothing to say', () => {
    assert.equal(
      complicationSummary(complication({ when: { stageMissed: true } })),
      'When the award is missed'
    );
  });

  it('renders no effects for a complication whose effect roll is off', () => {
    assert.equal(
      complicationSummary(
        complication({
          when: { stageMissed: true },
          effectRoll: { enabled: false, expr: '2d6' },
        })
      ),
      'When the award is missed'
    );
  });
});

describe('complicationSummary: a complication that can never fire says so', () => {
  it('returns the NO-TRIGGER sentence, never an empty string', () => {
    // The one string that tells a GM their complication is inert. An empty sentence would
    // render as a blank row body — indistinguishable from a complication that simply has
    // a short trigger — and the authoring row would say nothing at all.
    const sentence = complicationSummary(complication({}));
    assert.equal(sentence, 'No trigger set — never fires');
    assert.notEqual(sentence, '');
  });

  it('says so even when the complication authors EFFECTS but no trigger', () => {
    assert.equal(
      complicationSummary(
        complication({ effectRoll: { enabled: true, expr: '2d6' }, macroUuid: 'Macro.x' }),
        { macroName: 'Shrapnel Burst' }
      ),
      'No trigger set — never fires',
      'effects without a trigger never happen, so the sentence must not describe them'
    );
  });

  it('says so for a null, undefined or junk complication rather than throwing', () => {
    for (const value of [null, undefined, 'nonsense', 42, []]) {
      assert.equal(complicationSummary(value), 'No trigger set — never fires');
    }
  });

  it('reads a stage flag STRICTLY, so a truthy junk value is not a trigger', () => {
    assert.equal(
      complicationSummary({ when: { stageAwarded: 'yes' }, match: 'any' }),
      'No trigger set — never fires'
    );
  });
});

describe('complicationSummary: the injected translator', () => {
  it('asks for a TEMPLATE per key and substitutes here, so a missing key degrades intact', () => {
    const asked = [];
    const sentence = complicationSummary(
      complication({
        when: { stageMissed: true },
        rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
        effectRoll: { enabled: true, expr: '2d6' },
      }),
      {
        translate: (key, fallback) => {
          asked.push(key);
          return fallback;
        },
      }
    );

    assert.ok(sentence.includes('1d20 = 1'), 'the substitution happened in the module');
    assert.ok(
      asked.every((key) => key.startsWith('FABRICATE.Admin.Manager.Component.Complications.')),
      'every key is a FULL literal, which is what `ui-lang-keys-resolve` can see'
    );
    assert.deepEqual(
      asked.filter((key) => !Object.values(COMPLICATION_SUMMARY_STRINGS).some(([k]) => k === key)),
      [],
      'and every key asked for is one this module declares'
    );
  });

  it('honours a LOCALIZED template, including one that reorders the placeholders', () => {
    const sentence = complicationSummary(
      complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'gt', value: '15' } }),
      {
        translate: tagged({
          Sentence: 'Wenn {clauses}',
          RollCondition: '{value} {operator} {expr}',
        }),
      }
    );
    assert.equal(sentence, 'Wenn 15 > 1d20');
  });

  it('never rescans substituted TEXT for a placeholder of its own', () => {
    // Placeholder-by-placeholder substitution, not a regex over the data: an authored
    // expression carrying braces must land as text rather than being read as a slot.
    assert.equal(
      complicationSummary(
        complication({
          rollCondition: { enabled: true, expr: '{value}', cmp: 'eq', value: '{expr}' },
        })
      ),
      'When {value} = {expr}',
      'the two authored strings must not swap places, nor consume one another'
    );
  });

  it('leaves a placeholder this builder does not supply VISIBLE rather than emptying it', () => {
    // A localized template that reaches for a slot the builder never fills is a broken
    // translation, and it must read as one. Emptying it would silently lose a word from
    // the middle of a GM's sentence in exactly one language.
    assert.equal(
      complicationSummary(complication({ when: { stageAwarded: true } }), {
        translate: tagged({ Sentence: 'When {clauses} for {actor}' }),
      }),
      'When the award is granted for {actor}'
    );
  });

  it('declares a key and a STRING fallback for every clause it can render', () => {
    for (const [name, entry] of Object.entries(COMPLICATION_SUMMARY_STRINGS)) {
      assert.ok(Array.isArray(entry) && entry.length === 2, `${name} is a [key, fallback] pair`);
      assert.equal(typeof entry[0], 'string');
      assert.equal(typeof entry[1], 'string');
      assert.ok(entry[1].length > 0, `${name} has a non-empty English fallback`);
    }
    assert.ok(Object.isFrozen(COMPLICATION_SUMMARY_STRINGS));
  });
});

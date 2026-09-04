/**
 * The pure half of the world Component screens (issue 1371, epic 1357).
 *
 * Three things are settled here rather than on a mounted tree, because each of them is a
 * PROPERTY OF A FUNCTION and a mounted assertion could only ever observe it through a rendered
 * consequence that a hand-built fixture can also produce:
 *
 *  - that an INHERITING `category` really does resolve from the world default, which is the
 *    premise every screen in this lane rests on;
 *  - that the category picker's offered set refuses the reserved bucket CASE-INSENSITIVELY;
 *  - that each validation check renders at its declared SEVERITY, so a legitimately blank entry
 *    warns rather than blocking.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveComponentScope } from '../../src/systems/componentScope.js';
import {
  componentScopeValidation,
  componentScopeValidationPresentation,
} from '../../src/utils/componentScopeValidation.js';
import {
  componentAttributionNote,
  componentCategoryInheritOffered,
  componentCategoryNote,
  componentDeleteNote,
  componentRowStats,
  componentWorldCategoryNote,
  componentWorldTagNote,
  offeredWorldComponentCategories,
} from '../../src/ui/svelte/apps/manager/scoped/componentScoped.js';

/** The interpolating localizer these leaves take, with no localization seam in the way. */
const phrase = (_key, fallback, data) =>
  Object.entries(data ?? {}).reduce(
    (copy, [token, value]) => copy.replaceAll(`{${token}}`, String(value)),
    fallback
  );

/**
 * A one-component world corpus, with the inherit switch and the world category as parameters.
 *
 * @param {object} options
 * @param {boolean} options.inheriting
 * @param {string|undefined} options.worldCategory
 * @returns {object}
 */
function corpus({ inheriting, worldCategory }) {
  return {
    entities: [{ id: 'ingot', name: 'Iron Ingot' }],
    defaults: worldCategory === undefined ? [] : [{ id: 'ingot', category: worldCategory }],
    membership: [{ entityId: 'ingot', systemId: 'sys-forge', inherit: { category: inheriting } }],
  };
}

/** The system's own surviving in-system array, which carries its own category. */
const IN_SYSTEM = [{ id: 'ingot', name: 'Iron Ingot', category: 'ingot', tags: [] }];

describe('the component read union answers an inheriting category from the world default', () => {
  // AC-5. THIS IS THE PREMISE THE WHOLE LANE RESTS ON. Under the retired blanket form of
  // `## Scoped Entity Definitions` requirement 15 clause 1 the in-system record answered every
  // key it carried, which made the inherit switch decide nothing at read time — and every
  // `Inherits world category` line on these screens a false statement.
  it('resolves the WORLD value when the section is marked inheriting', () => {
    const [row] = resolveComponentScope(
      corpus({ inheriting: true, worldCategory: 'reagent' }),
      'sys-forge',
      IN_SYSTEM
    );
    assert.equal(
      row.category,
      'reagent',
      'an inheriting section resolves from the world default, on the shipped field name'
    );
  });

  it('and the IN-SYSTEM value when the section is marked overriding', () => {
    // THE POSITIVE CONTROL. Without it the assertion above is satisfied by an implementation
    // that always answers the world value, which would revert every system's own category.
    const [row] = resolveComponentScope(
      corpus({ inheriting: false, worldCategory: 'reagent' }),
      'sys-forge',
      IN_SYSTEM
    );
    assert.equal(row.category, 'ingot', 'an overriding section answers the in-system record');
  });

  it('and the in-system value when the world default authored NOTHING', () => {
    // THE SECOND CONTROL, and it is what the note's third branch exists for: an UNAUTHORED world
    // category applies nothing, so an inheriting system keeps its own value and is not
    // "following the world value" at all.
    const [row] = resolveComponentScope(
      corpus({ inheriting: true, worldCategory: undefined }),
      'sys-forge',
      IN_SYSTEM
    );
    assert.equal(row.category, 'ingot', 'an unauthored world section applies nothing');
  });
});

describe('the world category picker refuses the reserved bucket', () => {
  // AC-10. A plain-equality implementation passes every fixture that spells the bucket one way,
  // and ships a control through which `General` reaches the world defaults — where
  // `resolveComponentCategory` treats it as authored and the union then writes it onto every
  // inheriting row, resetting each of them on the first resolve.
  it('drops every spelling of the bucket, case- and whitespace-insensitively', () => {
    const offered = offeredWorldComponentCategories([
      'general',
      'General',
      ' GENERAL ',
      'ingot',
      'reagent',
    ]);
    assert.deepEqual(offered, ['ingot', 'reagent']);
  });

  it('and the offered set is NON-EMPTY, so the assertion above is a measurement', () => {
    // Without this an implementation that returned `[]` for every input would satisfy the
    // refusal assertion completely.
    assert.ok(offeredWorldComponentCategories(['ingot']).length > 0);
  });

  it('withholds the inherit affordance only when NO world value is authored', () => {
    assert.equal(componentCategoryInheritOffered('reagent'), true);
    assert.equal(componentCategoryInheritOffered(''), false);
    assert.equal(componentCategoryInheritOffered('   '), false);
    assert.equal(componentCategoryInheritOffered(undefined), false);
  });
});

describe('the system-scope category note branches on the WORLD VALUE first', () => {
  // AC-14's pure half. An implementation that tested the switch first tells an inheriting system
  // it is "following the world value" over a value that does not exist.
  it('states the unauthored branch whichever way the switch is set', () => {
    for (const inheriting of [true, false]) {
      const note = componentCategoryNote(
        { worldCategory: '', inheriting, systemName: 'Forge' },
        phrase
      );
      assert.equal(note.state, 'unset');
      assert.match(note.text, /No world category is set/);
    }
  });

  it('states the inheriting branch on the INFO tone, never a raw hex', () => {
    const note = componentCategoryNote(
      { worldCategory: 'reagent', inheriting: true, systemName: 'Forge' },
      phrase
    );
    assert.equal(note.state, 'inherited');
    assert.equal(note.tone, 'info');
  });

  it('and names the world value and the system when the switch is off', () => {
    const note = componentCategoryNote(
      { worldCategory: 'reagent', inheriting: false, systemName: 'Forge' },
      phrase
    );
    assert.equal(note.state, 'overridden');
    assert.match(note.text, /reagent/);
    assert.match(note.text, /Forge/);
  });
});

describe('the attribution sentence is clamped at zero', () => {
  // AC-13's pure half. The prototype's own `system` string is UNCLAMPED, so transcribing it
  // renders `shared with -1 other systems` for a component no system has adopted.
  it('reads 0 other systems for a component with no membership record', () => {
    for (const surface of ['list', 'editor']) {
      const note = componentAttributionNote(
        { surface, memberCount: 0, systemName: 'Forge' },
        phrase
      );
      assert.match(note, /0 other systems/);
      assert.ok(!note.includes('-1'), 'and never a negative count');
    }
  });

  it('and 2 other systems for a component three systems hold', () => {
    // The positive control: with the count above zero the clamp is invisible, which is exactly
    // why the zero fixture is the criterion.
    assert.match(
      componentAttributionNote({ surface: 'list', memberCount: 3 }, phrase),
      /2 other systems/
    );
  });

  it('and pluralises the singular case rather than saying "1 other systems"', () => {
    assert.match(
      componentAttributionNote({ surface: 'list', memberCount: 2 }, phrase),
      /1 other system\./
    );
  });

  it('and the ENTRY surface counts members rather than OTHERS, in all three branches', () => {
    // THE THIRD SURFACE WAS UNTESTED, and it is the one that cannot reuse either sentence above.
    // The list and the editor are read FROM a system, so they say how many OTHER systems share
    // the record — member count minus one, clamped. The world entry belongs to no system, so
    // "other" has no referent there: subtracting one would tell a GM looking at a component two
    // systems hold that it is shared by one, and would say "shared with -1" on the zero case that
    // is the whole reason this describe exists.
    //
    // All three branches, because they are three different sentences rather than one with a
    // number in it: zero is a statement about being unused, one is singular, and the plural is
    // the only branch a naive implementation gets right.
    const entryNote = (memberCount) =>
      componentAttributionNote({ surface: 'entry', memberCount }, phrase);

    assert.match(entryNote(0), /No system has rules for this component yet\./);
    assert.ok(!entryNote(0).includes('0 system'), 'the zero case is a sentence, not a count');

    assert.equal(entryNote(1), 'Shared by the 1 system that has rules for this component.');
    assert.equal(entryNote(3), 'Shared by the 3 systems that have rules for this component.');

    // AND IT IS NOT THE LIST SENTENCE WITH A DIFFERENT COUNT. A surface that fell through to the
    // default branch would answer `2 other systems` for three members and read plausibly.
    assert.ok(
      !entryNote(3).includes('other system'),
      'the entry has no system to be "other" than'
    );
  });
});

describe('the world category note pluralises BOTH of its counts', () => {
  // The counts pluralise on DIFFERENT numbers — the left clause on the member total, the right on
  // the override count — so a single composed sentence with one plural rule cannot be right for
  // both. On the commonest state of all, a component exactly one system has and overrides, the
  // composed version read `0 of 1 systems inherit it · 1 override locally.`: wrong twice.
  const noteFor = (members, inheriting) =>
    componentWorldCategoryNote(
      { membershipCount: members, inheritCounts: { category: inheriting } },
      phrase
    );

  it('says "1 system inherits" and "1 overrides" on the one-system record', () => {
    assert.equal(noteFor(1, 0), '0 of 1 system inherits it · 1 overrides locally.');
    assert.equal(noteFor(1, 1), '1 of 1 system inherits it · 0 override locally.');
  });

  it('and keeps the plural forms where they are right', () => {
    // The positive control: an implementation that simply swapped in the singular strings would
    // pass the case above and fail here.
    assert.equal(noteFor(6, 1), '1 of 6 systems inherit it · 5 override locally.');
  });

  it('and states the unused case as a sentence rather than as a fraction of nothing', () => {
    assert.match(noteFor(0, 0), /No system has rules for this yet\./);
  });
});

describe('the delete note refuses while any system holds rules', () => {
  // AC-15's pure half. The in-use branch is REFUSAL copy rather than the prototype's proceed
  // copy, because this lane refuses the delete.
  it('names the systems and says what to do instead', () => {
    const note = componentDeleteNote(['Forge', 'Alchemy'], phrase);
    assert.equal(note.refused, true);
    assert.match(note.text, /cannot be deleted yet/);
    assert.match(note.text, /Forge, Alchemy/);
  });

  it('lists the first three and counts the rest', () => {
    const note = componentDeleteNote(['A', 'B', 'C', 'D', 'E'], phrase);
    assert.match(note.text, /A, B, C and 2 more/);
  });

  it('and states that nothing else is affected when no system has rules', () => {
    const note = componentDeleteNote([], phrase);
    assert.equal(note.refused, false);
    assert.match(note.text, /nothing else is affected/);
  });
});

describe('the catalogue row states its two reach counts and its one flag', () => {
  // AC-6's pure half: the flag is answered by the MEMBERSHIP COUNT, so an implementation that
  // inverted it would state `Unused` on every adopted component.
  it('flags a component no system holds', () => {
    const row = componentRowStats({ membershipCount: 0, recipeCount: 0 }, 3, phrase);
    assert.equal(row.flag, 'Unused');
    assert.equal(row.stats.find((stat) => stat.id === 'systems').text, '0/3 systems');
  });

  it('and states no flag for one two systems hold', () => {
    const row = componentRowStats({ membershipCount: 2, recipeCount: 4 }, 3, phrase);
    assert.equal(row.flag, '');
    assert.equal(row.stats.find((stat) => stat.id === 'recipes').text, '4 recipes');
  });
});

describe('the world entry notes count MEMBERS only', () => {
  it('says no system has rules for an unadopted component', () => {
    assert.match(
      componentWorldCategoryNote({ membershipCount: 0, inheritCounts: { category: 0 } }, phrase),
      /No system has rules for this yet/
    );
  });

  it('and splits the member count between inheriting and overriding', () => {
    assert.match(
      componentWorldCategoryNote({ membershipCount: 4, inheritCounts: { category: 3 } }, phrase),
      // `1 overrides`, singular, since round 3: the two clauses pluralise on different counts.
      /3 of 4 systems inherit it · 1 overrides locally/
    );
  });

  it('states the tag list with its muting exceptions', () => {
    const note = componentWorldTagNote(
      {
        defaults: { tags: ['ore', 'bulk'] },
        systems: [
          { member: true, mutedTags: ['bulk'] },
          { member: true, mutedTags: [] },
          { member: false, mutedTags: ['ore'] },
        ],
      },
      phrase
    );
    // The non-member's muted list is NOT counted: it names a record the resolver never reaches.
    assert.match(note, /2 world tags set on this record · muted in 1 system/);
  });

  it('and CLAIMS NO REACH when nothing is muted, because the tags reach nothing yet', () => {
    // It used to close ` in every system that has rules`, and that was false: world tags are
    // merged by the resolver only and the read union discards them, so no system sees this list.
    // `setMutedTags` has no caller under `src/` either, so a note asserting reach was telling the
    // GM to tag here instead of in the system that actually reads a tag.
    const note = componentWorldTagNote(
      { defaults: { tags: ['ore'] }, systems: [{ member: true, mutedTags: [] }] },
      phrase
    );
    assert.equal(note, '1 world tag set on this record');
    assert.ok(
      !/every system/.test(note),
      `the sentence claims no reach, and read "${note}"`
    );
  });
});

describe('the entry validation check set renders at its declared severity', () => {
  // AC-17. The two `warn` severities are load-bearing: promoting `No world category` to blocking
  // makes a legitimately blank entry look broken while still satisfying a presence-only check.
  const blank = {
    name: 'Iron Ingot',
    hasSourceLink: false,
    worldCategory: '',
    worldTags: [],
    systemKnown: true,
    member: true,
    systemName: 'Forge',
    resolvedCategory: '',
  };

  it('presents every check the evaluator returned, and no others', () => {
    const { checks, groups } = componentScopeValidationPresentation(blank, phrase);
    const presented = groups.flatMap((group) => group.rows.map((row) => row.id));
    assert.deepEqual(
      [...presented].sort(),
      checks.map((check) => check.id).sort(),
      'the row builder FILTERS BEFORE IT MAPS, so a registered-but-unpresented check is dropped ' +
        'in silence rather than throwing; this is what would catch one'
    );
  });

  it('warns on a blank classification and blocks on a missing source', () => {
    const { groups, counts } = componentScopeValidationPresentation(blank, phrase);
    const byId = new Map(groups.flatMap((group) => group.rows).map((row) => [row.id, row]));

    assert.equal(byId.get('worldCategory').status, 'warn');
    assert.equal(byId.get('worldTags').status, 'warn');
    assert.equal(byId.get('source').status, 'block');
    assert.equal(byId.get('systemCategory').status, 'block');
    assert.ok(counts.warnings >= 2, 'a blank classification warns twice');
    assert.ok(counts.blocking >= 1, 'and an unlinked record blocks');
  });

  it('titles the two failing classification rows in the words the criterion names', () => {
    const { groups } = componentScopeValidationPresentation(blank, phrase);
    const titles = groups.flatMap((group) => group.rows.map((row) => row.title));
    assert.ok(titles.includes('No world category'));
    assert.ok(titles.includes('No world tags'));
    assert.ok(titles.includes('No source item linked'));
  });

  it('RETURNS after the system-rules gate rather than reporting passes about no record', () => {
    const { checks } = componentScopeValidation({ ...blank, member: false });
    const ids = checks.map((check) => check.id);
    assert.ok(ids.includes('systemRules'), 'the gate itself is reported');
    assert.ok(
      !ids.includes('systemCategory'),
      'and the check it gates is OMITTED, not reported as a pass about a record nobody authored'
    );
  });

  it('and the gate itself BLOCKS, which nothing asserted', () => {
    // AC-17 names `No rules in {system}` as blocking. On the blank fixture it PASSES — the
    // component is a member there — and the `member: false` case above checks presence only, so
    // demoting the severity to a warning left the whole tree green.
    const { groups, counts } = componentScopeValidationPresentation(
      { ...blank, member: false },
      phrase
    );
    const row = groups.flatMap((group) => group.rows).find((entry) => entry.id === 'systemRules');
    assert.ok(Boolean(row), 'the gate renders a row');
    assert.equal(row.status, 'block');
    assert.equal(row.title, 'No rules in Forge');
    assert.ok(counts.blocking >= 2, 'it counts toward Blocking beside the missing source');
  });

  it('omits the whole system pass when no crafting system is in view', () => {
    const { checks } = componentScopeValidation({ ...blank, systemKnown: false });
    assert.deepEqual(
      checks.map((check) => check.id),
      ['source', 'name', 'worldCategory', 'worldTags']
    );
  });

  it('and reports SIX passes on a complete record, so failure is discriminating', () => {
    const { counts } = componentScopeValidation({
      name: 'Iron Ingot',
      hasSourceLink: true,
      worldCategory: 'ingot',
      worldTags: ['ore'],
      systemKnown: true,
      member: true,
      resolvedCategory: 'ingot',
    });
    assert.equal(counts.warnings, 0);
    assert.equal(counts.blocking, 0);
    assert.equal(counts.passing, 6);
  });
});

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

import {
  COMPONENT_SECTIONS,
  componentEssenceMapsEqual,
  normalizeComponentEssenceMap,
  resolveComponentScope,
} from '../../src/systems/componentScope.js';
import {
  componentScopeValidation,
  componentScopeValidationPresentation,
} from '../../src/utils/componentScopeValidation.js';
import {
  componentAttributionNote,
  componentBulkEssenceCarried,
  componentBulkEssencePlan,
  componentCategoryInheritOffered,
  componentCategoryNote,
  componentDeleteNote,
  componentEssenceChips,
  componentEssenceFilter,
  componentEssenceInheritOffered,
  componentEssenceNote,
  componentRowEssenceChips,
  componentWorldEssenceNote,
  componentRowStats,
  componentSalvageInLabel,
  componentWorldCategoryNote,
  componentWorldEssenceMap,
  componentWorldTagNote,
  mergeStagedEssences,
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

describe('the catalogue row states its two reach counts as a value over a label', () => {
  // AC-6's pure half. The `Unused` FLAG this block used to assert is gone with r8's row rebuild
  // (gap-list rows 14 and 16): the reference's row has one flag slot and puts `Broken link` in
  // it, and `Unused` restated the `0/3` the systems column now prints two centimetres away. The
  // membership arithmetic it was the only cover for is asserted here instead, in the column that
  // carries it — an inverted implementation still reds.
  it('states the membership fraction for a component no system holds', () => {
    const row = componentRowStats({ membershipCount: 0, recipeCount: 0 }, 3, phrase);
    const systems = row.stats.find((stat) => stat.id === 'systems');
    assert.equal(systems.value, '0/3');
    assert.equal(systems.label, 'Systems');
  });

  it('and counts both reaches for one two systems hold', () => {
    const row = componentRowStats({ membershipCount: 2, recipeCount: 4 }, 3, phrase);
    assert.equal(row.stats.find((stat) => stat.id === 'systems').value, '2/3');
    const recipes = row.stats.find((stat) => stat.id === 'recipes');
    assert.equal(recipes.value, '4');
    assert.equal(recipes.label, 'Recipes');
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

  it('BLOCKS on an empty name, which no fixture in this file ever drove', () => {
    // `name` is a blocking check and every fixture here named the record `Iron Ingot`, so
    // collapsing the evaluator's `trimmed(context.name) ? 'authored' : 'missing'` to a bare
    // `'authored'` left this whole file green at 32/32 and the entry's mounted suite green at
    // 64/64. Three claims, because the defect can hide in any one of them: the SEVERITY the row
    // renders at, the TITLE it renders, and whether it reaches the Blocking tally the hero and
    // the tab badge are both painted from.
    //
    // WHITESPACE, NOT THE EMPTY STRING. `''` is refused by `Boolean` as well as by `trim()`, so a
    // check that dropped the trim would still pass on it; `'   '` is a name a GM can really type
    // and is the one input that discriminates between the two.
    const { groups, counts } = componentScopeValidationPresentation(
      { ...blank, name: '   ', hasSourceLink: true, resolvedCategory: 'Refined' },
      phrase
    );
    const row = groups.flatMap((group) => group.rows).find((entry) => entry.id === 'name');
    assert.ok(Boolean(row), 'the identity group renders a row for the name');
    assert.equal(row.status, 'block');
    assert.equal(row.title, 'Name is empty');
    assert.equal(
      counts.blocking,
      1,
      'and it is the ONLY blocking row on this fixture, so the tally is its own rather than the ' +
        'missing source item being counted twice'
    );
  });

  it('and a named record passes that row, so the check is discriminating', () => {
    const { groups, counts } = componentScopeValidationPresentation(
      { ...blank, hasSourceLink: true, resolvedCategory: 'Refined' },
      phrase
    );
    const row = groups.flatMap((group) => group.rows).find((entry) => entry.id === 'name');
    assert.equal(row.status, 'pass');
    assert.equal(row.title, 'Name is set');
    assert.equal(counts.blocking, 0);
  });

  it('and the world-tag row counts ONE tag in the singular', () => {
    // Reviewer finding 9: `WorldTagsSet` shipped as `{count} world tags set` with no `…One` twin,
    // so a record with exactly one world tag rendered `1 world tags set`. Both arms, because a
    // key wired to the singular unconditionally reads just as wrong at two.
    const titleFor = (worldTags) =>
      componentScopeValidationPresentation(
        { ...blank, worldTags, hasSourceLink: true, resolvedCategory: 'Refined' },
        phrase
      )
        .groups.flatMap((group) => group.rows)
        .find((entry) => entry.id === 'worldTags').title;

    assert.equal(titleFor(['ore']), '1 world tag set');
    assert.equal(titleFor(['ore', 'fuel']), '2 world tags set');
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

// ── issue 1371 r12-list ──────────────────────────────────────────────────────────────────────
describe('the inspector’s `Salvage in` heading names the system as its own node', () => {
  // `proto:1263` draws `Salvage in {{ d.sysName }}` — the caption and the name as two text nodes
  // of one line — where the subject folded both into one localized string. The helper splits the
  // localized template at its token so the view can wrap the name, and the JOIN of the three
  // parts is byte-identical to the single string a screen reader used to hear.
  const text = (_key, fallback) => fallback;

  it('splits the shipped template into a lead, the name and an empty trail', () => {
    assert.deepEqual(componentSalvageInLabel('Forge', text), {
      lead: 'Salvage in ',
      name: 'Forge',
      trail: '',
    });
  });

  it('keeps a translation that puts the name FIRST, so the token is honoured wherever it sits', () => {
    const leading = (_key, fallback) =>
      _key === 'FABRICATE.Admin.Manager.Component.SalvageIn' ? '{system}: salvage' : fallback;
    const parts = componentSalvageInLabel('Forge', leading);
    assert.deepEqual(parts, { lead: '', name: 'Forge', trail: ': salvage' });
    assert.equal(parts.lead + parts.name + parts.trail, 'Forge: salvage');
  });

  it('and a template with no token still draws the name, after the caption', () => {
    const tokenless = (_key, fallback) =>
      _key === 'FABRICATE.Admin.Manager.Component.SalvageIn' ? 'Salvage in' : fallback;
    assert.deepEqual(componentSalvageInLabel('Forge', tokenless), {
      lead: 'Salvage in ',
      name: 'Forge',
      trail: '',
    });
  });
});

// ── issue 1371 r18-entry — M31: THE WORLD BULK `Essence values` GROUP WRITES THE WORLD SECTION ──
describe('the world bulk essence instruction is ONE world write per changed record (M31)', () => {
  // Three world records, each carrying a different world map: `coal` has an elected map, `ingot`
  // an authored EMPTY one, and `orphan` none at all. `resin` is not selected and must never be
  // planned. The raw roster is present only so the union fallback has something to read for a
  // record with no world section; it must not be written to.
  const ENTRIES = [
    { id: 'coal', defaults: { category: 'Raw', essences: { flame: 2, tide: 1 } } },
    { id: 'ingot', defaults: { category: 'Refined', essences: {} } },
    { id: 'orphan' },
    { id: 'resin', defaults: { essences: { flame: 9 } } },
  ];
  const ROSTER = [
    { id: 'sys-forge', components: [{ id: 'orphan', essences: { earth: 4 } }] },
  ];

  it('merges the staged map over each record’s WORLD map: a positive value sets, a zero strips, an unnamed key is left alone', () => {
    assert.deepEqual(mergeStagedEssences({ flame: 2, tide: 1 }, { flame: 3, tide: 0, earth: 1 }), {
      flame: 3,
      earth: 1,
    });
    assert.deepEqual(mergeStagedEssences({}, { flame: 0 }), {}, 'a strip of nothing is nothing');
    assert.deepEqual(mergeStagedEssences({ flame: 2 }, { flame: 'x' }), { flame: 2 }, 'a non-number is ignored');
  });

  it('plans one `updateWorldDefaultSection(id, "essences", map)` per SELECTED record whose map changes, in selection order', () => {
    assert.deepEqual(
      componentBulkEssencePlan(['coal', 'ingot', 'orphan'], { flame: 3, tide: 0 }, { entries: ENTRIES, systems: ROSTER }),
      [
        { entityId: 'coal', essences: { flame: 3 } },
        { entityId: 'ingot', essences: { flame: 3 } },
        // `orphan` has no world section: the union fallback (`earth: 4`) is its current map, so
        // the write carries it forward beside the staged value rather than erasing it.
        { entityId: 'orphan', essences: { earth: 4, flame: 3 } },
      ]
    );
  });

  it('skips a record whose world map would not change, and plans nothing for an empty instruction', () => {
    assert.deepEqual(
      componentBulkEssencePlan(['coal', 'ingot'], { flame: 2 }, { entries: ENTRIES, systems: ROSTER }),
      [{ entityId: 'ingot', essences: { flame: 2 } }],
      '`coal` already carries flame at 2, so only `ingot` is written'
    );
    assert.deepEqual(
      componentBulkEssencePlan(['coal', 'ingot'], { earth: 0 }, { entries: ENTRIES, systems: ROSTER }),
      [],
      'a strip of an essence nobody carries writes nothing'
    );
    assert.deepEqual(componentBulkEssencePlan(['coal'], {}, { entries: ENTRIES, systems: ROSTER }), []);
    assert.deepEqual(componentBulkEssencePlan(['coal'], { flame: 1 }, {}), [
      { entityId: 'coal', essences: { flame: 1 } },
    ], 'an unknown record is written from an empty base rather than skipped');
  });

  it('counts the `n/N` off each selected record’s WORLD map', () => {
    assert.deepEqual(
      componentBulkEssenceCarried(['coal', 'ingot', 'orphan'], { entries: ENTRIES, systems: ROSTER }),
      { flame: 1, tide: 1, earth: 1 }
    );
    assert.deepEqual(componentBulkEssenceCarried([], { entries: ENTRIES }), {});
    assert.deepEqual(
      componentBulkEssenceCarried(['resin'], { entries: ENTRIES }),
      { flame: 1 },
      'the count reads the world section, never a system roster'
    );
  });
});

// ── issue 1371 r18-entry — M31: THE ENTRY'S ESSENCE CARD AND THE EDITOR'S INHERIT CHOICE ─────
describe('the essence inherit choice is offered exactly when the world has AUTHORED a map (M31)', () => {
  it('offers it for a map, including an authored EMPTY one, and withholds it for absence', () => {
    assert.equal(componentEssenceInheritOffered({ flame: 2 }), true);
    assert.equal(componentEssenceInheritOffered({}), true, '`{}` is an authored "no essences"');
    assert.equal(componentEssenceInheritOffered(undefined), false);
    assert.equal(componentEssenceInheritOffered(null), false);
    assert.equal(componentEssenceInheritOffered([]), false, 'an array is not a map');
    assert.equal(componentEssenceInheritOffered('flame'), false);
  });
});

describe('the system-scope essence note has the category note’s three branches (M31)', () => {
  it('is muted and `unset` when the world authored nothing', () => {
    const note = componentEssenceNote({ worldEssences: undefined, inheriting: true, systemName: 'Forge' }, phrase);
    assert.equal(note.state, 'unset');
    assert.equal(note.tone, 'muted');
    assert.match(note.text, /No world essence values are set/);
  });

  it('is info and `inherited` while the switch is on', () => {
    const note = componentEssenceNote({ worldEssences: { flame: 2 }, inheriting: true, systemName: 'Forge' }, phrase);
    assert.equal(note.state, 'inherited');
    assert.equal(note.tone, 'info');
    assert.equal(note.icon, 'fas fa-earth-americas');
    assert.match(note.text, /Following the world values/);
  });

  it('is warning and `overridden` while the switch is off, naming the system', () => {
    const note = componentEssenceNote({ worldEssences: {}, inheriting: false, systemName: 'Forge' }, phrase);
    assert.equal(note.state, 'overridden');
    assert.equal(note.tone, 'warning');
    assert.match(note.text, /Overriding the world values for Forge only/);
  });
});

describe('the world entry’s essence note counts inheriting and overriding members (M31)', () => {
  // `membershipCount` is the projection's own member tally, which is what the note counts against.
  const entry = (inheriting, members) => ({
    membershipCount: members,
    inheritCounts: { category: 0, essences: inheriting },
  });

  it('reads the two clauses off `inheritCounts.essences`, pluralised independently', () => {
    assert.equal(componentWorldEssenceNote(entry(2, 3), phrase), '2 of 3 systems inherit it · 1 overrides locally.');
    assert.equal(componentWorldEssenceNote(entry(0, 1), phrase), '0 of 1 system inherits it · 1 overrides locally.');
    assert.equal(componentWorldEssenceNote(entry(2, 2), phrase), '2 of 2 systems inherit it · 0 override locally.');
  });

  it('says so when no system has rules for the record', () => {
    assert.equal(componentWorldEssenceNote(entry(0, 0), phrase), 'No system has rules for this yet.');
  });

  it('and the category note is the SAME sentence over the other section, so the two cannot drift', () => {
    const both = { membershipCount: 3, inheritCounts: { category: 1, essences: 2 } };
    assert.equal(componentWorldCategoryNote(both, phrase), '1 of 3 systems inherit it · 2 override locally.');
    assert.equal(componentWorldEssenceNote(both, phrase), '2 of 3 systems inherit it · 1 overrides locally.');
  });
});

describe('an essence map is drawn as chips over the world catalogue, in its order (M31)', () => {
  const ESSENCES = [
    { id: 'flame', name: 'Flame', icon: 'fas fa-fire', colorToken: 'ember' },
    { id: 'earth', name: 'Earth' },
    { id: 'tide' },
  ];

  it('draws one chip per POSITIVE value the catalogue names, with the roster’s glyph and colour', () => {
    assert.deepEqual(componentEssenceChips({ tide: 1, flame: 2, ghost: 3, earth: 0 }, ESSENCES), [
      { id: 'flame', name: 'Flame', icon: 'fas fa-fire', colorToken: 'ember', quantity: 2 },
      { id: 'tide', name: 'tide', icon: 'fas fa-mortar-pestle', colorToken: '', quantity: 1 },
    ]);
    assert.deepEqual(componentEssenceChips({}, ESSENCES), []);
    assert.deepEqual(componentEssenceChips(null, ESSENCES), []);
    assert.deepEqual(componentEssenceChips({ flame: 2 }, []), []);
  });
});

// ── M30: THE ROW'S ESSENCES AND THE ESSENCE FILTER (issue 1371 r18-cat) ─────────────────────
describe('the catalogue reads one essence map per world component (M30)', () => {
  // `coal` carries flame in two systems at two values and tide in one; `ingot` carries an
  // essence the world catalogue does not list; `resin` carries a zero and a NaN.
  const ROSTER = [
    {
      id: 'sys-forge',
      components: [
        { id: 'coal', essences: { flame: 2 } },
        { id: 'ingot', essences: { earth: 1, ghost: 3 } },
      ],
    },
    {
      id: 'sys-alchemy',
      components: [
        { id: 'coal', essences: { flame: 1, tide: 1 } },
        { id: 'resin', essences: { earth: 0, tide: 'x' } },
      ],
    },
    { id: 'sys-bare' },
  ];
  const ESSENCES = [
    { id: 'flame', name: 'Flame', icon: 'fas fa-fire', colorToken: 'ember' },
    { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' },
    { id: 'tide' },
  ];
  const entry = (id) => ({ id, entity: { id, name: id } });

  it('reads the WORLD section first when the record carries one (M31), positive values only', () => {
    // r18-store: read the world essence map — `entry.defaults.essences` is where the section
    // write lands, and it wins over whatever the systems carry.
    const sectioned = { ...entry('coal'), defaults: { category: 'Raw', essences: { earth: 3, flame: 0 } } };
    assert.deepEqual(componentWorldEssenceMap(sectioned, ROSTER), { earth: 3 });
    const emptied = { ...entry('coal'), defaults: { essences: {} } };
    assert.deepEqual(componentWorldEssenceMap(emptied, ROSTER), {}, 'an authored EMPTY section is empty');
  });

  it('unions the per-system values where no world section exists, keeping the LARGEST where systems disagree', () => {
    // r18-store: read the world essence map — the union is the fallback for a record without one.
    assert.deepEqual(componentWorldEssenceMap(entry('coal'), ROSTER), { flame: 2, tide: 1 });
    const unsectioned = { ...entry('coal'), defaults: { category: 'Raw' } };
    assert.deepEqual(componentWorldEssenceMap(unsectioned, ROSTER), { flame: 2, tide: 1 });
  });

  it('drops zero and non-numeric values, and answers nothing for a record no system has rules for', () => {
    assert.deepEqual(componentWorldEssenceMap(entry('resin'), ROSTER), {});
    assert.deepEqual(componentWorldEssenceMap(entry('nobody'), ROSTER), {});
    assert.deepEqual(componentWorldEssenceMap(entry('coal'), null), {});
    assert.deepEqual(componentWorldEssenceMap(null, ROSTER), {});
  });

  it('draws the chips in the WORLD catalogue’s order, with the roster’s name and glyph', () => {
    assert.deepEqual(componentRowEssenceChips(entry('coal'), { systems: ROSTER, essences: ESSENCES }), [
      { id: 'flame', name: 'Flame', icon: 'fas fa-fire', colorToken: 'ember', quantity: 2 },
      { id: 'tide', name: 'tide', icon: 'fas fa-mortar-pestle', colorToken: '', quantity: 1 },
    ]);
  });

  it('draws no chip for an essence the world catalogue does not list', () => {
    assert.deepEqual(componentRowEssenceChips(entry('ingot'), { systems: ROSTER, essences: ESSENCES }), [
      { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', colorToken: '', quantity: 1 },
    ]);
    assert.deepEqual(componentRowEssenceChips(entry('ingot'), { systems: ROSTER, essences: [] }), []);
  });
});

describe('the catalogue’s essence filter is the rules list’s, over the world catalogue (M30)', () => {
  const ROSTER = [
    {
      id: 'sys-forge',
      components: [
        { id: 'coal', essences: { flame: 2 } },
        { id: 'ingot', essences: { earth: 1 } },
      ],
    },
  ];
  const ESSENCES = [
    { id: 'flame', name: 'Flame' },
    { id: 'earth', name: 'Earth' },
  ];
  const entry = (id) => ({ id, entity: { id, name: id } });
  const [filter] = componentEssenceFilter({ essences: ESSENCES, systems: ROSTER }, phrase);

  it('is ONE lead-row descriptor with the reference’s option set (`proto:5533`)', () => {
    assert.equal(filter.id, 'essence');
    assert.equal(filter.toolbarRow, 'lead');
    assert.equal(filter.label, 'Essence');
    assert.deepEqual(
      filter.options.map((option) => [option.value, option.label]),
      [
        ['all', 'All essences'],
        ['__any', 'Carries any essence'],
        ['__none', 'No essences'],
        ['flame', 'Flame'],
        ['earth', 'Earth'],
      ]
    );
  });

  it('applies the reference’s three predicates (`proto:5477`-`5479`) and a named essence', () => {
    const passes = (value) =>
      ['coal', 'ingot', 'orphan'].filter((id) => filter.matches(entry(id), value));
    assert.deepEqual(passes('all'), ['coal', 'ingot', 'orphan']);
    assert.deepEqual(passes('__any'), ['coal', 'ingot']);
    assert.deepEqual(passes('__none'), ['orphan']);
    assert.deepEqual(passes('flame'), ['coal']);
    assert.deepEqual(passes('earth'), ['ingot']);
    assert.deepEqual(passes('ghost'), [], 'an unknown value matches nothing rather than everything');
  });

  it('is WITHHELD over an empty world essence catalogue', () => {
    assert.deepEqual(componentEssenceFilter({ essences: [], systems: ROSTER }, phrase), []);
    assert.deepEqual(componentEssenceFilter({ systems: ROSTER }, phrase), []);
  });
});

// ── THE WORLD `essences` SECTION (issue 1371 r18-store, maintainer ruling M31) ────────────────
//
// The world component record carries an `essences` SECTION beside `category`, on the category
// model exactly: a world map every system with rules for the component inherits unless it
// overrides with its own. These pin the read union's answer, because that is the premise the
// world entry's editor, the catalogue's rows and filter, and the rules editor's inherit choice
// all rest on — and a mounted assertion could only observe it through a rendered consequence a
// hand-built fixture can also produce.

/** A one-component corpus with the essences switch and the world map as parameters. */
function essenceCorpus({ inheriting, worldEssences }) {
  return {
    entities: [{ id: 'ingot', name: 'Iron Ingot' }],
    defaults: worldEssences === undefined ? [] : [{ id: 'ingot', essences: worldEssences }],
    membership: [
      {
        entityId: 'ingot',
        systemId: 'sys-forge',
        inherit: inheriting === undefined ? {} : { essences: inheriting },
      },
    ],
  };
}

/** The system's own surviving in-system row, carrying its own essence map. */
const IN_SYSTEM_ESSENCES = [{ id: 'ingot', name: 'Iron Ingot', essences: { iron: 2 }, tags: [] }];

describe('the component read union answers an inheriting essence map from the world default (M31)', () => {
  it('declares `essences` as a component section beside `category`', () => {
    assert.deepEqual([...COMPONENT_SECTIONS], ['category', 'essences']);
  });

  it('resolves the WORLD map when the section is marked inheriting', () => {
    const [row] = resolveComponentScope(
      essenceCorpus({ inheriting: true, worldEssences: { fire: 3 } }),
      'sys-forge',
      IN_SYSTEM_ESSENCES
    );
    assert.deepEqual(row.essences, { fire: 3 }, 'the world map is the answer, whole');
    assert.equal(row.inherited.essences, true);
  });

  it('and an OMITTED switch inherits, which is the state "add to system" creates', () => {
    const [row] = resolveComponentScope(
      essenceCorpus({ inheriting: undefined, worldEssences: { fire: 3 } }),
      'sys-forge',
      IN_SYSTEM_ESSENCES
    );
    assert.deepEqual(row.essences, { fire: 3 });
  });

  it('and the IN-SYSTEM map when the section is marked overriding', () => {
    const [row] = resolveComponentScope(
      essenceCorpus({ inheriting: false, worldEssences: { fire: 3 } }),
      'sys-forge',
      IN_SYSTEM_ESSENCES
    );
    assert.deepEqual(row.essences, { iron: 2 }, 'the system keeps its own values');
    assert.equal(row.inherited.essences, false);
  });

  it('and the in-system map when the world default authored NOTHING', () => {
    const [row] = resolveComponentScope(
      essenceCorpus({ inheriting: true, worldEssences: undefined }),
      'sys-forge',
      IN_SYSTEM_ESSENCES
    );
    assert.deepEqual(row.essences, { iron: 2 }, 'absence at world scope is the world saying nothing');
  });

  it('an authored EMPTY world map clears an inheriting system, because `{}` is a value', () => {
    const [row] = resolveComponentScope(
      essenceCorpus({ inheriting: true, worldEssences: {} }),
      'sys-forge',
      IN_SYSTEM_ESSENCES
    );
    assert.deepEqual(row.essences, {}, '"no essences" is authored, not absent');
  });

  it('hands the row a COPY of the world map, never the corpus object itself', () => {
    const corpus = essenceCorpus({ inheriting: true, worldEssences: { fire: 3 } });
    const [row] = resolveComponentScope(corpus, 'sys-forge', IN_SYSTEM_ESSENCES);
    row.essences.fire = 99;
    assert.equal(corpus.defaults[0].essences.fire, 3, 'a consumer edit cannot reach the corpus');
  });
});

describe('the essence section normalizes to a map of positive quantities over trimmed ids', () => {
  it('keeps positive finite quantities, drops the rest, and trims the ids', () => {
    assert.deepEqual(
      normalizeComponentEssenceMap({ ' fire ': 2, water: 0, earth: -1, air: 'x', '': 4, moss: 1.5 }),
      { fire: 2, moss: 1.5 }
    );
  });

  it('answers an EMPTY map for an empty object, which is authored "no essences"', () => {
    assert.deepEqual(normalizeComponentEssenceMap({}), {});
  });

  it('and ABSENCE for anything that is not a plain object', () => {
    for (const junk of [undefined, null, 'fire', 3, ['fire'], true]) {
      assert.equal(normalizeComponentEssenceMap(junk), undefined, `${String(junk)} is not a map`);
    }
  });

  it('answers a NEW object, so a normalized record never aliases the caller\'s map', () => {
    const raw = { fire: 2 };
    const normalized = normalizeComponentEssenceMap(raw);
    assert.notEqual(normalized, raw);
    assert.deepEqual(normalized, raw);
  });

  it('compares two maps by their normalized content, absence reading as empty', () => {
    assert.equal(componentEssenceMapsEqual({ fire: 2, moss: 1 }, { moss: 1, fire: 2 }), true);
    assert.equal(componentEssenceMapsEqual({ fire: 2, water: 0 }, { fire: 2 }), true);
    assert.equal(componentEssenceMapsEqual(undefined, {}), true);
    assert.equal(componentEssenceMapsEqual({ fire: 2 }, { fire: 3 }), false);
    assert.equal(componentEssenceMapsEqual({ fire: 2 }, {}), false);
  });
});

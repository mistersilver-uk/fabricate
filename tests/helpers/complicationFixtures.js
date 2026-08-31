/**
 * One authored-complication factory, shared by every suite that needs a component
 * complication in its PERSISTED shape (issue 1286).
 *
 * It is hoisted here rather than restated per suite for two reasons. The literal is long
 * enough to trip SonarCloud's duplication detector on new code — `tests/**` counts against
 * that gate exactly like `src/**` — and, more importantly, its SECRET halves are the point:
 * `when`, `rollCondition`, `effectRoll` and `macroUuid` are always populated, so a suite
 * asserting that the player projection withholds them is asserting against a record that
 * genuinely has something to withhold. A local fixture that omitted them would pass those
 * assertions while proving nothing.
 *
 * The default `visibility` is `visible` — the opposite of the normalizer's `gmOnly` default —
 * because a redaction test needs both audiences and the one worth spelling out at each call
 * site is the exception.
 */

/** Every activity flag off but `activity`, or all three on when no activity is named. */
function activityFlags(activity) {
  const all = { crafting: true, salvage: true, gathering: true };
  if (!activity) return all;
  return { crafting: false, salvage: false, gathering: false, [activity]: true };
}

/**
 * @param {object} [overrides] merged over the defaults. An explicit `when` REPLACES the
 *   default clause set rather than merging into it, which is what lets a caller spell
 *   `when: {}` — no enabled clause at all — as the "provably cannot fire" case.
 * @param {'crafting'|'salvage'|'gathering'} [overrides.activity] narrow `activities` to this
 *   ONE activity. Not a field of the persisted shape — it writes `activities` — and the
 *   default of all three on is what makes an ordinary fixture activity-agnostic. Spell it
 *   whenever the claim under test is that a caller passed the RIGHT activity token: against
 *   an all-three fixture, `salvage` and `crafting` are interchangeable and the assertion
 *   proves nothing. An explicit `activities` override still wins over it.
 * @returns {object} a complication in the shape `authoredComplications` persists.
 */
export function authoredComplication({
  when = { stageMissed: true },
  activity = null,
  ...overrides
} = {}) {
  return {
    id: 'x1',
    name: 'Shrapnel',
    description: 'Splinters fly.',
    severity: 'major',
    visibility: 'visible',
    activities: activityFlags(activity),
    match: 'any',
    when: {
      stageAwarded: false,
      stagePartial: false,
      stageMissed: false,
      checkTrigger: null,
      ...when,
    },
    rollCondition: { enabled: false, expr: '', cmp: 'gte', value: '' },
    effectRoll: { enabled: true, expr: '1d6', label: 'Shrapnel' },
    macroUuid: 'Macro.secret',
    ...overrides,
  };
}

/**
 * TWO player-visible complications authored on ONE component.
 *
 * The capability this exists to supply is a stage row that survives redaction carrying more
 * than one entry. Every other fixture in this feature pairs a `visible` complication with a
 * `gmOnly` one — as does the lab world's `hb-mortar-dust` — so after redaction each stage row
 * holds exactly one entry, and a projection that kept only the first, or a mark that flooded
 * every entry on the row it touched, would be indistinguishable from a correct one. Both of
 * those are real failures a player would read as a false claim about their own run, so the
 * plural case is fixture-level rather than restated per suite.
 *
 * The two are distinguishable by id, name AND description, so an assertion can name which
 * one it means, and the ids are deliberately outside the `x1`/`x2`/`gm1` set the seam suite's
 * own constants use, so a suite may add this pair beside them without collision.
 *
 * @param {object} [overrides] applied to BOTH, e.g. `{ activity: 'salvage' }`.
 * @returns {[object, object]}
 */
export function visibleComplicationPair(overrides = {}) {
  return [
    authoredComplication({ id: 'p1', name: 'Shrapnel', description: 'Splinters fly.', ...overrides }),
    authoredComplication({ id: 'p2', name: 'Scalding', description: 'The metal spits.', ...overrides }),
  ];
}

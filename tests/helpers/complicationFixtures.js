/**
 * One authored-complication factory, shared by every suite that needs a component complication in
 * its PERSISTED shape (issue 1286). It is hoisted here rather than restated per suite for two
 * reasons.
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
 * @param {object} [overrides] applied to BOTH, e.g. `{ activity: 'salvage' }`.
 */
export function visibleComplicationPair(overrides = {}) {
  return [
    authoredComplication({ id: 'p1', name: 'Shrapnel', description: 'Splinters fly.', ...overrides }),
    authoredComplication({ id: 'p2', name: 'Scalding', description: 'The metal spits.', ...overrides }),
  ];
}

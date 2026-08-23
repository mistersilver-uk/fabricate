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

/**
 * @param {object} [overrides] merged over the defaults. An explicit `when` REPLACES the
 *   default clause set rather than merging into it, which is what lets a caller spell
 *   `when: {}` — no enabled clause at all — as the "provably cannot fire" case.
 * @returns {object} a complication in the shape `authoredComplications` persists.
 */
export function authoredComplication({ when = { stageMissed: true }, ...overrides } = {}) {
  return {
    id: 'x1',
    name: 'Shrapnel',
    description: 'Splinters fly.',
    severity: 'major',
    visibility: 'visible',
    activities: { crafting: true, salvage: true, gathering: true },
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

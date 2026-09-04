/**
 * The shared ledger of bare-`manager-button` test fixtures that are deliberately pre-conversion.
 *
 * ── WHY IT IS A MODULE RATHER THAN A CONSTANT (issue 1502) ──────────────────────────────
 * It was module-private in `tests/manager-button-source-contract.test.js`, which was correct while
 * exactly one gate asked the question. Two do now: `searchable-popover-area-scope.test.js`'s
 * fixture clauses must EXEMPT the same entries from the "every fixture element carries the family
 * root" offender list, because an entry here is a control the product deliberately does not render
 * through the primitive and therefore one that must NOT gain `fabricate-button`. Two hand-listed
 * copies of one census is the drift this repository has already paid for once —
 * `tests/helpers/primitiveSourceContract.js` exists because SonarCloud measured 88 duplicated
 * lines between two source-contract guards — so the census is stated once and imported twice.
 *
 * ── THE SHAPE, AND WHY EACH FIELD IS REQUIRED ───────────────────────────────────────────
 * Keyed on the file and the exact class attribute rather than on a line number, which rots on the
 * first edit above it, and COUNTED, so that deleting one of two identical probes is not silently
 * absorbed. `why` is required: a fixture with no stated reason to be pre-conversion is a stale
 * fixture that has not been noticed yet.
 *
 * A fixture that hand-writes its own HTML and measures it in a browser keeps passing after the
 * component stops emitting that HTML. It measures the old markup forever, reports green, and
 * nothing anywhere says so. Two such fixtures were already stale when this census was first
 * written — one modelling the Tool Studio header, which has rendered through the primitive since
 * issue 1096 and passed only because the values happened to agree.
 *
 * @typedef {object} ManagerButtonFixtureExemption
 * @property {string} file Repository-relative POSIX path of the suite holding the fixture.
 * @property {string} classes The exact `class` attribute value, token order included.
 * @property {number} count How many identical attributes that suite is allowed to hold.
 * @property {string} why Why the fixture is deliberately pre-conversion.
 */

/** @type {ReadonlyArray<ManagerButtonFixtureExemption>} */
export const FIXTURE_ALLOWLIST = Object.freeze([
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes: 'manager-button is-primary',
    count: 1,
    why:
      'HALF OF A DELIBERATE PAIR, and the reason this allowlist exists rather than a blanket ' +
      'exemption. `data-probe="roll-unconverted"` stands beside `data-probe="roll"`, which ' +
      'carries the primitive class, so the Checks rail test can show that its rule reaches the ' +
      'converted control and that the unconverted spelling measures something else. Convert ' +
      'this one and the test proves nothing while still passing.',
  }),
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes: 'manager-button is-danger',
    count: 2,
    why:
      'Two controls, one reason each. `data-probe="card-unconverted"` is the negative control ' +
      'in the authority-equivalence test — the class string the Modifiers card shipped before ' +
      'the conversion, kept so that "the primitive changes nothing" would fail rather than ' +
      'pass. The other is the Delete in the knowledge-row geometry fixture, which is an ' +
      '`ArmedDangerButton` and writes this string in the product too.',
  }),
  // (`manager-layout.test.js: manager-button is-subtle manager-recipe-tag-trigger` was booked
  // here as population B. Issue 1373's maintainer round 5 made `+ Tag` a CHIP trigger — the
  // design draws a dashed tag-tinted pill, not a button (`proto:2256`) — so it writes no
  // `manager-button` class at all and the fixture that modelled it went with it. Recorded
  // rather than quietly deleted, because this list exists to catch exactly the reverse: a
  // fixture outliving the control it models.)
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes: 'manager-button manager-travel-picker-trigger manager-checks-preview-actor-trigger',
    count: 1,
    why: 'Population B, as above: the Checks preview actor picker trigger.',
  }),
  Object.freeze({
    file: 'tests/components/recipe-studio-font-size.test.js',
    classes: 'manager-button manager-recipe-component-trigger',
    count: 1,
    why: 'Population B: the recipe ingredient picker trigger.',
  }),
  Object.freeze({
    file: 'tests/components/recipe-studio-font-size.test.js',
    classes: 'manager-button manager-recipe-component-trigger manager-recipe-stage-trigger',
    count: 1,
    why: 'Population B: the recipe stage picker trigger.',
  }),
  Object.freeze({
    file: 'tests/components/component-studio-font-size.test.js',
    classes: 'manager-button manager-salvage-component-trigger',
    count: 1,
    why: 'Population B: the salvage result component picker trigger.',
  }),
  Object.freeze({
    file: 'tests/components/theme-rendered-validation.test.js',
    classes: 'manager-button is-danger is-armed',
    count: 1,
    why:
      'The armed half of `ArmedDangerButton`, which is held out of the conversion and writes ' +
      'this exact string. It carries its own solid-contrast probe because it is the product`s ' +
      'first solid danger surface.',
  }),
]);

/** How many fixture ATTRIBUTES the allowlist covers, as distinct from how many entries it has. */
export const FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT = FIXTURE_ALLOWLIST.reduce(
  (total, entry) => total + entry.count,
  0
);

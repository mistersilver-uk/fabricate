/**
 * The shared ledger of bare-`manager-button` test fixtures that are deliberately pre-conversion.
 *
 * ── WHY IT IS A MODULE RATHER THAN A CONSTANT (issue 1502) ──────────────────────────────
 * It was module-private in `tests/manager-button-source-contract.test.js`, which was correct while
 * exactly one gate asked the question. Two do now: `searchable-popover-area-scope.test.js`'s
 * fixture clauses consult the same entries when they build their offender list. Two hand-listed
 * copies of one census is the drift this repository has already paid for once —
 * `tests/helpers/primitiveSourceContract.js` exists because SonarCloud measured 88 duplicated
 * lines between two source-contract guards — so the census is stated once and imported twice.
 *
 * ── THE TWO GATES ASK DIFFERENT QUESTIONS OF THIS LIST, AND FOUR ENTRIES NOW ANSWER THEM
 *    DIFFERENTLY ─────────────────────────────────────────────────────────────────────────
 * The question here is about the PRIMITIVE class: does a fixture write `manager-button` without
 * `fab-manager-button`, i.e. model a control the product renders unconverted? Every entry below
 * answers yes, permanently, and that is what earns it a place.
 *
 * The area-scope gate asks about the family ROOT instead, and for the four population-B entries
 * the two answers came apart in issue 1502. `SearchablePopover` renders its trigger as a raw
 * `<button class={triggerClass}>`, so the class list is CALLER-authored; that issue gave all
 * twelve of those call sites `fabricate-button` as their leading token, because the family is now
 * rooted at it and a trigger without it matches no rule in the sheet at all. The four fixtures
 * that model those triggers measure geometry against the real sheet, so they carry the root too —
 * MEASURED: strip it from `recipe-studio-font-size.test.js` and its flat picker reads Foundry's
 * 14px app base instead of the shared trigger rule's 13.12px. They remain unconverted, so they
 * remain listed here; they are simply no longer examples of "a fixture that must not gain the
 * root". Read this list as the ledger of deliberately UNCONVERTED fixtures, which is what its
 * entries have always said, and not as a ledger of root-less ones.
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
    count: 1,
    why:
      '`data-probe="card-unconverted"`, the negative control in the authority-equivalence ' +
      'test: the class string the Modifiers card shipped before the conversion, kept without ' +
      'the family root AND without the primitive class so that "the primitive changes ' +
      'nothing" would fail rather than pass. Giving it either class is what would make that ' +
      'test measure the converted control twice and pass vacuously.',
  }),
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes: 'fabricate-button manager-button is-danger',
    count: 1,
    why:
      'The Delete in the knowledge-row geometry fixture, which models an `ArmedDangerButton`. ' +
      'That component writes `fabricate-button manager-button is-danger` since issue 1502, so ' +
      'the fixture carries the family root as well — root-less it matched no rule in the ' +
      'family and the row clipped an action cluster shorter and narrower than the shipped ' +
      'one. Still unconverted, so it stays listed.',
  }),
  // (`manager-layout.test.js: manager-button is-subtle manager-recipe-tag-trigger` was booked
  // here as population B. Issue 1373's maintainer round 5 made `+ Tag` a CHIP trigger — the
  // design draws a dashed tag-tinted pill, not a button (`proto:2256`) — so it writes no
  // `manager-button` class at all and the fixture that modelled it went with it. Recorded
  // rather than quietly deleted, because this list exists to catch exactly the reverse: a
  // fixture outliving the control it models.)
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes:
      'fabricate-button manager-button manager-travel-picker-trigger ' +
      'manager-checks-preview-actor-trigger',
    count: 1,
    why:
      'Population B, as above: the Checks preview actor picker trigger. It carries the family ' +
      'root since issue 1502, as its call site does, and stays listed because it still models an ' +
      'unconverted control.',
  }),
  Object.freeze({
    file: 'tests/components/recipe-studio-font-size.test.js',
    classes: 'fabricate-button manager-button manager-recipe-component-trigger',
    count: 1,
    why:
      'Population B: the recipe ingredient picker trigger. Root-carrying since issue 1502, and ' +
      'the fixture whose measurement proved the root is load-bearing rather than cosmetic.',
  }),
  Object.freeze({
    file: 'tests/components/recipe-studio-font-size.test.js',
    classes:
      'fabricate-button manager-button manager-recipe-component-trigger ' +
      'manager-recipe-stage-trigger',
    count: 1,
    why:
      'Population B: the recipe stage picker trigger. Root-carrying since issue 1502, and still ' +
      'unconverted, so it keeps its place here.',
  }),
  Object.freeze({
    file: 'tests/components/component-studio-font-size.test.js',
    classes: 'fabricate-button manager-button manager-salvage-component-trigger',
    count: 1,
    why:
      'Population B: the salvage result component picker trigger. Root-carrying since issue ' +
      '1502, and still unconverted, so it keeps its place here.',
  }),
  Object.freeze({
    file: 'tests/components/theme-rendered-validation.test.js',
    classes: 'fabricate-button manager-button is-danger is-armed',
    count: 1,
    why:
      'The armed half of `ArmedDangerButton`, which is held out of the conversion. The ' +
      'component writes the family root plus `manager-button is-danger` and adds `is-armed` ' +
      'when armed, and this fixture spells that exactly. Root-less it matched nothing in the ' +
      'family, so its solid-contrast probe read the browser default button chrome — the same ' +
      'ratio in all seven themes — instead of `--fab-on-danger` on `--fab-danger`.',
  }),
]);

/** How many fixture ATTRIBUTES the allowlist covers, as distinct from how many entries it has. */
export const FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT = FIXTURE_ALLOWLIST.reduce(
  (total, entry) => total + entry.count,
  0
);

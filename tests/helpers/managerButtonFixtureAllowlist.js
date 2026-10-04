/**
 * The shared ledger of test fixtures that write `fabricate-button` without `fab-manager-button`:
 * hand-written buttons that model a control the product renders unconverted, on purpose.
 *
 * ── WHY IT IS A MODULE RATHER THAN A CONSTANT (issue 1502) ──────────────────────────────
 * It was module-private in `tests/manager-button-source-contract.test.js`, which was correct while
 * exactly one gate asked the question. Two do now: `searchable-popover-area-scope.test.js`'s
 * fixture clauses consult the same entries when they build their offender list. Two hand-listed
 * copies of one census is the drift this repository has already paid for once —
 * `tests/helpers/primitiveSourceContract.js` exists because SonarCloud measured 88 duplicated
 * lines between two source-contract guards — so the census is stated once and imported twice.
 *
 * ── THE QUESTION, RE-KEYED AT ISSUE 1507 ────────────────────────────────────────────────
 * The question here is about the PRIMITIVE class: does a fixture write `fabricate-button` without
 * `fab-manager-button`, i.e. model a control the product renders unconverted? Every entry below
 * answers yes, and that is what earns it a place. Until issue 1507 the question was asked of a
 * second family class the hand-written carriers spelled beside the root; that issue retired it, so
 * the root is now the class the question is asked of. The three entries that were root-less then
 * carry the root now, and each was re-measured with it: the values their suites assert held.
 *
 * The area-scope gate reads the same list for its root-less subset, the entries that write no
 * primitive's root at all. That subset is empty since issue 1507 and the gate's clauses stay so
 * that a root-less entry added later is still matched against its fixture. `SearchablePopover`
 * renders its trigger as a raw `<button class={triggerClass}>`, so the population-B class lists
 * are CALLER-authored, and issue 1502 gave all twelve of those call sites `fabricate-button` as
 * their leading token because a trigger without it matches no rule in the sheet at all — MEASURED:
 * strip it from `recipe-studio-font-size.test.js` and its flat picker reads Foundry's 14px app
 * base instead of the shared trigger rule's 13.12px. Read this list as the ledger of deliberately
 * UNCONVERTED fixtures, which is what its entries have always said.
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
 * @typedef {object} ButtonFixtureExemption
 * @property {string} file Repository-relative POSIX path of the suite holding the fixture.
 * @property {string} classes The exact `class` attribute value, token order included.
 * @property {number} count How many identical attributes that suite is allowed to hold.
 * @property {string} why Why the fixture is deliberately pre-conversion.
 * @property {{ file: string, literal: string }} [stillRenderedBy] The product call site whose
 *   class list this fixture models, and the exact literal it writes there. Optional, and READ
 *   rather than believed by the source-contract gate: a prose `why` cannot notice the call site
 *   it names being converted, deleted or re-rooted.
 */

/** @type {ReadonlyArray<ButtonFixtureExemption>} */
export const FIXTURE_ALLOWLIST = Object.freeze([
  Object.freeze({
    file: 'tests/components/manager-layout-tools.js',
    classes: 'fabricate-button is-primary',
    count: 1,
    why:
      'HALF OF A DELIBERATE PAIR, and the reason this allowlist exists rather than a blanket ' +
      'exemption. `data-probe="roll-unconverted"` stands beside `data-probe="roll"`, which ' +
      'carries the primitive class, so the Checks rail test can show that its rule reaches the ' +
      'converted control and that the unconverted spelling measures something else. It gained ' +
      'the family root at issue 1507 and still reads 14px against the primitive`s 11.52px. ' +
      'Convert this one and the test proves nothing while still passing.',
  }),
  Object.freeze({
    file: 'tests/components/manager-layout-tools.js',
    classes: 'fabricate-button is-danger',
    count: 1,
    why:
      '`data-probe="card-unconverted"`, the negative control in the authority-equivalence ' +
      'test: the class string the Modifiers card shipped before the conversion, kept without ' +
      'the primitive class so that "the primitive changes nothing" would fail rather than ' +
      'pass. It gained the family root at issue 1507 and, measured with it, reads 16px on a 6px ' +
      'corner against the authority`s 11.52px on 9px, so the control still discriminates. ' +
      'Giving it the primitive class is what would make that test measure the converted ' +
      'control twice and pass vacuously.',
  }),
  Object.freeze({
    file: 'tests/components/manager-layout-browsers-fixtures.js',
    classes: 'fabricate-button is-danger',
    count: 1,
    why:
      'The Delete in the knowledge-row geometry fixture, which models an `ArmedDangerButton`. ' +
      'That component writes `fabricate-button is-danger`, so the fixture carries the family ' +
      'root as well — root-less it matched no rule in the ' +
      'family and the row clipped an action cluster shorter and narrower than the shipped ' +
      'one. Still unconverted, so it stays listed.',
  }),
  // (A `manager-layout.test.js` entry for the `+ Tag` trigger, `is-subtle
  // manager-recipe-tag-trigger` behind the button classes, was booked here as population B.
  // Issue 1373's maintainer round 5 made `+ Tag` a CHIP trigger — the design draws a dashed
  // tag-tinted pill, not a button (`proto:2256`) — so it writes no button class at all and the
  // fixture that modelled it went with it. Recorded rather than quietly deleted, because this
  // list exists to catch exactly the reverse: a fixture outliving the control it models.)
  Object.freeze({
    file: 'tests/components/manager-layout-tools.js',
    classes: 'fabricate-button manager-travel-picker-trigger manager-checks-preview-actor-trigger',
    count: 1,
    why:
      'Population B, as above: the Checks preview actor picker trigger. It carries the family ' +
      'root since issue 1502, as its call site does, and stays listed because it still models an ' +
      'unconverted control.',
  }),
  Object.freeze({
    file: 'tests/components/manager-layout-select.js',
    classes: 'fabricate-button',
    count: 1,
    why:
      'BOTH sanctioned reasons at once, which is why it is a bare string rather than a forgotten ' +
      'one. `data-probe="unconverted"` is the M12a half of a converted/unconverted pair (issue ' +
      '1371): the primitive now paints the 34-38px band’s 9px corner and this probe measures ' +
      'that an unconverted hand-written button is still on the base rule’s 6px, so the ruling is ' +
      'proved scoped to the primitive rather than to the whole `.fabricate-button` family. Give it ' +
      'the primitive class and it measures 9px, the equality goes vacuous, and the blast-radius ' +
      'claim is gone. It is ALSO population B: `ComponentComplicationsSection` passes exactly ' +
      'this string as a `SearchablePopover` `triggerClass`, so the product does render it. It ' +
      'carries the family ROOT since issue 1502 — root-less it would match no family rule at all ' +
      'and measure Foundry`s own corner rather than the base rule`s 6px — but never ' +
      '`fab-manager-button`, which is what makes it the unconverted half.',
    // The provenance, checked rather than asserted in prose above — see the loop below.
    stillRenderedBy: Object.freeze({
      file: 'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte',
      literal: 'triggerClass="fabricate-button"',
    }),
  }),
  Object.freeze({
    file: 'tests/components/bulk-edit-dock-pinning.test.js',
    classes: 'fabricate-button is-danger',
    count: 1,
    why:
      'The IDLE half of `ArmedDangerButton` (`ArmedDangerButton.svelte` writes this string), ' +
      'held out of the conversion. The dock-pinning suite renders it as the bulk dock`s delete ' +
      'probe so the dock`s one-line, full-width danger face is measured against a real label ' +
      '(issue 1371, M24). Every value it measures — 34px, radius 9, 11px, weight 700, the ' +
      'clipped one-line label — is declared by ' +
      '`.fabricate-manager .fab-bulk-edit-dock .fabricate-button.is-danger`, a rule whose ' +
      'ancestor chain names the dock. It was root-less until issue 1507 retired the class that ' +
      'rule used to name; it carries the root now, and those values held.',
    // The provenance, READ rather than believed (issue 1371 r17-b, quality N7): the `why` above
    // claims the product writes this string, and the loop below checks it does.
    stillRenderedBy: Object.freeze({
      file: 'src/ui/svelte/components/ArmedDangerButton.svelte',
      literal: 'class="fabricate-button is-danger"',
    }),
  }),
  Object.freeze({
    file: 'tests/components/theme-rendered-validation.test.js',
    classes: 'fabricate-button is-danger is-armed',
    count: 1,
    why:
      'The armed half of `ArmedDangerButton`, which is held out of the conversion. The ' +
      'component writes `fabricate-button is-danger` and adds `is-armed` when armed, and this ' +
      'fixture spells that exactly. Root-less it matched nothing in the ' +
      'family, so its solid-contrast probe read the browser default button chrome — the same ' +
      'ratio in all seven themes — instead of `--fab-on-danger` on `--fab-danger`.',
  }),
]);

/** How many fixture ATTRIBUTES the allowlist covers, as distinct from how many entries it has. */
export const FIXTURE_ALLOWLIST_ATTRIBUTE_COUNT = FIXTURE_ALLOWLIST.reduce(
  (total, entry) => total + entry.count,
  0
);

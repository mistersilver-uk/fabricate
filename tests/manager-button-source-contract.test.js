/**
 * Source contract: the manager's button contract is written in ONE place (issue 1118).
 *
 * `class="manager-button"` was a CSS CONVENTION for as long as this app has had a manager, and
 * a convention is exactly as reliable as everyone's memory of it. The modifier half is the part
 * that drifted: `is-primary`, `is-ghost` and `is-danger` are remembered or they are not, nothing
 * enforces the choice, and a forgotten one is invisible to `lint`, to `format:check` and to
 * every source-contract test in this repository. It is visible only to someone looking at the
 * screen. The sweep found 19 controls painted as the wrong verb, and one — the environment
 * editor's labelled Force add — spelling a modifier the stylesheet declares NOWHERE, so it
 * shipped with no treatment at all while the amber treatment shipped with no call site.
 *
 * `ManagerButton.svelte` makes the role a required-shaped PROP with a small closed set, which
 * is a thing a reviewer can see and a test can assert. This file is what keeps it that way: it
 * is the END-STATE gate for the conversion, not a ratchet, and it asserts that the literal has
 * left `src/` entirely.
 *
 * ── THE TWO EXCEPTIONS, AND WHY EACH IS ONE ─────────────────────────────────────────────
 * `ManagerButton.svelte` carries the literal in its own docblock prose, twice, explaining the
 * convention it replaced. Without the exception this gate would red on the day it landed.
 * `ArmedDangerButton.svelte` is a CONSUMER of the same CSS contract rather than a consumer of
 * the primitive: it owns a two-state arm/confirm machine whose danger role is an invariant of
 * the machine, not a caller's choice, and routing it through the primitive would buy one shared
 * class string in exchange for a keydown/blur contract no other call site wants.
 *
 * ── WHY IT READS THE FILES ITSELF ───────────────────────────────────────────────────────
 * Never by shelling to `grep`. GNU grep classifies a file holding a raw NUL byte as BINARY and
 * omits it from a recursive search with no `-a` — silently, with no diagnostic. Three tracked
 * files under `src/` held one, and `checks/ChecksView.svelte` was among them: 101KB of manager
 * markup that every `grep -rn 'class="manager-button' src/` in this issue's planning walked
 * straight past, which is how a 101KB view came to be missing from a census that had been
 * re-derived three times. The NUL guard below is the other half of that lesson.
 *
 * ── THE FIXTURE HALF ────────────────────────────────────────────────────────────────────
 * A suite that hand-writes its own HTML and measures it in a browser keeps passing after the
 * component stops emitting that HTML. It measures the old markup forever, reports green, and
 * nothing anywhere says so. Two such fixtures were already stale when this file was written —
 * one modelling the Tool Studio header, which has rendered through the primitive since #1096
 * and passed only because the values happened to agree. So every bare `manager-button` in a
 * fixture is either fixed or ALLOWLISTED WITH ITS REASON, and the allowlist is asserted
 * exactly: an entry that stops matching reds just as loudly as an unlisted one appearing.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(repoRoot, 'src');
const TESTS = join(repoRoot, 'tests');

const CONTRACT_CLASS = 'manager-button';
const PRIMITIVE_CLASS = 'fab-manager-button';

/**
 * The two `.svelte` files under `src/` that may still write the literal, each for its own
 * reason. Repo-relative POSIX paths, so a Windows checkout compares the same strings.
 */
const LITERAL_EXCEPTIONS = Object.freeze({
  'src/ui/svelte/components/ManagerButton.svelte':
    'the primitive itself, which names the convention it replaced in its docblock prose and ' +
    'emits its own classes through a `.join(" ")` rather than writing them in markup',
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte':
    'a consumer of the same CSS contract, not of the primitive: its danger role is an ' +
    'invariant of its arm/confirm machine rather than a caller choice',
});

/**
 * Every bare-`manager-button` fixture a test is allowed to keep, and why.
 *
 * Keyed on the file and the exact class attribute rather than on a line number, which rots on
 * the first edit above it, and counted, so that deleting one of two identical probes is not
 * silently absorbed. `why` is required: a fixture with no stated reason to be pre-conversion is
 * a stale fixture that has not been noticed yet.
 */
const FIXTURE_ALLOWLIST = Object.freeze([
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
  Object.freeze({
    file: 'tests/components/manager-layout.test.js',
    classes: 'manager-button is-subtle manager-recipe-tag-trigger',
    count: 1,
    why:
      'Population B: `SearchablePopover` renders this trigger itself from a `triggerClass` ' +
      'STRING (`recipe/RecipeIngredientOption.svelte`), so it never gains the primitive class. ' +
      'The 17 such sites are named debt in the issue delta, and a fixture that converted this ' +
      'one would be modelling a control the product does not render.',
  }),
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

/** Every file beneath `directory`, as repo-relative POSIX paths. */
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(child);
    return [relative(repoRoot, child).split(sep).join('/')];
  });
}

/**
 * A prose line, which may legitimately quote the literal while explaining it.
 *
 * Line-based rather than a comment-stripping parse, for the reason
 * `confirm-button-shape-source-contract.test.js` gives: a violation is always on a CODE line,
 * and the docblocks that explain this defect must not read as the defect itself.
 */
function isCommentLine(line) {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

/**
 * Every class attribute that is actually ON AN ELEMENT in this source, as its raw token string.
 *
 * Tag-aware rather than line-based, and both halves of that are load-bearing. Prose is the
 * first reason: this repository's guards quote the literal constantly — "is booked as converted
 * but still writes a literal class=..." is an assertion MESSAGE, not a fixture, and a bare
 * `class="…"` match cannot tell the two apart. The second is that fixture markup wraps: the
 * Checks rail probe puts its `class=` on its own line, several lines below the `<button` that
 * owns it, so a rule of "is there a `<` earlier on this line" would miss exactly the fixtures
 * this exists to find.
 *
 * Comment lines are blanked first, preserving offsets, so a docblock that draws the markup it
 * is describing does not read as the markup itself.
 *
 * @param {string} source a test file's text
 * @returns {Array<string>} the value of every `class` attribute inside an element tag
 */
function classAttributesIn(source) {
  const code = source
    .split('\n')
    .map((line) => (isCommentLine(line) ? ' '.repeat(line.length) : line))
    .join('\n');
  return [...code.matchAll(/<[a-zA-Z][\w-]*\b[^<>]*>/g)].flatMap((tag) =>
    [...tag[0].matchAll(/class="([^"]*)"/g)].map((match) => match[1])
  );
}

test('no .svelte under src writes the manager-button class literal', () => {
  const svelte = filesUnder(SRC).filter((path) => path.endsWith('.svelte'));

  // NON-VACUITY, in the precedent's own style and for the precedent's own reason: an absence
  // check over an empty corpus passes forever and reports itself satisfied. A wrong root, a bad
  // extension filter or a `readdirSync` that stopped recursing all read as zero here.
  //
  // The floor is `<ManagerButton` call-site FILES, not the literal it replaced, because the
  // literal is what this test asserts the absence of — a floor stated over the same string
  // would be self-contradictory. 48 `.svelte` files under `src/` render the primitive as this
  // lands: 42 converted by the sweep plus the seven that already used it, less one orphan
  // component the sweep deleted rather than converting. 41 is a real floor with headroom, and
  // it is deliberately below the measured number so that deleting a screen does not red this.
  const callSiteFiles = svelte.filter((path) =>
    readFileSync(join(repoRoot, path), 'utf8').includes('<ManagerButton')
  );
  assert.ok(
    callSiteFiles.length >= 41,
    `expected the manager's button call sites to still be here, found ${callSiteFiles.length} ` +
      `files rendering <ManagerButton across ${svelte.length} components under src/`
  );

  const offenders = svelte
    .filter((path) => !(path in LITERAL_EXCEPTIONS))
    .filter((path) =>
      readFileSync(join(repoRoot, path), 'utf8').includes(`class="${CONTRACT_CLASS}`)
    );

  assert.deepEqual(
    offenders,
    [],
    'a manager button is a `<ManagerButton role="…">`, never a remembered class string. The ' +
      'role vocabulary is closed and a per-site visual tweak travels as a pass-through on the ' +
      '`class` prop — see `openspec/specs/ui-integration/spec.md`:\n  ' +
      offenders.join('\n  ')
  );

  // The exceptions are asserted to still EARN their exemption. An exception for a file that no
  // longer contains the literal is a permission nobody is using, and the next file added to
  // this object gets to lean on the precedent of an unchecked list.
  for (const [path, why] of Object.entries(LITERAL_EXCEPTIONS)) {
    assert.ok(
      readFileSync(join(repoRoot, path), 'utf8').includes(`class="${CONTRACT_CLASS}`),
      `${path} is exempted (${why}) but no longer writes the literal, so drop the exception`
    );
  }
});

test('no tracked file under src contains a raw NUL byte', () => {
  // The blind spot that hid `checks/ChecksView.svelte` from three rounds of census. GNU grep
  // treats a file holding a raw NUL as BINARY and omits it from a recursive search with no
  // `-a`, printing nothing to say so — so a 101KB manager view was simply absent from every
  // count. Three tracked files under `src/` held one, written as a signature separator inside a
  // `.join()`; issue 1118 rewrote all three as the two-character escape, which is one identical
  // U+0000 code point and therefore byte-identical output.
  //
  // This guards the tree rather than the tool: a NUL is invisible in an editor and in a diff,
  // so the only way it stays gone is a test that reads the bytes.
  const offenders = filesUnder(SRC).filter((path) =>
    readFileSync(join(repoRoot, path)).includes(0)
  );
  assert.deepEqual(
    offenders,
    [],
    'write a raw NUL as the `\\0` escape: it is the same code point, it survives a copy-paste, ' +
      'and it does not make the file invisible to every recursive grep in the repository:\n  ' +
      offenders.join('\n  ')
  );
});

test('no test fixture models a manager button the product no longer renders', () => {
  const found = new Map();
  let attributesScanned = 0;

  const suites = filesUnder(TESTS).filter((file) => file.endsWith('.js'));
  for (const path of suites) {
    for (const attribute of classAttributesIn(readFileSync(join(repoRoot, path), 'utf8'))) {
      const tokens = attribute.split(/\s+/).filter(Boolean);
      if (!tokens.includes(CONTRACT_CLASS)) continue;
      attributesScanned += 1;
      if (tokens.includes(PRIMITIVE_CLASS)) continue;
      const key = `${path} ${attribute}`;
      found.set(key, (found.get(key) ?? 0) + 1);
    }
  }

  // Non-vacuity: the scan must be reaching real fixture markup. Every converted fixture still
  // carries `manager-button` beside the primitive class, so this counts both halves and would
  // read zero if the attribute matcher, the walk or the extension filter stopped working.
  assert.ok(
    attributesScanned > 20,
    `only ${attributesScanned} manager-button class attributes found under tests/`
  );

  const expected = new Map(
    FIXTURE_ALLOWLIST.map((entry) => [`${entry.file} ${entry.classes}`, entry.count])
  );
  const describe = (entries) =>
    [...entries]
      .map(([key, count]) => `${count}× ${key.replace(' ', ': ')}`)
      .sort((left, right) => (left === right ? 0 : left < right ? -1 : 1));

  assert.deepEqual(
    describe(found),
    describe(expected),
    'a fixture writing a bare `manager-button` is measuring markup the product may have ' +
      'stopped emitting — the component stopped, the fixture did not, and the suite stayed ' +
      'green. Add the primitive class to the fixture, or allowlist it HERE with the reason it ' +
      'is deliberately pre-conversion (a population-B `triggerClass` trigger, an ' +
      '`ArmedDangerButton`, or one half of a converted/unconverted probe pair).'
  );

  for (const entry of FIXTURE_ALLOWLIST) {
    assert.ok(
      entry.why && entry.why.length > 40,
      `${entry.file} allowlists \`${entry.classes}\` with no stated reason`
    );
  }
});

test('the warning role has the call site its vocabulary entry was added for', () => {
  // Asserted from SOURCE, and that is a deliberate exception to this repository's preference
  // for a mounted `querySelector` — because the control cannot be mounted. It sits in
  // `CompositionList`'s standalone Non-matching section, which the markup gates on
  // `mode !== 'manual'`, while its own guard demands `mode === 'manual'`; the two conditions
  // are mutually exclusive and it renders in no state. That is a SECOND defect on the same
  // control, reported with the sweep rather than repaired by it, because whether a manual
  // force-add belongs there is a product question and this task's ruling was about a class.
  //
  // Which is also why the role assertion is worth having at all: nothing else in the tree
  // can notice this control, and the misspelling it replaces survived for exactly that reason.
  const file = 'src/ui/svelte/apps/manager/environment/CompositionList.svelte';
  const source = readFileSync(join(repoRoot, file), 'utf8');

  // Bounded to the opening tag, so the match cannot run into the next control: from the
  // `<ManagerButton` that carries the site's own class through to that tag's `>`.
  const tag = /<ManagerButton\b[^]*?>/g;
  const forceAdd = [...source.matchAll(tag)].find((match) =>
    match[0].includes('manager-environment-force-include')
  );
  assert.ok(Boolean(forceAdd), `${file} should render the labelled Force add as a ManagerButton`);
  assert.match(
    forceAdd[0],
    /role="warning"/,
    'the labelled Force add takes the `warning` role, which emits the `is-warning-action` the ' +
      'sheet actually declares — it spelt the modifier `is-warning` by hand, a class declared ' +
      'nowhere, and shipped with no warning treatment at all'
  );
  assert.ok(
    !/\bis-warning\b(?!-action)/.test(forceAdd[0]),
    'and the misspelt modifier is gone rather than joined by the correct one'
  );

  // The other half of the pair, and the mutation proof: the icon Force add beside it is the
  // same verb — same handler, same `data-action`, same localization key — and it always spelt
  // the class correctly. Moving the role onto it instead of onto the labelled control would
  // satisfy a file-level "does `warning` appear here" assertion and fails this one.
  assert.match(
    source,
    /class="manager-icon-button is-warning-action manager-environment-comp-quick-action"/,
    'the icon Force add keeps the spelling it always had, so the two halves of one verb agree'
  );
});

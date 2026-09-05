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
 * Each exception states the EVIDENCE it earns its exemption by — `'prose'` or `'markup'` — and
 * the earning clause reads it that way. Issue 1502 is why: it re-rooted the family, so the
 * carrier now writes `class="fabricate-button manager-button is-danger"`, which the raw
 * `class="manager-button` prefix no longer matches while the primitive's prose still does.
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
 *
 * That census lives in `tests/helpers/managerButtonFixtureAllowlist.js` since issue 1502, because
 * the area-scope gate's fixture clauses need the same list to know which fixture elements must
 * NOT gain the family root. Two hand-listed copies of one census is the drift this repository
 * has already paid for once; it is stated there and imported here.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FIXTURE_ALLOWLIST } from './helpers/managerButtonFixtureAllowlist.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(repoRoot, 'src');
const TESTS = join(repoRoot, 'tests');

const CONTRACT_CLASS = 'manager-button';
const PRIMITIVE_CLASS = 'fab-manager-button';
const ROOT_CLASS = 'fabricate-button';
const KEYBOARD_FOCUS_ATTRIBUTE = 'data-keyboard-focus="true"';
const PRIMITIVE_FILE = 'src/ui/svelte/components/ManagerButton.svelte';

/**
 * The two `.svelte` files under `src/` that may still write the literal, each for its own
 * reason. Repo-relative POSIX paths, so a Windows checkout compares the same strings.
 *
 * ── `evidence` IS NOT DECORATION (issue 1502) ───────────────────────────────────────────
 * The exemption-earning clause below asserts that an exempted file STILL WRITES the thing it is
 * exempted for, so a permission nobody is using is dropped rather than inherited. The two
 * exemptions earn that in DIFFERENT WAYS, and one probe cannot read both:
 *
 * - `'prose'` — the file's only occurrences of the literal are inside its docblock, explaining
 *   the convention it replaced. `classAttributesIn` returns ZERO class attributes for such a
 *   file, so a token-aware probe would red with "no longer writes the literal, so drop the
 *   exception" against a file that has not changed. Prose evidence is the raw substring.
 * - `'markup'` — the file writes the literal on a real element, so the token form is both
 *   available and strictly better. It is REQUIRED here rather than merely preferred: issue
 *   1502 re-rooted the family, and `ArmedDangerButton` now spells its attribute
 *   `class="fabricate-button manager-button is-danger"`, which a `class="manager-button`
 *   PREFIX probe no longer matches. A prefix probe is exactly the shape this change defeats.
 */
const LITERAL_EXCEPTIONS = Object.freeze({
  [PRIMITIVE_FILE]: Object.freeze({
    evidence: 'prose',
    why:
      'the primitive itself, which names the convention it replaced in its docblock prose and ' +
      'emits its own classes through a `.join(" ")` rather than writing them in markup — so ' +
      'its evidence is PROSE, and a token-aware probe would read it as having stopped',
  }),
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte': Object.freeze({
    evidence: 'markup',
    why:
      'a consumer of the same CSS contract, not of the primitive: its danger role is an ' +
      'invariant of its arm/confirm machine rather than a caller choice — so its evidence is ' +
      'MARKUP, read in token form because it now writes the family root ahead of the literal',
  }),
});

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

  // TOKEN-AWARE, not a prefix probe (issue 1502). It reads the file's own `classAttributesIn`
  // extractor and splits on whitespace, which strictly TIGHTENS the clause: the prefix form
  // `includes('class="manager-button')` cannot see a site that spells the attribute
  // `class="fabricate-button manager-button …"`, and re-rooting the family is precisely the
  // change that makes that spelling the normal one for a hand-written carrier. The token form
  // also stops matching the middle of a longer class name, which the prefix form never could.
  const offenders = svelte
    .filter((path) => !(path in LITERAL_EXCEPTIONS))
    .filter((path) =>
      classAttributesIn(readFileSync(join(repoRoot, path), 'utf8')).some((attribute) =>
        attribute.split(/\s+/).filter(Boolean).includes(CONTRACT_CLASS)
      )
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
  //
  // Each is read by the evidence it actually offers — see `LITERAL_EXCEPTIONS` above. Reading
  // both the same way is what would break: the token form reports the primitive as having
  // stopped (its literal is prose, and prose holds no class attribute), and the prose form
  // reports the carrier as having stopped the moment it writes the family root first.
  for (const [path, exception] of Object.entries(LITERAL_EXCEPTIONS)) {
    const source = readFileSync(join(repoRoot, path), 'utf8');
    const earns =
      exception.evidence === 'prose'
        ? source.includes(`class="${CONTRACT_CLASS}`)
        : classAttributesIn(source).some((attribute) =>
            attribute.split(/\s+/).filter(Boolean).includes(CONTRACT_CLASS)
          );
    assert.ok(
      earns,
      `${path} is exempted (${exception.why}) but no longer writes the literal as ` +
        `${exception.evidence}, so drop the exception or restate its evidence`
    );
  }
});

test('the primitive emits the family root and the keyboard-focus attribute', () => {
  // NOTHING ELSE PINS EITHER EMISSION (issue 1502). `IconButton` has
  // `tests/helpers/primitiveSourceContract.js` for exactly this, but `ManagerButton` does not use
  // that helper, so its two new emissions would otherwise be deletable with every suite green:
  // the class family would silently lose its root and fall back to matching nothing, and
  // `KeyboardManager#hasFocus` would silently answer `false` again.
  const source = readFileSync(join(repoRoot, PRIMITIVE_FILE), 'utf8');

  const composed = /const classes = \$derived\(\s*\[([\s\S]*?)\]/.exec(source);
  assert.ok(
    composed,
    `${PRIMITIVE_FILE} no longer composes its classes in a \`const classes = $derived([…])\` ` +
      'array literal. Retarget this reader rather than deleting the assertion — ' +
      '`manager-layout.test.js` scrapes the same literal to build its browser probes, so an ' +
      'unreadable array leaves that harness measuring an unstyled control by the primitive`s name.'
  );

  const literals = [...composed[1].matchAll(/'([a-z][\w-]*)'/g)].map((match) => match[1]);
  assert.ok(
    literals.includes(ROOT_CLASS),
    `${PRIMITIVE_FILE} must emit \`${ROOT_CLASS}\` as an unconditional literal of \`classes\`: ` +
      'the whole family is rooted at it in `styles/fabricate.css`, so without it every rule ' +
      `misses and the button renders as a bare Foundry control. Found: ${literals.join(', ')}`
  );
  assert.equal(
    literals[0],
    ROOT_CLASS,
    `\`${ROOT_CLASS}\` is the family ROOT and leads the array, ahead of \`${CONTRACT_CLASS}\` ` +
      `and \`${PRIMITIVE_CLASS}\`, so the rendered attribute reads root-first like every ` +
      'hand-written carrier of the same contract.'
  );
  for (const expected of [CONTRACT_CLASS, PRIMITIVE_CLASS]) {
    assert.ok(
      literals.includes(expected),
      `${PRIMITIVE_FILE} stopped emitting \`${expected}\`, which every rule in the family ` +
        'still names beside the root.'
    );
  }

  assert.ok(
    source.includes(KEYBOARD_FOCUS_ATTRIBUTE),
    `${PRIMITIVE_FILE} must emit \`${KEYBOARD_FOCUS_ATTRIBUTE}\` on its root element. ` +
      'Foundry`s `KeyboardManager#hasFocus` reads `dataset.keyboardFocus` on the FOCUSED ' +
      'element only, with no inheritance, so dropping it silently restores Foundry`s ' +
      'Space/arrow/Tab bindings while this control holds focus.'
  );

  // PLACEMENT, not merely presence. A rest spread that lands later wins, so the attribute has to
  // sit on the same side of `{...rest}` as `class={classes}` — see the docblock sentence this
  // asserts. Written after the spread, a caller`s `data-*` bag unsets it by accident.
  const markup = source.slice(source.indexOf('</script>'));
  const attributeAt = markup.indexOf(KEYBOARD_FOCUS_ATTRIBUTE);
  const spreadAt = markup.indexOf('{...rest}');
  assert.ok(
    attributeAt !== -1 && spreadAt !== -1 && attributeAt < spreadAt,
    `${PRIMITIVE_FILE} must write \`${KEYBOARD_FOCUS_ATTRIBUTE}\` BEFORE \`{...rest}\`, on the ` +
      'same side of the spread as `class={classes}`, so a caller`s pass-through attribute bag ' +
      'can override it deliberately and never by accident.'
  );
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

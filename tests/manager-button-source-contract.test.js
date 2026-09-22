/**
 * Source contract: the manager's button contract is written in ONE place (issue 1118).
 * `class="manager-button"` was a CSS CONVENTION for as long as this app has had a manager, and a
 * convention is exactly as reliable as everyone's memory of it.
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
 * The two `.svelte` files under `src/` that may still write the literal, each for its own reason.
 * Repo-relative POSIX paths, so a Windows checkout compares the same strings (issue 1502).
 */
const LITERAL_EXCEPTIONS = Object.freeze({
  [PRIMITIVE_FILE]: Object.freeze({
    evidence: 'prose',
    why:
      'the primitive itself, which names the convention it replaced in its docblock prose and ' +
      'emits its own classes through a `.join(" ")` rather than writing them in markup — so ' +
      'its evidence is PROSE, and a token-aware probe would read it as having stopped',
  }),
  'src/ui/svelte/components/ArmedDangerButton.svelte': Object.freeze({
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

/** A prose line, which may legitimately quote the literal while explaining it. */
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

  // NON-VACUITY, in the precedent's own style and for the precedent's own reason: an absence check
  // over an empty corpus passes forever and reports itself satisfied.
  const callSiteFiles = svelte.filter((path) =>
    readFileSync(join(repoRoot, path), 'utf8').includes('<ManagerButton')
  );
  assert.ok(
    callSiteFiles.length >= 41,
    `expected the manager's button call sites to still be here, found ${callSiteFiles.length} ` +
      `files rendering <ManagerButton across ${svelte.length} components under src/`
  );

  // TOKEN-AWARE, not a prefix probe (issue 1502).
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
      '`class` prop — see `openspec/specs/ui-visual-style/spec.md` `### Shared product UI primitives`:\n  ' +
      offenders.join('\n  ')
  );

  // The exceptions are asserted to still EARN their exemption.
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
  // NOTHING ELSE PINS EITHER EMISSION (issue 1502).
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

  // PLACEMENT, not merely presence.
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
  // The blind spot that hid `checks/ChecksView.svelte` from three rounds of census (issue 1118).
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

  // Non-vacuity: the scan must be reaching real fixture markup.
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

    // An entry claiming the PRODUCT still renders its string says so with a path and a literal, and
    // the claim is read rather than believed.
    if (!entry.stillRenderedBy) continue;
    const { file, literal } = entry.stillRenderedBy;
    assert.ok(
      readFileSync(join(repoRoot, file), 'utf8').includes(literal),
      `${entry.file} allowlists \`${entry.classes}\` because ${file} writes \`${literal}\`, ` +
        'and it no longer does — re-earn the exemption or drop it'
    );
  }
});

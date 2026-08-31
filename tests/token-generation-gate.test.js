/**
 * The `--fab-*` namespace is ONE generation, and area scoping is spelled out (issue 1399).
 *
 * Three generations of custom property were live at once — `--fab-v2-*`, `--fab-editor-*` and
 * `--fab-mv2-*` — and nothing governed which one a new token joined. `--fab-editor-*` had twenty
 * names and zero readers. Twelve of the manager's seventeen were single-declaration aliases that
 * forwarded a foundation token unconditionally, so the layer re-themed nothing and bought one
 * live effect: a primitive shared between the manager and the player rendered correctly in the
 * manager and UNSTYLED in the player, silently, because an out-of-scope custom property makes the
 * declaration invalid at computed-value time rather than failing.
 *
 * `openspec/specs/design-system/spec.md` now states the rule. This file is the gate.
 *
 * ── THE GATE IS A RAW-TEXT SCAN, AND IT OWNS THE COMMENTS ────────────────────────────────
 * A code-only scan acquires a blind spot the moment it strips comments: a commented-out
 * declaration, and — far more likely — a file that goes on NAMING a retired generation in prose
 * that is false after the collapse. So this scans raw text, and the change that landed it rewrote
 * every prose site the same grep reaches. The consequence is worth stating plainly, because it is
 * a real cost: no comment under `src/` or `styles/` may record what a token used to be called.
 * The retirement note lives in the spec and in this file. Every prose site that must go on naming
 * a retired generation — `openspec/specs/**`, `tests/**`, `AGENTS.md`, `DOMAIN.md`,
 * `scripts/lib/viewLabCases.js`, `.agents/skills/**` — sits outside the scanned roots, so the
 * gate does not contradict its own spec text.
 *
 * ── THREE TRAPS, EACH ONE MEASURED RATHER THAN REASONED ABOUT ───────────────────────────
 *   1. `--fab-v<N>-` does NOT match `--fab-mv2-`: the character before `v2` is `m`. Both shapes
 *      are therefore banned explicitly, not as one pattern with a wildcard in front of the `v`.
 *   2. THE EXTENSION LIST MUST INCLUDE `.js`. `collectWorkingTreeSources` takes an explicit list
 *      with no default, for the reason its own docstring gives — "the omitted extensions are
 *      exactly the ones a caller does not notice missing" — and this corpus proved it: a `.js`
 *      module returned `'var(--fab-mv2-accent)'` as a STRING LITERAL, which is the one channel a
 *      CSS-only pass cannot see.
 *   3. Falsification is a MATRIX, not one probe: 3 name shapes x {declaration, read} x
 *      {`.css`, `.svelte`, `.js`}. A single probe proves the regex compiles, not that the scan
 *      reaches the file the next mistake will be made in.
 *
 * ── WHAT THIS GATE DOES NOT CLAIM ───────────────────────────────────────────────────────
 * It bans three NAME SHAPES. It does not and cannot stop a fourth generation being minted under
 * a name it does not match — `--fab-gen3-` passes here. The requirement in the spec is the rule;
 * this is the part of it a text scan can decide, and saying so is the point of the change that
 * added it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import { collectStyleCorpus, declarationsIn } from './helpers/styleBlockScan.js';

/** The roots the product ships from. Prose that must name a retired generation lives outside. */
const SCANNED_ROOTS = Object.freeze(['src', 'styles']);

/**
 * `.js` is load-bearing — see trap 2 in the header. `.svelte` carries both scoped CSS and the
 * template-literal `style=` channel; `.css` carries the global sheet.
 */
const SCANNED_EXTENSIONS = Object.freeze(['.css', '.svelte', '.js']);

/**
 * The three retired shapes, as RAW TEXT patterns rather than as `var()` reads, so a declaration,
 * a read and a bare mention in prose all match. `<N>` is any run of digits, so retiring `--fab-v2-`
 * does not leave `--fab-v3-` available.
 */
const RETIRED_NAME_SHAPES = Object.freeze([
  { label: '--fab-v<N>-', pattern: /--fab-v\d+-/g },
  { label: '--fab-mv<N>-', pattern: /--fab-mv\d+-/g },
  { label: '--fab-editor-', pattern: /--fab-editor-/g },
]);

/**
 * The fourteen foundation tokens the twelve manager colour aliases and the two `--fab-v2-*`
 * colour aliases were inlined onto.
 *
 * ── WHY THIS LIST NEEDS A GATE AT ALL ───────────────────────────────────────────────────
 * Custom-property substitution is LAZY AND SITE-LOCAL. `--fab-mv2-border: var(--fab-border)`
 * declared on `.fabricate-manager` resolved `var(--fab-border)` AT `.fabricate-manager` and
 * inherited the resolved value down; after the inline each reading element resolves it for
 * itself. The substitution point moved at 919 sites, so "the alias was declared once" does not
 * license the change on its own — what licenses it is that no inline target is redeclared on any
 * selector a descendant of `.fabricate-manager` can match. That was true when it was measured and
 * ONE new `--fab-border:` inside the manager would end it, silently and in the wrong direction.
 * It is the only one of the change's three premises a future edit can break, so it ships as an
 * assertion rather than as a paragraph in a pull request.
 *
 * The predicate is a declaring-selector ALLOW-LIST rather than "can match a descendant of
 * `.fabricate-manager`", which is undecidable from a selector string.
 */
const INLINE_TARGETS = Object.freeze([
  '--fab-bg-1',
  '--fab-bg-2',
  '--fab-bg-3',
  '--fab-surface-raised',
  '--fab-border',
  '--fab-border-strong',
  '--fab-text',
  '--fab-text-muted',
  '--fab-text-subtle',
  '--fab-accent',
  '--fab-info',
  '--fab-warning',
  '--fab-danger',
  '--fab-shadow-lg',
]);

/** `:root`, or one compound of a theme block's two-selector list. */
const THEME_ROOT_COMPOUND = /^(?::root|:root\[data-fabricate-theme="[^"]+"\]|\.fabricate\[data-fabricate-theme="[^"]+"\])$/;

/** The prefix for an area-scoped custom property, which must not be read outside its area. */
const AREA_SCOPED_PREFIX = '--fab-manager-';

/** The area every `--fab-manager-*` property is scoped to. */
const AREA_SELECTOR = '.fabricate-manager';

/**
 * Every rule in one comment-stripped stylesheet, as `{ selector, body, line }`.
 *
 * At-rule preludes (`@media`, `@container`, `@supports`, `@layer`) are NOT selectors, so a rule
 * nested inside one reports the inner prelude — which is what both callers need, since a
 * container query around a manager rule must not be read as that rule's selector. An at-rule with
 * no block of its own (`@import`, `@charset`) never opens a brace and is skipped by construction.
 *
 * @param {string} css Comment-stripped CSS, offsets intact.
 * @returns {Array<{selector: string, body: string, line: number}>}
 */
function rulesIn(css) {
  const rules = [];
  const stack = [];
  let prelude = '';
  let line = 1;
  let preludeLine = 1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '\n') line += 1;
    if (character === '{') {
      const trimmed = prelude.trim().replace(/\s+/g, ' ');
      stack.push({ selector: trimmed, start: index + 1, line: preludeLine });
      prelude = '';
      preludeLine = line;
      continue;
    }
    if (character === '}') {
      const open = stack.pop();
      if (open && !open.selector.startsWith('@')) {
        rules.push({ selector: open.selector, body: css.slice(open.start, index), line: open.line });
      }
      prelude = '';
      preludeLine = line;
      continue;
    }
    if (character === ';' && stack.length === 0) {
      prelude = '';
      preludeLine = line;
      continue;
    }
    if (prelude === '' && !/\s/.test(character)) preludeLine = line;
    prelude += character;
  }
  return rules;
}

/** Every rule in the global sheet, walked once. */
let cachedRules = null;
function globalSheetRules() {
  if (cachedRules === null) {
    const corpus = collectStyleCorpus({ roots: ['styles'], extensions: ['.css'] });
    cachedRules = Object.entries(corpus).flatMap(([file, css]) =>
      rulesIn(css).map((rule) => ({ ...rule, file }))
    );
  }
  return cachedRules;
}

test('no retired token generation survives anywhere under src/ or styles/', () => {
  const sources = collectWorkingTreeSources([...SCANNED_ROOTS], [...SCANNED_EXTENSIONS]);
  const files = Object.keys(sources);

  // NOT VACUOUS, and this is the whole reason the assertion below can be trusted: an absence
  // gate over an empty corpus passes forever. Both halves are floored — a root that stopped
  // being walked, or an extension silently dropped from the list, takes one of them to zero.
  assert.ok(
    files.length > 600,
    `the scanned corpus fell to ${files.length} files, which is far below the ~690 this repository ` +
      'holds under `src/` and `styles/` at these three extensions. An absence gate over an empty ' +
      'corpus passes forever, so this is a broken scan rather than a clean tree.'
  );
  for (const extension of SCANNED_EXTENSIONS) {
    assert.ok(
      files.some((file) => file.endsWith(extension)),
      `no ${extension} file reached the scan, so this gate is blind to that half of the corpus. ` +
        'The `.js` case is the one that has actually happened: a module returned a token as a ' +
        'string literal, which no CSS-only pass can see.'
    );
  }

  const offences = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const [index, text] of source.split('\n').entries()) {
      for (const { label, pattern } of RETIRED_NAME_SHAPES) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) offences.push(`${file}:${index + 1} (${label}) ${text.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    'the `--fab-v<N>-`, `--fab-mv<N>-` and `--fab-editor-` generations are RETIRED and must not ' +
      'be declared, read, or named in a comment under `src/` or `styles/` — see "The token ' +
      'namespace is one generation and names its purpose" in ' +
      '`openspec/specs/design-system/spec.md`. A surface that wants to name a colour it already ' +
      'gets from a foundation token reads that token directly; a forwarding alias hides it from ' +
      'every surface outside its own selector. Prose that must name a retired generation belongs ' +
      'in the spec or in a test, both outside these roots:\n  ' + offences.join('\n  ')
  );
});

test('every inline target is declared only at theme root', () => {
  const declaring = new Map(INLINE_TARGETS.map((name) => [name, []]));
  for (const rule of globalSheetRules()) {
    for (const declaration of declarationsIn(rule.file, rule.body)) {
      const held = declaring.get(declaration.property);
      if (held) held.push(rule);
    }
  }

  // Non-vacuity: seven theme blocks x fourteen tokens. A drop here means the walker stopped
  // finding the theme blocks, at which point the allow-list below is satisfied by an empty set.
  const total = [...declaring.values()].reduce((sum, rules) => sum + rules.length, 0);
  assert.ok(
    total >= 90,
    `only ${total} declarations of the fourteen inline targets were found, against the 98 this ` +
      'sheet carries (seven theme blocks x fourteen). The allow-list assertion below is trivially ' +
      'satisfied by an empty set, so this is a broken walk rather than a tidied stylesheet.'
  );
  for (const [name, rules] of declaring) {
    assert.ok(rules.length > 0, `${name} is no longer declared anywhere, so it is not a foundation token`);
  }

  const offences = [];
  for (const [name, rules] of declaring) {
    for (const rule of rules) {
      const compounds = rule.selector.split(',').map((part) => part.trim());
      if (compounds.every((compound) => THEME_ROOT_COMPOUND.test(compound))) continue;
      offences.push(`${name} declared on \`${rule.selector}\` (${rule.file}:${rule.line})`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    'a foundation token that twelve manager aliases and two app aliases were INLINED onto is ' +
      'declared somewhere other than `:root` or a theme block. Custom-property substitution is ' +
      'lazy and site-local: the inline moved the substitution point from `.fabricate-manager` to ' +
      'each reading element, and that is value-preserving only while every one of these fourteen ' +
      'resolves to the same text at both places. One redeclaration inside the manager breaks it ' +
      'silently, at hundreds of sites, in the direction nobody looks:\n  ' + offences.join('\n  ')
  );
});

test('an area-scoped manager property is declared and read only inside its area', () => {
  const rules = globalSheetRules().filter((rule) => rule.body.includes(AREA_SCOPED_PREFIX));

  // Non-vacuity, and it is the reason this gate is written against the requirement's own words
  // rather than against a directory. The obvious proxy — "no file outside `apps/manager/**`
  // reads one" — is UNSATISFIABLE here: all of these properties are read from the global sheet,
  // which is outside that directory, so the proxy would red on 100% of its own population on
  // arrival. Manager CSS living in the global stylesheet is the design, not the defect.
  assert.ok(
    rules.length >= 10,
    `only ${rules.length} rules in the global sheet mention \`${AREA_SCOPED_PREFIX}\`, against the ` +
      'fourteen — carrying sixteen declaration and read sites — this sheet holds. With none, the ' +
      'assertion below is vacuous.'
  );

  const offences = rules
    .filter((rule) => !rule.selector.includes(AREA_SELECTOR))
    .map((rule) => `${rule.file}:${rule.line} \`${rule.selector}\``);

  assert.deepEqual(
    offences,
    [],
    `\`${AREA_SCOPED_PREFIX}*\` is the prefix for an AREA-SCOPED custom property and must not be ` +
      `declared or read outside \`${AREA_SELECTOR}\`. Outside the area it is undefined, the ` +
      'declaration is invalid at computed-value time, and the value falls back to inheritance — ' +
      'nothing fails, it just looks wrong. If the rule genuinely belongs to every area, it is ' +
      'reading a foundation token, not an area-scoped one:\n  ' + offences.join('\n  ')
  );
});

test('no Svelte scoped style reaches an area-scoped manager property', () => {
  // A scoped `<style>` cannot guarantee its host renders under `.fabricate-manager`: a component
  // is placed in a directory, not in a DOM subtree, and `apps/manager/ComplicationSummaryRow` is
  // the standing counterexample — it lives under `apps/manager/` and is imported by two player
  // surfaces that render it under `.fabricate-app`. So the rule for `src/**` is stricter than the
  // rule for the global sheet, and it is a rule about SCOPED CSS rather than about a folder.
  //
  // `selection-checkbox-mounted.test.js` already asserts this shape for one component. This
  // generalises it rather than replacing it with something weaker: that suite reads the primitive
  // it is about and fails with that primitive's name on it.
  const corpus = collectStyleCorpus({ roots: ['src'], extensions: ['.svelte'] });
  const files = Object.keys(corpus);

  assert.ok(
    files.length > 100,
    `only ${files.length} Svelte scoped blocks reached the scan, against the ~180 this tree holds. ` +
      'An absence gate over an empty corpus passes forever.'
  );

  const offences = [];
  for (const [file, css] of Object.entries(corpus)) {
    for (const [index, text] of css.split('\n').entries()) {
      if (text.includes(AREA_SCOPED_PREFIX)) offences.push(`${file}:${index + 1} ${text.trim()}`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    `a Svelte scoped \`<style>\` reads or declares a \`${AREA_SCOPED_PREFIX}*\` property. A ` +
      'component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot ' +
      `guarantee that its host renders under \`${AREA_SELECTOR}\` — and where it does not, the ` +
      'property is undefined and the declaration silently falls back to inheritance. Read a ' +
      'foundation token, or move the rule into the global sheet under an area selector:\n  ' +
      offences.join('\n  ')
  );
});

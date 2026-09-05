/**
 * The four liveness rules of `scripts/lib/stylesheetLiveClasses.js`, proved on a synthetic corpus.
 *
 * WHY SYNTHETIC. The helper's customer is `tests/styles-dead-classes.test.js`, which runs it over
 * the real tree and asserts the answer is ZERO. That is a fine ratchet and a terrible specification:
 * a helper that returned nothing at all would satisfy it forever. Every rule is therefore exercised
 * here against inputs written to exercise it, where a wrong answer is a failing assertion rather
 * than a quietly shorter list — and where the case that the tree does not currently contain (a
 * frozen map keyed dynamically, a class named only inside a comment) is still covered.
 *
 * WHY ONE TABLE OF STRING ROWS. SonarCloud counts duplication in test code, and a rule-per-suite
 * layout would repeat the same six lines of build-and-assert scaffolding once per rule. The corpus
 * is one array of `{id, file, source}` rows and the assertions are data on the same row, so adding
 * a case is a row rather than a block.
 *
 * WHY THE FILE EXTENSION IS PART OF EACH ROW. Comment stripping is per REGION and the region rules
 * are chosen by extension: a `.svelte` file's markup gets HTML comments only, its `<script>` gets
 * the JavaScript stripper and its `<style>` gets the CSS one. The `style url` row is the one that
 * fails if the `<style>` region is handed the JavaScript stripper: two slashes are not a comment
 * delimiter in CSS, so an unquoted `url(https://…)` blanks the rest of its line and takes any
 * `:global()` after it. The `markup url` row is the WEAKER half of the same story and says so on
 * its own line — an `href="…"` is quoted, and the JavaScript stripper skips quoted runs, so that
 * row pins the markup region rule without being able to fail on the `//` hazard itself.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOUNDRY_CORE_CLASSES,
  attachedCommentStart,
  buildLiveClassSet,
  compoundClasses,
  compoundsOf,
  deadRuleBlocks,
  declaredClasses,
  ruleBlocks,
} from '../scripts/lib/stylesheetLiveClasses.js';

/**
 * One synthetic source file per row, with what its text must and must not make live.
 *
 * `live` is checked through `has`, which admits literals, the core allow-list and the positional
 * wildcards. `exact` is checked through the literal set alone, so a row claiming a CONSTRUCTED
 * class was resolved cannot be satisfied by the wildcard that the same token also contributes.
 * `dead` is checked through `has`, so it fails on any channel at all admitting the name.
 */
const SOURCE_ROWS = [
  {
    id: 'literal class attribute',
    file: 'src/ui/svelte/apps/Alpha.svelte',
    source: '<div class="alpha-card alpha-card-body"></div>',
    exact: ['alpha-card', 'alpha-card-body'],
  },
  {
    id: 'class directive',
    file: 'src/ui/svelte/apps/Beta.svelte',
    source: '<div class="beta-card" class:is-open={open}></div>',
    exact: ['beta-card', 'is-open'],
  },
  {
    id: 'global selector in a scoped style',
    file: 'src/ui/svelte/apps/Gamma.svelte',
    source: '<div></div>\n<style>\n  :global(.gamma-card) {\n    color: red;\n  }\n</style>',
    exact: ['gamma-card'],
  },
  {
    id: 'classes array on an application shell',
    file: 'src/ui/DeltaApp.svelte.js',
    source: 'export const options = {\n  classes: ["delta-app", "fabricate"],\n};',
    exact: ['delta-app'],
  },
  {
    id: 'markup url',
    file: 'src/ui/svelte/apps/Epsilon.svelte',
    source: '<a href="https://example.invalid/docs" class="epsilon-link">read</a>',
    exact: ['epsilon-link'],
    because: 'markup is given HTML comments only, and this pins that region rule rather than the'
      + ' // hazard: the href is QUOTED and the JavaScript stripper skips quoted runs, so the row'
      + ' below is the one that fails when the style region loses the CSS stripper',
  },
  {
    id: 'style url',
    file: 'src/ui/svelte/apps/Upsilon.svelte',
    source: [
      '<div></div>',
      '<style>',
      '  .upsilon-shell { background: url(https://example.invalid/a.png); }'
        + ' :global(.upsilon-live) { color: red; }',
      '</style>',
    ].join('\n'),
    exact: ['upsilon-live'],
    because: 'an UNQUOTED url() is the case the JavaScript stripper really does eat — it reads the'
      + ' // as a line comment and blanks to the end of the line, so the :global() sharing that'
      + ' line is lost and .upsilon-live is called dead. Both are on one line deliberately: the'
      + ' blanking stops at the newline, so a row spreading them over two lines stays green with'
      + ' the style region wired to the JavaScript stripper and proves nothing',
  },
  {
    id: 'class named only in a markup comment',
    file: 'src/ui/svelte/apps/Zeta.svelte',
    source: '<!-- <div class="zeta-card"></div> was retired -->\n<div class="zeta-live"></div>',
    exact: ['zeta-live'],
    dead: ['zeta-card'],
  },
  {
    id: 'class named only in a script comment',
    file: 'src/ui/svelte/apps/Eta.svelte',
    source: '<script>\n  // const retired = "eta-card";\n  const kept = "eta-live";\n</script>',
    exact: ['eta-live'],
    dead: ['eta-card'],
  },
  {
    id: 'class named only in a style comment',
    file: 'src/ui/svelte/apps/Theta.svelte',
    source: '<div></div>\n<style>\n  /* class="theta-card" is gone */\n</style>',
    dead: ['theta-card'],
  },
  {
    id: 'constructed from a module constant',
    file: 'src/systems/KappaCard.js',
    source: "const BLOCK = 'kappa-chat';\nexport const html = `<span class=\"${BLOCK}__label\"></span>`;",
    exact: ['kappa-chat__label'],
  },
  {
    id: 'constructed from a frozen map read dynamically',
    file: 'src/systems/LambdaCard.js',
    source: [
      "const BLOCKS = Object.freeze({ craft: 'lambda-chat', gather: 'mu-chat' });",
      'export function render(kind) {',
      '  const block = BLOCKS[kind];',
      '  return `<ul class="${block}__grid"></ul>`;',
      '}',
    ].join('\n'),
    exact: ['lambda-chat__grid', 'mu-chat__grid'],
  },
  {
    id: 'unresolvable hole leaves a positional wildcard',
    file: 'src/ui/svelte/apps/Nu.svelte',
    source: '<div class={`${unknownPrefix}-nu-panel`}></div>',
    live: ['anything-nu-panel'],
    unresolved: ['-nu-panel'],
    because: 'a static suffix admits every sheet class ending in it, which is how ${block}__section'
      + ' keeps the chat cards alive',
  },
  {
    id: 'wholly dynamic token contributes no wildcard',
    file: 'src/ui/svelte/apps/Xi.svelte',
    source: '<div class={`xi-card ${wholeToken}`}></div>',
    exact: ['xi-card'],
    dead: ['xi-orphan'],
    reportsDynamic: true,
  },
  {
    id: 'class prop passed as a quoted attribute',
    file: 'src/ui/svelte/apps/Chi.svelte',
    source: '<Picker triggerClass="chi-trigger chi-trigger-${size}" />',
    exact: ['chi-trigger'],
    live: ['chi-trigger-alpha'],
    unresolved: ['chi-trigger-'],
    because: 'a shared primitive takes its classes as PROPS, so a caller family classes reach'
      + ' the DOM through the primitive, and the prop is the only place they are written. Read as'
      + ' ordinary attribute the value would be one flat string and the rung suffix would be lost',
  },
  {
    id: 'class prop passed as a braced template',
    file: 'src/ui/svelte/apps/Psi.svelte',
    source: '<Picker pickerClass={`psi-picker psi-picker-${rung}`} />',
    exact: ['psi-picker'],
    live: ['psi-picker-form'],
    unresolved: ['psi-picker-'],
    because: 'the braced form is where every real call site writes a class prop, and its value is a'
      + ' TEMPLATE literal — invisible to the quoted-string sweep, so without the class-prop rule'
      + ' even the static half is not live',
  },
  {
    id: 'class prop passed by Svelte shorthand',
    file: 'src/ui/svelte/apps/Omega.svelte',
    source: [
      '<script>',
      '  const rowClass = $derived(`omega-row omega-row-${tone}`);',
      '</script>',
      '<Picker {rowClass} />',
    ].join('\n'),
    exact: ['omega-row'],
    live: ['omega-row-warm'],
    unresolved: ['omega-row-'],
    because: 'the shorthand names the binding rather than the value, so the prop is resolved out of'
      + ' the file own definitions — a $derived template included',
  },
  {
    id: 'a *Class binding outside markup is not a class prop',
    file: 'src/ui/svelte/util/koppaNavigation.js',
    source: [
      "const koppaSuffix = 'alpha';",
      "const koppaProbeClass = 'koppa-probe-${koppaSuffix}';",
    ].join('\n'),
    exact: ['koppa-probe-'],
    dead: ['koppa-probe-alpha'],
    because: 'the class-prop rule is keyed on the attribute name AND on the markup region, because'
      + ' a name ending in Class is an ordinary JavaScript identifier too. This module holds no'
      + ' markup and hands the value to nothing, so it writes no class onto any element and the'
      + ' hole beside its static half must not resolve into one',
  },
  {
    id: 'a template literal that is not a class prop stays dead',
    file: 'src/ui/svelte/apps/Digamma.svelte',
    source: [
      '<script>',
      '  const label = `digamma-heading digamma-heading-${title}`;',
      '</script>',
      '<button class="digamma-live" title={`digamma-tooltip ${title}`}>{label}</button>',
    ].join('\n'),
    exact: ['digamma-live'],
    dead: ['digamma-heading', 'digamma-heading-x', 'digamma-tooltip'],
    because: 'the class-prop rule is keyed on the ATTRIBUTE NAME ending in Class, not on the value'
      + ' being a template. Widening the literal sweep to backticks instead would make every'
      + ' identifier run in every template under src/ live, which is what keeps a dead rule alive',
  },
  {
    id: 'dynamic state class does not widen every state class',
    file: 'src/ui/svelte/apps/Omicron.svelte',
    source: '<span class={`omicron-pill is-${tone}`}></span>',
    exact: ['omicron-pill'],
    dead: ['is-anything'],
    stateOpen: ['omicron-pill'],
    reportsDynamic: true,
    because: 'the state prefix yields no wildcard, so the token is reported for disposition',
  },
];

/** Build a live-class set from one row, with no filesystem access at all. */
function liveSetFor(row) {
  return buildLiveClassSet({ sources: { [row.file]: row.source } });
}

test('every liveness rule holds on its synthetic row', () => {
  for (const row of SOURCE_ROWS) {
    const live = liveSetFor(row);
    for (const name of row.exact ?? []) {
      assert.ok(live.literals.has(name), `${row.id}: "${name}" must be resolved to a literal`);
    }
    for (const name of [...(row.exact ?? []), ...(row.live ?? [])]) {
      assert.ok(live.has(name), `${row.id}: "${name}" must be live`);
    }
    for (const name of row.dead ?? []) {
      assert.ok(!live.has(name), `${row.id}: "${name}" must NOT be live — ${row.because ?? ''}`);
    }
    for (const fragment of row.unresolved ?? []) {
      const found = live.wildcards.some((wildcard) => wildcard.fragment === fragment);
      assert.ok(found, `${row.id}: expected a positional wildcard on "${fragment}"`);
    }
    for (const base of row.stateOpen ?? []) {
      assert.ok(live.stateOpenBases.has(base), `${row.id}: "${base}" must accept a state class`);
    }
    assert.equal(
      live.dynamicTokens.length > 0,
      Boolean(row.reportsDynamic),
      `${row.id}: the unresolvable-token report disagrees with the row`
    );
  }
});

test('the corpus is alive, so the loop above cannot pass by iterating nothing', () => {
  assert.ok(SOURCE_ROWS.length >= 14, 'the synthetic corpus lost rows');
  const covered = SOURCE_ROWS.filter((row) => (row.exact ?? row.live ?? row.dead ?? []).length > 0);
  assert.equal(covered.length, SOURCE_ROWS.length, 'a row asserts nothing at all');
});

test('a state class is live through the base class a dynamic site writes it onto', () => {
  const live = buildLiveClassSet({
    sources: {
      'src/ui/svelte/apps/Pi.svelte':
        '<span class={`pi-pill is-${tier}`}></span>\n<span class="pi-card"></span>',
    },
  });

  assert.deepEqual(deadRuleBlocks('.pi-pill.is-hazardous { color: red; }', live), []);
  assert.equal(
    deadRuleBlocks('.pi-card.is-hazardous { color: red; }', live).length,
    1,
    'no site writes a dynamic state class onto .pi-card, so .is-hazardous there matches nothing'
  );
  assert.deepEqual(
    deadRuleBlocks('.is-nowhere { color: red; }', live),
    [],
    'a compound with no base class at all has nothing to judge its state against, so rule 4'
      + ' abstains rather than condemning it: an element type carries `strong.is-disabled` with no'
      + ' Fabricate class beside it, and a deletion is the direction a later gate cannot undo'
  );
});

test('a selector list with one live item keeps the whole block', () => {
  const live = buildLiveClassSet({
    sources: { 'src/ui/svelte/apps/Rho.svelte': '<div class="rho-live"></div>' },
  });

  assert.deepEqual(deadRuleBlocks('.rho-live, .rho-dead { color: red; }', live), []);
  const dead = deadRuleBlocks('.rho-dead, .rho-gone { color: red; }', live);
  assert.equal(dead.length, 1);
  assert.deepEqual(dead[0].deadClasses, ['rho-dead', 'rho-gone']);
});

test('one dead class anywhere in a selector condemns it, because the selector matches nothing', () => {
  const live = buildLiveClassSet({
    sources: { 'src/ui/svelte/apps/Sigma.svelte': '<div class="sigma-live"></div>' },
  });

  assert.equal(deadRuleBlocks('.sigma-live .sigma-dead { color: red; }', live).length, 1);
  assert.deepEqual(
    deadRuleBlocks('.sigma-live:not(.sigma-dead) { color: red; }', live),
    [],
    'a :not() argument is a class the element must NOT carry, so it is not a requirement'
  );
});

test('the Foundry core allow-list is what keeps core-emitted classes alive', () => {
  const sources = { 'src/ui/svelte/apps/Tau.svelte': '<div class="tau-card"></div>' };
  const withList = buildLiveClassSet({ sources });
  const withoutList = buildLiveClassSet({ sources, coreClasses: [] });

  assert.ok(withList.has('window-content'), 'the allow-list must admit a core class');
  assert.ok(!withoutList.has('window-content'), 'nothing else admits it, so the list is load-bearing');
  assert.ok(FOUNDRY_CORE_CLASSES.includes('window-content'));
});

test('at-rules are containers, so only the rules inside them are reported', () => {
  const css = '@media (width <= 10px) {\n  .upsilon-dead {\n    color: red;\n  }\n}';
  const live = buildLiveClassSet({ sources: { 'src/ui/svelte/apps/Ups.svelte': '<div></div>' } });

  assert.deepEqual(
    ruleBlocks(css).map((rule) => rule.selector),
    ['.upsilon-dead'],
    'the @media prelude is a query, not a selector'
  );
  const dead = deadRuleBlocks(css, live);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].line, 2);
  assert.equal(dead[0].endLine, 4);
});

test('a class exempted by name is treated as live', () => {
  const live = buildLiveClassSet({ sources: { 'src/ui/svelte/apps/Phi.svelte': '<div></div>' } });
  const css = '.manager-availability-menu { color: red; }';

  assert.equal(deadRuleBlocks(css, live).length, 1, 'without the exemption it is dead');
  assert.deepEqual(
    deadRuleBlocks(css, live, { exempt: (name) => name.startsWith('manager-availability-') }),
    []
  );
});

test('a comment directly above a rule is part of it; a banner above a blank line is not', () => {
  const attached = '/* why */\n.chi { color: red; }';
  assert.equal(attachedCommentStart(attached, attached.indexOf('.chi')), 0);

  const banner = '/* SECTION */\n\n.psi { color: red; }';
  const ruleAt = banner.indexOf('.psi');
  assert.equal(attachedCommentStart(banner, ruleAt), ruleAt, 'a banner describes what follows it');
});

test('selectors split at top-level combinators and read only top-level classes', () => {
  assert.deepEqual(compoundsOf('.a.b > .c:is(.d .e)'), ['.a.b', '.c:is(.d .e)']);
  assert.deepEqual(compoundClasses('.a.b'), ['a', 'b']);
  assert.deepEqual(compoundClasses('.c:is(.d .e)'), ['c']);
  assert.deepEqual(declaredClasses('.a .b, .c { color: red; }'), new Set(['a', 'b', 'c']));
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  gateOver,
  templatesOf,
  workingTree,
} from './helpers/designSystemRatchet.js';
import { attributeText, walkElements } from './helpers/svelteTemplateScan.js';

/**
 * Foundry decides whether a keypress belongs to the focused element or to its own bindings by
 * reading ONE property, and a `div` loses that test.
 */

/** Foundry's `hasFocus` recognises these by TAG NAME alone, so they need no declaration. */
const SELF_DECLARING_TAGS = new Set(['input', 'select', 'textarea']);

/** The working tree's templates, parsed once for every clause in this file (issue 1497). */
function templates() {
  const tree = workingTree(TEMPLATE_CORPUS);
  return templatesOf(tree.readFile, tree.listFiles());
}

/** The roles that make a non-form element an interactive control, for clause (a). */
const INTERACTIVE_ROLES = new Set(['button', 'row', 'option', 'tab', 'tabpanel']);

/** A statically written `tabindex="0"`, as opposed to a roving expression. */
const STATIC_TABINDEX_ZERO = /=\s*["']0["']/u;

/** An ACTIVE opt-out: `data-keyboard-focus="false"`. */
const OPTED_OUT = /=\s*["']false["']/u;

/** The declaration this whole file is about. */
const DECLARATION = 'data-keyboard-focus';

/** Every element the widened gate looks at, in the three clauses that make it up. */
function focusPopulations(corpus = templates()) {
  const negativeOne = [];
  const roleZero = [];
  const formlessButtons = [];
  const roving = [];
  for (const { file, source, ast } of corpus) {
    walkElements(ast.fragment, (element, inForm) => {
      const tag = element.name.toLowerCase();
      const declared = attributeText(source, element, DECLARATION);
      const tabindex = attributeText(source, element, 'tabindex');
      const roleText = attributeText(source, element, 'role');
      const role = roleText === null ? null : (/=\s*["']([^"']+)["']/u.exec(roleText) ?? [])[1];
      const target = {
        file,
        tag: element.name,
        declared,
        line: source.slice(0, element.start).split('\n').length,
      };

      // (c) the shipped clause: a programmatic focus target.
      if (
        tabindex !== null &&
        /-1/u.test(tabindex) &&
        !SELF_DECLARING_TAGS.has(tag) &&
        !(tag === 'button' && inForm) &&
        attributeText(source, element, 'contenteditable') === null
      ) {
        negativeOne.push(target);
      }

      // (a) an element that has put itself in the tab order and announced a control role.
      if (tabindex !== null && !SELF_DECLARING_TAGS.has(tag)) {
        if (role !== null && INTERACTIVE_ROLES.has(role)) {
          if (STATIC_TABINDEX_ZERO.test(tabindex)) roleZero.push({ ...target, role });
        }
        if (!STATIC_TABINDEX_ZERO.test(tabindex) && /\{/u.test(tabindex) && /0/u.test(tabindex)) {
          roving.push({ ...target, role });
        }
      }

      // (b) a button Foundry does not recognise, because it has no form.
      if (element.type === 'RegularElement' && tag === 'button' && !inForm) {
        formlessButtons.push(target);
      }
    });
  }
  return { negativeOne, roleZero, formlessButtons, roving };
}

/**
 * The undeclared members of a population — the debt, as opposed to the compliant sites (issue
 * 1497).
 *
 * @returns {Array<{declared: string|null}>} The members that do not declare themselves focused.
 */
const undeclaredIn = (population) =>
  population.filter((target) => target.declared === null || OPTED_OUT.test(target.declared));

/** A gate over one population's undeclared members, one site per element, counted per file. */
const undeclaredGate = (population, id) =>
  gateOver([TEMPLATE_CORPUS], (readFile, files) =>
    undeclaredIn(focusPopulations(templatesOf(readFile, files))[population]).map((target) => ({
      file: target.file,
      line: target.line,
      id,
    }))
  );

const ROLE_FOCUS_GATE = undeclaredGate('roleZero', 'undeclared role focus target');
const FORMLESS_BUTTON_GATE = undeclaredGate('formlessButtons', 'undeclared formless button');

describe('design system: a programmatic focus target declares itself focused to Foundry', () => {
  // (C) IS A FLOOR AND NOT A RATCHET, AND THAT IS A JUDGEMENT ABOUT WHAT IT MEASURES rather than
  // leniency. The clauses BELOW it compare with the base commit, because they measure debt.
  it('finds programmatic focus targets, so the assertions below are not vacuous', () => {
    const targets = focusPopulations().negativeOne;
    assert.ok(
      targets.length >= 20,
      `the walk reached ${targets.length} focus targets. A walk that reaches an empty or ` +
        'truncated set passes every assertion below while proving nothing.'
    );
  });

  it('finds no non-form focus target that fails to declare itself', () => {
    const undeclared = undeclaredIn(focusPopulations().negativeOne).map(
      (target) => `${target.file} <${target.tag}>`
    );
    assert.deepEqual(
      undeclared,
      [],
      'These elements can hold focus and do not declare it, so Foundry treats the window as ' +
        'unfocused: Space pauses the game and the arrows pan the canvas behind the open ' +
        'application. Add data-keyboard-focus="true".'
    );
  });

  it('reads the VALUE, because "false" inverts the meaning rather than merely omitting it', () => {
    // `hasFocus` returns FALSE for `data-keyboard-focus="false"`.
    const optedOut = focusPopulations()
      .negativeOne.filter((target) => target.declared !== null && OPTED_OUT.test(target.declared))
      .map((target) => `${target.file} <${target.tag}>`);
    assert.deepEqual(
      optedOut,
      [],
      'a programmatic focus target must not opt OUT of being treated as focused'
    );
  });

  it('counts an opt-out as UNDECLARED, so clauses (a) and (b) read the value too', () => {
    // SYNTHETIC AND BOTH POLARITIES, because no element in the corpus writes the opt-out today —
    // which is exactly the condition under which a value-blind filter goes unnoticed.
    const population = [
      { file: 'Omitted.svelte', tag: 'div', declared: null },
      { file: 'OptedOut.svelte', tag: 'div', declared: `${DECLARATION}="false"` },
      { file: 'SpacedOptOut.svelte', tag: 'div', declared: `${DECLARATION} = 'false'` },
      { file: 'Declared.svelte', tag: 'div', declared: `${DECLARATION}="true"` },
      { file: 'Bare.svelte', tag: 'div', declared: DECLARATION },
    ];

    assert.deepEqual(
      undeclaredIn(population).map((target) => target.file),
      ['Omitted.svelte', 'OptedOut.svelte', 'SpacedOptOut.svelte'],
      'an element that opts OUT is in exactly the state this file reports — `hasFocus` returns ' +
        'false for it — so it belongs in the debt with the elements that say nothing. A filter ' +
        "testing only for the attribute's PRESENCE lets one site leave the debt by writing " +
        '"false", which reads as a fix and is the opposite of one.'
    );
  });

  // THE TWO POPULATIONS THE `tabindex="-1"` CLAUSE NEVER REACHED. `tabindex="-1"` is only ONE of
  // the three ways an element in this corpus can hold focus, and it is the rarest: 42 elements, all
  // compliant (issue 1497).
  it('the roving-tabindex sites stay outside clause (a) by construction', () => {
    const { roving, roleZero } = focusPopulations();
    assert.ok(
      roving.length > 0,
      'no element writes a roving `tabindex={active ? 0 : -1}` any more, so this control has no ' +
        'domain and the paragraph above it is describing a pattern the corpus no longer uses'
    );
    const overlap = roving.filter((target) =>
      roleZero.some((other) => other.file === target.file && other.line === target.line)
    );
    assert.deepEqual(
      overlap.map((target) => `${target.file}:${target.line} <${target.tag}>`),
      [],
      'a roving-tabindex element has been counted by clause (a). The two populations are defined ' +
        'to be disjoint — (a) reads a STATIC `tabindex="0"` — so this is the pattern matcher ' +
        'having widened, not the corpus having changed.'
    );
  });

  it('no role-bearing element joins the tab order without declaring itself', (t) => {
    const { roleZero } = focusPopulations();

    assert.ok(
      roleZero.length >= 7,
      `only ${roleZero.length} elements carry both a static \`tabindex="0"\` and an interactive ` +
        'role, against the 7 this tree holds. An absence check over an empty population passes ' +
        'forever.'
    );

    assertFloor('role-bearing focus targets', templates().length, 250);
    checkGate(
      t,
      ROLE_FOCUS_GATE,
      `Add ${DECLARATION}="true". An element with \`tabindex="0"\` and \`role="button"\` has ` +
        'told the user it is a control and put itself in the tab order, and Foundry still treats ' +
        'the window as unfocused while it holds focus — so Space pauses the game and the arrows ' +
        'pan the canvas behind the open application. Better still, render the shared primitive ' +
        'that already declares it rather than a div wearing a role.'
    );
  });

  it('no button outside a form joins the tab order without declaring itself', (t) => {
    // THE LARGEST POPULATION IN THIS FILE AND THE LEAST OBVIOUS.
    const { formlessButtons } = focusPopulations();
    const undeclared = undeclaredIn(formlessButtons);

    // 198 at issue 1777, which moved the manager trail's 22 crumb buttons into `PageHeader`, then
    // 173 once the manager rail's hand-authored rows became loops over `managerNavItems.js`.
    assert.ok(
      formlessButtons.length >= 160,
      `only ${formlessButtons.length} buttons outside a form reached the walk, against the 164 ` +
        'this tree holds'
    );
    assert.ok(
      formlessButtons.length - undeclared.length >= 5,
      `only ${formlessButtons.length - undeclared.length} formless buttons declare ` +
        `\`${DECLARATION}\`. With none, this clause cannot tell "the fix works" from "nothing has ` +
        'been fixed", and the compliant shape has no live example for a reader to copy.'
    );

    assertFloor('formless buttons', templates().length, 250);
    checkGate(
      t,
      FORMLESS_BUTTON_GATE,
      `Add ${DECLARATION}="true", or render a shared primitive that already does. Foundry ` +
        'recognises a BUTTON only when it has an ancestor `<form>` — `hasFocus` literally returns ' +
        '`!!focused.form` — and this application renders almost no forms, so a focused toolbar ' +
        'button leaves every keybinding live: Space pauses the game and the arrows pan the canvas ' +
        'behind the window.'
    );
  });

  it('fails a new or grown undeclared population against base, and a marker exempts one', (t) => {
    const PROBE = 'src/ui/svelte/Probe.svelte';
    const probe = (...lines) =>
      ['<button>a</button>', '<form><button>b</button></form>', ...lines, ''].join('\n');
    const base = { [PROBE]: probe(), 'README.md': 'x\n' };
    const button = (file, what) => `${file}: undeclared formless button ${what}`;
    assertGateCases(t, FORMLESS_BUTTON_GATE, base, [
      {
        head: { [PROBE]: probe('<button>c</button>') },
        failures: [button(PROBE, 'rose from 1 to 2')],
      },
      {
        head: { 'src/ui/svelte/Other.svelte': '<button>d</button>\n' },
        failures: [button('src/ui/svelte/Other.svelte', 'is new (1)')],
      },
      { head: { [PROBE]: probe(`<button ${DECLARATION}="true">c</button>`) }, failures: [] },
      {
        head: {
          [PROBE]: probe('<!-- ratchet-exempt(design-system): a probe -->', '<button>c</button>'),
        },
        failures: [],
      },
      { head: { 'README.md': 'y\n' }, skipped: 'corpus-unchanged' },
    ]);
    assertGateCases(t, ROLE_FOCUS_GATE, base, [
      {
        head: { [PROBE]: probe('<div role="button" tabindex="0">e</div>') },
        failures: [`${PROBE}: undeclared role focus target is new (1)`],
      },
    ]);
  });
});

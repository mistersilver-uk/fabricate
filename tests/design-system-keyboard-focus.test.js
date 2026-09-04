import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_FORMLESS_BUTTONS,
  KNOWN_FORMLESS_BUTTON_TOTAL,
  KNOWN_ROLE_FOCUS_TARGETS,
  KNOWN_ROLE_FOCUS_TARGET_TOTAL,
} from './components/design-system-known-debt.js';
import { assertRatchet, tallyByKey } from './helpers/ratchetBaseline.js';
import {
  UI_TEMPLATE_ROOT,
  attributeText,
  parsedTemplates,
  walkElements,
} from './helpers/svelteTemplateScan.js';

/**
 * Foundry decides whether a keypress belongs to the focused element or to its own bindings by
 * reading ONE property, and a `div` loses that test.
 *
 * `KeyboardManager#hasFocus` (`client/helpers/interaction/keyboard-manager.mjs`, read from the
 * V14.365.0 install) answers, in order:
 *
 *   if (["", "true"].includes(focused.dataset.keyboardFocus)) return true;   // explicit true
 *   if (focused.dataset.keyboardFocus === "false") return false;             // explicit false
 *   if (["INPUT", "SELECT", "TEXTAREA"].includes(focused.tagName)) return true;
 *   if (focused.isContentEditable) return true;
 *   if (focused.tagName === "BUTTON") return !!focused.form;
 *   return false;
 *
 * So a focused `div`, `section` or `aside` returns FALSE and every keybinding fires: Space pauses
 * the game, the arrows pan the canvas, and Tab walks out of the window. The element does not have
 * to HANDLE those keys for that to happen — it only has to hold focus. That is the case
 * `openspec/specs/design-system/spec.md`'s scenario did not cover, because it is written about an
 * element that handles arrow keys, and it is the case that shipped.
 *
 * `tabindex="-1"` on a non-form element is the marker. It exists for exactly one reason — to be a
 * programmatic focus target — so every one of them is a place focus can land.
 *
 * ── WHY THIS PARSES RATHER THAN GREPS ─────────────────────────────────────────────────────────
 * The first version of this gate matched elements with `/<(\w+)\b([^>]*?)>/`. That regex ends the
 * tag at the first `>` in the source, which inside
 *
 *     <div tabindex="-1" use:portal={() => getPopoverHost()}>
 *
 * is the one in the arrow function. Two files were corrupted by a patch built on it, and — worse
 * for a gate — an element whose `tabindex` sits AFTER such an attribute is invisible to it. The
 * parser-based version found ELEVEN focus targets where the regex found ten;
 * `src/ui/svelte/components/ThresholdBandStrip.svelte` was the one it could not see. A gate that
 * silently under-reports is the failure mode this repository has been bitten by before, so this
 * one walks Svelte's own AST.
 *
 * ── THE NON-VACUITY HALF IS LOAD-BEARING ──────────────────────────────────────────────────────
 * A scan that reaches an empty set passes every compliance assertion while proving nothing. So
 * this suite asserts the walk FINDS targets before it asserts they are all compliant.
 */

/**
 * Foundry's `hasFocus` recognises these by TAG NAME alone, so they need no declaration.
 *
 * `button` is deliberately NOT here. `hasFocus` returns `!!focused.form` for a BUTTON, so a button
 * with no ancestor `<form>` is exactly as unrecognised as a bare div — and this app renders almost
 * none, so every roving-tabindex tab strip in the corpus was silently exempt under a blanket
 * `button` entry. Those are the WORSE case: they handle the arrows themselves, with
 * `preventDefault()` and no `stopPropagation()`, so the keypress ran the tab strip AND panned the
 * canvas. `openspec/specs/design-system/spec.md` says "a button with a form" for this reason; the
 * shared walk carries an `inForm` flag so the carve-out matches the spec rather than widening it.
 */
const SELF_DECLARING_TAGS = new Set(['input', 'select', 'textarea']);

/**
 * The corpus, parsed once for every clause in this file.
 *
 * `svelteFiles` and `walkElements` were DEFINED here until issue 1497 and now live in
 * `tests/helpers/svelteTemplateScan.js`, whose docblock carries the reasons both are shaped the
 * way they are — the regex that ended a tag at the `>` inside `use:portal={() => host()}`, and the
 * element-only walk that lost three focus targets in one change when three manager landmarks
 * became component tags. They moved because two other gates now need the same walk, and a second
 * hand-written copy of it would reacquire both defects while passing every count.
 *
 * Lazily, so a walk failure is reported as a failing test rather than as an unattributed
 * module-load throw that escapes the `# fail` count entirely.
 */
let cachedTemplates = null;
function templates() {
  if (cachedTemplates === null) cachedTemplates = parsedTemplates(UI_TEMPLATE_ROOT);
  return cachedTemplates;
}

/**
 * The roles that make a non-form element an interactive control, for clause (a).
 *
 * Each of these announces to assistive technology that the element is operated by the keyboard,
 * which is a promise the element cannot keep in a Foundry window unless it also declares itself
 * focused. `role="tabpanel"` is in the set because the tab pattern moves focus INTO the panel on
 * activation, which is the whole reason it carries a `tabindex` at all.
 */
const INTERACTIVE_ROLES = new Set(['button', 'row', 'option', 'tab', 'tabpanel']);

/** A statically written `tabindex="0"`, as opposed to a roving expression. */
const STATIC_TABINDEX_ZERO = /=\s*["']0["']/u;

/**
 * An ACTIVE opt-out: `data-keyboard-focus="false"`.
 *
 * `hasFocus` reads the VALUE, so this attribute is an opt-in whose `"false"` spelling means the
 * opposite of the attribute's presence. Written once and shared by every clause because the two
 * readings have to agree: a value-blind clause counts an opt-out as compliance, and a clause that
 * checked the value while its neighbour did not would put the same element in the debt table under
 * one heading and out of it under another.
 */
const OPTED_OUT = /=\s*["']false["']/u;

/** The declaration this whole file is about. */
const DECLARATION = 'data-keyboard-focus';

/**
 * Every element the widened gate looks at, in the three clauses that make it up.
 *
 * ONE WALK, THREE POPULATIONS. They are collected together rather than by three separate walks
 * because the corpus is 300 files of parsed AST, and because a second walk is a second place for
 * the `inForm` flag to be threaded differently — which is the distinction the whole carve-out
 * turns on.
 *
 * @returns {{negativeOne: object[], roleZero: object[], formlessButtons: object[],
 *   roving: object[]}}
 */
function focusPopulations() {
  const negativeOne = [];
  const roleZero = [];
  const formlessButtons = [];
  const roving = [];
  for (const { file, source, ast } of templates()) {
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
 * The undeclared members of a population — the debt, as opposed to the compliant sites.
 *
 * AN OPT-OUT IS UNDECLARED, NOT DECLARED, and the distinction is the whole point of reading the
 * value. `data-keyboard-focus="false"` makes `hasFocus` return false exactly as omitting the
 * attribute does, so an element carrying it is in precisely the state clauses (a) and (b) exist to
 * report — while LOOKING compliant to any check that asks only whether the attribute is present.
 * Until issue 1497's review this filter tested presence alone, so `"false"` was the one spelling
 * that could leave a site out of the debt table by adding something to it.
 *
 * @param {Array<{declared: string|null}>} population
 * @returns {Array<{declared: string|null}>} The members that do not declare themselves focused.
 */
const undeclaredIn = (population) =>
  population.filter((target) => target.declared === null || OPTED_OUT.test(target.declared));

describe('design system: a programmatic focus target declares itself focused to Foundry', () => {
  // (C) IS A FLOOR AND NOT A PIN, AND THAT IS A JUDGEMENT ABOUT WHAT IT MEASURES rather than
  // leniency. Every one of these targets is COMPLIANT — the clause below finds none undeclared —
  // so there is no debt here to ratchet. What the number guards is that the walk is neither EMPTY
  // nor TRUNCATED, and a real truncation loses far more than the slack this floor leaves.
  //
  // A per-file pin would be actively wrong for this population. A programmatic focus target is an
  // ELEMENT, so extracting one component into two, or converting five hand-rolled tab strips onto
  // `EditorTabs`, moves the count without changing anything this file is about; issues 1038 and
  // 1429 did exactly that six times between them. Pinning it would turn every innocent extraction
  // into a baseline edit and teach the next author that this file's numbers are noise.
  //
  // The clauses BELOW it are pinned, because they measure something else: debt. Every element they
  // count is a site that can hold focus and does not say so.
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
    // `hasFocus` returns FALSE for `data-keyboard-focus="false"`. The attribute is an opt-in whose
    // value matters as much as its presence, so a `false` on an element that exists to receive
    // focus is a defect wearing compliance — and a presence-only assertion would pass it.
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
    // which is exactly the condition under which a value-blind filter goes unnoticed. Clause (c)
    // above rejects the opt-out in its own population; this proves the shared `undeclaredIn` that
    // (a) and (b) ratchet through makes the same reading, so the three cannot drift apart.
    //
    // The pins are unaffected: `"false"` appears on nothing in this tree, so the observed tallies
    // are identical either way. This is a defect that arrives with the FIRST site to write it, and
    // it would have arrived silently — as a row leaving the baseline, reported as debt paid down.
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
        "testing only for the attribute's PRESENCE lets one site leave the baseline by writing " +
        '"false", which reads as a fix and is the opposite of one.'
    );
  });

  // ── THE TWO POPULATIONS THE `tabindex="-1"` CLAUSE NEVER REACHED ────────────────────────
  //
  // `tabindex="-1"` is only ONE of the three ways an element in this corpus can hold focus, and it
  // is the rarest: 24 elements, all compliant. The other two are 21 role-bearing elements that put
  // themselves IN the tab order, and 290 buttons with no ancestor form — and not one of the 301
  // was looked at by anything until issue 1497.
  //
  // The consequence is identical in all three cases and is not about the element handling keys.
  // `KeyboardManager#hasFocus` returns false, so EVERY Foundry keybinding fires while the element
  // holds focus: Space pauses the game, the arrows pan the canvas behind the window, Tab walks out
  // of the application. The element does not have to listen for those keys for that to happen.
  //
  // WHY ROVING TABINDEX SITES ARE NOT IN (a). Ten elements in this corpus write
  // `tabindex={active ? 0 : -1}` — the standard tab-strip pattern, where one item is reachable and
  // the rest are not. Every one of them either carries no STATIC `role` attribute for clause (a) to
  // read, or is a `<button>` that clause (b) already counts. They are collected by the walk anyway
  // and asserted to stay outside (a) by construction, so the day one is written with a static role
  // is the day this comment stops being true and says so.
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

  it('no role-bearing element joins the tab order without declaring itself', () => {
    const { roleZero } = focusPopulations();
    const undeclared = undeclaredIn(roleZero);

    assert.ok(
      roleZero.length >= 15,
      `only ${roleZero.length} elements carry both a static \`tabindex="0"\` and an interactive ` +
        'role, against the 21 this tree holds. An absence check over an empty population passes ' +
        'forever.'
    );

    assertRatchet({
      label: 'role-bearing focus targets that do not declare themselves',
      baseline: KNOWN_ROLE_FOCUS_TARGETS,
      pinnedTotal: KNOWN_ROLE_FOCUS_TARGET_TOTAL,
      observed: tallyByKey(undeclared, (target) => target.file),
      scanned: templates().length,
      floor: 250,
      guidance:
        `Add ${DECLARATION}="true". An element with \`tabindex="0"\` and \`role="button"\` has ` +
        'told the user it is a control and put itself in the tab order, and Foundry still treats ' +
        'the window as unfocused while it holds focus — so Space pauses the game and the arrows ' +
        'pan the canvas behind the open application. Better still, render the shared primitive ' +
        'that already declares it rather than a div wearing a role.',
    });
  });

  it('no button outside a form joins the tab order without declaring itself', () => {
    // THE LARGEST POPULATION IN THIS FILE AND THE LEAST OBVIOUS. `hasFocus` returns
    // `!!focused.form` for a BUTTON, so a `<button>` is recognised ONLY when it has an ancestor
    // `<form>` — and this application renders almost none. Every ordinary toolbar button, every
    // card action, every tab in a hand-rolled strip is therefore exactly as unrecognised as a bare
    // `div`, which is precisely why `SELF_DECLARING_TAGS` does not contain `button`.
    //
    // Ten of the 290 already declare and are correctly absent from the baseline. `ActionMenu` is
    // the one worth naming: it emits the attribute on the trigger it opens with, so a gate keying
    // on the population rather than on the DEBT would have listed it as owing something it does
    // not. This is what a ratchet over compliant sites would get wrong, and it is why the rows are
    // the undeclared ones.
    //
    // It is meant to collapse rather than to be paid file by file. Once the shared primitives emit
    // the attribute — issues 1502 and 1508 — most of these stop being buttons this file can see.
    const { formlessButtons } = focusPopulations();
    const undeclared = undeclaredIn(formlessButtons);

    assert.ok(
      formlessButtons.length >= 200,
      `only ${formlessButtons.length} buttons outside a form reached the walk, against the 290 ` +
        'this tree holds'
    );
    assert.ok(
      formlessButtons.length - undeclared.length >= 5,
      `only ${formlessButtons.length - undeclared.length} formless buttons declare ` +
        `\`${DECLARATION}\`. With none, this clause cannot tell "the fix works" from "nothing has ` +
        'been fixed", and the compliant shape has no live example for a reader to copy.'
    );

    assertRatchet({
      label: 'formless buttons that do not declare themselves',
      baseline: KNOWN_FORMLESS_BUTTONS,
      pinnedTotal: KNOWN_FORMLESS_BUTTON_TOTAL,
      observed: tallyByKey(undeclared, (target) => target.file),
      scanned: templates().length,
      floor: 250,
      guidance:
        `Add ${DECLARATION}="true", or render a shared primitive that already does. Foundry ` +
        'recognises a BUTTON only when it has an ancestor `<form>` — `hasFocus` literally returns ' +
        '`!!focused.form` — and this application renders almost no forms, so a focused toolbar ' +
        'button leaves every keybinding live: Space pauses the game and the arrows pan the canvas ' +
        'behind the window.',
    });
  });
});

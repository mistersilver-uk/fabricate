import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const UI_ROOT = path.join(REPO_ROOT, 'src', 'ui', 'svelte');

/**
 * Foundry's `hasFocus` recognises these by TAG NAME alone, so they need no declaration.
 *
 * `button` is deliberately NOT here. `hasFocus` returns `!!focused.form` for a BUTTON, so a button
 * with no ancestor `<form>` is exactly as unrecognised as a bare div — and this app renders almost
 * none, so every roving-tabindex tab strip in the corpus was silently exempt under a blanket
 * `button` entry. Those are the WORSE case: they handle the arrows themselves, with
 * `preventDefault()` and no `stopPropagation()`, so the keypress ran the tab strip AND panned the
 * canvas. `openspec/specs/design-system/spec.md` says "a button with a form" for this reason; the
 * walk below carries an `inForm` flag so the carve-out matches the spec rather than widening it.
 */
const SELF_DECLARING_TAGS = new Set(['input', 'select', 'textarea']);

function svelteFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) svelteFiles(full, found);
    else if (entry.name.endsWith('.svelte')) found.push(full);
  }
  return found;
}

/**
 * Visit every `RegularElement` AND every `Component` in a parsed template.
 *
 * COMPONENTS COUNT, and leaving them out is how this gate goes blind as the corpus converges
 * (issue 1039). `<ManagerToolbar tabindex="-1" data-keyboard-focus="true">` forwards both through
 * a rest spread onto the `<section>` the primitive writes, so the RENDERED element is exactly
 * the unrecognised non-form focus target this file exists to police — but the AST node is a
 * `Component`, so an element-only walk stops seeing it. Three of the manager's browser landmarks
 * became component tags in one change; had the walk stayed element-only, all three would have
 * silently left the compliance clause below AND taken the non-vacuity floor down with them,
 * which reads as "the corpus converged" rather than as "the guard lost three sites".
 *
 * A component tag can only be a focus target through its own rest spread, so what is checked is
 * the same pair of attributes in the same place: nothing here knows or needs to know which
 * element the primitive renders.
 *
 * Recurses over EVERY own property rather than a hand-listed set of child keys, because an
 * element nested in an `{#if}`, an `{#each}`, a `{#snippet}` or a component's default slot hangs
 * off a differently-named branch in each case, and a hand-listed walk quietly skips whichever
 * branch it forgot. `parent` is skipped because the AST is cyclic through it.
 *
 * @param {unknown} node
 * @param {(element: object) => void} visit
 * @param {Set<object>} [seen]
 */
function walkElements(node, visit, inForm = false, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit, inForm, seen);
    return;
  }
  let descendantsAreInForm = inForm;
  if (node.type === 'RegularElement' || node.type === 'Component') {
    visit(node, inForm);
    if (node.type === 'RegularElement' && node.name.toLowerCase() === 'form') {
      descendantsAreInForm = true;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    walkElements(node[key], visit, descendantsAreInForm, seen);
  }
}

/**
 * Every non-form element in the UI corpus that carries `tabindex="-1"`, with what it declares.
 *
 * @returns {{file: string, tag: string, declared: string|null}[]}
 */
function focusTargets() {
  const targets = [];
  for (const file of svelteFiles(UI_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parse(source, { modern: true });
    walkElements(ast.fragment, (element, inForm) => {
      const tag = element.name.toLowerCase();
      if (SELF_DECLARING_TAGS.has(tag)) return;
      if (tag === 'button' && inForm) return;
      const attributes = element.attributes || [];
      const named = (name) =>
        attributes.find((attribute) => attribute.type === 'Attribute' && attribute.name === name);
      const tabindex = named('tabindex');
      if (!tabindex || !/-1/.test(source.slice(tabindex.start, tabindex.end))) return;
      if (named('contenteditable')) return;
      const declaration = named('data-keyboard-focus');
      targets.push({
        file: path.relative(REPO_ROOT, file).replaceAll('\\', '/'),
        tag: element.name,
        declared: declaration ? source.slice(declaration.start, declaration.end) : null,
      });
    });
  }
  return targets;
}

describe('design system: a programmatic focus target declares itself focused to Foundry', () => {
  // THE FLOOR MOVES DOWN AS THE CORPUS CONVERGES, and that is not the same thing as debt being
  // paid or a gate being loosened. A programmatic focus target is an ELEMENT, so five tab strips
  // that each rendered their own roving-tabindex button are five targets, and converting them all
  // onto `EditorTabs` leaves one. Three changes did exactly that: issue 1038 converted the recipe,
  // essence and tool strips, issue 1429's first half converted the Checks section strip and the
  // Knowledge tabs, and its second half converted `TagsCategoriesView`'s inlined vocabulary strip
  // — the last hand-rolled one, which had to be EXTRACTED as `VocabularyTabs` before it could be
  // converted, which is why it outlived the other five.
  //
  // THE COUNT IS NOT A RUNNING TOTAL OF THOSE CONVERSIONS, and reading it as one is how this
  // comment went stale. Convergence takes targets away and ordinary feature work adds them back:
  // between the two halves of issue 1429 the world essence surfaces and the toolbar extraction
  // added targets of their own, so the walk stood at 22 before this conversion rather than at the
  // 21 the subtraction predicted, and it stands at 21 after it. Re-lowering the floor per
  // conversion would be the cheapest-repair anti-pattern, so the slack is stated once and bounded
  // instead: ONE hand-rolled strip remains on this surface (`WorldDowntimeTabs`, whose row in
  // `scripts/lib/designSystemPrimitives.json` records conversion-pending work rather than a
  // justified divergence), so converging every remaining strip reaches 20 — which is this gate,
  // deliberately, rather than 19 with a fresh unit of slack cut for it. The property this guards
  // is that the walk is neither EMPTY nor TRUNCATED, and a real truncation loses far more than the
  // one strip that is left.
  it('finds programmatic focus targets, so the assertions below are not vacuous', () => {
    const targets = focusTargets();
    assert.ok(
      targets.length >= 20,
      `the walk reached ${targets.length} focus targets. A walk that reaches an empty or ` +
        'truncated set passes every assertion below while proving nothing.'
    );
  });

  it('finds no non-form focus target that fails to declare itself', () => {
    const undeclared = focusTargets()
      .filter((target) => target.declared === null)
      .map((target) => `${target.file} <${target.tag}>`);
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
    const optedOut = focusTargets()
      .filter((target) => target.declared !== null && /=\s*["']false["']/.test(target.declared))
      .map((target) => `${target.file} <${target.tag}>`);
    assert.deepEqual(
      optedOut,
      [],
      'a programmatic focus target must not opt OUT of being treated as focused'
    );
  });
});

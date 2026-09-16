/**
 * A template scanner over every `.svelte` file the product ships (issue 1497).
 *
 * Three gates need the same question answered — "which elements does this template render, and
 * what does each of them declare" — and each of them is a gate whose failure mode is UNDER-
 * REPORTING. `tests/components/design-system-debt-ratchets.test.js` counts native `<select>`
 * elements, `tests/design-system-required-names.test.js` reads `aria-label` bindings, and
 * `tests/design-system-keyboard-focus.test.js` finds programmatic focus targets. A gate that
 * silently sees fewer elements than the tree holds reports a CLEANER tree, which is the one
 * direction nobody checks, so the walk is shared rather than written three times.
 *
 * ── WHY THIS PARSES RATHER THAN GREPS ───────────────────────────────────────────────────
 * The first version of the keyboard-focus gate matched elements with `/<(\w+)\b([^>]*?)>/`. That
 * regex ends the tag at the first `>` in the source, which inside
 *
 *     <div tabindex="-1" use:portal={() => getPopoverHost()}>
 *
 * is the one in the arrow function. Two files were corrupted by a patch built on it, and — worse
 * for a gate — an element whose attribute sits AFTER such a one is invisible to it. The
 * parser-based version found ELEVEN focus targets where the regex found ten;
 * `src/ui/svelte/components/ThresholdBandStrip.svelte` was the one it could not see.
 *
 * The same arithmetic holds for the select gate: a raw text grep over the same corpus reports 140
 * `<select` in 48 files where {@link walkElements} reports 99 elements in 38, because the grep
 * counts docblock prose and CSS. Both errors are silent and they point in OPPOSITE directions,
 * which is exactly why the pin is the parse.
 *
 * ── COMPONENTS COUNT, AND LEAVING THEM OUT IS HOW A WALK GOES BLIND ─────────────────────
 * {@link walkElements} visits every `Component` node as well as every `RegularElement`, and that
 * is load-bearing rather than defensive (issue 1039). `<ManagerToolbar tabindex="-1"
 * data-keyboard-focus="true">` forwards both attributes through a rest spread onto the `<section>`
 * the primitive writes, so the RENDERED element is exactly the unrecognised non-form focus target
 * the keyboard gate exists to police — but the AST node is a `Component`, so an element-only walk
 * stops seeing it. Three of the manager's browser landmarks became component tags in ONE change;
 * had the walk stayed element-only, all three would have silently left that gate's compliance
 * clause AND taken its non-vacuity floor down with them, which reads as "the corpus converged"
 * rather than as "the guard lost three sites".
 *
 * A caller that wants only real elements filters on `node.type`; a caller that wants both gets
 * both by default. The asymmetry is deliberate: the safe default for a debt gate is to see MORE.
 *
 * ── THE `inForm` FLAG ───────────────────────────────────────────────────────────────────
 * Foundry's `KeyboardManager#hasFocus` returns `!!focused.form` for a `BUTTON`, so a button with
 * no ancestor `<form>` is exactly as unrecognised as a bare `div`. That distinction cannot be
 * made from an element in isolation, so the walk carries it down: `visit(node, inForm)` is called
 * with whether an ancestor `<form>` element is open. Do not re-derive it from `node.parent` — the
 * AST is cyclic through that field and this walk skips it for that reason.
 *
 * ── THE RECURSION IS OVER EVERY OWN PROPERTY, ON PURPOSE ────────────────────────────────
 * An element nested in an `{#if}`, an `{#each}`, a `{#snippet}` or a component's default slot
 * hangs off a differently-named branch of the AST in each case, and a hand-listed walk quietly
 * skips whichever branch it forgot. `parent` is skipped because the AST is cyclic through it, and
 * a `seen` set guards the rest.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. Its guarantees are proved from inside the glob
 * by `tests/svelte-template-scan.test.js`, the same arrangement (and the same reason) as
 * `styleBlockScan.js`/`style-block-scan.test.js` and `sourceScan.js`/`source-scan.test.js`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'svelte/compiler';

import { byCodePoint } from './ratchetBaseline.js';
import { repoRoot } from './sourceScan.js';

/** The repository-relative root every UI template lives under. */
export const UI_TEMPLATE_ROOT = 'src/ui/svelte';

/**
 * Every `.svelte` file under `dir`, recursively, as absolute paths in code-point order.
 *
 * SORTED, which `readdirSync` is not required to be. Two gates pin per-file counts and one pins a
 * register, so an order that differed between a developer's machine and the CI runner would
 * produce a diff nobody authored — the same failure `design-system-primitives.test.js` records
 * about path separators.
 *
 * @param {string} dir An absolute directory path.
 * @param {string[]} [found] Accumulator, for the recursion.
 * @returns {string[]} Absolute paths.
 */
export function svelteFiles(dir, found = []) {
  const entries = [...readdirSync(dir, { withFileTypes: true })].sort((left, right) =>
    byCodePoint(left.name, right.name)
  );
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) svelteFiles(full, found);
    else if (entry.name.endsWith('.svelte')) found.push(full);
  }
  return found;
}

/**
 * Visit every `RegularElement` AND every `Component` in a parsed template.
 *
 * See the header for why components count, why the recursion is over every own property, and why
 * `inForm` is threaded rather than derived.
 *
 * @param {unknown} node Any AST node, array of nodes, or `ast.fragment`.
 * @param {(element: object, inForm: boolean) => void} visit
 * @param {boolean} [inForm] Whether an ancestor `<form>` element is open.
 * @param {Set<object>} [seen] Cycle guard, for the recursion.
 */
export function walkElements(node, visit, inForm = false, seen = new Set()) {
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
 * Every UI template, parsed once, as `{ file, source, ast }`.
 *
 * `file` is repository-relative and POSIX-separated, because `readdirSync` yields `ui\theme.js`
 * on a Windows dev machine and `ui/theme.js` on the `ubuntu-latest` runner, and every baseline
 * row that cites a file is written forward-slash.
 *
 * The parse is what each caller would otherwise write for itself, three lines at a time, and the
 * `modern: true` flag is not optional: Svelte 5's legacy AST names its nodes differently, so a
 * caller that forgot it would walk a tree with no `RegularElement` in it at all and report zero
 * findings without erroring.
 *
 * @param {string} [root] Repository-relative directory to walk.
 * @returns {Array<{file: string, source: string, ast: object}>}
 */
export function parsedTemplates(root = UI_TEMPLATE_ROOT) {
  return svelteFiles(path.join(repoRoot, root)).map((full) => {
    const source = readFileSync(full, 'utf8');
    return {
      file: path.relative(repoRoot, full).split(path.sep).join('/'),
      source,
      ast: parse(source, { modern: true }),
    };
  });
}

/**
 * One STATIC attribute of an element, by name, or `undefined`.
 *
 * `type === 'Attribute'` excludes `SpreadAttribute` and every directive (`use:`, `bind:`, `on:`),
 * which is what every caller means: a gate asking whether an element declares
 * `data-keyboard-focus` is asking about a written attribute, and a spread's contents are not
 * decidable from the template at all.
 *
 * @param {object} element A `RegularElement` or `Component` node.
 * @param {string} name
 * @returns {object|undefined}
 */
export function attributeNamed(element, name) {
  return (element.attributes || []).find(
    (attribute) => attribute.type === 'Attribute' && attribute.name === name
  );
}

/**
 * The verbatim source text of an attribute, or `null` when the element does not carry it.
 *
 * The TEXT rather than a parsed value, because the three gates that ask disagree about what they
 * need: one wants to know whether `tabindex` is `-1` however it is written, one wants to read the
 * literal inside the quotes, and one wants to reject `data-keyboard-focus="false"` as an active
 * opt-OUT rather than treat it as a declaration. A shared parse would have to pick one reading.
 *
 * @param {string} source The file's text.
 * @param {object} element A `RegularElement` or `Component` node.
 * @param {string} name
 * @returns {string|null}
 */
export function attributeText(source, element, name) {
  const attribute = attributeNamed(element, name);
  return attribute ? source.slice(attribute.start, attribute.end) : null;
}

/** The 1-based line holding `index` in `source`. */
export function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

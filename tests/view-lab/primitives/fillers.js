/**
 * The content a `snippet`-typed knob puts into a component's snippet prop.
 *
 * ── WHY THESE ARE RAW SNIPPETS AND NOT A `Fillers.svelte` ─────────────────────────────────────
 *
 * Sixteen of the catalogued primitives take a snippet — `children` mostly, but also `header`,
 * `footer`, `trailing`, `control`, `chips` and `body`. A knob has to be able to hand one over as a
 * VALUE, chosen from a list, and a `{#snippet}` block cannot be created outside a component's
 * template. The alternatives were a wrapper component per primitive, which is 57 near-identical
 * files, or one `Fillers.svelte` whose snippets are somehow reached from module scope, which is not
 * a thing Svelte 5 does.
 *
 * `createRawSnippet` is the seam Svelte publishes for exactly this: a snippet built from a render
 * function, usable as a value. The cost is that each one must return a SINGLE root element — hence
 * the wrapping `<span>` on the multi-part fillers, which is also why none of them is a `<div>`: a
 * `children` snippet lands inside a `<button>` in half the primitives that take one, and a block
 * element there is invalid HTML that Chromium silently reparents.
 *
 * ── WHY THE MARKUP CARRIES REAL PRODUCT CLASSES ───────────────────────────────────────────────
 *
 * `two-buttons` emits `manager-button fab-manager-button is-primary`, not a bare `<button>`. A
 * filler is standing in for what a real call site passes, and every real call site that puts
 * buttons in a `footer` passes the primitive's own classes. A neutral placeholder would make a
 * footer's spacing and alignment look correct in the lab and wrong in the product, which is the one
 * failure mode a harness like this exists to remove.
 *
 * These are the only strings in the lab that name a product class. Everything the harness itself
 * draws is `pl-` prefixed and reads no `--fab-*` token, so nothing the chrome paints can be
 * mistaken for a primitive's own rendering.
 */
import { createRawSnippet } from 'svelte';

/** @param {string} html Markup with exactly one root element. */
function raw(html) {
  return createRawSnippet(() => ({ render: () => html }));
}

const LONG_TEXT =
  'Ingredients are consumed when the recipe is crafted. A requirement option that names ' +
  'no ingredient and no essence is still a valid option: it is the free route through the ' +
  'recipe, and the editor shows it as such rather than hiding it.';

/**
 * Every filler a `snippet` knob can select, keyed on the id a catalogue row writes.
 *
 * Ordered from smallest to largest, because that is the order a knob's option list shows them in
 * and the order someone reaching for one thinks in: text, then text with a mark, then a structure.
 *
 * @type {Record<string, import('svelte').Snippet>}
 */
export const SNIPPET_FILLERS = {
  text: raw('<span>Save changes</span>'),
  'short-text': raw('<span>Done</span>'),
  icon: raw('<i class="fas fa-trash" aria-hidden="true"></i>'),
  'icon-text': raw('<span><i class="fas fa-plus" aria-hidden="true"></i> Add modifier</span>'),
  'long-text': raw(`<span>${LONG_TEXT}</span>`),
  paragraph: raw(`<p style="margin:0">${LONG_TEXT}</p>`),
  'two-buttons': raw(
    '<span style="display:flex;gap:8px">' +
      '<button type="button" class="manager-button fab-manager-button is-ghost">Cancel</button>' +
      '<button type="button" class="manager-button fab-manager-button is-primary">Apply</button>' +
      '</span>'
  ),
  rows: raw(
    '<span style="display:grid;gap:6px">' +
      '<span>Iron ingot</span><span>Oak haft</span><span>Waxed cord</span>' +
      '</span>'
  ),
  field: raw(
    '<span style="display:grid;gap:4px">' +
      '<span class="manager-field-label">Difficulty</span>' +
      '<input type="text" value="Moderate" readonly>' +
      '</span>'
  ),
  chips: raw(
    '<span style="display:flex;gap:6px">' +
      '<span class="manager-chip">metal</span><span class="manager-chip">forged</span>' +
      '</span>'
  ),
  none: raw('<span></span>'),
};

/**
 * The filler ids, for a knob that declares no explicit option list.
 *
 * @returns {string[]} Ids in declaration order.
 */
export function fillerIds() {
  return Object.keys(SNIPPET_FILLERS);
}

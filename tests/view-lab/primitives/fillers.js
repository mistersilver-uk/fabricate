/**
 * The content a `snippet`-typed knob puts into a component's snippet prop.
 *
 * ── TWO KINDS OF FILLER, AND THE MEASURED REASON FOR THE SPLIT ────────────────────────────────
 *
 * Sixteen of the catalogued primitives take a snippet — `children` mostly, but also `header`,
 * `footer`, `trailing`, `control`, `chips` and `body`. A knob has to be able to hand one over as a
 * VALUE, chosen from a list, and a `{#snippet}` block cannot be created outside a component's
 * template.
 *
 * `createRawSnippet` is the seam Svelte publishes for that: a snippet built from a render function,
 * usable as a value. It renders a STRING, which is exactly right for text and a glyph and exactly
 * wrong for anything the design system owns — and the first draft of this file proved the second
 * half by getting it wrong twice:
 *
 *   - the `field` filler emitted `class="manager-field-label"`, a class that appears ZERO times in
 *     `styles/fabricate.css`. The shipped caption inside a `<Field>` is a bare `<span>`. So the
 *     filler drew an unstyled caption, and every slot it stood in was measured against a shape the
 *     product does not draw.
 *   - the `chips` filler emitted a bare `<span class="manager-chip">`. `Chip.svelte` keeps its CSS
 *     SCOPED and injected, so the shipped chip is `.manager-chip.svelte-<hash>` — a hand-written
 *     span carrying the same class picks up only the global remnants and renders a chip the product
 *     no longer has. This is the worse of the two, because it looks right.
 *
 * Neither could be fixed by editing the string: the correct markup is whatever the component emits
 * today, which is the one thing a copy cannot track. So the fillers standing in for a PRIMITIVE are
 * declared in `Fillers.svelte` as real `{#snippet}` blocks around the real components and handed up
 * as values through a snippet parameter — the idiomatic Svelte 5 way to publish a snippet from the
 * template that can create one. {@link assembleFillers} joins the two halves and refuses a registry
 * that does not cover {@link FILLER_IDS}.
 *
 * The rule is therefore: `createRawSnippet` for plain text and glyphs, a component for anything
 * with a primitive behind it.
 *
 * ── SINGLE ROOT, AND NEVER A BLOCK ELEMENT ────────────────────────────────────────────────────
 *
 * Each raw filler must return a SINGLE root element — hence the wrapping `<span>` on the multi-part
 * ones, which is also why none of them is a `<div>`: a `children` snippet lands inside a `<button>`
 * in half the primitives that take one, and a block element there is invalid HTML that Chromium
 * silently reparents.
 *
 * ── WHAT THE HARNESS READS ────────────────────────────────────────────────────────────────────
 *
 * The component-backed fillers DO read `--fab-*` tokens, because the components they mount read
 * them. That is the point of them, and it is why they are the only part of the harness allowed to:
 * a filler stands in for what a real call site passes, so it has to be painted the way a real call
 * site is painted. Everything the harness itself draws around them is `pl-` prefixed.
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
 * Every filler id, ordered smallest to largest.
 *
 * That is the order a knob's option list shows them in and the order someone reaching for one
 * thinks in: text, then text with a mark, then a structure. It is also the one place the set is
 * enumerated — the raw half, the component half and the description map are each checked against
 * it rather than against one another.
 *
 * @type {readonly string[]}
 */
export const FILLER_IDS = Object.freeze([
  'text',
  'short-text',
  'icon',
  'icon-text',
  'long-text',
  'paragraph',
  'two-buttons',
  'rows',
  'field',
  'chips',
  'none',
]);

/**
 * The fillers that are genuinely just text or a glyph.
 *
 * @type {Record<string, import('svelte').Snippet>}
 */
export const RAW_FILLERS = {
  text: raw('<span>Save changes</span>'),
  'short-text': raw('<span>Done</span>'),
  icon: raw('<i class="fas fa-trash" aria-hidden="true"></i>'),
  'icon-text': raw('<span><i class="fas fa-plus" aria-hidden="true"></i> Add modifier</span>'),
  'long-text': raw(`<span>${LONG_TEXT}</span>`),
  paragraph: raw(`<p style="margin:0">${LONG_TEXT}</p>`),
  rows: raw(
    '<span style="display:grid;gap:6px">' +
      '<span>Iron ingot</span><span>Oak haft</span><span>Waxed cord</span>' +
      '</span>'
  ),
  none: raw('<span></span>'),
};

/**
 * The filler ids `Fillers.svelte` has to supply, derived rather than typed.
 *
 * @type {readonly string[]}
 */
export const COMPONENT_FILLER_IDS = Object.freeze(
  FILLER_IDS.filter((id) => !Object.hasOwn(RAW_FILLERS, id))
);

/**
 * The markup a call site would write for each filler.
 *
 * Read by `renderInvocation` through its `describeFiller` seam, so the generated snippet shows what
 * the specimen is actually rendering. The version this replaces knew `icon` from everything else
 * and called the other ten "Save changes" — nine of them wrongly, in the one output on the page
 * whose whole purpose is to be pasted somewhere and compile.
 *
 * @type {Record<string, string>}
 */
export const FILLER_MARKUP = Object.freeze({
  text: 'Save changes',
  'short-text': 'Done',
  icon: '<i class="fas fa-trash" aria-hidden="true"></i>',
  'icon-text': '<i class="fas fa-plus" aria-hidden="true"></i> Add modifier',
  'long-text': 'Ingredients are consumed when the recipe is crafted. …',
  paragraph: '<p>Ingredients are consumed when the recipe is crafted. …</p>',
  'two-buttons':
    '<ManagerButton role="ghost">Cancel</ManagerButton> ' +
    '<ManagerButton role="primary">Apply</ManagerButton>',
  rows: '<span>Iron ingot</span> <span>Oak haft</span> <span>Waxed cord</span>',
  field: '<Field as="label"><span>Difficulty</span><input value="Moderate" /></Field>',
  chips: '<Chip icon="fas fa-cube">metal</Chip> <Chip>forged</Chip>',
  none: '',
});

/**
 * Describe one filler as the markup a call site would write.
 *
 * @param {string} id A filler id.
 * @returns {string} Markup, or the id itself when a row names a filler that does not exist — which
 *   shows up in the generated invocation rather than being silently reported as another filler.
 */
export function describeFiller(id) {
  return Object.hasOwn(FILLER_MARKUP, id) ? FILLER_MARKUP[id] : String(id);
}

/**
 * Join the raw fillers to the component-backed ones.
 *
 * Throws rather than returning a partial registry: a missing filler makes `buildProps` OMIT the
 * snippet prop, and several primitives branch on `children === undefined` to decide whether they
 * render that slot at all — so the specimen would draw a legitimate-looking narrower shape, with
 * no error, for a knob the page still offers.
 *
 * @param {Record<string, import('svelte').Snippet>} componentFillers Snippets declared in
 *   `Fillers.svelte`, keyed on {@link COMPONENT_FILLER_IDS}.
 * @returns {Record<string, import('svelte').Snippet>} Every filler, keyed on id.
 * @throws {Error} When the joined registry does not cover {@link FILLER_IDS}.
 */
export function assembleFillers(componentFillers) {
  const registry = { ...RAW_FILLERS, ...componentFillers };
  const missing = FILLER_IDS.filter((id) => !registry[id]);
  if (missing.length > 0) {
    throw new Error(`the primitive lab filler registry is missing: ${missing.join(', ')}`);
  }
  return registry;
}

/**
 * The filler ids, for a knob that declares no explicit option list.
 *
 * @returns {string[]} Ids in declaration order.
 */
export function fillerIds() {
  return [...FILLER_IDS];
}

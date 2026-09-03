/**
 * A catalogue row's CONTEXTS: the real call sites a primitive is drawn inside, and the views the
 * stage offers for one row.
 *
 * ── WHY A CONTEXT MOUNTS AN ANCESTOR AND NEVER A SET OF EXTRACTED PROPS ───────────────────────
 *
 * The obvious shape is a static extractor: read the call site out of the ancestor's source and
 * hand the primitive the props it is written with. Measured against this tree, that yields almost
 * nothing usable. `CheckDifficultyCard.svelte:134` passes `selectedValue={resolvedDcMode}`,
 * `ToolBreakageTab` passes `{tool?.breakage?.mode}`, half the corpus passes `{value}` — runtime
 * expressions, every one of them. Only a literal like `columns={2}` is statically resolvable, so
 * an extractor would produce a placeholder for the props that decide what is on screen and a real
 * value for the ones that do not.
 *
 * So the lab mounts the ANCESTOR and lets it pass its own props. The props are then real by
 * construction, because the real code computes them: give `CheckDifficultyCard` six plain scalars
 * and the `RadioCardGroup` inside it receives `selectedValue={resolvedDcMode}` with `resolvedDcMode`
 * resolved by the card's own `$derived`. Nothing is approximated and nothing can drift, because
 * there is no second copy of the call site anywhere.
 *
 * That also decides what a context may be. An ancestor that needs a booted world, a store bag or a
 * services grab bag is not mountable honestly, and the rule is that such a context must be ABSENT
 * with a stated reason rather than approximated with a fixture that pretends. Going one level out
 * — or one level in — to reach a component whose props are plain data is the repair; faking the
 * bag is not.
 *
 * ── THE HIGHLIGHT SELECTOR IS MEASURED, NOT WRITTEN ───────────────────────────────────────────
 *
 * Mounting an ancestor leaves the reader with the opposite problem from an isolated plinth: the
 * primitive is now one of forty boxes on screen. Something has to say which.
 *
 * A row COULD declare a selector, and it may — but the lab already has an exact answer and it is
 * free. Every catalogued row is mounted in isolation on its own catalogue plinth, and that
 * specimen's rendered root IS the primitive's root. `Plinth.svelte` publishes its class list;
 * {@link highlightSelectorFrom} drops the `is-*` tokens and joins the rest. The result is the
 * component's own identity classes, read off the component's own output.
 *
 * Dropping `is-*` is the whole of the rule and it is the repository's own convention rather than a
 * guess: the implementer persona requires component-specific state classes spelled `.is-disabled`
 * rather than `.disabled`, and `styles/fabricate.css` follows it. What is left after they go is
 * identity. Keeping them would over-restrict — a `Callout` mounted at `tone: "warning"` in
 * isolation would look for `.manager-callout.is-warning` inside an ancestor rendering an info one,
 * and match nothing.
 *
 * Two shapes the reading cannot cover, and both are why `highlight` stays declarable:
 *
 *   - a root with no class at all. `InspectorCard` renders `<section class={classes}>` and
 *     `classes` is `$derived`, which is fine here — the DOM has the resolved value — but a
 *     component whose root is genuinely unclassed yields nothing to select on.
 *   - a root that is a BRANCH. `ThresholdBandStrip` renders its fallback `<p>` first, so an
 *     isolated specimen holding no bands publishes the fallback's class and the selector would
 *     look for a fallback inside an ancestor drawing a real strip.
 */

/** State classes, by the convention the implementer rules state. Never part of an identity. */
const STATE_TOKEN_PREFIX = 'is-';

/**
 * Turn a rendered root's class list into a selector for that component's root.
 *
 * @param {string[]} tokens The class tokens read off the isolated specimen's rendered root.
 * @returns {string} A CSS selector, or `''` when the root carries no identity class.
 */
export function highlightSelectorFrom(tokens) {
  const identity = (tokens ?? []).filter(
    (token) => token && !token.startsWith(STATE_TOKEN_PREFIX) && !token.startsWith('svelte-')
  );
  return identity.length === 0 ? '' : identity.map((token) => `.${token}`).join('');
}

/**
 * The label a stage tab carries for one context.
 *
 * The `site` a row writes — `CheckDifficultyCard.svelte:134` — is the honest name for a call site
 * and is what the tab shows. It is prose rather than a resolved reference on purpose: the line
 * number is a reading of the tree at the moment the row was written, and a line number that has
 * moved is a stale citation rather than a broken page.
 *
 * @param {object} context One `context` entry.
 * @returns {string} The tab's label.
 */
export function contextLabel(context) {
  if (context.site) return context.site;
  const ancestor = String(context.ancestor ?? '');
  return ancestor.slice(ancestor.lastIndexOf('/') + 1).replace(/\.svelte$/, '');
}

/**
 * Every view the stage offers for one catalogue row, in the order the tabs are drawn.
 *
 * THE CONTEXTS COME FIRST AND THE ISOLATED VIEW LAST, which is the maintainer's ruling on this
 * page rather than an arrangement: a primitive alone on a plinth "says nothing about the product",
 * so what opens is the primitive where it actually ships. The isolated view stays because working
 * ON the primitive — driving every knob, walking its states — is the other half of what this page
 * is for, and a screen recipe is a bad place to do it.
 *
 * A row with no `context` has exactly one view and the tab strip is not drawn.
 *
 * @param {object} entry A catalogue row.
 * @param {string[]} rootClasses The class tokens of that row's isolated specimen's rendered root.
 * @returns {{id: string, kind: 'context'|'isolated', label: string, context: object|null,
 *   highlight: string, derived: boolean}[]} The views.
 */
export function viewsFor(entry, rootClasses) {
  const derivedSelector = highlightSelectorFrom(rootClasses);
  const contexts = (entry?.context ?? []).map((context, index) => ({
    id: `context-${index}`,
    kind: 'context',
    label: contextLabel(context),
    context,
    highlight: context.highlight || derivedSelector,
    derived: !context.highlight,
  }));
  return [
    ...contexts,
    {
      id: 'isolated',
      kind: 'isolated',
      label: 'Isolated',
      context: null,
      highlight: '',
      derived: false,
    },
  ];
}

/**
 * How a view's highlight selector was arrived at, for the readout beside the plinth.
 *
 * Stated on the page rather than left implicit, because a derived selector and a declared one fail
 * in different ways and a reader looking at an un-outlined specimen needs to know which one to go
 * and fix.
 *
 * @param {{highlight: string, derived: boolean}} view A view from {@link viewsFor}.
 * @returns {string} One sentence.
 */
export function describeHighlight(view) {
  if (!view.highlight) {
    return (
      'no highlight: this component’s isolated root carries no identity class, so the ' +
      'row has to declare `highlight`'
    );
  }
  return view.derived
    ? 'derived from this component’s own isolated root, minus its `is-*` state classes'
    : 'declared by the catalogue row';
}

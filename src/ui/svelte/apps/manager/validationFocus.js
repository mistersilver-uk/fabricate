/**
 * The focus half of a validation surface's row action (issue 1517).
 *
 * A validation row carries two independent fields. `target` is the ROUTE — the tab or
 * activity the host switches to — and `focusTarget` is the CONTROL, the value of a
 * `data-validation-target` attribute the offending control carries. A host sets its route
 * synchronously and FIRST, then awaits {@link focusValidationTarget}, which defers with
 * `queueMicrotask` so Svelte has flushed the route assignment and the destination panel
 * exists by the time the query runs.
 *
 * `queueMicrotask` rather than `requestAnimationFrame`, and the reason is about tests as
 * much as about timing: happy-dom does implement `requestAnimationFrame`, but its callback
 * has NOT run when a test awaits only microtasks, so an rAF-based helper would read as
 * correct in review and then no-op under every mounted assertion. `ScopedValidationTab`
 * already defers this way for the same reason.
 *
 * TWO THINGS THIS FILE OWNS THAT LOOK LIKE THEY BELONG ELSEWHERE.
 *
 * (1) The REFUSAL. happy-dom focuses anything — `.focus()` on a bare `<div>` sets
 * `document.activeElement` — so a mounted assertion of the form "after View, the heading is
 * the active element" passes even when the heading carries no `tabindex` and a real browser
 * would have done nothing. {@link isFocusable} is therefore a pure predicate with its own
 * unit table, and this helper REFUSES a target it cannot really focus: it does not call
 * `.focus()`, resolves `null`, and warns naming the target.
 *
 * (2) The pointer-path MARK. The module's focus-ring contract is a pair — a `:focus` reset
 * that strips whatever ring the browser or Foundry core would draw, and a `:focus-visible`
 * repaint that supplies Fabricate's accent ring. A programmatic `.focus()` following a
 * POINTER activation matches `:focus` and not `:focus-visible`, so a GM who CLICKS the row
 * action would see the tab change and no mark whatsoever on the destination. The helper
 * stamps a transient `data-validation-focused` attribute, which `styles/fabricate.css`
 * paints with declarations byte-identical to the repaint, and removes it on the element's
 * next `blur` — so the mark's whole lifetime is owned here, in one file, rather than split
 * between a component and a stylesheet.
 *
 * A LEAKED MARK IS THE ORIGINAL DEFECT INVERTED — a permanent accent outline on the
 * last-focused control — so the cleanup is registered once and only once. The listener is a
 * module-level function reference registered with `{ once: true }`: activating the row
 * action a second time on a control that ALREADY holds focus fires neither `blur` nor
 * `focus`, because `.focus()` on the active element is a no-op, so a fresh closure per call
 * would accumulate one dead one-shot listener per activation. A stable reference is the
 * duplicate `addEventListener` ignores, and the attribute is re-set unconditionally, which
 * is what makes the repeat path idempotent rather than merely harmless.
 */

/** The attribute a destination control carries so a validation row can address it. */
export const VALIDATION_TARGET_ATTRIBUTE = 'data-validation-target';

/** The transient mark that paints the pointer path. Removed on the element's next blur. */
export const VALIDATION_FOCUS_ATTRIBUTE = 'data-validation-focused';

/**
 * The tags that take focus with no `tabindex` of their own. `a` is deliberately absent: an
 * anchor is focusable only when it carries `href`, and an anchor without one is the exact
 * shape a "focus the deep link" destination degrades into.
 */
const NATIVELY_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'summary']);

/** The two characters that can terminate or continue a CSS attribute-selector string. */
const BACKSLASH_OR_QUOTE = /["\\]/gu;

/**
 * Whether an element can really take focus — the predicate the refusal turns on, kept pure
 * and unit-tested against a true/false table rather than left to a mounted suite that
 * cannot exercise it (happy-dom focuses anything).
 *
 * Read the attributes rather than the properties. `disabled` and `inert` are checked FIRST
 * because they defeat everything else, including an explicit `tabindex`: a disabled button
 * carrying `tabindex="0"` is still not focusable.
 *
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isFocusable(element) {
  if (!element || typeof element.getAttribute !== 'function') return false;
  if (element.hasAttribute('disabled') || element.hasAttribute('inert')) return false;
  if (element.hasAttribute('tabindex')) return true;
  const tag = String(element.tagName || '').toLowerCase();
  if (tag === 'a') return element.hasAttribute('href');
  return NATIVELY_FOCUSABLE.has(tag);
}

/**
 * The one-shot cleanup. A MODULE-LEVEL reference on purpose — see the header note on the
 * repeat-activation path.
 *
 * @param {Event} event
 */
function clearValidationFocusMark(event) {
  const element = event.currentTarget || event.target;
  if (element && typeof element.removeAttribute === 'function') {
    element.removeAttribute(VALIDATION_FOCUS_ATTRIBUTE);
  }
}

/**
 * Escape the two characters that can terminate or continue a CSS attribute-selector string.
 * Ids in this repository are alphanumeric, so this guards a shape rather than fixing one.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeAttributeValue(value) {
  return value.replace(BACKSLASH_OR_QUOTE, '\\$&');
}

/**
 * Build the attribute selector for a `focusTarget`. Returns null for anything that is not a
 * non-empty string, so a producer that emitted no `focusTarget` resolves to a route-only
 * action rather than to a selector that matches the first control in the panel.
 *
 * @param {unknown} focusTarget
 * @returns {string|null}
 */
function selectorFor(focusTarget) {
  if (typeof focusTarget !== 'string') return null;
  const value = focusTarget.trim();
  if (value === '') return null;
  return `[${VALIDATION_TARGET_ATTRIBUTE}="${escapeAttributeValue(value)}"]`;
}

/**
 * Resolve, focus and mark the control a validation row addresses.
 *
 * @param {ParentNode|null|undefined} root The subtree to resolve within — the host editor's
 *   own root, so a second editor mounted beside it cannot be reached.
 * @param {string|null|undefined} focusTarget The `data-validation-target` value to resolve.
 * @returns {Promise<Element|null>} The focused element, or null when the row carried no
 *   `focusTarget`, the target resolved to nothing, or the resolved element is not focusable.
 *   A host derives its announcement FROM this value, which is what makes "focus moved, then
 *   the announcement was written" a property of the data flow rather than of a test.
 */
export function focusValidationTarget(root, focusTarget) {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(focusResolvedTarget(root, focusTarget)));
  });
}

/**
 * @param {ParentNode|null|undefined} root
 * @param {string|null|undefined} focusTarget
 * @returns {Element|null}
 */
function focusResolvedTarget(root, focusTarget) {
  const selector = selectorFor(focusTarget);
  if (!selector || !root || typeof root.querySelector !== 'function') return null;

  const element = root.querySelector(selector);
  if (!element) return null;

  if (!isFocusable(element)) {
    console.warn(
      `Fabricate | validationFocus: ${JSON.stringify(focusTarget)} resolved to a <${String(
        element.tagName || ''
      ).toLowerCase()}> that cannot take focus, so the row action changed route and focused ` +
        'nothing. Give the control a tabindex, or emit no focusTarget for this row.'
    );
    return null;
  }

  element.focus?.();
  element.scrollIntoView?.({ block: 'nearest' });
  element.setAttribute(VALIDATION_FOCUS_ATTRIBUTE, '');
  element.addEventListener?.('blur', clearValidationFocusMark, { once: true });
  return element;
}

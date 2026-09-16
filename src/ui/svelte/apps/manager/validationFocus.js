/**
 * The focus half of a validation surface's row action (issue 1517).
 *
 * A validation row carries two independent fields: `target` is the ROUTE the host switches to, and
 * `focusTarget` is the CONTROL, the value of a `data-validation-target` attribute. A host sets its
 * route synchronously and FIRST, then awaits {@link focusValidationTarget}, which defers with
 * `queueMicrotask` so Svelte has flushed the route assignment and the destination panel exists by
 * the time the query runs. `queueMicrotask` rather than `requestAnimationFrame`: happy-dom
 * implements rAF but its callback has NOT run when a test awaits only microtasks, so an rAF-based
 * helper would read as correct and no-op under every mounted assertion.
 *
 * TWO THINGS THIS FILE OWNS.
 *
 * (1) THE REFUSAL. happy-dom focuses anything, so a mounted assertion passes even where a real
 * browser would do nothing. {@link isFocusable} is therefore a pure predicate with its own unit
 * table, and this helper refuses a target it cannot really focus. It SPEAKS for a SHAPE refusal —
 * a `<div>` with no `tabindex` is an authoring defect whose remedy is a `tabindex` or no
 * `focusTarget` — and is SILENT for a STATE refusal (`disabled`, `inert`, `aria-disabled`), which
 * is the normal runtime state of a correctly authored pair. `aria-disabled` is a state refusal
 * even though it IS focusable: that is the spelling a control uses to stay in the tab order while
 * saying it cannot be operated.
 *
 * (2) THE POINTER-PATH MARK. The module's focus-ring contract is a `:focus` reset plus a
 * `:focus-visible` repaint, and a programmatic `.focus()` following a POINTER activation matches
 * only the first — so a GM who CLICKS the row action would see no mark at all. The helper stamps a
 * transient `data-validation-focused` attribute, painted by `styles/fabricate.css` with
 * declarations byte-identical to the repaint, and removes it on the element's next `blur`.
 *
 * A LEAKED MARK IS THE ORIGINAL DEFECT INVERTED, so the cleanup listener is a module-level
 * function reference registered `{ once: true }`: re-activating on a control that ALREADY holds
 * focus fires neither `blur` nor `focus`, so a fresh closure per call would accumulate one dead
 * one-shot listener per activation. The attribute is re-set unconditionally, which is what makes
 * the repeat path idempotent rather than merely harmless.
 */

/** The attribute a destination control carries so a validation row can address it. */
export const VALIDATION_TARGET_ATTRIBUTE = 'data-validation-target';

/** The transient mark that paints the pointer path. Removed on the element's next blur. */
export const VALIDATION_FOCUS_ATTRIBUTE = 'data-validation-focused';

/**
 * The tags that take focus with no `tabindex` of their own. `a` is deliberately absent: an anchor
 * is focusable only when it carries `href`, and one without is the exact shape a "focus the deep
 * link" destination degrades into.
 */
const NATIVELY_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'summary']);

/** The two characters that can terminate or continue a CSS attribute-selector string. */
const BACKSLASH_OR_QUOTE = /["\\]/gu;

/**
 * Whether an element can really take focus — the predicate the refusal turns on, kept pure and
 * unit-tested against a true/false table rather than left to a mounted suite that cannot exercise
 * it.
 *
 * Read the attributes rather than the properties. `disabled` and `inert` are checked FIRST because
 * they defeat everything else, including an explicit `tabindex`.
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
 * Escape the two characters that can terminate or continue a CSS attribute-selector string. Ids in
 * this repository are alphanumeric, so this guards a shape rather than fixing one.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeAttributeValue(value) {
  // `String.raw` rather than `'\\$&'`: the replacement is one literal backslash followed by the
  // whole match, and the escaped spelling reads as two characters when it is one.
  return value.replace(BACKSLASH_OR_QUOTE, String.raw`\$&`);
}

/**
 * Build the attribute selector for a `focusTarget`. Returns null for anything that is not a
 * non-empty string, so a producer that emitted no `focusTarget` resolves to a route-only action
 * rather than to a selector that matches the first control in the panel.
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
 * @param {ParentNode|null|undefined} root The subtree to resolve within — the host editor's own
 *   root, so a second editor mounted beside it cannot be reached.
 * @param {string|null|undefined} focusTarget The `data-validation-target` value to resolve.
 * @returns {Promise<Element|null>} The focused element, or null when the row carried no
 *   `focusTarget`, the target resolved to nothing, or the resolved element is not focusable. A
 *   host derives its announcement FROM this value, which is what makes "focus moved, then the
 *   announcement was written" a property of the data flow rather than of a test.
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

  const refusal = refusalOf(element);
  if (refusal === SHAPE_REFUSAL) {
    console.warn(
      `Fabricate | validationFocus: ${JSON.stringify(focusTarget)} resolved to a <${String(
        element.tagName || ''
      ).toLowerCase()}> that cannot take focus, so the row action changed route and focused ` +
        'nothing. Give the control a tabindex, or emit no focusTarget for this row.'
    );
    return null;
  }
  if (refusal) return null;

  element.focus?.();

  // FOCUS IS A REQUEST, AND THE STAMP FOLLOWS THE ANSWER. `.focus()` returns nothing and a browser
  // may decline it, so the mark is written only once the element really holds the keyboard.
  // Stamping first would paint the ring on a control that never took focus, and the ring's own
  // removal is a `blur` that then never fires.
  if (element.ownerDocument?.activeElement !== element) return null;

  element.scrollIntoView?.({ block: 'nearest' });
  element.setAttribute(VALIDATION_FOCUS_ATTRIBUTE, '');
  element.addEventListener?.('blur', clearValidationFocusMark, { once: true });
  return element;
}

/** The authoring defect: a destination that could never take focus. See the header note. */
const SHAPE_REFUSAL = 'shape';

/**
 * Why a resolved destination must not take focus, as the two answers that want different
 * treatment: `'state'` for the transient `disabled` / `inert` / `aria-disabled="true"` a correct
 * pair reaches at runtime, `SHAPE_REFUSAL` for a destination authored so focus could never land on
 * it, and `null` when it can be focused.
 *
 * @param {Element} element
 * @returns {string|null}
 */
function refusalOf(element) {
  if (element.hasAttribute('disabled') || element.hasAttribute('inert')) return 'state';
  if (element.getAttribute('aria-disabled') === 'true') return 'state';
  return isFocusable(element) ? null : SHAPE_REFUSAL;
}

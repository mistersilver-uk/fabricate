/**
 * The focus half of a validation surface's row action (issue 1517). The host writes its ROUTE first,
 * then awaits `focusValidationTarget`, which defers with `queueMicrotask` — never
 * `requestAnimationFrame`, whose callback happy-dom does not run when a test awaits only microtasks,
 * so an rAF helper would read as correct and no-op under every mounted assertion. A programmatic
 * `.focus()` after a POINTER activation matches the `:focus` reset but not the `:focus-visible`
 * repaint, so this stamps a transient `data-validation-focused` that `styles/fabricate.css` paints
 * identically and clears on the next `blur` through a MODULE-LEVEL `{ once: true }` listener, which
 * a fresh closure per call would leak one dead copy of per repeat activation.
 */

export const VALIDATION_TARGET_ATTRIBUTE = 'data-validation-target';

export const VALIDATION_FOCUS_ATTRIBUTE = 'data-validation-focused';

const NATIVELY_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'summary']);

const BACKSLASH_OR_QUOTE = /["\\]/gu;

export function isFocusable(element) {
  if (!element || typeof element.getAttribute !== 'function') return false;
  if (element.hasAttribute('disabled') || element.hasAttribute('inert')) return false;
  if (element.hasAttribute('tabindex')) return true;
  const tag = String(element.tagName || '').toLowerCase();
  if (tag === 'a') return element.hasAttribute('href');
  return NATIVELY_FOCUSABLE.has(tag);
}

function clearValidationFocusMark(event) {
  const element = event.currentTarget || event.target;
  if (element && typeof element.removeAttribute === 'function') {
    element.removeAttribute(VALIDATION_FOCUS_ATTRIBUTE);
  }
}

function escapeAttributeValue(value) {
  return value.replace(BACKSLASH_OR_QUOTE, String.raw`\$&`);
}

function selectorFor(focusTarget) {
  if (typeof focusTarget !== 'string') return null;
  const value = focusTarget.trim();
  if (value === '') return null;
  return `[${VALIDATION_TARGET_ATTRIBUTE}="${escapeAttributeValue(value)}"]`;
}

/** Resolve within `root` alone; `null` when nothing focusable was reached. */
export function focusValidationTarget(root, focusTarget) {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(focusResolvedTarget(root, focusTarget)));
  });
}

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

  // FOCUS IS A REQUEST: stamping before it is granted paints a ring no `blur` ever removes.
  if (element.ownerDocument?.activeElement !== element) return null;

  element.scrollIntoView?.({ block: 'nearest' });
  element.setAttribute(VALIDATION_FOCUS_ATTRIBUTE, '');
  element.addEventListener?.('blur', clearValidationFocusMark, { once: true });
  return element;
}

const SHAPE_REFUSAL = 'shape';

/** happy-dom focuses anything, so the refusal is decided here rather than in a mounted suite:
    `'state'` — the transient `disabled` / `inert` / `aria-disabled="true"` a correct pair reaches at
    runtime — is SILENT, while `SHAPE_REFUSAL` is an authoring defect and SPEAKS. */
function refusalOf(element) {
  if (element.hasAttribute('disabled') || element.hasAttribute('inert')) return 'state';
  if (element.getAttribute('aria-disabled') === 'true') return 'state';
  return isFocusable(element) ? null : SHAPE_REFUSAL;
}

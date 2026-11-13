/**
 * The in-app half of the label-in-name rule (WCAG 2.5.3, issue 2869): the published seam refuses a
 * companion's `ariaLabel` that omits its visible text (M22), and this holds Fabricate's own buttons
 * to the same comparison, `containsLabel`, over mounted English markup. Lives in `tests/helpers/`,
 * outside the `npm test` glob, so it holds no `.test.js`.
 */
import { containsLabel } from '../../src/ui/labelInName.js';

/** The text a sighted user reads on a button: its text content less every `aria-hidden` subtree. */
export function visibleText(element) {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && node.getAttribute('aria-hidden') !== 'true') {
      text += ` ${visibleText(node)} `;
    }
  }
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Each button under `root`, narrowed by `selector`, whose `aria-label` omits its visible text, as `{ selector, name, label }`
 * for the failure message.
 */
export function buttonsBreakingLabelInName(root, selector = 'button') {
  const broken = [];
  for (const button of root.querySelectorAll(`:is(${selector})[aria-label]`)) {
    const [name, label] = [button.getAttribute('aria-label'), visibleText(button)];
    if (!label || containsLabel(name, label)) continue;
    const hook = [...button.attributes].find(({ name: attr }) => attr.startsWith('data-'));
    broken.push({ hook: hook ? hook.name : button.className, name, label });
  }
  return broken;
}

/**
 * Asserts that every labelled button under `root` holds its visible text in its name; `selector`
 * narrows the buttons judged, for a screen that draws other buttons the ratchet has not reached.
 */
export function assertButtonsHoldTheirLabels(assert, root, selector = 'button') {
  assert.deepEqual(
    buttonsBreakingLabelInName(root, selector),
    [],
    'a button’s aria-label must contain its visible text (WCAG 2.5.3, issue 2869)'
  );
}

/**
 * Moves focus where a settled press leaves it (issue 3011, D-3): the named card's button, the
 * begin control, else the first enabled control of the detail pane. `detail` is that pane.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** @param {Element|null|undefined} detail @param {{ kind: string, actionId?: string }} target */
export function focusSettled(detail, target) {
  if (!detail || !target) return;
  let control = null;
  if (target.kind === 'card') {
    const card = [...detail.querySelectorAll('[data-iterative-action]')].find(
      (element) => element.dataset.iterativeAction === target.actionId
    );
    control = card?.querySelector('button:not([disabled])') ?? null;
  } else if (target.kind === 'begin') {
    control = detail.querySelector('[data-run-action="begin"]:not([disabled])');
  }
  (control ?? detail.querySelector(FOCUSABLE))?.focus?.();
}

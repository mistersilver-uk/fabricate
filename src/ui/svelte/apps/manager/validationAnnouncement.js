/**
 * The ANNOUNCEMENT half of a validation row action (issue 1517). Its fallback, sentence and
 * focus-then-announce ordering are `openspec/specs/design-system/spec.md`'s "Validation is one
 * screen everywhere", enforced by `util/announceAfterFocus.js`. Its own: the region is CLEARED
 * before the move and written after it, since a live region announces a CHANGE and a repeat would
 * re-assign one string silently; the region ELEMENT stays per host, outside the block its own route
 * change unmounts; and the sentence names the control or the record and never both, because the
 * mover's return value reports the fallback panel too while a row carries ONE address.
 */

import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';

const ROUTE_CONTROL_SEPARATOR = ' — ';

export function accessibleNameOf(root, element) {
  if (!element || typeof element.getAttribute !== 'function') return '';
  const label = element.getAttribute('aria-label');
  if (label) return label.trim();
  const id = element.getAttribute('id');
  const labelling = id ? root?.querySelector?.(`label[for="${id}"]`) : null;
  if (labelling) return (labelling.textContent || '').trim();
  return (element.getAttribute('title') || '').trim();
}

export function announceValidationOutcome({
  root,
  routeLabel = '',
  focus,
  fallbackPanel = null,
  destinationName = '',
  announce = () => {},
}) {
  announce('');

  let control = null;

  announceAfterFocusMove(
    async () => {
      control = (await focus?.()) ?? null;
      if (control) return control;
      return focusFallbackPanel(fallbackPanel);
    },
    () => {
      const name = control ? accessibleNameOf(root, control) : destinationName;
      announce(name ? `${routeLabel}${ROUTE_CONTROL_SEPARATOR}${name}` : routeLabel);
    }
  );
}

function focusFallbackPanel(panel) {
  if (!panel || typeof panel.focus !== 'function') return null;
  panel.focus();
  return panel.ownerDocument?.activeElement === panel ? panel : null;
}

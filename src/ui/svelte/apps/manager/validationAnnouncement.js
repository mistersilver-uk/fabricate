/**
 * The ANNOUNCEMENT half of a validation surface's row action (issue 1517).
 *
 * `validationFocus.js` beside this file answers "which control does this row address, and can
 * it hold focus". This file answers the two questions that follow it — "where did I just land"
 * and "when is the GM told" — for all six hosts that wire the action: the recipe editor, the
 * recipe-item editor, the essence editor, the Tool editor, the Checks studio and the
 * environment editor.
 *
 * IT IS ONE LEAF BECAUSE IT WAS FIVE COPIES. Each host held its own `accessibleNameOf`, its own
 * `<route> — <control>` join and its own ordering, which is five places for one sentence's
 * shape to drift — and the ordering in particular is not a per-host choice: it is the rule
 * `src/ui/svelte/util/announceAfterFocus.js` owns for the whole module, and this file hands the
 * write to it rather than restating it. A host is left with its own route table, its own route
 * write, and one call.
 *
 * ── THREE THINGS THIS FILE OWNS ─────────────────────────────────────────────────────────────
 *
 * (1) THE FALLBACK. A validation row may carry a ROUTE and no control — eleven of the Checks
 * studio's sixteen issues, every Tool `general` row, four essence checks — and activating one
 * unmounts the panel the View button was in. Before this file, `focusValidationTarget` resolved
 * `null`, nothing re-took the keyboard, and focus fell to `<body>`: every Foundry keybinding
 * goes live there, so Space pauses the game, the arrows pan the canvas behind the window and
 * Tab walks out of the application. The remedy is not a control — there is none to point at —
 * it is the DESTINATION PANEL, which every host declares `tabindex="-1"` and
 * `data-keyboard-focus="true"` on for exactly this. So a `null` control focuses the panel, and
 * the GM lands inside the thing the row routed them to.
 *
 * (2) WHAT THE SENTENCE SAYS. `"<route> — <control name>"` when a control was reached, the
 * ROUTE ALONE when the fallback took it: the panel is where the GM is, not what the row was
 * about, and naming it ("Results tab panel") would be a longer way of saying the route twice.
 * The control's name is read off the DOM — `aria-label`, then the `<label for>` that names it,
 * then `title` — because that is the name the GM's screen reader is about to speak, and a
 * second name composed from the row's own copy would be a second thing to keep in step.
 *
 * (2b) AND THE THIRD DESTINATION, WHICH IS A RECORD. A row addresses either a CONTROL in the
 * route it names or a RECORD the route SELECTS — the environment editor's rows are the second
 * kind, because a stale included task is a record and not a field. There is no control to read
 * a name off, so a host with a record destination hands its name over as `destinationName` and
 * the sentence is `"<route> — <record name>"`. It is composed HERE rather than at that host,
 * even though the host knows both halves, because the join between a route and its destination
 * is the one thing every sentence in this file shares: composed at the call site it would be a
 * second `' — '`, and the whole reason this file exists is that there were five.
 *
 * ── AND WHAT IS DELIBERATELY LEFT IN THE HOSTS ──────────────────────────────────────────────
 *
 * THE LIVE REGION ITSELF, which is the one other thing that is written once per host. It stays,
 * because the copies are not a copy of one decision: each region has to sit OUTSIDE the
 * exact block its own host's route change unmounts — outside `{#if recipe}` and the tab chain in
 * the recipe editor, outside the route switch in the Checks studio, as a third child of a
 * `<main>` in the Tool editor — and each carries its own `data-*` hook, which mounted suites and
 * three source contracts read by name. A shared component would still need every host to place it
 * and to name it, so it would move the markup and leave both decisions where they are; what is
 * genuinely shared is the WRITE, and that is this function. The placement is guarded per host by
 * `describeValidationHostContract`'s region clause rather than by a component.
 *
 * (3) THE REPEAT. A live region announces a CHANGE of text, so activating the same row twice
 * assigned the same string and the second press was silent — the state a GM reaches by pressing
 * again precisely because they are not sure it worked. The region is therefore CLEARED
 * synchronously, before the focus move, and written after it: two changes rather than one
 * assignment, without a nonce in the sentence for an AT to read out.
 */

import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';

/** The join between the route and the control, in one place rather than five. */
const ROUTE_CONTROL_SEPARATOR = ' — ';

/**
 * A control's own accessible name, read off the DOM. `aria-label` first, then the `<label for>`
 * that names it, then `title`. A destination with none of the three — a card or a section
 * addressed as a whole — yields `''`, and the sentence names the route alone.
 *
 * The `<label for>` lookup is scoped to the SAME root the address was resolved in, so a second
 * editor mounted beside this one cannot supply the name.
 *
 * @param {ParentNode|null|undefined} root The host editor's own root.
 * @param {Element|null|undefined} element
 * @returns {string}
 */
export function accessibleNameOf(root, element) {
  if (!element || typeof element.getAttribute !== 'function') return '';
  const label = element.getAttribute('aria-label');
  if (label) return label.trim();
  const id = element.getAttribute('id');
  const labelling = id ? root?.querySelector?.(`label[for="${id}"]`) : null;
  if (labelling) return (labelling.textContent || '').trim();
  return (element.getAttribute('title') || '').trim();
}

/**
 * Move focus for one row action, then say where it landed.
 *
 * The host writes its ROUTE synchronously and FIRST — that is the host's own state write, and
 * this call must follow it — then hands over. Everything after the route is here: the deferred
 * query for the addressed control, the panel fallback, the sentence, and the ordering rule that
 * queues the sentence behind the focus utterance.
 *
 * @param {object} options
 * @param {ParentNode|null|undefined} options.root The host editor's own root, for the name read.
 * @param {string} [options.routeLabel] The destination's own name, already localized. `''` when
 *   the row named a route this host does not render.
 * @param {() => Promise<Element|null>} options.focus Resolves the addressed control, or `null`
 *   for a route-only row — `focusValidationTarget(root, focusTarget)`, always.
 * @param {Element|null} [options.fallbackPanel] The destination tab panel, focused when the row
 *   addressed no control. See (1) above.
 * @param {string} [options.destinationName] The name of the RECORD the route selects, for a row
 *   that addresses a record rather than a control. Read only when no control was reached, which
 *   is every activation for such a row. See (2b) above.
 * @param {(sentence: string) => void} options.announce Writes the live region.
 */
export function announceValidationOutcome({
  root,
  routeLabel = '',
  focus,
  fallbackPanel = null,
  destinationName = '',
  announce = () => {},
}) {
  // (3): cleared BEFORE the move, written after it, so a repeat activation is two changes.
  announce('');

  // The control, kept out of the mover's return value on purpose: the mover reports whatever
  // took focus, including the fallback panel, and the sentence must name only a real control.
  let control = null;

  announceAfterFocusMove(
    async () => {
      control = (await focus?.()) ?? null;
      if (control) return control;
      return focusFallbackPanel(fallbackPanel);
    },
    () => {
      // The control's own name when one was reached, and the record's when the row addressed a
      // record instead. Never both: a row carries ONE address, so exactly one of these is the
      // thing the GM is now standing in front of.
      const name = control ? accessibleNameOf(root, control) : destinationName;
      announce(name ? `${routeLabel}${ROUTE_CONTROL_SEPARATOR}${name}` : routeLabel);
    }
  );
}

/**
 * Focus the destination panel, and report whether it took the keyboard.
 *
 * Reported rather than assumed for the same reason `validationFocus.js` re-reads
 * `activeElement`: a panel that has not declared `tabindex` cannot hold focus, and treating the
 * request as a move would buy the announcement a delay it should not have.
 *
 * @param {Element|null} panel
 * @returns {Element|null}
 */
function focusFallbackPanel(panel) {
  if (!panel || typeof panel.focus !== 'function') return null;
  panel.focus();
  return panel.ownerDocument?.activeElement === panel ? panel : null;
}

/**
 * Where a portaled overlay lives, and what its coordinates are measured from (issue 1466).
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────────────────────
 * Six components each carried their own copy of this:
 *
 *   function getPopoverHost() {
 *     if (!pickerRoot || typeof document === 'undefined') return null;
 *     return pickerRoot.closest('.fabricate-manager');
 *   }
 *
 * and then, in the positioning pass:
 *
 *   const hostRect = host?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: innerWidth, ... };
 *
 * Outside the manager the `closest` returns null, so TWO things happen at once and they
 * disagree with each other. `use:portal` no-ops, leaving the panel inside the trigger's own
 * container; and the rect falls back to the VIEWPORT, so the `left`/`top` written onto that
 * `position: absolute` panel are viewport coordinates being interpreted against a completely
 * different containing block. The panel renders somewhere else entirely.
 *
 * The markup is byte-identical either way, which is why nothing caught it: there is no missing
 * element, no missing class, no thrown error and no failing DOM assertion — only a panel in the
 * wrong place, which is the failure mode least likely to be noticed by a test.
 *
 * Three of the six lived in `src/ui/svelte/components/`, the shared directory whose entire
 * premise is that a component there works wherever it is mounted. Each silently did not.
 *
 * ── THE RULE THIS MODULE ENFORCES ───────────────────────────────────────────────────────────
 * THE COORDINATE ORIGIN AND THE PORTAL TARGET MUST BE THE SAME ELEMENT. That is the whole
 * invariant, and the old code's real fault was not "the selector was too narrow" — it was that
 * the two answers were computed independently and were allowed to diverge. Both callers here
 * resolve through `resolveOverlayHost` against the same node, so they cannot.
 *
 * ── THE ROOT SET, AND WHY IT IS EXACTLY THESE TWO ───────────────────────────────────────────
 * Fabricate ships six Svelte applications. Their roots are:
 *
 *   SvelteCraftingSystemManagerApp  window `.crafting-system-manager`  root `.fabricate-manager`
 *   SvelteFabricateApp              window `.fabricate-app`            root `.fabricate-app-shell`
 *   SvelteComponentEditorApp        window `.component-editor-app`     root `.fabricate-component-editor`
 *   InteractablesManagerApp         window `.fabricate-interactables-manager`
 *   InteractableBrowserApp          window `.fabricate-interactable-browser-app`
 *   InteractableConfigApp           window `.fabricate-interactable-config-app`
 *
 * Only two of those can host an overlay, and the reason is POSITIONING rather than taxonomy: a
 * host is only usable as a coordinate origin if it is also the containing block of the
 * `position: absolute` panel appended to it, i.e. if it is itself positioned.
 *
 *   - `.fabricate-manager` declares `position: relative; isolation: isolate` in
 *     `styles/fabricate.css`. It is the manager's own Svelte root, inside the window content.
 *   - `.fabricate-app` is the player window's ApplicationV2 FRAME element, which Foundry
 *     positions absolutely and writes `left`/`top` onto. `.fabricate-app-shell`, the Svelte
 *     root one level in, is a static flex container and would NOT serve — which is exactly the
 *     kind of near-miss that makes "the nearest `.fabricate-*` thing" the wrong rule and an
 *     explicit, measured list the right one.
 *
 * `tests/components/portal-host-app-root.test.js` pins both halves: that no component
 * hard-codes a root of its own, and that every class named here is genuinely positioned.
 *
 * The other four applications reach none of the overlay components today (measured by walking
 * the import graph from each app root), so adding them would be adding untested capability.
 * When one of them grows an overlay, add its root here AND to the positioning proof.
 *
 * ── WHY THE FALLBACK IS LOUD RATHER THAN SILENT ─────────────────────────────────────────────
 * `resolveOverlayHost` never returns null while a document exists. Landing on `document.body`
 * keeps the origin and the target agreeing — the panel is still drawn where its trigger is,
 * merely unclipped by any app — so the visible failure mode is degraded, not wrong. But being
 * outside every Fabricate application root is a WIRING FAULT, so it also reports itself.
 *
 * It reports through `console.error` deliberately, and not through `notifyError`: the
 * positioning pass runs on every scroll and resize, so a Foundry notification would paint a
 * toast into every View Lab capture frame and every screenshot the moment it fired once. For
 * the same reason the report is deduplicated per component; without that, one mis-mounted
 * picker emits a line per scroll tick.
 */

/**
 * The application roots an overlay may be portaled into and measured against.
 *
 * Read by `tests/components/portal-host-app-root.test.js`, which is what makes this the single
 * source of truth rather than a comment: a root added here is a root the guard then requires to
 * be positioned, and a root removed here is one no component may name.
 *
 * @type {readonly string[]}
 */
export const OVERLAY_HOST_ROOT_CLASSES = Object.freeze(['fabricate-manager', 'fabricate-app']);

/** The `OVERLAY_HOST_ROOT_CLASSES` as one selector, for `closest`. */
export const OVERLAY_HOST_SELECTOR = OVERLAY_HOST_ROOT_CLASSES.map((cls) => `.${cls}`).join(', ');

/**
 * Components already reported as having no application root.
 *
 * Module-level, because "warn once" has to outlive the component instance that warned — a
 * picker is destroyed and recreated every time its view re-renders, so per-instance state would
 * report again on each one. `resetOverlayHostDiagnostics` is the seam that keeps this testable
 * rather than a hidden singleton.
 */
const reported = new Set();

/** Clear the warn-once registry. For tests that assert the diagnostic fires. */
export function resetOverlayHostDiagnostics() {
  reported.clear();
}

/**
 * Report, once per component, that an overlay was mounted outside every Fabricate application.
 *
 * @param {string} component Component name, for the message.
 */
function reportMissingHost(component) {
  if (reported.has(component)) return;
  reported.add(component);
  // `console.error`, not `notifyError`: see the header. A Foundry toast raised from a pass that
  // runs on every scroll and resize would land in every View Lab capture frame.
  console.error(
    `Fabricate: ${component} rendered an overlay outside every Fabricate application root ` +
      `(${OVERLAY_HOST_SELECTOR}), so its panel is hosted by <body> and is not clipped by any ` +
      'app. Mount it inside an application root, or add that root to ' +
      '`OVERLAY_HOST_ROOT_CLASSES` in src/ui/svelte/util/overlayHost.js.'
  );
}

/**
 * The nearest Fabricate application root containing `node`.
 *
 * @param {Element|null|undefined} node Any element inside the overlay's own subtree — the
 *   picker root, the trigger button, or the portaled node itself. All three give the same
 *   answer, because they share every ancestor above the picker.
 * @param {object} [options]
 * @param {string} [options.component] Component name used in the missing-host report.
 * @returns {HTMLElement|null} The host, `document.body` when the node sits outside every
 *   application root, or `null` when there is no document at all (SSR/module scope).
 */
export function resolveOverlayHost(node, { component = 'An overlay component' } = {}) {
  if (typeof document === 'undefined') return null;
  if (!node) return null;

  const root = node.closest?.(OVERLAY_HOST_SELECTOR);
  if (root) return root;

  reportMissingHost(component);
  return document.body;
}

/**
 * The host's box, used as the origin for the panel's `left`/`top`.
 *
 * There is deliberately NO viewport fallback here. A viewport-origin rect combined with a panel
 * that did not move is precisely the defect this module exists to remove, and a fallback that
 * produced one would reintroduce it for any caller that mis-wires the host. A zero box degrades
 * to the callers' existing `hostRect.width || window.innerWidth` sizing guard while keeping the
 * origin honest.
 *
 * @param {Element|null} host Result of {@link resolveOverlayHost}.
 * @returns {{left: number, top: number, width: number, height: number}} The origin box.
 */
export function overlayHostRect(host) {
  return host?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
}

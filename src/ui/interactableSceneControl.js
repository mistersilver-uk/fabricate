/**
 * Pure registration seam for the GM Interactable-browser scene-control button
 * (Phase 7).
 *
 * Foundry V13 changed the `getSceneControlButtons` payload shape: the hook now
 * receives an OBJECT-of-controls keyed by control name (a record), NOT the
 * pre-V13 array. Each control group carries a `tools` OBJECT (also keyed by
 * tool name). This module mutates that V13 controls record purely so the
 * registration is unit-testable without a live Foundry controls bar; the hook
 * body in `main.js` is the thin edge that supplies the GM gate, the localizer,
 * and the launch callback.
 *
 * We register a dedicated top-level control GROUP named `fabricate` (rather than
 * appending into the token control) so the Fabricate canvas tooling is a
 * discrete, discoverable entry in the controls bar. Its single tool is a
 * BUTTON (`button: true` → a one-shot click action, not a toggle/active mode)
 * that launches the Interactable browser app.
 */

/** Control-group + tool ids. Stable, namespaced so they cannot collide. */
export const FABRICATE_SCENE_CONTROL_NAME = 'fabricate';
export const FABRICATE_INTERACTABLE_TOOL_NAME = 'fabricate-interactables';
/** FontAwesome icon for the control group + its launch button. */
export const FABRICATE_SCENE_CONTROL_ICON = 'fas fa-mortar-pestle';

/**
 * Add the GM-only Fabricate Interactable-browser control to a V13
 * `getSceneControlButtons` controls record. PURE: returns the same `controls`
 * object after (optionally) inserting the Fabricate group. No-op for non-GMs —
 * the control is simply not added.
 *
 * @param {Record<string, object>} controls  The V13 object-of-controls record.
 * @param {object} deps
 * @param {boolean} deps.isGM        When false, nothing is added.
 * @param {() => void} deps.onClick   Invoked when the button tool is clicked
 *   (launches the Interactable browser app).
 * @param {(key: string, fallback: string) => string} [deps.localize]  Localizer;
 *   defaults to the fallback string.
 * @returns {Record<string, object>} The (possibly mutated) controls record.
 */
export function addInteractableSceneControl(controls, { isGM, onClick, localize } = {}) {
  if (!controls || typeof controls !== 'object') return controls;
  // GM-only: players never see the Fabricate placement control.
  if (isGM !== true) return controls;

  const t = typeof localize === 'function'
    ? localize
    : (_key, fallback) => fallback;

  const groupTitle = t('FABRICATE.Canvas.SceneControl.Title', 'Fabricate');
  const toolTitle = t('FABRICATE.Canvas.SceneControl.BrowserTool', 'Place interactables');

  controls[FABRICATE_SCENE_CONTROL_NAME] = {
    name: FABRICATE_SCENE_CONTROL_NAME,
    title: groupTitle,
    icon: FABRICATE_SCENE_CONTROL_ICON,
    // The Fabricate control group is GM-only; no persistent active layer tool.
    visible: true,
    tools: {
      [FABRICATE_INTERACTABLE_TOOL_NAME]: {
        name: FABRICATE_INTERACTABLE_TOOL_NAME,
        title: toolTitle,
        icon: FABRICATE_SCENE_CONTROL_ICON,
        // A click action (one-shot), NOT a toggle mode.
        button: true,
        visible: true,
        onClick: () => { if (typeof onClick === 'function') onClick(); },
        // V13 also dispatches `onChange` for button tools; route both to the
        // launch callback so the click fires regardless of which the running
        // Foundry build invokes.
        onChange: () => { if (typeof onClick === 'function') onClick(); }
      }
    },
    // V13 control groups carry an `activeTool`; a button-only group points it at
    // its single tool so the bar has a valid default selection.
    activeTool: FABRICATE_INTERACTABLE_TOOL_NAME
  };

  return controls;
}

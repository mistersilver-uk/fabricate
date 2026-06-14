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
/** Tool id for the GM "Manage interactables" panel button (issue 335). */
export const FABRICATE_MANAGE_INTERACTABLES_TOOL_NAME = 'fabricate-manage-interactables';
/** FontAwesome icon for the top-level Fabricate control GROUP. */
export const FABRICATE_SCENE_CONTROL_ICON = 'fas fa-mortar-pestle';
/** FontAwesome icon for the "Place interactables" tool button. */
export const FABRICATE_INTERACTABLE_TOOL_ICON = 'fas fa-hand-pointer';
/** FontAwesome icon for the "Manage interactables" tool button (issue 335). */
export const FABRICATE_MANAGE_INTERACTABLES_TOOL_ICON = 'fas fa-list-check';

/**
 * Add the GM-only Fabricate canvas-tooling control GROUP to a V13
 * `getSceneControlButtons` controls record. PURE: returns the same `controls`
 * object after (optionally) inserting the Fabricate group. No-op for non-GMs —
 * the control is simply not added.
 *
 * The group carries TWO button tools (both one-shot clicks, not toggle modes):
 *   - "Place interactables" — launches the Interactable browser (`onClick`).
 *   - "Manage interactables" — launches the Manage Interactables panel
 *     (`onManageClick`, issue 335); only added when an `onManageClick` callback
 *     is supplied so the legacy single-button shape stays unchanged when it is
 *     absent.
 *
 * @param {Record<string, object>} controls  The V13 object-of-controls record.
 * @param {object} deps
 * @param {boolean} deps.isGM        When false, nothing is added.
 * @param {() => void} deps.onClick   Invoked when the browser button tool is
 *   activated. Wired to the V13 tool `onChange` handler; `onClick` on the tool
 *   itself is deprecated in V13 and not set.
 * @param {() => void} [deps.onManageClick]  Invoked when the Manage Interactables
 *   button tool is activated (issue 335). When absent, the panel tool is omitted.
 * @param {(key: string, fallback: string) => string} [deps.localize]  Localizer;
 *   defaults to the fallback string.
 * @returns {Record<string, object>} The (possibly mutated) controls record.
 */
export function addInteractableSceneControl(controls, { isGM, onClick, onManageClick, localize } = {}) {
  if (!controls || typeof controls !== 'object') return controls;
  // GM-only: players never see the Fabricate placement control.
  if (isGM !== true) return controls;

  const t = typeof localize === 'function'
    ? localize
    : (_key, fallback) => fallback;

  const groupTitle = t('FABRICATE.Canvas.SceneControl.Title', 'Fabricate');
  const toolTitle = t('FABRICATE.Canvas.SceneControl.BrowserTool', 'Place interactables');
  const manageTitle = t('FABRICATE.Canvas.SceneControl.ManageTool', 'Manage interactables');

  const tools = {
    [FABRICATE_INTERACTABLE_TOOL_NAME]: {
      name: FABRICATE_INTERACTABLE_TOOL_NAME,
      title: toolTitle,
      icon: FABRICATE_INTERACTABLE_TOOL_ICON,
      // A click action (one-shot), NOT a toggle mode.
      button: true,
      visible: true,
      // V13 SceneControlTool dispatches `onChange` for button tools; `onClick`
      // is DEPRECATED on the tool and emits a console warning, so we only wire
      // `onChange`. The launch callback fires every activation regardless of
      // whether the button was already active.
      onChange: () => { if (typeof onClick === 'function') onClick(); }
    }
  };

  // The Manage Interactables panel button (issue 335) — a GM-only sibling that
  // lists/manages every interactable on the scene and promotes regions. Added
  // only when a launch callback is supplied so the seam stays backward-compatible.
  if (typeof onManageClick === 'function') {
    tools[FABRICATE_MANAGE_INTERACTABLES_TOOL_NAME] = {
      name: FABRICATE_MANAGE_INTERACTABLES_TOOL_NAME,
      title: manageTitle,
      icon: FABRICATE_MANAGE_INTERACTABLES_TOOL_ICON,
      button: true,
      visible: true,
      onChange: () => { if (typeof onManageClick === 'function') onManageClick(); }
    };
  }

  controls[FABRICATE_SCENE_CONTROL_NAME] = {
    name: FABRICATE_SCENE_CONTROL_NAME,
    title: groupTitle,
    icon: FABRICATE_SCENE_CONTROL_ICON,
    // The Fabricate control group is GM-only; no persistent active layer tool.
    visible: true,
    tools
    // NOTE: deliberately NO `activeTool`. A button-only group must not declare an
    // active/persistent tool: in V13 that makes the bar render the icon twice
    // (group icon + active-tool child) and keeps the button stuck "active" so
    // re-clicks do not re-fire the launch callback. Without it, the group is a
    // plain button that re-opens the browser on every click.
  };

  return controls;
}

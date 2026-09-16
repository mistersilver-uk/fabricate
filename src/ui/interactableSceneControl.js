// Registration seam for the GM Interactable scene-control buttons. V13's
// `getSceneControlButtons` hands the hook an OBJECT of controls keyed by name, not the pre-V13
// array, and each group carries a `tools` OBJECT; keeping the mutation here makes it unit-testable
// with no controls bar, and `main.js` stays the thin edge supplying the GM gate and callbacks.
// Fabricate takes its OWN top-level group rather than appending into the token control, so the
// canvas tooling is a discrete, discoverable entry.

// Stable, namespaced ids, so they cannot collide.
export const FABRICATE_SCENE_CONTROL_NAME = 'fabricate';
export const FABRICATE_INTERACTABLE_TOOL_NAME = 'fabricate-interactables';
export const FABRICATE_MANAGE_INTERACTABLES_TOOL_NAME = 'fabricate-manage-interactables';
export const FABRICATE_SCENE_CONTROL_ICON = 'fas fa-mortar-pestle';
export const FABRICATE_INTERACTABLE_TOOL_ICON = 'fas fa-hand-pointer';
export const FABRICATE_MANAGE_INTERACTABLES_TOOL_ICON = 'fas fa-list-check';

// Both tools are one-shot click BUTTONS, not toggle modes. The Manage tool is added only when its
// callback is supplied, so the legacy single-button shape is unchanged without one.
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
      button: true,
      visible: true,
      // V13 dispatches `onChange` for a button tool and DEPRECATES `onClick` on the tool itself
      // (it warns), so only `onChange` is wired; it fires on every activation.
      onChange: () => { if (typeof onClick === 'function') onClick(); }
    }
  };

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
    visible: true,
    tools
    // Deliberately NO `activeTool`. A button-only group that declares one makes V13 render the icon
    // twice and leaves the button stuck "active", so a re-click never re-fires the launch callback.
  };

  return controls;
}

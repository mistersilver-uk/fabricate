/**
 * Phase 7 — the PURE GM scene-control registration seam.
 *
 * Foundry V13 `getSceneControlButtons` passes an OBJECT-of-controls (keyed
 * record), NOT the pre-V13 array, and each control's `tools` is also an object.
 * `addInteractableSceneControl` mutates that record. These tests assert the V13
 * object shape, the GM gate (non-GM ⇒ nothing added), and that the button's
 * handler launches the browser app.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addInteractableSceneControl,
  FABRICATE_SCENE_CONTROL_NAME,
  FABRICATE_INTERACTABLE_TOOL_NAME,
  FABRICATE_SCENE_CONTROL_ICON
} from '../../src/ui/interactableSceneControl.js';

// A minimal V13 object-of-controls record (keyed by control name), as the hook
// receives it; the token control's `tools` is itself an object.
function v13Controls() {
  return {
    tokens: {
      name: 'tokens',
      title: 'CONTROLS.GroupToken',
      icon: 'fa-solid fa-user',
      tools: { select: { name: 'select', title: 'Select', icon: 'fa-expand' } },
      activeTool: 'select'
    }
  };
}

test('adds a GM-only Fabricate control group keyed into the V13 object-of-controls record', () => {
  const controls = v13Controls();
  addInteractableSceneControl(controls, { isGM: true, onClick: () => {} });

  const group = controls[FABRICATE_SCENE_CONTROL_NAME];
  assert.ok(group, 'a fabricate control group is added under its name key');
  assert.equal(group.name, FABRICATE_SCENE_CONTROL_NAME);
  assert.equal(group.icon, FABRICATE_SCENE_CONTROL_ICON, 'uses the chosen FontAwesome icon');
  // The pre-existing control group must be untouched.
  assert.ok(controls.tokens, 'existing controls are preserved');
});

test('the group exposes a button tool (click action, not a toggle mode) in the V13 tools OBJECT', () => {
  const controls = v13Controls();
  addInteractableSceneControl(controls, { isGM: true, onClick: () => {} });

  const tools = controls[FABRICATE_SCENE_CONTROL_NAME].tools;
  assert.ok(tools && typeof tools === 'object' && !Array.isArray(tools), 'tools is a V13 keyed object, not an array');
  const tool = tools[FABRICATE_INTERACTABLE_TOOL_NAME];
  assert.ok(tool, 'the browser tool is keyed by its name');
  assert.equal(tool.name, FABRICATE_INTERACTABLE_TOOL_NAME);
  assert.equal(tool.button, true, 'a button tool is a one-shot click action, not a toggle');
  assert.equal(tool.icon, FABRICATE_SCENE_CONTROL_ICON);
});

test('the button handler launches the browser app (via onClick and onChange)', () => {
  const controls = v13Controls();
  let clicks = 0;
  addInteractableSceneControl(controls, { isGM: true, onClick: () => { clicks += 1; } });
  const tool = controls[FABRICATE_SCENE_CONTROL_NAME].tools[FABRICATE_INTERACTABLE_TOOL_NAME];

  tool.onClick();
  assert.equal(clicks, 1, 'onClick fires the launch callback');
  tool.onChange();
  assert.equal(clicks, 2, 'onChange also fires the launch callback (V13 dispatches it for button tools)');
});

test('non-GM ⇒ the Fabricate control is NOT added', () => {
  const controls = v13Controls();
  addInteractableSceneControl(controls, { isGM: false, onClick: () => {} });
  assert.equal(controls[FABRICATE_SCENE_CONTROL_NAME], undefined, 'players never see the placement control');
  assert.deepEqual(Object.keys(controls), ['tokens'], 'the record is otherwise unchanged');
});

test('localizes the group + tool titles when a localizer is supplied', () => {
  const controls = v13Controls();
  const dict = {
    'FABRICATE.Canvas.SceneControl.Title': 'Fabriquer',
    'FABRICATE.Canvas.SceneControl.BrowserTool': 'Placer'
  };
  addInteractableSceneControl(controls, {
    isGM: true,
    onClick: () => {},
    localize: (key, fallback) => dict[key] ?? fallback
  });
  const group = controls[FABRICATE_SCENE_CONTROL_NAME];
  assert.equal(group.title, 'Fabriquer');
  assert.equal(group.tools[FABRICATE_INTERACTABLE_TOOL_NAME].title, 'Placer');
});

test('tolerates a missing/invalid controls argument', () => {
  assert.equal(addInteractableSceneControl(null, { isGM: true, onClick: () => {} }), null);
  assert.equal(addInteractableSceneControl(undefined, { isGM: true }), undefined);
});

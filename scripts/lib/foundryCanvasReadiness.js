/** The canvas-readiness predicate the Foundry smoke harness waits on after switching scenes. */
export const isCanvasReadyForScene = (sceneId) =>
  globalThis.canvas?.ready === true && globalThis.canvas?.scene?.id === sceneId;

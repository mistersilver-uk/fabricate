/**
 * The canvas-readiness predicate the Foundry smoke harness waits on after switching scenes.
 *
 * Kept here, away from `foundry-test-run.mjs`, for the same reason `foundrySmokeSignal.js` is:
 * that harness launches Chromium from `main()` on import, so a test cannot import it. This module
 * imports nothing, touches no Playwright API, and is therefore directly exercisable by
 * `tests/foundry-canvas-readiness.test.js` against a fabricated `globalThis.canvas`.
 *
 * WHY THE SCENE ID ALONE IS NOT A READINESS SIGNAL (issue #1010)
 * -------------------------------------------------------------
 * `Canvas#scene` is assigned EARLY in a draw and the render infrastructure is stood up LATE, so
 * `canvas.scene?.id === sceneId` becomes true roughly sixty lines before the canvas can accept a
 * placeable. Verified against the pinned Foundry 14.365 archive the smoke container installs
 * (`client/canvas/board.mjs`), in `Canvas##draw` order:
 *
 *   1105  `#ready = false`                  — cleared BEFORE the scene swaps, so a stale `true`
 *                                             from the previous scene cannot leak into the window
 *   1149  `#scene = nextScene`              — `canvas.scene.id` starts answering here
 *   1191  `await this.#loadTextures()`      — an await, so the window spans real time
 *   1209  `this.#activateTicker()`          — 2562: defines `pendingRenderFlags`
 *   1241  `await this.#initialize()`        — 1475: `#ready = true`
 *
 * Between 1149 and 1209 the canvas answers to the new scene id while `canvas.pendingRenderFlags`
 * is still the bare, unassigned class field declared at `board.mjs:2518`. Creating a placeable
 * document in that window reaches `RenderFlags#set`
 * (`client/canvas/interaction/render-flags.mjs:99`), which does
 * `canvas.pendingRenderFlags[this.priority].add(this.object)` and throws
 * `Cannot read properties of undefined (reading '<PRIORITY>')`. `CanvasDocumentMixin#_onCreate`
 * (`client/documents/abstract/canvas-document.mjs:140-144`) calls `object.draw()` un-awaited and
 * un-caught, so the throw surfaces as an unhandled rejection — a bare `pageerror` with no failing
 * harness step, which is why this went undiagnosed behind a waiver for so long.
 *
 * WHAT THIS PREDICATE DOES AND DOES NOT BUY
 * ------------------------------------------
 * It answers "has the canvas finished drawing this scene" correctly. It does NOT make a caller
 * safe, because a wait is only as good as its timeout: the first draw of a session is by far the
 * most expensive (WebGL init, BASIS transcoder, worker startup, a full asset load on a software
 * renderer), and when a real run overran the original 15s bound the harness swallowed the timeout
 * and created placeables into the open window regardless. Waiting longer is a mitigation; not
 * writing a placeable to a scene the canvas is drawing is a fix. Order the work so the unsafe
 * state is unreachable, and use this to keep a capture looking at the right scene.
 *
 * Note also which draws are exposed. Placeables the scene ALREADY carries are drawn by the layer
 * pass, which core runs after `#activateTicker()`, so they are never at risk — a scene full of
 * Regions and Tiles redraws cleanly. Only a document created DURING the window is, because that
 * path goes through `_onCreate` instead. A document created while the scene is not viewed is safe
 * too: `object` is null, so nothing is drawn at create time at all.
 *
 * The compound predicate closes the window BY CONSTRUCTION, in both directions:
 *   - `#ready = false` at 1105 precedes `#scene = nextScene` at 1149, so the predicate can never
 *     pass on the previous scene's `ready` while the new scene id is already visible.
 *   - `#ready = true` at 1475 follows `#activateTicker()` at 1209, so `ready === true` for a given
 *     scene id implies the pending-render-flag queues exist.
 * The only other assignments to `#ready` in 14.365 are `false` (709, 1105, and 1449 in
 * `#drawBlank`, the no-scene path that returns at 1141 before the scene is ever assigned), so
 * there is no route to `ready === true` that skips the ticker.
 *
 * @param {string} sceneId the id of the scene the canvas must have finished drawing
 * @returns {boolean} whether the canvas is drawn, ready, and showing that scene
 */
export const isCanvasReadyForScene = (sceneId) =>
  globalThis.canvas?.ready === true && globalThis.canvas?.scene?.id === sceneId;

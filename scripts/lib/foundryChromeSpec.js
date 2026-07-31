/**
 * The Foundry V13 application-frame contract the View Lab reproduces, plus the Fabricate window
 * descriptors it reproduces it for.
 *
 * This module is a TRANSCRIPTION, not an invention. Every value below is copied from Foundry's
 * own `client/applications/api/application.mjs` and `client/game.mjs`, and
 * `tests/view-lab-chrome-drift.test.js` re-reads the harvested source to prove the transcription
 * still matches. Do not "improve" anything here — if a value looks wrong, it is because Foundry
 * does it that way, and changing it makes the lab render something production never shows.
 *
 * Pure data + string builders only: no DOM, so the drift test can run under `node --test`.
 */

/**
 * `_renderFrame` (application.mjs) builds the header with a template literal, so the lab builds
 * the same string rather than assembling elements and hoping the shape matches.
 *
 * @param {{toggleControls: string, close: string}} labels Localized control labels.
 * @returns {string} The frame's inner HTML, header and controls dropdown only.
 */
function frameInnerHtml(labels) {
  return `<header class="window-header">
      <i class="window-icon hidden" inert></i>
      <h1 class="window-title"></h1>
      <button type="button" class="header-control icon fa-solid fa-ellipsis-vertical"
              data-tooltip="${labels.toggleControls}" aria-label="${labels.toggleControls}"
              data-action="toggleControls"></button>
      <button type="button" class="header-control icon fa-solid fa-xmark"
              data-tooltip="${labels.close}" aria-label="${labels.close}" data-action="close"></button>
    </header>
    <menu class="controls-dropdown"></menu>`;
}

/**
 * `_initializeApplicationOptions`: `if (applicationOptions.window.frame)
 * applicationOptions.classes.unshift("application")`, then dedupe. Every `.application` rule in
 * `foundry2.css` hangs off this class, so a frame built from `DEFAULT_OPTIONS.classes` alone
 * gets NO chrome at all - it is the single easiest way to build a convincing-looking wrong frame.
 *
 * Note what is deliberately NOT added: `themed` / `theme-*`. `Game##configureUI` adds those only
 * to sidebar tabs, compendia, camera views, and HUDs (client/game.mjs:1745-1757); an ordinary
 * ApplicationV2 like Fabricate's is filtered out and inherits its theme from `body` instead.
 *
 * @param {{classes: readonly string[], window: {frame?: boolean}}} app An {@link APP_CHROME} entry.
 * @returns {string[]} The class list Foundry would put on the frame element.
 */
export function frameClassesFor(app) {
  const classes = [...app.classes];
  if (app.window.frame !== false) classes.unshift('application');
  return [...new Set(classes)];
}

export const FOUNDRY_CHROME_SPEC = Object.freeze({
  /** The Foundry major this transcription was taken from. */
  coreMajor: 13,
  frameInnerHtml,
  frameClassesFor,
  /** `_updateFrame`: `this.#window.icon.className = \`window-icon fa-fw ${window.icon || "hidden"}\`` */
  windowIconClass: (icon) => `window-icon fa-fw ${icon || 'hidden'}`,
  resizeHandleHtml: '<div class="window-resize-handle"></div>',
  /**
   * `configureUI` resolves the default fontScale of 5 to `fontSizes[4]` and writes it to
   * `documentElement.style.fontSize`. Everything in `foundry2.css` is rem-based off this, so
   * getting it wrong rescales the entire window.
   */
  rootFontSizePx: 16,
  /** `<body class="vtt game system-<id>">`, plus the theme class Foundry adds at runtime. */
  bodyClasses: Object.freeze(['vtt', 'game']),
  bodyStyleVars: Object.freeze({
    '--ui-scale': '1',
    '--ui-fade-opacity': '0.4',
    '--ui-fade-duration': '500ms',
    '--ui-fade-delay': '500ms',
  }),
  /**
   * `.application { max-height: calc(100vh - 1.5 * var(--hotbar-height)) }` with
   * `--hotbar-height: 52px`. `_updatePosition` clamps to this SILENTLY, so the lab computes the
   * same ceiling up front and refuses to capture a window that would be clamped.
   */
  hotbarHeightPx: 52,
  maxHeightFor: (viewportHeightPx) => viewportHeightPx - 1.5 * 52,
  toolLabelKeys: Object.freeze({
    toggleControls: 'APPLICATION.TOOLS.ToggleControls',
    close: 'APPLICATION.TOOLS.Close',
  }),
  /**
   * Foundry falls back to these when a label cannot be localized. They only ever reach
   * `data-tooltip`/`aria-label`, never a painted pixel, so a fallback cannot change a frame.
   */
  toolLabelFallbacks: Object.freeze({ toggleControls: 'Toggle Controls', close: 'Close' }),
});

/**
 * The Fabricate windows the lab can draw. Mirrors each application's `static DEFAULT_OPTIONS`;
 * `tests/view-lab-app-options-parity.test.js` parses the real classes and asserts equality, so
 * a window that is resized in `src/` cannot silently keep being captured at the old size.
 */
export const APP_CHROME = Object.freeze({
  'fabricate-app': Object.freeze({
    id: 'fabricate-app',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'fabricate-app']),
    window: Object.freeze({
      title: 'FABRICATE.App.Title',
      icon: 'fa-solid fa-flask',
      resizable: true,
      contentTag: 'section',
      contentClasses: Object.freeze([]),
      /** Fabricate registers no header controls, so `_updateFrame` hides the ellipsis button. */
      controls: Object.freeze([]),
    }),
    position: Object.freeze({ width: 1280, height: 860 }),
    minWidth: 1024,
    minHeight: 640,
    optionsSource: 'src/ui/SvelteFabricateApp.svelte.js',
  }),
  'fabricate-crafting-system-manager': Object.freeze({
    id: 'fabricate-crafting-system-manager',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'crafting-system-manager']),
    window: Object.freeze({
      title: 'FABRICATE.Admin.Manager.WindowTitle',
      icon: 'fa-solid fa-layer-group',
      resizable: true,
      contentTag: 'section',
      contentClasses: Object.freeze([]),
      controls: Object.freeze([]),
    }),
    position: Object.freeze({ width: 1280, height: 940 }),
    minWidth: 0,
    minHeight: 0,
    optionsSource: 'src/ui/SvelteCraftingSystemManagerApp.svelte.js',
  }),
});

export const APP_CHROME_IDS = Object.freeze(Object.keys(APP_CHROME));

/**
 * The smallest browser viewport that renders an app at its declared size without
 * `_updatePosition` clamping it.
 *
 * @param {string} appId Key of {@link APP_CHROME}.
 * @returns {{width: number, height: number}}
 */
export function minimumViewportFor(appId) {
  const app = APP_CHROME[appId];
  if (!app) throw new Error(`unknown app chrome id: ${appId}`);
  return {
    width: app.position.width,
    height: Math.ceil(app.position.height + 1.5 * FOUNDRY_CHROME_SPEC.hotbarHeightPx),
  };
}

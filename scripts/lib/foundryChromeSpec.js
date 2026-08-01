/**
 * The Foundry V13 application-frame contract the View Lab reproduces, plus the Fabricate window
 * descriptors it reproduces it for.
 *
 * This module is a TRANSCRIPTION, not an invention. Every value below is copied from Foundry's
 * own `client/applications/api/application.mjs`, `client/applications/api/dialog.mjs`, and
 * `client/game.mjs`, and `tests/view-lab-chrome-drift.test.js` re-reads the harvested source to
 * prove the transcription still matches. Do not "improve" anything here — if a value looks wrong,
 * it is because Foundry does it that way, and changing it makes the lab render something
 * production never shows.
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
 * Foundry V13's `DialogV2` (`client/applications/api/dialog.mjs`), transcribed exactly as
 * {@link FOUNDRY_CHROME_SPEC} transcribes the window frame.
 *
 * A confirmation dialog is Foundry's chrome, not Fabricate's: `foundryBridge.confirmDialog` hands
 * `DialogV2.confirm` a title, some content and two button labels, and every element, class and
 * attribute around them is drawn by this module. Reproducing it from Foundry's own source under
 * the same never-commit rule and the same drift gate is what makes it genuine; drawing a Svelte
 * lookalike would be a facsimile, which this harness must never publish.
 *
 * The frame itself is inherited unchanged — `DialogV2` does not override `_renderFrame` — so the
 * header, title, controls dropdown and content element all come from {@link FOUNDRY_CHROME_SPEC}.
 * What is new here is the `<dialog>` tag, the `dialog` class, and the form the dialog puts in the
 * `.window-content`.
 */
export const FOUNDRY_DIALOG_SPEC = Object.freeze({
  /** `static DEFAULT_OPTIONS` (dialog.mjs:140-152). */
  defaultOptions: Object.freeze({
    id: 'dialog-{id}',
    classes: Object.freeze(['dialog']),
    tag: 'dialog',
    form: Object.freeze({ closeOnSubmit: true }),
    window: Object.freeze({ frame: true, positioned: true, minimizable: false }),
  }),
  /** `_renderHTML`: `form.className = "dialog-form standard-form"` / `form.autocomplete = "off"`. */
  formClassName: 'dialog-form standard-form',
  formAutocomplete: 'off',
  /**
   * `_renderHTML`'s template literal, reproduced character for character including its whitespace,
   * so the drift test can find it verbatim in the harvested source.
   *
   * @param {string} content Dialog content HTML (empty for a contentless dialog).
   * @param {string} buttonsHtml The joined `outerHTML` of the rendered buttons.
   * @returns {string} The form's inner HTML.
   */
  formInnerHtml: (content, buttonsHtml) => `
      ${content ? `<div class="dialog-content standard-form">${content}</div>` : ''}
      <footer class="form-footer">${buttonsHtml}</footer>
    `,
  /**
   * `_renderButtons`' destructuring defaults:
   * `const { action, label, icon, class: cls="", style={}, type="submit", disabled } = buttonOptions`.
   */
  buttonDefaults: Object.freeze({ class: '', type: 'submit' }),
  /**
   * `_renderButtons`:
   * `const isDefault = !!buttonOptions.default || ((i === 0) && !buttons.some(b => b.default))`.
   *
   * It decides which button gets `autofocus`, and `confirm` puts `default: true` on **No** — so in
   * a Fabricate confirmation the focused button is the one that declines.
   *
   * @param {ReadonlyArray<{default?: boolean}>} buttons All buttons, in render order.
   * @param {number} index Index of the button being rendered.
   * @returns {boolean} Whether this button is the default.
   */
  isDefaultButton: (buttons, index) =>
    // `every(not)` rather than Foundry's `!some(...)`, which `unicorn/no-negated-array-predicate`
    // rejects. Identical semantics, and the drift test pins Foundry's own wording of the line.
    Boolean(buttons[index].default) || (index === 0 && buttons.every((button) => !button.default)),
  /**
   * `confirm`'s `position` merge: `this.wait(foundry.utils.mergeObject({ position: { width: 400 } },
   * config))` — so 400 is a floor the caller overrides, not a fixed width.
   */
  factoryPosition: Object.freeze({ width: 400 }),
});

/**
 * The two buttons `DialogV2.confirm` unshifts onto the caller's list (dialog.mjs:315-323).
 *
 * `mergeObject` is reproduced as a spread: every field of a button descriptor is a scalar, an
 * `icon` string or a callback, so a recursive merge and a shallow one agree. The one field where
 * they could differ is `style`, and no Fabricate caller passes one.
 *
 * @param {object} [overrides] Caller overrides.
 * @param {object} [overrides.yes] `config.yes`.
 * @param {object} [overrides.no] `config.no`.
 * @returns {Array<object>} The yes/no descriptors, in Foundry's order.
 */
export function confirmDialogButtons({ yes = {}, no = {} } = {}) {
  return [
    { action: 'yes', label: 'Yes', icon: 'fa-solid fa-check', callback: () => true, ...yes },
    {
      action: 'no',
      label: 'No',
      icon: 'fa-solid fa-xmark',
      default: true,
      callback: () => false,
      ...no,
    },
  ];
}

/**
 * Resolve the frame description Foundry would render a `DialogV2` with.
 *
 * `_initializeApplicationOptions` merges, in inheritance order, ApplicationV2's `DEFAULT_OPTIONS`
 * (application.mjs:59-84), then DialogV2's (dialog.mjs:140-152), then the caller's config — arrays
 * concatenating and objects merging (`#mergeApplicationOptions`, application.mjs:419-432) — and
 * finally unshifts `"application"` onto the class list. Each field below cites the line it comes
 * from rather than being re-derived, because a wrong default here draws a window Foundry never does.
 *
 * @param {object} [config] The configuration handed to `DialogV2.confirm` / `wait`.
 * @returns {{tag: string, classes: string[], window: object, position: object}}
 */
export function resolveDialogChrome(config = {}) {
  const declared = config.window ?? {};
  return {
    // dialog.mjs:143 — a `<dialog>`, not a `<div>`; `.application.dialog:not([open])` is
    // `display: none`, so it is invisible until `show()`/`showModal()`.
    tag: FOUNDRY_DIALOG_SPEC.defaultOptions.tag,
    classes: frameClassesFor({
      // dialog.mjs:142 `classes: ["dialog"]`, concatenated with the caller's.
      classes: [...FOUNDRY_DIALOG_SPEC.defaultOptions.classes, ...(config.classes ?? [])],
      // dialog.mjs:148 `frame: true`, which is what makes `application` get unshifted.
      window: { frame: FOUNDRY_DIALOG_SPEC.defaultOptions.window.frame },
    }),
    window: {
      // application.mjs:66-67 — DialogV2 overrides neither, so a dialog with no `window.title`
      // renders an empty title bar and a hidden icon.
      title: declared.title ?? '',
      icon: declared.icon ?? '',
      // application.mjs:68-72.
      controls: declared.controls ?? [],
      resizable: declared.resizable ?? false,
      contentTag: declared.contentTag ?? 'section',
      contentClasses: declared.contentClasses ?? [],
    },
    position: {
      // application.mjs:80-83 `width: "auto", height: "auto"`. `confirm`'s `width: 400` is NOT
      // applied here: it is merged into the config by the factory (dialog.mjs:322), so a dialog
      // constructed directly keeps Foundry's auto width.
      width: config.position?.width ?? 'auto',
      height: config.position?.height ?? 'auto',
    },
  };
}

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

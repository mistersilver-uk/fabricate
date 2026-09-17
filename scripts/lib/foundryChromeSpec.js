/**
 * The Foundry V14 application-frame contract the View Lab reproduces, plus the Fabricate window
 * descriptors it reproduces it for.
 */

/**
 * `_renderFrame` (application.mjs) builds the header with a template literal, so the lab builds the
 * same string rather than assembling elements and hoping the shape matches.
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
    </header>`;
}

/**
 * `_initializeApplicationOptions`: `if (applicationOptions.window.frame)
 * applicationOptions.classes.unshift("application")`, then dedupe.
 */
export function frameClassesFor(app) {
  const classes = [...app.classes];
  if (app.window.frame !== false) classes.unshift('application');
  return [...new Set(classes)];
}

export const FOUNDRY_CHROME_SPEC = Object.freeze({
  /** The Foundry major this transcription was taken from. */
  coreMajor: 14,
  frameInnerHtml,
  frameClassesFor,
  /** `_updateFrame`: `this.#window.icon.className = \`window-icon fa-fw ${window.icon || "hidden"}\`` */
  windowIconClass: (icon) => `window-icon fa-fw ${icon || 'hidden'}`,
  resizeHandleHtml: '<div class="window-resize-handle"></div>',
  /**
   * `configureUI` resolves the default fontScale of 5 to `fontSizes[4]` and writes it to
   * `documentElement.style.fontSize`.
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
   * `.application { max-height: calc(100vh - 1.5 * var(--hotbar-height)) }` with `--hotbar-height:
   * 52px`.
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
 * Foundry V14's `DialogV2` (`client/applications/api/dialog.mjs`), transcribed exactly as {@link
 * FOUNDRY_CHROME_SPEC} transcribes the window frame.
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
   */
  formInnerHtml: (content, buttonsHtml) => `
      ${content ? `<div class="dialog-content standard-form">${content}</div>` : ''}
      <footer class="form-footer">${buttonsHtml}</footer>
    `,
  /**
   * `_renderButtons`' destructuring defaults: `const { action, label, icon, class: cls="",
   * style={}, type="submit", disabled, tooltip } = buttonOptions`.
   */
  buttonDefaults: Object.freeze({ class: '', type: 'submit' }),
  /**
   * `_renderButtons`: `const isDefault = !!buttonOptions.default || ((i === 0) && !buttons.some(b
   * => b.default))`.
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

/** The two buttons `DialogV2.confirm` unshifts onto the caller's list (dialog.mjs:315-323). */
export function confirmDialogButtons({ yes = {}, no = {} } = {}) {
  return [
    { action: 'yes', label: 'COMMON.Yes', icon: 'fa-solid fa-check', callback: () => true, ...yes },
    {
      action: 'no',
      label: 'COMMON.No',
      icon: 'fa-solid fa-xmark',
      // V14 only. `_renderButtons` defaults `type` to "submit", so before this the No button
      // submitted the dialog form; it now declines without one. Invisible in a screenshot, present
      // in the captured markup.
      type: 'button',
      default: true,
      callback: () => false,
      ...no,
    },
  ];
}

/** The single button `DialogV2.prompt` unshifts (`dialog.mjs:338-344`). */
export function promptDialogButtons(ok = {}) {
  return [
    { action: 'ok', label: 'COMMON.Confirm', icon: 'fa-solid fa-check', default: true, ...ok },
  ];
}

/** Resolve the frame description Foundry would render a `DialogV2` with. */
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
      // application.mjs:80-83 `width: "auto", height: "auto"`.
      width: config.position?.width ?? 'auto',
      height: config.position?.height ?? 'auto',
    },
  };
}

/** The Fabricate windows the lab can draw. */
export const APP_CHROME = Object.freeze({
  'fabricate-app': Object.freeze({
    id: 'fabricate-app',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'fabricate-app', 'fabricate-app-window']),
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
  // Registered before the design-system adoption that re-skins them, not after, because until they
  // were here a diff touching all three selected exactly one case — `fabricate-app-shell`, the
  // player crafting window — through `mapChangedFilesToCases`'s fallback, and the evidence matcher
  // computed its expectation from the same selector and reported the gate satisfied.
  'fabricate-interactable-browser': Object.freeze({
    id: 'fabricate-interactable-browser',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'fabricate-interactable-browser-app', 'fabricate-app']),
    window: Object.freeze({
      title: 'FABRICATE.Canvas.Browser.Title',
      icon: 'fas fa-mortar-pestle',
      resizable: true,
      contentTag: 'section',
      contentClasses: Object.freeze([]),
      controls: Object.freeze([]),
    }),
    position: Object.freeze({ width: 420, height: 620 }),
    minWidth: 0,
    minHeight: 0,
    optionsSource: 'src/ui/InteractableBrowserApp.svelte.js',
  }),
  'fabricate-interactable-config': Object.freeze({
    id: 'fabricate-interactable-config',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'fabricate-interactable-config-app', 'fabricate-app']),
    window: Object.freeze({
      title: 'FABRICATE.Canvas.Interactable.Config.Title',
      icon: 'fas fa-sliders',
      resizable: true,
      contentTag: 'section',
      contentClasses: Object.freeze([]),
      controls: Object.freeze([]),
    }),
    position: Object.freeze({ width: 480, height: 680 }),
    minWidth: 0,
    minHeight: 0,
    optionsSource: 'src/ui/InteractableConfigApp.svelte.js',
  }),
  'fabricate-interactables-manager': Object.freeze({
    id: 'fabricate-interactables-manager',
    tag: 'div',
    classes: Object.freeze(['fabricate', 'fabricate-interactables-manager', 'fabricate-app']),
    window: Object.freeze({
      title: 'FABRICATE.Canvas.Manage.Title',
      icon: 'fas fa-list-check',
      resizable: true,
      contentTag: 'section',
      contentClasses: Object.freeze([]),
      controls: Object.freeze([]),
    }),
    position: Object.freeze({ width: 560, height: 680 }),
    minWidth: 0,
    minHeight: 0,
    optionsSource: 'src/ui/InteractablesManagerApp.svelte.js',
  }),
});

export const APP_CHROME_IDS = Object.freeze(Object.keys(APP_CHROME));

/**
 * The smallest browser viewport that renders an app at its declared size without `_updatePosition`
 * clamping it.
 */
export function minimumViewportFor(appId) {
  const app = APP_CHROME[appId];
  if (!app) throw new Error(`unknown app chrome id: ${appId}`);
  return {
    width: app.position.width,
    height: Math.ceil(app.position.height + 1.5 * FOUNDRY_CHROME_SPEC.hotbarHeightPx),
  };
}

/**
 * A real Foundry V13 `DialogV2` for the View Lab.
 *
 * This is the browser half of `FOUNDRY_DIALOG_SPEC` (`scripts/lib/foundryChromeSpec.js`), and it
 * stands in the same relationship to `client/applications/api/dialog.mjs` that `foundryFrame.js`
 * stands in to `application.mjs`: it walks Foundry's own sequence — `_initializeApplicationOptions`
 * → `_renderFrame` → `_renderHTML` → `_replaceHTML` → `_insertElement` → `show()` → `setPosition`
 * → `bringToFront` — so a photographed confirmation is Foundry's dialog around Fabricate's copy,
 * not a drawing of one.
 *
 * WHY THIS EXISTS. `foundryBridge.confirmDialog` returns `false` unless `DialogV2.confirm` exists,
 * so the lab's old empty-class stub made every confirmation in the manager unreachable: three
 * registry cases could reach the screen but never the dialog. The objection that answering it would
 * mean "a facsimile of Foundry chrome" only holds if the markup is invented. `dialog.mjs` is in the
 * release archive, so it is harvestable, transcribable, and drift-gated exactly as the window frame
 * already is.
 *
 * WHAT IS NOT TRANSCRIBED, and is a deliberate gap rather than an oversight:
 *
 * - `foundry.utils.cleanHTML` (`client/utils/helpers.mjs`), which `_initializeApplicationOptions`
 *   runs over string content. It is a sanitiser built on `ALLOWED_HTML_TAGS` /
 *   `ALLOWED_HTML_ATTRIBUTES` from `@common/constants.mjs` and it imports `CompendiumCollection` at
 *   module scope, so faithfully reproducing it means harvesting a third module and its constants
 *   table. The lab passes content through unchanged, which is `cleanHTML`'s identity for the
 *   balanced `<p>`/`<strong>` fragments Fabricate's confirmations pass it.
 * - Drag, resize, minimize, the controls dropdown, and `Escape`-to-dismiss. A screenshot never
 *   exercises them; the same omission is already disclosed for the app frame.
 * - `prompt` / `input` / `query`. Only `confirm` (and the `wait` it is built on) is wired, because
 *   only `confirm` is what `confirmDialog` needs. A caller reaching for the others still finds them
 *   absent, exactly as before, rather than finding a half-built stand-in.
 */
import {
  FOUNDRY_CHROME_SPEC,
  FOUNDRY_DIALOG_SPEC,
  confirmDialogButtons,
  resolveDialogChrome,
} from '../../scripts/lib/foundryChromeSpec.js';

/** Marks a lab-rendered dialog so the mount page and the driver can find one. */
export const LAB_DIALOG_ATTRIBUTE = 'data-view-lab-dialog';

/**
 * How the lab answers a dialog Foundry would wait on a human for. One of:
 *
 * - `open` — press nothing. The dialog stands and its promise never settles, which is the ONLY way
 *   to photograph one: an answered dialog closes again long before the screenshot. This is what a
 *   case that wants the dialog in frame asks for.
 * - `enter` — press the button Foundry marks as the default (`_renderButtons` gives it `autofocus`,
 *   and it is the action a bare Enter keypress submits). This is the lab-wide default.
 * - any button action, e.g. `yes` / `no` / `roll` — press that button by name.
 *
 * WHY `enter` IS THE DEFAULT, rather than `open` as first scoped. Measured, not assumed: of the 150
 * publishable cases, exactly one — `player-gathering-after-success` — opens a dialog without asking
 * for one, Fabricate's interactive roll prompt. With `open` as the lab-wide default that case's
 * frame silently became a picture of an unresolved roll prompt, and its gather never completed, so
 * a shipped frame started contradicting its own label. `enter` reproduces what the old empty-class
 * stub produced at both call sites and does it through Foundry's real code path: `promptCheckRoll`
 * proceeds (its default button is Roll/Normal) and `confirmDialog` declines (`confirm` marks **No**
 * as default), which is exactly what `return false` meant. A case that wants the dialog in frame
 * opts into `open`; nothing gets it by accident.
 */
export const LAB_DIALOG_ANSWERS = Object.freeze(['open', 'enter']);
export const DEFAULT_LAB_DIALOG_ANSWER = 'enter';

/**
 * Resolve the header control labels the way `_renderFrame` does, falling back when the key is
 * unmapped. They only ever reach `data-tooltip`/`aria-label`.
 *
 * @param {(key: string) => string} localize Resolver.
 * @returns {{toggleControls: string, close: string}}
 */
function controlLabels(localize) {
  const { toolLabelKeys, toolLabelFallbacks } = FOUNDRY_CHROME_SPEC;
  const resolve = (key, fallback) => {
    const value = typeof localize === 'function' ? localize(key) : key;
    return !value || value === key ? fallback : value;
  };
  return {
    toggleControls: resolve(toolLabelKeys.toggleControls, toolLabelFallbacks.toggleControls),
    close: resolve(toolLabelKeys.close, toolLabelFallbacks.close),
  };
}

/**
 * `_renderButtons` (dialog.mjs:197-222), built with the same DOM calls in the same order rather
 * than as a string template — the attribute order in the captured markup is decided by the order
 * `setAttribute` is called in, so writing the string by hand would be inventing it.
 *
 * @param {ReadonlyArray<object>} buttons The resolved button descriptors.
 * @param {(key: string) => string} localize Label resolver.
 * @returns {string} The joined `outerHTML`, as `_renderButtons` returns it.
 */
function renderButtons(buttons, localize) {
  return buttons
    .map((buttonOptions, index) => {
      const {
        action,
        label,
        icon,
        class: cls = FOUNDRY_DIALOG_SPEC.buttonDefaults.class,
        style = {},
        type = FOUNDRY_DIALOG_SPEC.buttonDefaults.type,
        disabled,
      } = buttonOptions;
      const isDefault = FOUNDRY_DIALOG_SPEC.isDefaultButton(buttons, index);
      const button = document.createElement('button');
      button.setAttribute('type', type);
      button.setAttribute('data-action', action);
      button.setAttribute('class', cls);
      for (const [key, value] of Object.entries(style)) {
        if (key in button.style) button.style[key] = value;
        else button.style.setProperty(key, value);
      }
      button.toggleAttribute('disabled', Boolean(disabled));
      button.toggleAttribute('autofocus', isDefault);
      if (icon) {
        const iconElement = document.createElement('i');
        iconElement.className = icon;
        button.append(iconElement);
      }
      const span = document.createElement('span');
      span.innerText = localize(label);
      button.append(span);
      return button.outerHTML;
    })
    .join('');
}

/**
 * `_updatePosition` + `#applyPosition` (application.mjs:916-992) for the auto-height case a dialog
 * is always in.
 *
 * Reproducing the measure-then-centre sequence rather than writing a size straight to the style is
 * what puts the dialog where Foundry puts it: centred in the VIEWPORT, which for the lab's 1920x1080
 * context means centred over the application window it was opened from.
 *
 * @param {HTMLElement} element The dialog element, already in the document.
 * @param {{width: number|'auto', height: number|'auto'}} position Requested position.
 * @returns {{width: number|'auto', height: number|'auto', left: number, top: number}} Applied.
 */
function applyDialogPosition(element, position) {
  // `ApplicationV2.parseCSSDimension(style, parentDimension)` (application.mjs:1657-1663).
  const parseCssDimension = (value, parentDimension) => {
    if (value.includes('px')) return Number.parseInt(value.replace('px', ''), 10);
    if (value.includes('%'))
      return (Number.parseInt(value.replace('%', ''), 10) / 100) * parentDimension;
    return undefined;
  };
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

  const computed = globalThis.getComputedStyle(element);
  const parent = element.parentElement;
  let minWidth = parseCssDimension(computed.minWidth, parent.offsetWidth) || 0;
  let maxWidth =
    parseCssDimension(computed.maxWidth, parent.offsetWidth) || Number.POSITIVE_INFINITY;
  let { width, height } = position;
  let bounds = element.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;

  const autoWidth = width === 'auto';
  if (!autoWidth) {
    const targetWidth = Number(width || bounds.width);
    minWidth = Number.parseInt(minWidth, 10) || 0;
    maxWidth = Number.parseInt(maxWidth, 10) || clientWidth;
    width = clamp(targetWidth, minWidth, maxWidth);
  }

  // A dialog's height is always `auto`: it is whatever its content needs. Foundry measures it by
  // writing the width, clearing the height, and reading the box back.
  const autoHeight = height === 'auto';
  if (autoHeight) {
    Object.assign(element.style, { width: `${width}px`, height: '' });
    bounds = element.getBoundingClientRect();
    height = bounds.height;
  }
  if (autoWidth) {
    Object.assign(element.style, { height: `${height}px`, width: '' });
    bounds = element.getBoundingClientRect();
    width = bounds.width;
  }

  const left = clamp((clientWidth - width) / 2, 0, Math.max(clientWidth - width, 0));
  const top = clamp((clientHeight - height) / 2, 0, Math.max(clientHeight - height, 0));
  Object.assign(element.style, {
    width: autoWidth ? '' : `${width}px`,
    height: autoHeight ? '' : `${height}px`,
    left: `${left}px`,
    top: `${top}px`,
  });
  return { width: autoWidth ? 'auto' : width, height: autoHeight ? 'auto' : height, left, top };
}

/**
 * Press the button the lab's answer names, failing loudly when it is not there.
 *
 * Silence would be the wrong failure: a case that asked for `yes` and got nothing would publish a
 * frame of the dialog it thought it had dismissed, and look like a fixture problem.
 *
 * @param {HTMLElement} frame The rendered dialog.
 * @param {string} answer `enter`, or a button action.
 */
function pressAnswer(frame, answer) {
  const selector = answer === 'enter' ? 'button[autofocus]' : `button[data-action="${answer}"]`;
  const button = frame.querySelector(selector);
  if (!button) {
    const available = [...frame.querySelectorAll('button[data-action]')]
      .map((element) => element.dataset.action)
      .join(', ');
    throw new Error(
      `view lab: the dialog has no button matching "${selector}" (answer "${answer}"); ` +
        `it offers: ${available}`
    );
  }
  button.click();
}

/**
 * Build the lab's `DialogV2` class plus the controller the mount page steers it with.
 *
 * @param {object} options Options.
 * @param {(key: string) => string} options.localize `game.i18n.localize`, for titles and labels.
 * @returns {{DialogV2: Function, setAnswer: Function, openDialogs: () => HTMLElement[]}}
 */
export function createLabDialogV2({ localize }) {
  const open = new Set();
  let answer = DEFAULT_LAB_DIALOG_ANSWER;
  let sequence = 0;
  // `ApplicationV2._maxZ` seeds from `--z-index-window` (application.mjs:117) and `bringToFront`
  // pre-increments it, so a dialog always stacks above the window that opened it.
  let maxZ = null;

  function nextZIndex() {
    maxZ ??=
      Number(globalThis.getComputedStyle(document.body).getPropertyValue('--z-index-window')) ||
      100;
    maxZ += 1;
    return maxZ;
  }

  class LabDialogV2 extends EventTarget {
    #element = null;
    #config;
    #chrome;
    #buttons;

    constructor(config = {}) {
      super();
      // `_initializeApplicationOptions` (dialog.mjs:157-173), minus the `cleanHTML` call on the
      // string branch — the one disclosed gap; see the module header.
      let content = config.content ?? '';
      if (content instanceof HTMLElement) {
        if (content.tagName !== 'DIV') throw new Error('config.content must be <div> element');
        if (content.attributes.length) {
          throw new Error('config.content element must have no attributes');
        }
        content = content.innerHTML;
      } else content = String(content);
      if (!config.buttons?.length) {
        throw new Error('You must define at least one entry in config.buttons');
      }
      this.#config = { ...config, content };
      this.#chrome = resolveDialogChrome(this.#config);
      this.#buttons = [...config.buttons];
    }

    get element() {
      return this.#element;
    }

    /** The buttons as `_initializeApplicationOptions` keys them: by action. */
    get buttons() {
      return Object.fromEntries(this.#buttons.map((button) => [button.action, button]));
    }

    /**
     * `#render` (application.mjs:460-534), reduced to the first-render path a dialog always takes.
     *
     * @returns {Promise<this>}
     */
    async render() {
      if (this.#element) return this;
      const { tag, classes, window: windowOptions } = this.#chrome;

      // _renderFrame
      const frame = document.createElement(tag);
      frame.className = classes.join(' ');
      // The lab's own handle on the element. Foundry gives it `id="dialog-<n>"` from a global
      // application counter; the lab has no such counter, and an id is not what the mount page
      // needs to find one.
      sequence += 1;
      frame.setAttribute(LAB_DIALOG_ATTRIBUTE, String(sequence));
      frame.innerHTML = FOUNDRY_CHROME_SPEC.frameInnerHtml(controlLabels(localize));
      const content = document.createElement(windowOptions.contentTag);
      content.classList.add('window-content', ...windowOptions.contentClasses);
      frame.append(content);

      // _updateFrame. `_configureRenderOptions` localizes the title through `this.title` and
      // collapses its whitespace before `_updateFrame` writes it.
      frame.querySelector('.window-title').innerText = localize(windowOptions.title)
        .replaceAll(/\s+/g, ' ')
        .trim();
      frame.querySelector('.window-icon').className = FOUNDRY_CHROME_SPEC.windowIconClass(
        windowOptions.icon
      );
      frame
        .querySelector('button[data-action=toggleControls]')
        .classList.toggle('hidden', windowOptions.controls.length === 0);

      // _renderHTML + _replaceHTML
      const form = document.createElement('form');
      form.className = FOUNDRY_DIALOG_SPEC.formClassName;
      form.autocomplete = FOUNDRY_DIALOG_SPEC.formAutocomplete;
      form.innerHTML = FOUNDRY_DIALOG_SPEC.formInnerHtml(
        this.#config.content,
        renderButtons(this.#buttons, localize)
      );
      form.addEventListener('submit', (event) => this._onSubmit(event.submitter, event));
      content.replaceChildren(form);

      // `_attachFrameListeners` routes a `data-action` click to `_onClickButton`, which submits.
      frame.addEventListener('click', (event) => {
        const target = event.target.closest?.('button[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (action === 'close') {
          this.close();
          return;
        }
        if (this.buttons[action]) this._onSubmit(target, event);
      });

      // _insertElement: `document.body.append(element)`. A dialog is a SIBLING of the application
      // window, not a child of it — which is why it can only be captured by overlapping the frame.
      this.#element = frame;
      document.body.append(frame);
      open.add(frame);

      // `_onFirstRender`: `showModal()` when modal, `show()` otherwise. `.application.dialog` is
      // `display: none` without the `open` attribute either sets.
      if (this.#config.modal) frame.showModal();
      else frame.show();

      applyDialogPosition(frame, this.#chrome.position);
      frame.style.zIndex = String(nextZIndex());
      this.dispatchEvent(new Event('render'));

      // The lab is the user Foundry is waiting for. Answering here, after the frame is positioned,
      // runs the real submit path through a real click on a real button.
      if (answer !== 'open') pressAnswer(frame, answer);
      return this;
    }

    /**
     * `_onSubmit` (dialog.mjs:233-246).
     *
     * @param {HTMLButtonElement} target The button that was clicked.
     * @param {Event} event The triggering event.
     * @returns {Promise<this>}
     */
    async _onSubmit(target, event) {
      event.preventDefault();
      const priorDisabledStates = [];
      for (const action of Object.keys(this.buttons)) {
        const button = this.#element.querySelector(`button[data-action="${action}"]`);
        priorDisabledStates.push([button, button.disabled]);
        button.disabled = true;
      }
      const button = this.buttons[target?.dataset.action];
      const result = (await button?.callback?.(event, target, this)) ?? button?.action;
      await this.#config.submit?.(result, this);
      for (const [element, disabled] of priorDisabledStates) element.disabled = disabled;
      return FOUNDRY_DIALOG_SPEC.defaultOptions.form.closeOnSubmit ? this.close() : this;
    }

    /**
     * `close` (application.mjs:801) reduced to what a dialog needs: drop the element and emit the
     * `close` event `wait` resolves a dismissal on.
     *
     * @returns {Promise<this>}
     */
    async close() {
      if (this.#element) {
        open.delete(this.#element);
        this.#element.remove();
        this.#element = null;
      }
      this.dispatchEvent(new Event('close'));
      return this;
    }

    /**
     * `static wait` (dialog.mjs:374-394), transcribed including the resolve-on-close branch.
     *
     * @param {object} [config] Dialog configuration.
     * @returns {Promise<any>}
     */
    static async wait({ rejectClose = false, close, render, ...config } = {}) {
      return new Promise((resolve, reject) => {
        const originalSubmit = config.submit;
        config.submit = async (result, dialog) => {
          await originalSubmit?.(result, dialog);
          resolve(result);
        };
        const dialog = new this(config);
        dialog.addEventListener(
          'close',
          (event) => {
            const result = typeof close === 'function' ? close(event, dialog) : undefined;
            if (rejectClose) reject(new Error('Dialog was dismissed without pressing a button.'));
            else resolve(result ?? null);
          },
          { once: true }
        );
        if (typeof render === 'function') {
          dialog.addEventListener('render', (event) => render(event, dialog));
        }
        // Foundry lets a render failure surface as an unhandled rejection while `wait` hangs. The
        // lab rejects instead: a harness whose job is to fail loudly must not turn a broken dialog
        // into a case that simply never settles.
        dialog.render({ force: true }).catch(reject);
      });
    }

    /**
     * `static confirm` (dialog.mjs:315-323).
     *
     * @param {object} [config] Dialog configuration, with optional `yes`/`no` overrides.
     * @returns {Promise<any>} `true`, `false`, or `null` on dismissal.
     */
    static async confirm({ yes = {}, no = {}, ...config } = {}) {
      config.buttons ??= [];
      config.buttons.unshift(...confirmDialogButtons({ yes, no }));
      return this.wait({
        ...config,
        position: { ...FOUNDRY_DIALOG_SPEC.factoryPosition, ...config.position },
      });
    }

    /**
     * `DialogV2.prompt` — one button, defaulted, over the same `wait`.
     *
     * Transcribed from `dialog.mjs`'s own `static async prompt`, which unshifts a single
     * `{action: 'ok', label: 'Confirm', icon: 'fa-solid fa-check', default: true}` before delegating
     * to `wait` with the 400px factory position. The caller's `ok` overrides win, which is how
     * Fabricate's system import relabels it "Import".
     *
     * Left unimplemented when the dialog was first transcribed, on the principle that a half-built
     * API is worse than an absent one. It is here now because the import-report frame needs it, and
     * because with `wait` already in place it is a button list rather than new machinery.
     *
     * @param {object} [config] Dialog configuration, with an optional `ok` override.
     * @returns {Promise<any>} The ok callback's value, or `null` on dismissal.
     */
    static async prompt({ ok = {}, ...config } = {}) {
      config.buttons ??= [];
      config.buttons.unshift({
        action: 'ok',
        label: 'Confirm',
        icon: 'fa-solid fa-check',
        default: true,
        ...ok,
      });
      return this.wait({
        ...config,
        position: { ...FOUNDRY_DIALOG_SPEC.factoryPosition, ...config.position },
      });
    }
  }

  return {
    DialogV2: LabDialogV2,
    /**
     * Choose how the lab answers the next dialog: `open`, `enter`, or a button action name.
     *
     * @param {string} requested Answer mode.
     */
    setAnswer(requested) {
      if (typeof requested !== 'string' || requested.length === 0) {
        throw new Error(
          `view lab: dialog answer must be ${LAB_DIALOG_ANSWERS.join(' | ')} or a button action, ` +
            `not ${JSON.stringify(requested)}`
        );
      }
      answer = requested;
    },
    /** @returns {HTMLElement[]} The dialog elements currently in the page. */
    openDialogs: () => [...open],
  };
}

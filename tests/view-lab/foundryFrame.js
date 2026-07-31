/**
 * Build a real Foundry V13 ApplicationV2 window frame in the View Lab page.
 *
 * This is the browser half of `scripts/lib/foundryChromeSpec.js`: it walks the same sequence
 * `_renderFrame` → `_updateFrame` → `#applyPosition` that Foundry walks, so the captured window
 * is the genuine chrome around a genuine Fabricate app root, not a drawing of one.
 *
 * The frame is positioned but inert: nothing here wires drag, resize, minimize, or the controls
 * dropdown, because a screenshot never exercises them. See the fidelity register in
 * `scripts/README.md`.
 */
import { APP_CHROME, FOUNDRY_CHROME_SPEC } from '../../scripts/lib/foundryChromeSpec.js';

/**
 * Reproduce `Game##configureUI`'s page-level state. Everything in `foundry2.css` is rem-based
 * off the root font size, and the theme class on `body` is what selects Foundry's light/dark
 * chrome variables, so both have to be set before the frame is measured.
 *
 * @param {object} [options] Page options.
 * @param {string} [options.systemId] Game system id, for the `system-<id>` body class.
 * @param {'light'|'dark'} [options.colorScheme] Which Foundry chrome theme to render.
 */
export function configureLabPage({ systemId = 'dnd5e', colorScheme = 'light' } = {}) {
  document.documentElement.style.fontSize = `${FOUNDRY_CHROME_SPEC.rootFontSizePx}px`;
  document.body.className = [...FOUNDRY_CHROME_SPEC.bodyClasses, `system-${systemId}`, `theme-${colorScheme}`].join(' ');
  for (const [name, value] of Object.entries(FOUNDRY_CHROME_SPEC.bodyStyleVars)) {
    document.body.style.setProperty(name, value);
  }
}

function localizeControlLabels(localize) {
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
 * `_updatePosition` clamps width/height to the element's COMPUTED min/max box and then centres
 * the window, and `#applyPosition` writes the result inline. Reproducing the clamp rather than
 * writing the declared size straight to the style is the whole point: it is what surfaces a
 * `max-height` collision instead of hiding one.
 *
 * @param {HTMLElement} frame The `.application` element, already in the document.
 * @param {{width: number, height: number}} position Requested size.
 * @returns {{width: number, height: number, left: number, top: number}} The applied position.
 */
function applyPosition(frame, position) {
  const computed = globalThis.getComputedStyle(frame);
  const parseDimension = (value, relativeTo) => {
    if (!value || value === 'none') return null;
    if (value.endsWith('%')) return (Number.parseFloat(value) / 100) * relativeTo;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const { clientWidth, clientHeight } = document.documentElement;
  const minWidth = parseDimension(computed.minWidth, clientWidth) ?? 0;
  const maxWidth = parseDimension(computed.maxWidth, clientWidth) ?? clientWidth;
  const minHeight = parseDimension(computed.minHeight, clientHeight) ?? 0;
  const maxHeight = parseDimension(computed.maxHeight, clientHeight) ?? clientHeight;

  const width = Math.min(Math.max(position.width, minWidth), maxWidth);
  const height = Math.min(Math.max(position.height, minHeight), maxHeight);
  const left = Math.min(Math.max((clientWidth - width) / 2, 0), Math.max(clientWidth - width, 0));
  const top = Math.min(Math.max((clientHeight - height) / 2, 0), Math.max(clientHeight - height, 0));

  Object.assign(frame.style, {
    width: `${width}px`,
    height: `${height}px`,
    left: `${left}px`,
    top: `${top}px`,
  });
  return { width, height, left, top };
}

/**
 * Build one Fabricate application window and append it to the document.
 *
 * @param {object} options Frame options.
 * @param {string} options.appId Key of {@link APP_CHROME}.
 * @param {(key: string) => string} [options.localize] i18n resolver for the title and labels.
 * @param {{width: number, height: number}} [options.position] Override the declared window size.
 * @returns {{frame: HTMLElement, content: HTMLElement, applied: object, declared: object}}
 */
export function buildAppWindow({ appId, localize, position }) {
  const app = APP_CHROME[appId];
  if (!app) throw new Error(`unknown app chrome id: ${appId}`);
  const declared = position ?? app.position;

  // _renderFrame
  const frame = document.createElement(app.tag);
  frame.id = app.id;
  frame.className = FOUNDRY_CHROME_SPEC.frameClassesFor(app).join(' ');
  frame.setAttribute('data-view-lab-frame', appId);
  frame.innerHTML = FOUNDRY_CHROME_SPEC.frameInnerHtml(localizeControlLabels(localize));
  const content = document.createElement(app.window.contentTag);
  content.classList.add('window-content', ...app.window.contentClasses);
  frame.appendChild(content);
  if (app.window.resizable) frame.insertAdjacentHTML('beforeend', FOUNDRY_CHROME_SPEC.resizeHandleHtml);

  // _updateFrame. `_configureRenderOptions` collapses whitespace in the title before it is set.
  const title = frame.querySelector('.window-title');
  const rawTitle = typeof localize === 'function' ? localize(app.window.title) : app.window.title;
  title.innerText = String(rawTitle).replace(/\s+/g, ' ').trim();
  frame.querySelector('.window-icon').className = FOUNDRY_CHROME_SPEC.windowIconClass(app.window.icon);
  frame.querySelector('.controls-dropdown').replaceChildren();
  // Fabricate declares no header controls, so Foundry hides the ellipsis button. A frame that
  // shows one is visibly wrong against any real screenshot.
  frame
    .querySelector('button[data-action=toggleControls]')
    .classList.toggle('hidden', app.window.controls.length === 0);

  document.body.appendChild(frame);
  const applied = applyPosition(frame, declared);
  return { frame, content, applied, declared };
}

/**
 * Fail loudly when the rendered window is not the size it claims to be. `_updatePosition` clamps
 * without any signal, so a viewport 20px too short yields a green run and a wrong screenshot —
 * the worst failure mode this harness has.
 *
 * @param {{frame: HTMLElement, applied: object, declared: object}} window A built window.
 * @throws {Error} When the applied box differs from the declared one.
 */
export function assertWindowGeometry({ frame, applied, declared }) {
  const rect = frame.getBoundingClientRect();
  const problems = [];
  if (Math.round(applied.width) !== declared.width || Math.round(rect.width) !== declared.width) {
    problems.push(`width ${Math.round(rect.width)} (applied ${applied.width}) != declared ${declared.width}`);
  }
  if (Math.round(applied.height) !== declared.height || Math.round(rect.height) !== declared.height) {
    problems.push(`height ${Math.round(rect.height)} (applied ${applied.height}) != declared ${declared.height}`);
  }
  if (problems.length === 0) return;
  const ceiling = FOUNDRY_CHROME_SPEC.maxHeightFor(document.documentElement.clientHeight);
  throw new Error(
    `window geometry was clamped: ${problems.join('; ')}. ` +
      `Viewport is ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}, ` +
      `so .application max-height resolves to ${ceiling}px. Give the browser a taller viewport.`
  );
}

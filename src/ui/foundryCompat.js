export function getDragEventData(event) {
  // Strategy 1: Foundry v13+ API (evaluated at call time, not module load time)
  const impl = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  if (impl?.getDragEventData) {
    return impl.getDragEventData(event);
  }

  // Strategy 2: Parse text/plain from dataTransfer (universal Foundry format)
  try {
    const raw = event?.dataTransfer?.getData?.('text/plain');
    if (raw) return JSON.parse(raw);
  } catch (_) {
    // Not valid JSON -- fall through
  }

  return null;
}

export async function confirmDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm(options);
}

function normalizeDialogOptions(options = {}) {
  const normalized = foundry.utils.deepClone(options);

  if (normalized.title && !normalized.window?.title) {
    normalized.window = {
      ...(normalized.window || {}),
      title: normalized.title
    };
  }

  if (normalized.buttons && !Array.isArray(normalized.buttons)) {
    const legacyButtons = normalized.buttons;
    const buttonEntries = Object.entries(legacyButtons);
    const jq = globalThis.jQuery ?? globalThis.$;

    normalized.buttons = buttonEntries.map(([action, config], index) => {
      const callback = config?.callback;
      return {
        action,
        label: config?.label ?? action,
        icon: config?.icon,
        default: normalized.default === action || (!normalized.default && index === 0),
        callback: (...args) => {
          if (typeof callback !== 'function') return;
          const dialog = args[2];
          const element = dialog?.element ?? null;
          const html = typeof jq === 'function' && element ? jq(element) : element;
          return callback(html);
        }
      };
    });
  }

  if (!Array.isArray(normalized.buttons) || normalized.buttons.length === 0) {
    normalized.buttons = [{ action: 'close', label: 'Close', default: true }];
  }

  return normalized;
}

export function renderDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return null;
  const dialog = new DialogV2(normalizeDialogOptions(options));
  dialog.render(true);
  return dialog;
}

/**
 * Render a multi-choice dialog and resolve to the chosen action string.
 * Each choice is `{ action, label, icon, default }`; the dialog closing
 * (or DialogV2 being unavailable) resolves to `'cancel'`.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.content - HTML content
 * @param {Array<{action: string, label?: string, icon?: string, default?: boolean}>} options.choices
 * @param {string} [options.defaultAction] - action whose button is the default
 * @returns {Promise<string>} the chosen action, or 'cancel'
 */
function escapeDialogHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render a labelled, keyboard-operable single-selection dialog and resolve to the
 * chosen option value (or `null` on cancel / when DialogV2 is unavailable). This
 * is a distinct seam from `confirmDialog` (a yes/no primitive that cannot host a
 * selection) — used by the capped-cookbook recipe learn picker (issue 511).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.content] - plain-text lead paragraph
 * @param {Array<{value: string, label: string}>} [options.options]
 * @param {string} [options.selectLabel]
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @returns {Promise<string|null>} the chosen option value, or null
 */
export function selectDialog({
  title,
  content = '',
  options = [],
  selectLabel = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel'
} = {}) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2 || options.length === 0) return Promise.resolve(null);

  const selectId = 'fabricate-recipe-select';
  const optionMarkup = options
    .map((option, index) =>
      `<option value="${escapeDialogHtml(option.value)}"${index === 0 ? ' selected' : ''}>${escapeDialogHtml(option.label)}</option>`
    )
    .join('');
  const dialogContent = `
    ${content ? `<p>${escapeDialogHtml(content)}</p>` : ''}
    <div class="form-group">
      <label for="${selectId}">${escapeDialogHtml(selectLabel)}</label>
      <select id="${selectId}" name="recipe" aria-label="${escapeDialogHtml(selectLabel)}">${optionMarkup}</select>
    </div>`;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const readSelection = (button, dialog) => {
      const root = dialog?.element || button?.form || button?.closest?.('form');
      const select = root?.querySelector?.(`#${selectId}`);
      return select?.value ?? options[0]?.value ?? null;
    };
    const dialog = renderDialog({
      window: { title },
      content: dialogContent,
      buttons: [
        {
          action: 'confirm',
          label: confirmLabel,
          default: true,
          callback: (event, button, instance) => settle(readSelection(button, instance))
        },
        { action: 'cancel', label: cancelLabel, callback: () => settle(null) }
      ],
      close: () => settle(null)
    });
    if (!dialog) settle(null);
  });
}

export function choiceDialog({ title, content, choices = [], defaultAction } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const buttons = choices.map((choice, index) => ({
      action: choice.action,
      label: choice.label ?? choice.action,
      icon: choice.icon,
      default: defaultAction ? choice.action === defaultAction : index === 0,
      callback: () => settle(choice.action)
    }));
    const dialog = renderDialog({
      window: { title },
      content,
      buttons,
      close: () => settle('cancel')
    });
    if (!dialog) settle('cancel');
  });
}

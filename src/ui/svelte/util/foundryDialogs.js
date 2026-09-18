// Namespaced so `styles/fabricate.css` can style the dialog without bleeding into another module's
// DialogV2, and wide enough that a multi-button confirm row is not crushed by DialogV2's default.
const FABRICATE_DIALOG_CLASSES = Object.freeze(['fabricate', 'fabricate-dialog']);
const FABRICATE_DIALOG_DEFAULT_WIDTH = 420;

function normalizeDialogOptions(options = {}) {
  const deepClone = globalThis.foundry?.utils?.deepClone ?? ((o) => JSON.parse(JSON.stringify(o)));
  const normalized = deepClone(options);

  // Idempotent, so the namespaced CSS applies however often this runs.
  const existingClasses = Array.isArray(normalized.classes) ? normalized.classes : [];
  normalized.classes = [...new Set([...existingClasses, ...FABRICATE_DIALOG_CLASSES])];

  // An explicit caller width always wins.
  normalized.position = {
    ...normalized.position,
    width: normalized.position?.width ?? FABRICATE_DIALOG_DEFAULT_WIDTH,
  };

  if (normalized.title && !normalized.window?.title) {
    normalized.window = {
      ...normalized.window,
      title: normalized.title,
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
        },
      };
    });
  }

  if (!Array.isArray(normalized.buttons) || normalized.buttons.length === 0) {
    normalized.buttons = [{ action: 'close', label: 'Close', default: true }];
  }

  return normalized;
}

// The shape `DialogV2.confirm` and `ApplicationV2` actually READ, shared with
// `src/ui/foundryCompat.js` so the manager's confirm seam and the player's cannot drift (issue
// 1154). Two mappings, both load-bearing: `title` becomes `window.title`, because a top-level
// `title` is read by NOTHING and every manager confirm used to render an empty title bar; and a
// FUNCTION `yes`/`no` becomes `{ callback }`, because `DialogV2.confirm` merges each over a default
// button with `mergeObject`, which iterates `Object.keys` — `[]` for a function — so a bare
// `yes: () => 'x'` silently keeps the default label AND the default `() => true` callback.
// Deliberately NOT routed through `normalizeDialogOptions`: that injects a `close` button when
// `buttons` is absent, and `DialogV2.confirm` unshifts its own pair, giving a THREE-button confirm.
// Returns a fresh bag; the caller's object is never mutated.
export function normalizeConfirmOptions(options) {
  const normalized = { ...options };
  if (normalized.title && !normalized.window?.title) {
    normalized.window = { ...normalized.window, title: normalized.title };
  }
  if (typeof normalized.yes === 'function') normalized.yes = { callback: normalized.yes };
  if (typeof normalized.no === 'function') normalized.no = { callback: normalized.no };
  return normalized;
}

export async function confirmDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm(normalizeConfirmOptions(options));
}

export function renderDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return null;
  const dialog = new DialogV2(normalizeDialogOptions(options));
  dialog.render(true);
  return dialog;
}

/**
 * Render a multi-choice dialog and resolve to the chosen action string.
 * Each choice is `{ action, label, icon, default }`; the dialog closing
 * (or DialogV2 being unavailable) resolves to `'cancel'`.
 */
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
      callback: () => settle(choice.action),
    }));
    const dialog = renderDialog({
      window: { title },
      content,
      buttons,
      close: () => settle('cancel'),
    });
    if (!dialog) settle('cancel');
  });
}

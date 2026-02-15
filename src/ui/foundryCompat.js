export const TextEditorCompat = (() => {
  const impl = foundry.applications?.ux?.TextEditor?.implementation;
  return impl ?? globalThis.TextEditor ?? null;
})();

export function getDragEventData(event) {
  if (TextEditorCompat?.getDragEventData) {
    return TextEditorCompat.getDragEventData(event);
  }
  return null;
}

export async function confirmDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    return DialogV2.confirm(options);
  }
  const DialogLegacy = globalThis.Dialog;
  if (DialogLegacy?.confirm) {
    return DialogLegacy.confirm(options);
  }
  return false;
}

export function renderDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  const DialogClass = DialogV2 ?? globalThis.Dialog;
  if (!DialogClass) return null;
  const dialog = new DialogClass(options);
  dialog.render(true);
  return dialog;
}

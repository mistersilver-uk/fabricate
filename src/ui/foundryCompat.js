export const TextEditorCompat = foundry.applications?.ux?.TextEditor?.implementation ?? null;

export function getDragEventData(event) {
  if (TextEditorCompat?.getDragEventData) {
    return TextEditorCompat.getDragEventData(event);
  }
  return null;
}

export async function confirmDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm(options);
}

export function renderDialog(options) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return null;
  const dialog = new DialogV2(options);
  dialog.render(true);
  return dialog;
}

/**
 * The thin `DialogV2` edge for the on-drop GM environment pick. `environmentResolution.js` decides
 * WHEN it is needed; cancelling or closing ABORTS the spawn, which the caller reads as a null.
 * The options and copy are passed in and the dialog factory is read off `globalThis.foundry`, so
 * the resolution logic stays unit-testable.
 */

/**
 * Prompt the GM for a gathering environment. Null when they cancel or close, or when the system
 * has no environments to offer.
 */
export async function promptDropEnvironment({
  environments = [],
  defaultEnvironmentId = '',
  localize,
} = {}) {
  const list = (Array.isArray(environments) ? environments : []).filter((env) => env && env.id);
  if (list.length === 0) return null;

  const t = typeof localize === 'function' ? localize : (_k, fallback) => fallback;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.prompt) return null;

  const selected = list.some((env) => env.id === defaultEnvironmentId)
    ? defaultEnvironmentId
    : list[0].id;
  const options = list
    .map((env) => {
      const isSelected = env.id === selected ? ' selected' : '';
      return `<option value="${escapeHtml(env.id)}"${isSelected}>${escapeHtml(env.name || env.id)}</option>`;
    })
    .join('');
  const label = t('FABRICATE.Canvas.Interactable.EnvironmentDialogLabel', 'Environment');
  const content = `<div class="fabricate-canvas-env-dialog">
    <p>${escapeHtml(t('FABRICATE.Canvas.Interactable.EnvironmentDialogHint', 'Choose the gathering environment for this resource node.'))}</p>
    <label>${escapeHtml(label)}
      <select name="environmentId">${options}</select>
    </label>
    <p class="fabricate-canvas-env-dialog-modifier-hint">${escapeHtml(t('FABRICATE.Canvas.Interactable.DropModifierHint', 'Hold Alt while dropping to always choose the environment manually.'))}</p>
  </div>`;

  try {
    const result = await DialogV2.prompt({
      window: {
        title: t(
          'FABRICATE.Canvas.Interactable.EnvironmentDialogTitle',
          'Resolve gathering environment'
        ),
      },
      content,
      ok: {
        label: t('FABRICATE.Canvas.Interactable.EnvironmentDialogConfirm', 'Place node'),
        callback: (_event, button) => button?.form?.elements?.environmentId?.value ?? null,
      },
      rejectClose: false,
    });
    const id = typeof result === 'string' ? result.trim() : '';
    return id || null;
  } catch {
    // Cancel / close ⇒ abort the spawn.
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

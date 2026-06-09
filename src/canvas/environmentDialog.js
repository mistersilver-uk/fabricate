/**
 * Thin Foundry edge: the on-drop GM environment-pick dialog (Foundry `DialogV2`).
 *
 * The env-resolution precedence (`environmentResolution.js`) decides WHEN a dialog
 * is needed; this module presents it. The GM picks an environment from a select;
 * cancelling (or closing) the dialog ABORTS the spawn — the caller treats a null
 * return as "do not spawn".
 *
 * Pure aside from the `DialogV2` call: the option list + the localized copy are
 * passed in, and the dialog factory is read off `globalThis.foundry` so this
 * stays isolated and the caller's resolution logic remains unit-testable.
 */

/**
 * Prompt the GM to pick a gathering environment for a dropped task tile.
 *
 * @param {object} args
 * @param {Array<{ id: string, name: string }>} args.environments  Selectable
 *   environments (same crafting system as the task).
 * @param {string} [args.defaultEnvironmentId]  Pre-selected option, if any.
 * @param {(key: string, fallback?: string) => string} [args.localize]  i18n seam.
 * @returns {Promise<string|null>}  The chosen environment id, or null when the GM
 *   cancels / closes the dialog (abort the spawn) or no environments exist.
 */
export async function promptDropEnvironment({ environments = [], defaultEnvironmentId = '', localize } = {}) {
  const list = (Array.isArray(environments) ? environments : []).filter((env) => env && env.id);
  if (list.length === 0) return null;

  const t = typeof localize === 'function' ? localize : ((_k, fallback) => fallback);
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.prompt) return null;

  const selected = list.some((env) => env.id === defaultEnvironmentId) ? defaultEnvironmentId : list[0].id;
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
      window: { title: t('FABRICATE.Canvas.Interactable.EnvironmentDialogTitle', 'Resolve gathering environment') },
      content,
      ok: {
        label: t('FABRICATE.Canvas.Interactable.EnvironmentDialogConfirm', 'Place node'),
        callback: (_event, button) => button?.form?.elements?.environmentId?.value ?? null
      },
      rejectClose: false
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

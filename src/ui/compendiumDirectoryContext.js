/**
 * Compendium Directory bulk-import context-menu integration.
 *
 * This module mirrors the pure-helper style of `itemsDirectoryButtons.js`: the
 * option builder imports no Foundry runtime globals (`game`, `ui`, `Hooks`,
 * `CONFIG`) and takes every Foundry-touching collaborator by injection, so it is
 * unit-testable under happy-dom. The one Foundry-touching function in this module
 * (`promptSelectCraftingSystem`) is the injected picker collaborator and is not
 * unit-tested.
 */

/**
 * Dataset key that carries the right-clicked compendium's collection id on the
 * Compendium Directory entry element (`data-pack`). Named here so the live
 * runtime key is a single, visibly-diffed source of truth.
 *
 * @type {string}
 */
export const PACK_DATASET_KEY = 'pack';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

/**
 * Build the GM-only Compendium Directory context-menu entry that imports every
 * eligible Item from the right-clicked compendium into a chosen crafting system.
 *
 * Returns the MODERN Foundry `ContextMenuEntry` shape `{ label, icon, visible,
 * onClick }` (NOT the deprecated `{ name, condition, callback }`). `visible`
 * returns a boolean; `onClick` receives `(event, target)` with the target
 * SECOND. The handler delegates entirely to `importPack` and renders its
 * returned summary, so de-duplication and update/skip reporting are preserved by
 * construction — no counting logic lives here.
 *
 * @param {object} deps Injected collaborators.
 * @param {(key: string, data?: object) => string} deps.localize Localizer.
 * @param {() => boolean} deps.isGM True when the current user is a GM.
 * @param {(packId: string) => boolean} deps.isItemPack True when the pack holds Items.
 * @param {(packId: string) => string} deps.getPackName Human-readable pack name.
 * @param {() => Array<{id: string, name?: string}>} deps.getSystems Crafting systems.
 * @param {(systems: Array, options: object) => Promise<string|null>} deps.promptSelectSystem
 *   Opens the target-system picker; resolves the chosen system id or null on cancel.
 * @param {(systemId: string, packId: string) => Promise<object>} deps.importPack
 *   Bulk-import primitive (`CraftingSystemManager.addItemsFromPack`).
 * @param {{info: Function, warn: Function}} deps.notify Notification sink.
 * @returns {{label: string, icon: string, visible: Function, onClick: Function}}
 */
export function buildCompendiumImportContextOption({
  localize,
  isGM,
  isItemPack,
  getPackName,
  getSystems,
  promptSelectSystem,
  importPack,
  notify
} = {}) {
  return {
    label: localize('FABRICATE.Admin.Items.CompendiumImportContextLabel'),
    icon: '<i class="fa-solid fa-hammer"></i>',
    visible: (target) => Boolean(isGM?.() && isItemPack?.(target?.dataset?.[PACK_DATASET_KEY])),
    onClick: async (event, target) => {
      const packId = target?.dataset?.[PACK_DATASET_KEY];
      if (!packId) return;
      const packName = getPackName?.(packId) ?? packId;

      const systems = getSystems?.() ?? [];
      if (systems.length === 0) {
        notify?.warn?.(localize('FABRICATE.Admin.Items.CompendiumImportNoSystems'));
        return;
      }

      // Always open the picker so the Import button is the deliberate commit —
      // even for a single system it is preselected, never auto-imported. A null
      // (cancel) return aborts without touching importPack.
      const systemId = await promptSelectSystem(systems, { localize, packName });
      if (!systemId) return;

      const result = await importPack(systemId, packId);
      if (!result || result.total === 0) {
        notify?.info?.(localize('FABRICATE.Admin.Items.CompendiumImportNoItems', { name: packName }));
        return;
      }

      notify?.info?.(localize('FABRICATE.Admin.Items.CompendiumImportSummary', {
        added: result.added,
        updated: result.updated,
        skipped: result.skipped,
        total: result.total,
        name: packName
      }));

      if (Array.isArray(result.sourceFallbacks) && result.sourceFallbacks.length > 0) {
        notify?.warn?.(localize('FABRICATE.Admin.Items.SourceFallbackSummary', {
          count: result.sourceFallbacks.length
        }));
      }
    }
  };
}

/**
 * Foundry picker collaborator: prompt the GM to choose a target crafting system
 * for a compendium import via a `DialogV2` select. Mirrors the DialogV2 usage in
 * `renderSystemImportDialog` (`SvelteCraftingSystemManagerApp.svelte.js`). The
 * sole system is preselected when exactly one exists so the Import button is
 * still the deliberate commit. Resolves to the chosen system id, or null on
 * cancel/close.
 *
 * This is the single Foundry-touching function in this module; it is injected
 * into the option builder (as `promptSelectSystem`) and is not unit-tested.
 *
 * @param {Array<{id: string, name?: string}>} systems Available crafting systems.
 * @param {object} options
 * @param {(key: string, data?: object) => string} options.localize Localizer.
 * @param {string} [options.packName] Human-readable compendium name for the prompt.
 * @returns {Promise<string|null>} Chosen system id, or null.
 */
export async function promptSelectCraftingSystem(systems, { localize, packName = '' } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return null;

  const list = Array.isArray(systems) ? systems : [];
  if (list.length === 0) return null;

  const preselectedId = list.length === 1 ? list[0]?.id : null;
  const optionsHtml = list
    .map((system) => {
      const id = escapeHtml(system?.id ?? '');
      const name = escapeHtml(system?.name ?? system?.id ?? '');
      const selected = system?.id === preselectedId ? ' selected' : '';
      return `<option value="${id}"${selected}>${name}</option>`;
    })
    .join('');

  const prompt = localize('FABRICATE.Admin.Items.CompendiumImportDialogPrompt', { name: packName ?? '' });
  const content = `
    <div class="fabricate-compendium-import">
      <p>${escapeHtml(prompt)}</p>
      <select name="systemId" style="width: 100%;">${optionsHtml}</select>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: localize('FABRICATE.Admin.Items.CompendiumImportDialogTitle') },
    content,
    buttons: [
      {
        action: 'import',
        label: localize('FABRICATE.Admin.Items.CompendiumImportConfirm'),
        default: true,
        callback: (event, button) => button?.form?.querySelector('select[name="systemId"]')?.value || null
      },
      {
        action: 'cancel',
        label: localize('FABRICATE.Admin.Items.CompendiumImportCancel')
      }
    ],
    rejectClose: false
  });

  return result && result !== 'cancel' ? result : null;
}

// Compendium Directory bulk-import context menu. The option builder imports no Foundry runtime
// global and takes every Foundry-touching collaborator by injection, so it is unit-testable;
// `promptSelectCraftingSystem` below is that injected picker, and is the one Foundry-touching
// function here.

// The right-clicked entry's `data-pack`, named so the live runtime key is one visibly-diffed source.
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

// The MODERN `ContextMenuEntry` shape `{ label, icon, visible, onClick }`, not the deprecated
// `{ name, condition, callback }`; `onClick` receives `(event, target)` with the target SECOND.
// The handler delegates entirely to `importPack` and renders its summary, so de-duplication and
// update/skip reporting are preserved by construction — no counting logic lives here.
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

      // The picker always opens, so the Import button is the deliberate commit: a lone system is
      // preselected, never auto-imported, and a null return aborts without touching `importPack`.
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

// The `DialogV2` picker, mirroring `renderSystemImportDialog`'s usage. Resolves the chosen system
// id, or null on cancel or close.
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

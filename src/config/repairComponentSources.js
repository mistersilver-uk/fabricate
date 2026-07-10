/**
 * GM maintenance action + settings-menu button ("Repair item data") that reconciles
 * component AND recipe-item (book/scroll) source items so craft-time and knowledge
 * matching is durable: it strips a transitive `_stats.duplicateSource` (so future
 * inventory copies link to the source item's own identity, not a template it was copied
 * from), stamps the durable `flags.fabricate.componentId` / `recipeItemDefinitionId`,
 * and re-points owned copies that a duplicate mislabelled.
 *
 * Foundry globals (`foundry.applications.api.*`, `game`, `ui`) are referenced lazily
 * inside functions so importing this module never evaluates a `class extends
 * foundry…` at load time — keeping it safe to import under the test harness.
 */

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a settings
// ↔ repair import cycle (this module registers a menu into that settings namespace).
const NAMESPACE = 'fabricate';
const REPAIR_MENU_KEY = 'repairComponentSources';

function localize(key, data) {
  const i18n = globalThis.game?.i18n;
  if (data) return i18n?.format?.(key, data) ?? key;
  return i18n?.localize?.(key) ?? key;
}

/**
 * Run the repair and toast the result. Returns the summary (or null when the
 * crafting system manager is unavailable).
 */
export async function runComponentSourceRepair() {
  const manager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
  if (!manager || typeof manager.repairComponentSourceFlags !== 'function') {
    globalThis.ui?.notifications?.error?.(
      localize('FABRICATE.Settings.RepairComponentSources.Unavailable')
    );
    return null;
  }

  try {
    const summary = await manager.repairComponentSourceFlags();
    globalThis.ui?.notifications?.info?.(
      localize('FABRICATE.Settings.RepairComponentSources.Success', summary)
    );
    // Secondary notices for the name-assisted re-point outcomes (issue 555). The
    // reversible audit records live on `summary.repointLog` and are logged for the GM.
    if (summary?.repointed > 0) {
      if (Array.isArray(summary.repointLog) && summary.repointLog.length > 0) {
        console.info('Fabricate | Repair item data re-point audit', summary.repointLog);
      }
      globalThis.ui?.notifications?.info?.(
        localize('FABRICATE.Settings.RepairComponentSources.Repointed', summary)
      );
    }
    if (summary?.skippedAmbiguous > 0) {
      globalThis.ui?.notifications?.warn?.(
        localize('FABRICATE.Settings.RepairComponentSources.Ambiguous', summary)
      );
    }
    return summary;
  } catch (error) {
    console.error('Fabricate | Component source repair failed', error);
    globalThis.ui?.notifications?.error?.(
      localize('FABRICATE.Settings.RepairComponentSources.Failed')
    );
    return null;
  }
}

/**
 * Confirm with the GM (DialogV2) then run the repair. Falls back to running
 * directly when DialogV2 is unavailable.
 */
export async function openRepairComponentSourcesDialog() {
  if (!globalThis.game?.user?.isGM) return;

  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) {
    await runComponentSourceRepair();
    return;
  }

  const confirmed = await DialogV2.wait({
    window: { title: localize('FABRICATE.Settings.RepairComponentSources.Title') },
    content: `<p>${localize('FABRICATE.Settings.RepairComponentSources.Body')}</p>`,
    rejectClose: false,
    buttons: [
      {
        action: 'repair',
        default: true,
        label: localize('FABRICATE.Settings.RepairComponentSources.Confirm'),
        callback: () => true,
      },
      {
        action: 'cancel',
        label: localize('FABRICATE.Settings.RepairComponentSources.Cancel'),
        callback: () => false,
      },
    ],
  }).catch(() => false);

  if (confirmed === true) await runComponentSourceRepair();
}

/**
 * Register the "Repair component sources" button into Fabricate's module settings
 * (the same panel as the theme selector). No-op when Foundry's settings/menu API is
 * unavailable (e.g. under the test harness).
 */
export function registerRepairComponentSourcesMenu() {
  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!ApplicationV2 || typeof globalThis.game?.settings?.registerMenu !== 'function') return;

  // Defined lazily so `extends ApplicationV2` only evaluates when Foundry is present.
  // Overriding render() turns the menu button into a direct action (open the confirm
  // dialog) rather than opening a window.
  class RepairComponentSourcesMenu extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'fabricate-repair-component-sources' };

    async render() {
      await openRepairComponentSourcesDialog();
      return this;
    }
  }

  globalThis.game.settings.registerMenu(NAMESPACE, REPAIR_MENU_KEY, {
    name: 'FABRICATE.Settings.RepairComponentSources.Name',
    label: 'FABRICATE.Settings.RepairComponentSources.Label',
    hint: 'FABRICATE.Settings.RepairComponentSources.Hint',
    icon: 'fas fa-wrench',
    type: RepairComponentSourcesMenu,
    restricted: true,
  });
}

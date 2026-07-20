/**
 * GM maintenance action + settings-menu button ("Repair Item Data") that reconciles
 * EVERY PROJECTION of a definition's resolved source document — durable identity and
 * derived display snapshots alike.
 *
 * Identity: it strips a transitive `_stats.duplicateSource` (so future inventory copies
 * link to the source item's own identity, not a template it was copied from), stamps the
 * durable `flags.fabricate.componentId` / `recipeItemDefinitionId`, and re-points owned
 * copies that a duplicate mislabelled.
 *
 * Descriptions (issue 800): each component and recipe-item definition resolves its own
 * source reference — including sources in LOCKED system/module compendiums — and its
 * stored description is refreshed to the enricher-resolved plain text, so a content link
 * reads as the referenced item's name instead of raw `@UUID[…]` directive text.
 *
 * Foundry globals (`foundry.applications.api.*`, `game`, `ui`) are referenced lazily
 * inside functions so importing this module never evaluates a `class extends
 * foundry…` at load time — keeping it safe to import under the test harness.
 */

import { hasUnresolvedDirectives } from '../utils/plainTextDescription.js';

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a settings
// ↔ repair import cycle (this module registers a menu into that settings namespace).
const NAMESPACE = 'fabricate';
const REPAIR_MENU_KEY = 'repairItemData';

function localize(key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (data) return i18n?.format?.(key, data) ?? key;
  return i18n?.localize?.(key) ?? key;
}

/**
 * Run the repair and toast the result. Returns the summary (or null when the
 * crafting system manager is unavailable).
 */
/**
 * Toast the description leg's outcome. Silent only when nothing was attempted.
 *
 * @param {{refreshed:number, unchanged:number, skipped:number, skippedUnresolved:number, skippedEmpty:number}|undefined} descriptions
 */
function reportDescriptionOutcome(descriptions) {
  if (!descriptions) return;
  const { refreshed = 0, skipped = 0 } = descriptions;
  if (refreshed > 0) {
    globalThis.ui?.notifications?.info?.(
      localize('FABRICATE.Settings.RepairItemData.DescriptionsRefreshed', descriptions)
    );
    return;
  }
  if (skipped > 0) {
    globalThis.ui?.notifications?.warn?.(
      localize('FABRICATE.Settings.RepairItemData.DescriptionsNoneRefreshed', descriptions)
    );
  }
}

export async function runItemDataRepair() {
  const manager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
  if (!manager || typeof manager.repairItemData !== 'function') {
    globalThis.ui?.notifications?.error?.(
      localize('FABRICATE.Settings.RepairItemData.Unavailable')
    );
    return null;
  }

  try {
    const summary = await manager.repairItemData();
    globalThis.ui?.notifications?.info?.(
      localize('FABRICATE.Settings.RepairItemData.Success', summary)
    );
    // Secondary notices for the name-assisted re-point outcomes (issue 555). The
    // reversible audit records live on `summary.repointLog` and are logged for the GM.
    if (summary?.repointed > 0) {
      if (Array.isArray(summary.repointLog) && summary.repointLog.length > 0) {
        console.info('Fabricate | Repair item data re-point audit', summary.repointLog);
      }
      globalThis.ui?.notifications?.info?.(
        localize('FABRICATE.Settings.RepairItemData.Repointed', summary)
      );
    }
    if (summary?.skippedAmbiguous > 0) {
      globalThis.ui?.notifications?.warn?.(
        localize('FABRICATE.Settings.RepairItemData.Ambiguous', summary)
      );
    }
    // Description refresh outcome (issue 800), reported separately from the identity
    // counts. The GM's consent for it is obtained up front in the Hint and the
    // confirmation Body — this line reports what happened, it does not stand in for
    // asking.
    //
    // Reported whenever ANYTHING was attempted, not only on success. A GM sent here by
    // the startup notice whose definitions all land in `skipped` would otherwise learn
    // nothing, run it again next login, and be told the same thing forever — a nag loop
    // with no exit. The failure branch names the cause so the loop can actually end.
    reportDescriptionOutcome(summary?.descriptions);
    return summary;
  } catch (error) {
    console.error('Fabricate | Item data repair failed', error);
    globalThis.ui?.notifications?.error?.(localize('FABRICATE.Settings.RepairItemData.Failed'));
    return null;
  }
}

/**
 * Confirm with the GM (DialogV2) then run the repair. Falls back to running
 * directly when DialogV2 is unavailable.
 */
export async function openRepairItemDataDialog() {
  if (!globalThis.game?.user?.isGM) return;

  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) {
    await runItemDataRepair();
    return;
  }

  const confirmed = await DialogV2.wait({
    window: { title: localize('FABRICATE.Settings.RepairItemData.Title') },
    // Two paragraphs, not one: the consent-bearing half ("REPLACES … will be
    // overwritten") is its own visual unit rather than a clause buried at the end of a
    // ninety-word block the GM has already stopped reading.
    content:
      `<p>${localize('FABRICATE.Settings.RepairItemData.BodyIdentity')}</p>` +
      `<p>${localize('FABRICATE.Settings.RepairItemData.BodyDescriptions')}</p>`,
    rejectClose: false,
    buttons: [
      {
        action: 'repair',
        default: true,
        label: localize('FABRICATE.Settings.RepairItemData.Confirm'),
        callback: () => true,
      },
      {
        action: 'cancel',
        label: localize('FABRICATE.Settings.RepairItemData.Cancel'),
        callback: () => false,
      },
    ],
  }).catch(() => false);

  if (confirmed === true) await runItemDataRepair();
}

/**
 * How many stored component / recipe-item descriptions still carry an unresolved
 * enricher directive.
 *
 * Pure and synchronous: it reads descriptions already in memory and resolves no
 * documents. Components and recipe-item definitions only — the same population the
 * repair's description leg covers.
 *
 * @param {Array<object>} systems
 * @returns {number}
 */
export function countUnresolvedDirectiveDescriptions(systems = []) {
  let count = 0;
  for (const system of systems) {
    for (const bucket of ['components', 'recipeItemDefinitions']) {
      for (const definition of system?.[bucket] || []) {
        if (hasUnresolvedDirectives(definition?.description)) count += 1;
      }
    }
  }
  return count;
}

/**
 * GM-only startup cue for a world whose descriptions predate write-time resolution.
 *
 * Without it the affected GM has zero signal: they see raw directive text and no
 * reason to connect it to a settings button. Emits ONE notification naming the path
 * verbatim, and carries no "already notified" flag — after a successful repair the
 * scan finds nothing and the notice self-clears.
 *
 * This is a DETECTOR, not a flattener. It never rewrites displayed text and is not on
 * the rendering path.
 *
 * @returns {number} the number of affected descriptions (0 when nothing was emitted)
 */
export function notifyUnresolvedItemDescriptions() {
  if (!globalThis.game?.user?.isGM) return 0;
  const manager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
  const systems = typeof manager?.getSystems === 'function' ? manager.getSystems() : [];
  const count = countUnresolvedDirectiveDescriptions(systems);
  if (count > 0) {
    globalThis.ui?.notifications?.info?.(
      localize('FABRICATE.Settings.RepairItemData.UnresolvedDetected', { count })
    );
  }
  return count;
}

/**
 * Register the "Repair Item Data" button into Fabricate's module settings
 * (the same panel as the theme selector). No-op when Foundry's settings/menu API is
 * unavailable (e.g. under the test harness).
 */
export function registerRepairItemDataMenu() {
  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!ApplicationV2 || typeof globalThis.game?.settings?.registerMenu !== 'function') return;

  // Defined lazily so `extends ApplicationV2` only evaluates when Foundry is present.
  // Overriding render() turns the menu button into a direct action (open the confirm
  // dialog) rather than opening a window.
  class RepairItemDataMenu extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'fabricate-repair-item-data' };

    async render() {
      await openRepairItemDataDialog();
      return this;
    }
  }

  globalThis.game.settings.registerMenu(NAMESPACE, REPAIR_MENU_KEY, {
    name: 'FABRICATE.Settings.RepairItemData.Name',
    label: 'FABRICATE.Settings.RepairItemData.Label',
    hint: 'FABRICATE.Settings.RepairItemData.Hint',
    icon: 'fas fa-wrench',
    type: RepairItemDataMenu,
    restricted: true,
  });
}

/**
 * The GM "Repair Item Data" action, reconciling every projection of a definition's source.
 * Identity: strip a transitive `_stats.duplicateSource`, stamp the durable flags, re-point
 * mislabelled owned copies. Descriptions (issue 800): re-resolve each source, locked compendiums
 * included, to plain text. Foundry globals are read lazily, so importing it evaluates no
 * `class extends foundry…`.
 */

import { hasUnresolvedDirectives } from '../utils/plainTextDescription.js';

import { registerDialogSettingsMenu } from './settingsMenu.js';

const REPAIR_MENU_KEY = 'repairItemData';

function localize(key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (data) return i18n?.format?.(key, data) ?? key;
  return i18n?.localize?.(key) ?? key;
}

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

/** `null` when the crafting system manager is unavailable. */
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
    // Secondary notices for the name-assisted re-point outcomes (issue 555).
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
    // Description refresh outcome (issue 800), reported separately from the identity counts.
    reportDescriptionOutcome(summary?.descriptions);
    return summary;
  } catch (error) {
    console.error('Fabricate | Item data repair failed', error);
    globalThis.ui?.notifications?.error?.(localize('FABRICATE.Settings.RepairItemData.Failed'));
    return null;
  }
}

export async function openRepairItemDataDialog() {
  if (!globalThis.game?.user?.isGM) return;

  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) {
    await runItemDataRepair();
    return;
  }

  const confirmed = await DialogV2.wait({
    window: { title: localize('FABRICATE.Settings.RepairItemData.Title') },
    // The consent-bearing "REPLACES" half is its own paragraph, not buried in a long block.
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

/** Stored descriptions still carrying an unresolved enricher directive. */
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

/** GM-only startup cue for a world whose descriptions predate write-time resolution. */
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

export function registerRepairItemDataMenu() {
  return registerDialogSettingsMenu({
    key: REPAIR_MENU_KEY,
    id: 'fabricate-repair-item-data',
    name: 'FABRICATE.Settings.RepairItemData.Name',
    label: 'FABRICATE.Settings.RepairItemData.Label',
    hint: 'FABRICATE.Settings.RepairItemData.Hint',
    icon: 'fas fa-wrench',
    open: () => openRepairItemDataDialog(),
  });
}

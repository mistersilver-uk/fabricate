/**
 * The three system-level mode writes of `createAdminStore`, extracted unchanged: the resolution
 * mode (which confirms the recipe migration it causes), the visibility mode, and the salvage
 * resolution mode.
 */
import { get } from 'svelte/store';

import { summarizeModeChange } from '../../../systems/migrateRecipeForModeChange.js';
import { modeChangeRefusal } from '../../../systems/resolutionModeAvailability.js';

import { modeChangeConfirmOptions } from './modeChangeConfirm.js';

export function createCraftingSettingsActions({ services, selectedSystemId, refresh }) {
  async function setResolutionMode(resolutionMode) {
    const systemManager = services.getCraftingSystemManager();
    const recipeManager = services.getRecipeManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;

    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const nextMode = String(resolutionMode || '').trim() || 'simple';
    const currentMode = system.resolutionMode || 'simple';
    if (nextMode === currentMode) return true;
    if (modeChangeRefusal(nextMode)) return false;

    // Dry-run the migration so the GM sees what is migrated, deleted and dropped before committing.
    const affectedRecipes = recipeManager?.getRecipes?.({ craftingSystemId: sysId }) || [];
    const summary = summarizeModeChange(affectedRecipes, currentMode, nextMode, system);
    const options = modeChangeConfirmOptions(summary, nextMode, services.localize);
    if (!(await services.confirmDialog(options))) return false;

    // A refused change (an active-run refusal) writes nothing; the GM sees its sentence.
    try {
      await systemManager.updateSystem(sysId, { resolutionMode: nextMode });
    } catch (error) {
      services.notify?.error?.(error?.message || 'Failed to change the resolution mode');
      await refresh();
      return false;
    }
    await refresh();
    return true;
  }

  // Flat system-level visibility strategy (issue 511). Non-destructive: unlike `setResolutionMode`,
  // switching `visibilityMode` migrates no recipes and needs no confirm — it only re-gates the
  // Crafting authoring surface.
  async function setVisibilityMode(mode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return;
    await systemManager.updateSystem(sysId, { visibilityMode: mode });
    await refresh();
  }

  // Salvage resolution mode is non-destructive: `updateSystem` runs only the inline salvage-cleanup
  // block, which reversibly disables salvage on incompatible components and deletes no recipes or
  // runs, so the confirm is salvage-accurate rather than the recipe-deletion warning.
  async function setSalvageResolutionMode(salvageResolutionMode) {
    const systemManager = services.getCraftingSystemManager();
    const sysId = get(selectedSystemId);
    if (!sysId) return false;

    const system = systemManager.getSystem(sysId);
    if (!system) return false;

    const nextMode = String(salvageResolutionMode || '').trim() || 'progressive';
    const currentMode = system.salvageResolutionMode || 'simple';
    if (nextMode === currentMode) return true;

    const localizeFn = services.localize;
    const confirmed = await services.confirmDialog({
      title:
        localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeTitle') ||
        'Change Salvage Resolution Mode?',
      content: `<p>${
        localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeContent', {
          name: system.name,
          mode: nextMode,
        }) ||
        `Changing the salvage resolution mode for ${system.name}: components incompatible with the new salvage mode will have salvage disabled.`
      }</p>`,
      yes: {
        label:
          localizeFn?.('FABRICATE.Admin.SystemSettings.SalvageResolutionModeChangeConfirm') ||
          'Change mode',
        callback: () => true,
      },
      no: { callback: () => false },
    });
    if (!confirmed) return false;

    await systemManager.updateSystem(sysId, { salvageResolutionMode: nextMode });
    await refresh();
    return true;
  }

  return { setResolutionMode, setVisibilityMode, setSalvageResolutionMode };
}

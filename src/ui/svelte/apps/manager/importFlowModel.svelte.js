import { localize, notifyWarn } from '../../util/foundryBridge.js';

// A drop import that throws reaches no other handler, so it is logged and the GM is told here.
function reportDropImportFailure(error) {
  console.error('Fabricate | Component drop import failed:', error);
  notifyWarn(localize('FABRICATE.Admin.Items.DropImportFailed'));
}

/**
 * The system import report and the folder-aware component drop that opens the mapping modal
 * before anything is imported (issues 771 and 877). `store`, `services` and `selectedSystemId`
 * are thunks, so each call reads the shell's live prop or `$derived` rather than the value it
 * held at construction.
 */
export function createImportFlowModel({ store, services, selectedSystemId } = {}) {
  let importMappingOpen = $state(false);
  let importMappingFolders = $state([]);
  // The store resolves the assembled `buildImportReportContent` output once a system import
  // completes, or null when the import was cancelled, failed, or skipped an existing system.
  let importReportContent = $state(null);

  async function importSystem() {
    importReportContent = (await store?.()?.importSystem?.()) ?? null;
  }

  async function dropComponent(data) {
    try {
      const plan = (await services?.()?.collectImportFolderGroups?.(data)) || null;
      if (plan?.groups?.length) {
        importMappingFolders = plan.groups;
        importMappingOpen = true;
        return;
      }
      // `handled` means the collector already notified (e.g. a compendium-directory folder groups
      // packs, not items) and there is nothing to import, so it never falls through to onDropItem.
      if (plan?.handled) return;
      await services?.()?.onDropItem?.(data);
    } catch (error) {
      reportDropImportFailure(error);
    }
  }

  async function commitImportFolderMapping(decisions) {
    importMappingOpen = false;
    if (!Array.isArray(decisions) || decisions.length === 0) return;
    try {
      await services?.()?.commitImportFolderMapping?.(selectedSystemId?.(), decisions);
    } catch (error) {
      reportDropImportFailure(error);
    }
  }

  return {
    get importMappingOpen() {
      return importMappingOpen;
    },
    set importMappingOpen(open) {
      importMappingOpen = open;
    },
    get importMappingFolders() {
      return importMappingFolders;
    },
    get importReportContent() {
      return importReportContent;
    },
    set importReportContent(content) {
      importReportContent = content;
    },
    importSystem,
    dropComponent,
    commitImportFolderMapping,
  };
}

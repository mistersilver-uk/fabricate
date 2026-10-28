/** The mounted-harness options for `GatheringTaskRow`, shared by the suites that read its callout chips. */
import { resolve } from 'node:path';

import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from './foundryBridgeModules.js';
import { STATUS_TONE_RAW_MODULES } from './svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** A blocked task whose reasons draw one neutral callout and one warning callout. */
export const BLOCKED_TASK = Object.freeze({
  id: 'task-1',
  name: 'Vein',
  attemptable: false,
  blockedReasons: [{ code: 'GAME_PAUSED' }, { code: 'TOOL_BLOCKED' }],
});

export const GATHERING_TASK_ROW_HARNESS = Object.freeze({
  repoRoot,
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    ...STATUS_TONE_RAW_MODULES,
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/disclosurePhrase.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/apps/gathering/gatheringBlockedReasons.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/components/ListRow.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/BandedBar.svelte',
    'src/ui/svelte/components/FillBar.svelte',
    'src/ui/svelte/apps/gathering/ChanceBar.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
});

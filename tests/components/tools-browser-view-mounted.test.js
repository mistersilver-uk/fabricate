/** The system Tool Rules toolbar across a crafting-system switch (issue 1902). */
import { resolve } from 'node:path';
import { after, afterEach, before } from 'node:test';

import { describeBrowserListState } from '../helpers/browserListStateCases.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  PAGINATION_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  TOOL_TREE_COMPILED_MODULES,
  TOOL_TREE_RAW_MODULES,
  WORLD_TOOL_SCOPE_RAW_MODULES,
} from '../helpers/toolMountModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tools-browser-',
  componentPath: 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
  rawModules: [
    ...TOOL_TREE_RAW_MODULES,
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    ...WORLD_TOOL_SCOPE_RAW_MODULES,
  ],
  runeModules: ['src/ui/svelte/apps/manager/browserListState.svelte.js'],
  compiledModules: [
    ...TOOL_TREE_COMPILED_MODULES,
    ...SELECT_COMPILED_MODULES,
    ...PAGINATION_COMPILED_MODULES,
    'src/ui/svelte/components/FilterBar.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
  ],
});

before(async () => {
  await harness.setup();
});
after(() => {
  harness.teardown();
});
afterEach(() => {
  harness.remount();
});

describeBrowserListState({
  label: 'ToolsBrowserView',
  harness,
  systemProp: 'systemId',
  props: ({ rowCount, selectedSystemId, browserState }) => ({
    systemId: selectedSystemId,
    tools: Array.from({ length: rowCount }, (_, index) => ({
      id: `tool-${index + 1}`,
      label: `Tool ${index + 1}`,
      enabled: true,
      componentId: 'c1',
      requirement: null,
      breakage: { mode: 'limitedUses', maxUses: null },
      onBreak: { mode: 'destroy' },
    })),
    managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }],
    browserState,
  }),
  // Tool rules are per system: the search, cohort and page name the old system's list.
  resetAxes: {
    searchTerm: ['pick', ''],
    membershipFilter: ['all', 'in'],
    pageIndex: [1, 0],
  },
  // The sort is a preference, and the page size with it.
  preservedAxes: { sortKey: 'state', sortDirection: 'desc', pageSize: 2 },
  clampsPage: true,
});

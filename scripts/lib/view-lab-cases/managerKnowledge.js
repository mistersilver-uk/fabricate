/**
 * System scope: knowledge, progressive components, the import report and the remaining settings routes.
 */

import { BULK_EDIT_CHROME_PATTERN } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-knowledge-owned-copies',
    label: 'Manager — Knowledge owned copies',
    smokeLabels: ['manager-knowledge-owned-copies'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-empty-tab',
    label: 'Manager — Knowledge empty tab',
    smokeLabels: ['manager-knowledge-empty-tab'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Idrin carries knowledge and no copies, the only route to the Recipe-items tab's dashed empty state.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-idrin"]' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-learned-lost-copy',
    label: 'Manager — Knowledge learned lost copy',
    smokeLabels: ['manager-knowledge-learned-lost-copy'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The same character on the other tab, and the only frame that renders a learned row.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-idrin"]' },
      { selector: '[data-knowledge-tab="learnedRecipes"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/knowledge\//,
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
      // The snapshot projection this frame renders moved out of the shell (issue 1674). Inert
      // until `mapChangedFilesToCases` stops pre-filtering the changed set through `isUiFile`,
      // which drops a `src/systems/` path before `sourceMatches` is consulted (issue 1896).
      /^src\/systems\/knowledgeSnapshot\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-knowledge-party-pool-warning',
    label: 'Manager — Knowledge party pool warning',
    smokeLabels: ['manager-knowledge-party-pool-warning'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Vosk's `total`-scope codex is still the source of a learned entry, the one arrangement raising the ordering-hazard band.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-vosk"]' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-delete-armed',
    label: 'Manager — Knowledge delete armed',
    smokeLabels: ['manager-knowledge-delete-armed'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Delete armed to its confirm face.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
      { selector: '[data-arm-token="delete:copy-primer-partial"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-narrow',
    label: 'Manager — Knowledge narrow',
    smokeLabels: ['manager-knowledge-narrow'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 880, height: 900 },
    kinds: ['manager', 'knowledge', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/knowledge\//,
    ],
  }),
  managerCase({
    id: 'manager-components-progressive',
    label: 'Manager — Components progressive',
    smokeLabels: ['manager-components-progressive'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit-progressive',
    label: 'Manager — Components bulk edit progressive',
    smokeLabels: ['manager-components-bulk-edit-progressive'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Progressive DC renders only for a progressive difficulty axis, which is why this case sits on herbalism.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="hb-moonleaf"])' },
      { selector: 'label:has(input[data-component-select="hb-sunroot"])' },
    ],
    expectView: 'components',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-component-edit-difficulty',
    label: 'Manager — Component edit difficulty',
    smokeLabels: ['manager-component-edit-difficulty'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-ruby"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-import-report',
    label: 'Manager — Import report',
    smokeLabels: ['manager-import-report'],
    // The uploaded payload is a real export envelope, because `validateImportData` rejects anything else.
    reaches: 'exact',
    query: { dialog: 'open' },
    steps: [
      { selector: '[data-manager-import-system]' },
      {
        selector: 'input[name="importFile"]',
        upload: JSON.stringify({
          schemaVersion: 2,
          fabricateVersion: '1.1.0',
          runtimeStateIncluded: false,
          system: {
            id: 'lab-imported-forge',
            name: 'Imported Forge',
            summary: 'A system that arrived by file.',
            enabled: true,
            // Dangling `originItemUuid`s on purpose.
            components: [
              {
                id: 'imp-emberglass',
                name: 'Emberglass Shard',
                originItemUuid: 'Item.absent-emberglass',
                essences: {},
                tags: [],
              },
              {
                id: 'imp-quenching-salt',
                name: 'Quenching Salt',
                originItemUuid: 'Item.absent-quenching-salt',
                essences: {},
                tags: [],
              },
            ],
            essences: [],
            componentCategories: [],
            itemTags: [],
          },
          // No recipes.
          recipes: [],
          gatheringEnvironments: [],
          gatheringConfig: {},
        }),
      },
      { selector: '.application.dialog button[data-action="ok"]' },
    ],
    expectView: 'systems',
    // The systems browser sits underneath the report, so `expectView` alone cannot tell the two apart.
    expectSelector: '[data-import-report-group]',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportReportModal\.svelte$/,
      // The prompt, run and report sequence this frame drives (issue 1674).
      /^src\/ui\/managerServices\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-import-folder-mapping',
    label: 'Manager — Import folder mapping',
    smokeLabels: ['manager-import-folder-mapping'],
    // The one case on this branch whose blocker is a missing verb rather than a fixture shape.
    reaches: 'window',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportFolderMappingModal\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-alchemy-settings',
    label: 'Manager — Alchemy settings',
    smokeLabels: ['manager-alchemy-settings'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    kinds: ['manager', 'crafting-settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  }),
  managerCase({
    id: 'manager-experimental-off',
    label: 'Manager — Experimental off',
    smokeLabels: ['manager-experimental-off'],
    reaches: 'exact',
    query: { experimental: '0' },
    steps: [],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
]);

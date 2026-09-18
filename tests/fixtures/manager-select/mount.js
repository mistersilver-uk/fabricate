/**
 * Mount the REAL converted manager settings/tab controls, and the three caption SHAPES, for issue
 * 1510.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';

import CharacterPrerequisitesCard from '../../../src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte';
import GatheringEconomyView from '../../../src/ui/svelte/apps/manager/GatheringEconomyView.svelte';
import ImportFolderMappingModal from '../../../src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte';
import Select from '../../../src/ui/svelte/components/Select.svelte';
import WorldCurrencyTab from '../../../src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte';
import { installFixtureI18n, mountCaptionShape } from '../select-fixture-shared.js';

const params = new URLSearchParams(globalThis.location.search);
const subject = params.get('subject') ?? 'span';
const startValue = params.get('value') ?? '';

installFixtureI18n(en);

const frame = document.createElement('div');
frame.className = 'fabricate fabricate-manager';
const mountPoint = document.createElement('div');
mountPoint.className = 'fixture-mount fixture-column manager-section-body';
frame.append(mountPoint);
document.body.append(frame);

/**
 * The three caption shapes around one bare `Select`, hosted the way the manager's `Pagination`
 * page-size row hosts its control (the wrapper class is the difference under test); the `showTick`
 * refusal matches that shipped row.
 */
function mountShape() {
  mountCaptionShape({
    mount,
    Select,
    mountPoint,
    subject,
    startValue,
    wrapperClass: 'manager-pagination-size fixture-wrapper',
    captionClass: 'fixture-caption',
    extraProps: { showTick: false },
  });
}

/** One prerequisite entry, opened, so the operator select renders. */
const PREREQUISITE_LIBRARY = [
  {
    id: 'p1',
    name: 'Trained hands',
    icon: 'fa-solid fa-user-shield',
    path: 'abilities.int.mod',
    op: startValue || 'gte',
    value: '2',
  },
];

/** Two folders, one of which the name matcher pre-fills, so both category states render. */
const IMPORT_FOLDERS = [
  {
    folderId: 'f1',
    folderName: 'Reagent',
    itemCount: 3,
    itemUuids: ['Item.a', 'Item.b', 'Item.c'],
  },
  { folderId: 'f2', folderName: 'Widgets', itemCount: 2, itemUuids: ['Item.d', 'Item.e'] },
];

/**
 * The gathering services seam, reduced to the four reads this view makes on mount.
 *
 * @param {string} unit The regeneration unit the economy starts on.
 */
function economyServices(unit) {
  const economy = {
    resolutionMode: 'd100',
    stamina: {
      enabled: true,
      max: '40',
      start: '',
      regen: { policy: 'overTime', unit, amount: '2' },
    },
    nodes: { enabled: false },
  };
  return {
    getGatheringEconomy: () => economy,
    setGatheringEconomy: (options) => Promise.resolve(options.economy),
    getGatheringStaminaState: () => [],
    setGatheringStamina: () => Promise.resolve({}),
    adjustGatheringStamina: () => Promise.resolve({}),
    rollGatheringStamina: () => Promise.resolve({}),
  };
}

const SUBJECTS = {
  prerequisites: () =>
    mount(CharacterPrerequisitesCard, {
      target: mountPoint,
      props: {
        library: PREREQUISITE_LIBRARY,
        requestOpenId: 'p1',
        requestOpenNonce: 1,
      },
    }),
  currency: () =>
    mount(WorldCurrencyTab, {
      target: mountPoint,
      props: {
        // THREE UNITS, so the add-sub-unit control has something to offer and two labels of very
        // different lengths to be measured on: `currencyUnitSubUnitOptions` offers every unit
        // that is not the edited one and not already reachable from it, and its labels are
        // `${label} (${abbreviation})`. One unit renders no builder at all.
        currencyUnits: [
          {
            id: 'gp',
            name: 'Gold',
            label: 'Gold',
            abbreviation: 'gp',
            actorPath: 'currency.gp',
            contains: [],
          },
          {
            id: 'sp',
            name: 'Silver',
            label: 'Silver',
            abbreviation: 'sp',
            actorPath: 'currency.sp',
            contains: [],
          },
          {
            id: 'electrum',
            name: 'Electrum piece',
            label: 'Electrum piece',
            abbreviation: 'ep',
            actorPath: 'currency.ep',
            contains: [],
          },
        ],
        currencySpendStrategy: startValue || 'actorProperty',
        currencyProviderId: 'dnd5e-inventory',
        currencyProviderOptions: [
          { id: 'dnd5e-inventory', label: 'D&D 5e actor inventory currency' },
          { id: 'pf2e-inventory', label: 'Pathfinder 2e actor inventory currency' },
        ],
      },
    }),
  import: () =>
    mount(ImportFolderMappingModal, {
      target: mountPoint,
      props: {
        open: true,
        folders: IMPORT_FOLDERS,
        componentCategories: ['Reagent', 'Metal', 'Alchemical reagent'],
        itemTags: ['herb', 'rare'],
      },
    }),
  economy: () =>
    mount(GatheringEconomyView, {
      target: mountPoint,
      props: { services: economyServices(startValue || 'hours'), systemId: 'sys' },
    }),
};

if (Object.hasOwn(SUBJECTS, subject)) SUBJECTS[subject]();
else mountShape();

globalThis.__managerSelectFixtureReady = true;

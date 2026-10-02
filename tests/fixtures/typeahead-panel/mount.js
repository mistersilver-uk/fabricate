/**
 * Mount one real typeahead combobox inside a `.fabricate-manager` frame, under an ancestor carrying
 * the product class that clips it, with the field at that ancestor's bottom edge (issue 2157).
 * Only components are imported, so the page runs unchanged on a commit that predates the seam.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import GatheringModifierEditor from '../../../src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte';
import GatheringTaskEditView from '../../../src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';
import RecipeIngredientOption from '../../../src/ui/svelte/apps/manager/recipe/PickerRow.svelte';
import RecipeItemLimitsTab from '../../../src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

const params = new URLSearchParams(globalThis.location.search);
const family = params.get('family') ?? 'requirement';
const edge = params.get('edge') === 'host' ? 'bottom' : 'top';
const width = Number(params.get('width') ?? 560);
// How many names match the word the suite types: four fit every family's panel, and a larger
// figure is the case that makes the panel scroll.
const matching = Number(params.get('matching') ?? 4);

installFixtureI18n(en);

/** What the mounted component committed, read by the suite from the document after a choice. */
function commit(id) {
  const { dataset } = document.documentElement;
  dataset.typeaheadCommitted = [dataset.typeaheadCommitted, id].filter(Boolean).join(' ');
}

function element(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const KINDS = ['ingot', 'ore', 'nail', 'plate', 'wire', 'rivet', 'filings', 'chain', 'hinge'];
const NAMES = [
  ...KINDS.slice(0, matching).map((kind) => ({ id: `iron-${kind}`, name: `Iron ${kind}` })),
  { id: 'copper-wire', name: 'Copper wire' },
  { id: 'oak-haft', name: 'Oak haft' },
].map((entry) => ({ ...entry, label: entry.name }));

function limitsTab(target) {
  return mount(RecipeItemLimitsTab, {
    target,
    props: {
      recipeItem: {
        id: 'ri1',
        caps: { item: {}, learn: { limitLearning: true, learnScope: 'perInstance' } },
      },
      visibilityMode: 'knowledge',
      availableRecipes: NAMES,
      characterPrerequisites: NAMES.map((entry) => ({
        ...entry,
        path: 'skills.cra.rank',
        op: 'gte',
        value: 2,
      })),
      onPatch: (patch) => {
        const { prerequisiteIds, characterPrerequisiteIds } = patch.caps.learn;
        commit((prerequisiteIds ?? characterPrerequisiteIds).at(-1));
      },
    },
  });
}

/**
 * Each family names the product class that clips its list, the input the suite types into, and
 * how its component mounts. A family whose component renders the clipping ancestor itself sets
 * `ownsScroller`, and the stage becomes the page that component scrolls in.
 */
const FAMILIES = {
  requirement: {
    clip: 'manager-editor-tab-panel',
    input: '[data-recipe-option-search]',
    mount: (target) =>
      mount(RecipeIngredientOption, {
        target,
        props: {
          option: { quantity: 1, match: { type: 'component', componentId: null } },
          componentOptions: NAMES,
          onChange: (next) => commit(next.match.componentId),
        },
      }),
  },
  knowledge: {
    clip: 'manager-editor-tab-panel',
    input: '[data-recipe-item-required-knowledge-search]',
    mount: limitsTab,
  },
  prerequisite: {
    clip: 'manager-editor-tab-panel',
    input: '[data-recipe-item-character-prereq-search]',
    mount: limitsTab,
  },
  // The shell filters this list in the product; the panel takes it as given.
  modifier: {
    clip: 'manager-drop-inspector-scroll',
    input: '[data-gathering-drop-character-modifier-search] input',
    mount: (target) =>
      mount(GatheringModifierEditor, {
        target,
        props: {
          subject: 'drop',
          row: { id: 'drop-1', conditionModifiers: {}, characterModifiers: [] },
          idPrefix: 'drop-drop-1',
          suggestions: NAMES.filter((entry) => entry.id.startsWith('iron-')),
          characterModifierLibrary: NAMES,
          onPickCharacterModifier: commit,
        },
      }),
  },
  // An unbreakable tag per card: the list's row is a glyph column and a label, and a tag is bare
  // text, so a tag with a space or a hyphen wraps in the glyph column and measures two rows.
  task: {
    clip: 'manager-task-component-browser-card',
    input: '[data-gathering-component-tag-search] input',
    ownsScroller: true,
    mount: (target) =>
      mount(GatheringTaskEditView, {
        target,
        props: {
          task: { id: 'task-1', name: 'Forage', dropRows: [] },
          resolutionMode: 'd100',
          itemCards: NAMES.map((entry) => ({ ...entry, tags: [entry.id.replace('-', '')] })),
        },
      }),
  },
};

const chosen = FAMILIES[family] ?? FAMILIES.requirement;

const frame = element('div', 'application fabricate crafting-system-manager');
const content = element('section', 'window-content');
const managerRoot = element('div', 'fabricate-manager');
managerRoot.dataset.fabricateTheme = 'dark';
const stage = element('div', `fixture-stage is-${edge}`);
managerRoot.append(stage);
content.append(managerRoot);
frame.append(content);
document.body.append(frame);

if (chosen.ownsScroller) {
  stage.classList.add('is-owned');
  chosen.mount(stage);
  // The field onto the stage's own bottom edge, or a little under its top one.
  const input = stage.querySelector(chosen.input);
  const box = input.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  stage.scrollTop += edge === 'bottom' ? box.bottom - stageBox.bottom + 8 : box.top - 160;
} else {
  stage.style.width = `${width}px`;
  const scroller = element('div', `${chosen.clip} fixture-scroller`);
  const mountPoint = element('div', 'fixture-mount');
  scroller.append(element('div', 'fixture-spacer'), mountPoint);
  stage.append(scroller);
  chosen.mount(mountPoint);
  // The field's bottom edge onto the scroller's, wherever the component put the field.
  const input = scroller.querySelector(chosen.input);
  scroller.scrollTop +=
    input.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 8;
}

document.documentElement.dataset.typeaheadReady = 'true';

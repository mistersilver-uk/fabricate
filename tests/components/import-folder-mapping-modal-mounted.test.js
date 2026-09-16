import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-import-mapping-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    // InlineVocabularyAdd imports IconPicker STATICALLY (issue 878), so the picker's own
    // dependencies are in this graph even though this modal never sets `showIcon` and so
    // never renders the field. Membership follows the import graph, not the rendered tree.
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/utils/matchFolderVocabulary.js',
  ],
  compiledModules: [
    // THE APP'S ONE SELECT AND ITS WHOLE COMPILED CLOSURE (issue 1510), spread rather than copied.
    // This tree renders `components/Select.svelte` now, and a `.svelte` the tree renders but the
    // harness omits HANGS the suite (`# cancelled`) rather than failing it.
    ...SELECT_COMPILED_MODULES,
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
    // the harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    // The manager's ONE selection control (issue 772). The match-by-name toggle renders
    // through it now rather than as a raw checkbox wearing Foundry's control chrome.
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    // The shared modal chrome (issue 877): portal, centring, title/subtitle, close and
    // footer rail. This modal renders THROUGH it, so omitting it breaks the mount.
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). Skip, New, the footer pair and InlineVocabularyAdd`s Add all render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte',
});

const FOLDERS = [
  { folderId: 'f1', folderName: 'Reagent', itemCount: 3, itemUuids: ['Item.a', 'Item.b', 'Item.c'] },
  { folderId: 'f2', folderName: 'Widgets', itemCount: 2, itemUuids: ['Item.d', 'Item.e'] },
];
const VOCAB = { componentCategories: ['Reagent', 'Metal'], itemTags: ['herb', 'rare'] };

function dialog() {
  return document.querySelector('[data-import-mapping]');
}
function rows() {
  return [...document.querySelectorAll('.manager-import-mapping-row')];
}
function commitButton() {
  return document.querySelector('[data-import-mapping-commit]');
}

/**
 * @param {number} index The folder row's index.
 * @returns {string} A selector for that row's category trigger.
 */
function categoryTrigger(index) {
  return `.manager-import-mapping-row:nth-of-type(${index + 1}) [data-import-mapping-category]`;
}

/**
 * @param {HTMLElement} root The harness mount target.
 * @param {number} index The folder row's index.
 * @returns {string} The label that row's category control currently shows.
 */
function categoryTriggerText(root, index) {
  return selectTriggerText(root, categoryTrigger(index));
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ImportFolderMappingModal (mounted)', () => {
  it('renders nothing when closed', async () => {
    await harness.mount({ open: false, folders: FOLDERS, ...VOCAB });
    assert.equal(dialog(), null);
  });

  it('renders one row per detected folder with a tabular-nums item count', async () => {
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    assert.ok(dialog(), 'expected the dialog to be portaled');
    assert.equal(rows().length, 2);
    const counts = [...document.querySelectorAll('[data-import-mapping-count]')].map((n) =>
      n.textContent.trim()
    );
    assert.deepEqual(counts, ['3 items', '2 items']);
    const badge = document.querySelector('[data-import-mapping-count]');
    assert.equal(badge.style.fontVariantNumeric, 'tabular-nums');
  });

  it('match-by-name (ON by default) pre-fills the category of a name-matched folder only', async () => {
    const root = await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    // THE TRIGGER'S RENDERED VALUE, not an element `.value` (issue 1510). The control is a
    // `<button>` drawing the app's own option list, so what the GM reads is the label rather
    // than the value — and the unassigned row reads "General", which is what its empty-string
    // value means at this call site.
    assert.equal(categoryTriggerText(root, 0), 'Reagent', 'Reagent folder pre-filled by name');
    assert.equal(categoryTriggerText(root, 1), 'General', 'Widgets folder matches nothing');
  });

  it('names every category control by the caption its wrapper used to name it by', async () => {
    // FIRST COVERAGE OF THE NAME AT THIS SITE, and it is what the demotion can silently break.
    // The `<Field>` was `as="label"` and named the select by containment; it is `as="div"` now
    // and the caption is POINTED at, so a caption that never received its `id` would leave the
    // trigger with an `aria-labelledby` resolving to nothing — which no warning reports, because
    // the primitive was given a name prop. Pinned against the pre-conversion string, measured.
    const root = await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    for (const index of [0, 1]) {
      assert.equal(assertSelectHasResolvedName(root, categoryTrigger(index)), 'Category');
    }
    const ids = [0, 1].map((index) =>
      root.querySelector(categoryTrigger(index)).getAttribute('aria-labelledby')
    );
    assert.ok(
      ids[0] !== ids[1],
      'and the two rows point at DIFFERENT captions: one id per component would name every ' +
        'row in the list the same way'
    );
  });

  it('offers the General bucket under the empty-string sentinel handle', async () => {
    // THE SENTINEL. `Select` stamps `data-popover-option="__unchanged__"` on any row whose value
    // is the empty string, because `SearchablePopover` omits the attribute entirely for a falsy
    // `dataId` — so General, the row a driver most needs to click, would otherwise be the one row
    // with no handle at all. Pinned here because the literal is a hand-maintained mirror.
    const root = await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    assert.deepEqual(selectOptionValues(root, categoryTrigger(0)), [
      '__unchanged__',
      'Reagent',
      'Metal',
    ]);
    assert.deepEqual(selectOptionLabels(root, categoryTrigger(0)), ['General', 'Reagent', 'Metal']);
  });

  it('assigns a category by clicking its row, and the trigger states the choice', async () => {
    const root = await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    chooseSelectOption(root, categoryTrigger(1), 'Metal');
    assert.equal(categoryTriggerText(root, 1), 'Metal');
  });

  it('renders the singular item form for a one-item folder', async () => {
    await harness.mount({
      open: true,
      folders: [{ folderId: 'solo', folderName: 'Solo', itemCount: 1, itemUuids: ['Item.z'] }],
      ...VOCAB,
    });
    assert.equal(document.querySelector('[data-import-mapping-count]').textContent.trim(), '1 item');
    assert.match(commitButton().textContent, /Import 1 item(?!s)/);
  });

  it('turning match-by-name OFF clears the pre-filled assignment', async () => {
    const root = await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    const toggle = document.querySelector('[data-import-mapping-match] input');
    toggle.checked = false;
    toggle.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.equal(categoryTriggerText(root, 0), 'General', 'pre-fill cleared with match-by-name off');
  });

  it('the commit button reflects the live import count and skipping a folder lowers it', async () => {
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    assert.match(commitButton().textContent, /Import 5 items/);
    // Skip the second folder (2 items) → count drops to 3.
    rows()[1].querySelector('[data-import-mapping-skip]').click();
    flushSync();
    assert.match(commitButton().textContent, /Import 3 items/);
    assert.ok(rows()[1].classList.contains('is-skipped'));
  });

  it('commits only non-skipped folders, carrying their category and tags', async () => {
    let committed = null;
    await harness.mount({
      open: true,
      folders: FOLDERS,
      ...VOCAB,
      onCommit: (decisions) => {
        committed = decisions;
      },
    });
    // Skip Widgets; commit with Reagent's match-by-name category intact.
    rows()[1].querySelector('[data-import-mapping-skip]').click();
    flushSync();
    commitButton().click();
    assert.equal(committed.length, 1);
    assert.equal(committed[0].folderId, 'f1');
    assert.equal(committed[0].category, 'Reagent');
    assert.deepEqual(committed[0].itemUuids, ['Item.a', 'Item.b', 'Item.c']);
    assert.deepEqual(committed[0].addTags, []);
  });

  it('disables commit when every folder is skipped (nothing to import)', async () => {
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    for (const row of rows()) row.querySelector('[data-import-mapping-skip]').click();
    flushSync();
    assert.equal(commitButton().disabled, true);
  });

  // The close control now belongs to the shared ManagerModal chrome (issue 877), so it
  // is located by the primitive's hook rather than a mapping-specific one.
  it('calls onClose from the shared modal close button', async () => {
    let closed = 0;
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB, onClose: () => (closed += 1) });
    document.querySelector('[data-manager-modal-close]').click();
    assert.equal(closed, 1);
  });

  // The smoke harness pins `[data-import-mapping]` on the dialog ROOT; the root is now
  // rendered by ManagerModal, so the hook survives only via its `rootAttributes` prop.
  it('keeps the mapping automation hook on the shared modal root', async () => {
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    const root = dialog();
    assert.ok(root, 'expected the dialog root');
    assert.ok(root.hasAttribute('data-manager-modal'), 'renders through the shared chrome');
    assert.equal(root.getAttribute('role'), 'dialog');
  });
});

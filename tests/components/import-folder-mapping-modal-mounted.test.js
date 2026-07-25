import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-import-mapping-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/utils/matchFolderVocabulary.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
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
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    const selects = [...document.querySelectorAll('[data-import-mapping-category]')];
    assert.equal(selects[0].value, 'Reagent', 'Reagent folder pre-filled by match-by-name');
    assert.equal(selects[1].value, '', 'Widgets folder matches nothing → no category');
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
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB });
    const toggle = document.querySelector('[data-import-mapping-match] input');
    toggle.checked = false;
    toggle.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    const selects = [...document.querySelectorAll('[data-import-mapping-category]')];
    assert.equal(selects[0].value, '', 'pre-fill cleared when match-by-name is off');
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

  it('calls onClose from the close button', async () => {
    let closed = 0;
    await harness.mount({ open: true, folders: FOLDERS, ...VOCAB, onClose: () => (closed += 1) });
    document.querySelector('[data-import-mapping-close]').click();
    assert.equal(closed, 1);
  });
});

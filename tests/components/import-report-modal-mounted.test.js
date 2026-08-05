/**
 * Issue 877 — the post-import reference report, converted from a raw-HTML DialogV2 into
 * a Svelte modal that renders through the SHARED `ManagerModal` chrome (the same one the
 * folder-mapping step in the very same import flow uses).
 *
 * These tests pin the two things the conversion is for: the report wears the shared
 * chrome (compact title + subtitle, round close, right-aligned footer) rather than
 * Foundry's dialog defaults, and it presents `buildImportReportContent` output as
 * bordered per-kind cards instead of raw `<ul>` bullets.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-import-report-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/apps/manager/ImportReportModal.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ImportReportModal.svelte',
});

// Shaped exactly like `buildImportReportContent` output (see src/systems/importReportContent.js).
const REPORTED_CONTENT = {
  title: 'Import report',
  headline: 'Import succeeded — 3 reference(s) need attention.',
  hasReported: true,
  reportedCount: 3,
  handledCount: 8,
  emptyStateLabel: 'Nothing needs your attention.',
  handledLine: '8 reference(s) resolved automatically.',
  groups: [
    {
      kind: 'sourceItem',
      kindLabel: 'Component source items',
      count: 1,
      rows: [
        {
          ownerType: 'component',
          ownerTypeLabel: 'Component',
          ownerName: 'Smoke Orphan Reagent',
          referenceValue: 'Item.fabricateSmokeMissing0001',
        },
      ],
    },
    {
      kind: 'recipeItem',
      kindLabel: 'Recipe item links',
      count: 2,
      rows: [
        {
          ownerType: 'recipeItem',
          ownerTypeLabel: 'Book or scroll',
          ownerName: 'Tome of Brewing',
          referenceValue: 'N8ZXIFg6nBP6fJRF',
        },
        {
          ownerType: 'recipeItem',
          ownerTypeLabel: 'Book or scroll',
          ownerName: '',
          referenceValue: 'N8ZXIFg6nBP6fJRG',
        },
      ],
    },
  ],
};

const RESOLVED_CONTENT = {
  title: 'Import report',
  headline: 'Import succeeded — all references resolved.',
  hasReported: false,
  reportedCount: 0,
  handledCount: 0,
  emptyStateLabel: 'Nothing needs your attention.',
  handledLine: '0 reference(s) resolved automatically.',
  groups: [],
};

function modal() {
  return document.querySelector('[data-import-report]');
}
function groups() {
  return [...document.querySelectorAll('[data-import-report-group]')];
}
function rows() {
  return [...document.querySelectorAll('[data-import-report-row]')];
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ImportReportModal (mounted)', () => {
  it('renders nothing when closed', async () => {
    await harness.mount({ open: false, content: REPORTED_CONTENT });
    assert.equal(modal(), null);
  });

  it('renders through the shared ManagerModal chrome, not a bare dialog', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    const root = modal();
    assert.ok(root, 'expected the report to be portaled');
    assert.ok(root.hasAttribute('data-manager-modal'), 'wears the shared modal chrome');
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
    assert.ok(document.querySelector('[data-manager-modal-close]'), 'has the round close control');
  });

  it('shows the headline as the modal subtitle rather than a serif page heading', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    const heading = modal().querySelector('h3');
    assert.equal(heading.textContent.trim(), 'Import report');
    assert.equal(
      modal().querySelector('p.manager-muted').textContent.trim(),
      REPORTED_CONTENT.headline
    );
    // The old raw-HTML report used <h2> per kind; the card head is an <h4> inside a card.
    assert.equal(modal().querySelector('h2'), null);
  });

  it('renders one bordered card per reference kind, each carrying its own count', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    assert.deepEqual(
      groups().map((group) => group.getAttribute('data-import-report-group')),
      ['sourceItem', 'recipeItem']
    );
    assert.deepEqual(
      [...document.querySelectorAll('[data-import-report-count]')].map((n) => n.textContent.trim()),
      ['1', '2']
    );
    assert.deepEqual(
      groups().map((group) => group.querySelector('h4').textContent.trim()),
      ['Component source items', 'Recipe item links']
    );
  });

  it('renders each reference as an owner line plus a mono reference chip', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    assert.equal(rows().length, 3);
    const owners = rows().map((row) =>
      row.querySelector('.manager-import-report-owner').textContent.trim()
    );
    // A named owner reads "<type>: <name>"; an unnamed one is just the type.
    assert.deepEqual(owners, [
      'Component: Smoke Orphan Reagent',
      'Book or scroll: Tome of Brewing',
      'Book or scroll',
    ]);
    const reference = document.querySelector('[data-import-report-ref]');
    assert.equal(reference.textContent.trim(), 'Item.fabricateSmokeMissing0001');
    assert.ok(reference.classList.contains('manager-chip'), 'reference value uses the chip idiom');
    assert.ok(reference.classList.contains('is-mono'));
  });

  it('never renders a raw localization key for a supplied label', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    assert.ok(
      !modal().textContent.includes('FABRICATE.'),
      'a raw FABRICATE.* key leaked into the rendered report'
    );
  });

  it('shows the handled-count footnote only when references were handled', async () => {
    await harness.mount({ open: true, content: REPORTED_CONTENT });
    assert.equal(
      document.querySelector('[data-import-report-handled]').textContent.trim(),
      REPORTED_CONTENT.handledLine
    );
    await harness.setProps({ content: RESOLVED_CONTENT });
    assert.equal(document.querySelector('[data-import-report-handled]'), null);
  });

  it('uses the shared EmptyState primitive when nothing needs attention', async () => {
    await harness.mount({ open: true, content: RESOLVED_CONTENT });
    assert.equal(groups().length, 0);
    const empty = document.querySelector('[data-import-report-empty]');
    assert.ok(empty, 'expected the shared no-state panel');
    assert.ok(empty.classList.contains('manager-empty'));
    assert.match(empty.textContent, /Nothing needs your attention\./);
  });

  it('calls onClose from both the header control and the footer button', async () => {
    let closed = 0;
    await harness.mount({
      open: true,
      content: REPORTED_CONTENT,
      onClose: () => (closed += 1),
    });
    document.querySelector('[data-manager-modal-close]').click();
    document.querySelector('[data-import-report-close]').click();
    assert.equal(closed, 2);
  });
});

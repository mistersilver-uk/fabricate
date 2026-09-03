import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-system-overview-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    // THE manager's labelled push-button (issue 1118). Named AHEAD of the conversion that
    // puts it in this tree: `SystemOverviewView`'s deep-link control is one of the sweep's
    // forgotten-role repairs, and the moment it becomes a `<ManagerButton>` an omission here
    // costs a HUNG suite reported as `# cancelled`, not a failing one. Compiling a module the
    // tree does not yet render is free; discovering the omission from a cancelled count is not.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/SystemOverviewView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/SystemOverviewView.svelte'
});

function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A report carrying a system blocker (no deep link) plus per-entity issues of
// each deep-linkable kind, so the grouped layout and deep-link wiring are both
// exercised.
const populatedReport = {
  issues: [
    {
      kind: 'system',
      entityId: null,
      entityName: 'Demo System',
      severity: 'critical',
      blocks: 'system',
      code: 'progressiveNoCheck',
      message: 'Progressive mode requires a configured progressive crafting check.',
      nav: { view: 'system-overview' }
    },
    {
      kind: 'recipe',
      entityId: 'r1',
      entityName: 'Iron Ingot',
      severity: 'critical',
      blocks: 'enable',
      code: 'noResultGroup',
      message: 'A step is missing a result group.',
      nav: { view: 'recipe-edit', tab: 'results' }
    },
    {
      kind: 'environment',
      entityId: 'e1',
      environmentId: 'e1',
      entityName: 'Forest',
      severity: 'warning',
      blocks: undefined,
      code: 'noScene',
      message: 'Environment has no linked scene.',
      nav: { view: 'environment-edit' }
    },
    {
      // A task-kind issue: `entityId` is the task RECORD id; the deep-link must
      // resolve via the OWNING environment id (`environmentId`).
      kind: 'task',
      entityId: 'task-7',
      environmentId: 'e1',
      entityName: 'Forage Berries',
      severity: 'warning',
      blocks: undefined,
      code: 'taskNoDescription',
      message: 'A gathering task has no description.',
      nav: { view: 'environment-edit' }
    },
    {
      kind: 'salvage',
      entityId: 'c1',
      entityName: 'Broken Sword',
      severity: 'critical',
      blocks: 'visibility',
      code: 'invalidSalvage',
      message: 'Salvage is invalid.',
      nav: { view: 'items' }
    }
  ],
  counts: { critical: 3, warning: 2, info: 0, blockers: 1 },
  blocksSystem: true
};

describe('SystemOverviewView (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('groups issues by kind and renders a severity chip + entity name per row', async () => {
    const target = await harness.mount({ report: populatedReport });

    const systemGroup = target.querySelector('[data-system-overview-group="system"]');
    const recipeGroup = target.querySelector('[data-system-overview-group="recipe"]');
    const environmentGroup = target.querySelector('[data-system-overview-group="environment"]');
    const taskGroup = target.querySelector('[data-system-overview-group="task"]');
    const salvageGroup = target.querySelector('[data-system-overview-group="salvage"]');
    assert.ok(systemGroup, 'system blocker group renders');
    assert.ok(recipeGroup, 'recipe group renders');
    assert.ok(environmentGroup, 'environment group renders');
    assert.ok(taskGroup, 'task group renders');
    assert.ok(salvageGroup, 'salvage group renders');

    const recipeRow = recipeGroup.querySelector('[data-overview-issue="noResultGroup"]');
    assert.ok(recipeRow, 'recipe issue row renders');
    assert.ok(recipeRow.querySelector('.manager-chip.is-danger'), 'critical row carries a danger chip');
    assert.match(recipeRow.textContent, /Iron Ingot/, 'recipe entity name shows');

    const environmentRow = environmentGroup.querySelector('[data-overview-issue="noScene"]');
    assert.ok(environmentRow.querySelector('.manager-chip.is-warning'), 'warning row carries a warning chip');

    // The system-blocker banner renders and the system row carries no deep link.
    assert.ok(target.querySelector('[data-system-overview-blocker]'), 'blocker banner renders');
    assert.equal(
      systemGroup.querySelector('[data-overview-link]'),
      null,
      'system kind carries no deep-link button'
    );

    harness.remount();
  });

  // ── The deep link is a `ghost`, and the sweep found it painted as a neutral (issue 1118) ──
  //
  // Audit row 21. One deep link per issue row, in a list whose SEVERITY CHIP is the loud
  // thing: a solid control repeated down every row out-shouts the ranking the list exists to
  // present, which is why `component/ComponentEditorHeader.svelte`'s Back — the ruling this
  // repair follows — is ghost for the same reason.
  //
  // Bound to `[data-overview-link="recipe"]`, which names ONE control in this report and no
  // other. Two mutations red it: dropping `role="ghost"` from the component, and moving that
  // role onto a neighbour — the negative half below is what catches the second, because it
  // asserts that the OTHER kinds' links carry it too by naming each, rather than asking
  // whether "a ghost appears in this list".
  it('paints every issue row deep link as the ghost role', async () => {
    const target = await harness.mount({ report: populatedReport, onSelectIssue: () => {} });
    await flushRender();

    const links = Array.from(target.querySelectorAll('[data-overview-link]'));
    assert.equal(links.length, 4, 'one deep link per deep-linkable issue kind in this report');
    for (const link of links) {
      const kind = link.getAttribute('data-overview-link');
      assert.ok(
        link.classList.contains('fab-manager-button'),
        `the ${kind} deep link renders through the ManagerButton primitive, got ${link.className}`
      );
      assert.ok(
        link.classList.contains('is-ghost'),
        `the ${kind} deep link takes the ghost role, got ${link.className}`
      );
      assert.ok(
        link.classList.contains('manager-system-overview-link'),
        `and keeps its pass-through class, got ${link.className}`
      );
    }
    harness.remount();
  });

  it("fires onSelectIssue with the whole issue when a row's deep link is clicked", async () => {
    const selected = [];
    const target = await harness.mount({
      report: populatedReport,
      onSelectIssue: (issue) => selected.push(issue)
    });

    const recipeLink = target.querySelector('[data-overview-issue="noResultGroup"] [data-overview-link="recipe"]');
    assert.ok(recipeLink, 'a deep-link button renders on the recipe row');
    recipeLink.click();
    await flushRender();

    assert.equal(selected.length, 1, 'one issue forwarded');
    assert.equal(selected[0].kind, 'recipe');
    assert.equal(selected[0].entityId, 'r1', 'deep link forwards the recipe entity id');

    harness.remount();
  });

  it('forwards the owning environmentId for a task/event deep-link', async () => {
    const selected = [];
    const target = await harness.mount({
      report: populatedReport,
      onSelectIssue: (issue) => selected.push(issue)
    });

    const taskLink = target.querySelector('[data-overview-issue="taskNoDescription"] [data-overview-link="task"]');
    assert.ok(taskLink, 'a deep-link button renders on the task row');
    taskLink.click();
    await flushRender();

    assert.equal(selected.length, 1, 'one issue forwarded');
    assert.equal(selected[0].kind, 'task');
    // The deep link must carry the OWNING environment id (which selectEnvironment
    // resolves) — the record id `task-7` would never resolve.
    assert.equal(selected[0].environmentId, 'e1', 'task deep link forwards the owning environment id');

    harness.remount();
  });

  it('hides the deep-link button on an environment-derived issue with no environmentId', async () => {
    // A task issue missing `environmentId` cannot resolve a selectable environment,
    // so the row must not render a no-op deep-link button.
    const target = await harness.mount({
      report: {
        issues: [
          {
            kind: 'task',
            entityId: 'task-9',
            environmentId: null,
            entityName: 'Orphan Task',
            severity: 'warning',
            blocks: undefined,
            code: 'taskNoDescription',
            message: 'A gathering task has no description.',
            nav: { view: 'environment-edit' }
          }
        ],
        counts: { critical: 0, warning: 1, info: 0, blockers: 0 },
        blocksSystem: false
      }
    });
    const row = target.querySelector('[data-overview-issue="taskNoDescription"]');
    assert.ok(row, 'the task row still renders');
    assert.equal(row.querySelector('[data-overview-link]'), null, 'no deep-link button without an environmentId');
    harness.remount();
  });

  it('shows the empty state when no issues are present', async () => {
    const target = await harness.mount({
      report: { issues: [], counts: { critical: 0, warning: 0, info: 0, blockers: 0 }, blocksSystem: false }
    });
    assert.ok(target.querySelector('[data-system-overview-empty]'), 'empty state renders');
    assert.equal(target.querySelector('[data-system-overview-group]'), null, 'no groups rendered');
    assert.equal(target.querySelector('[data-system-overview-blocker]'), null, 'no blocker banner with no blocker');
    harness.remount();
  });
});

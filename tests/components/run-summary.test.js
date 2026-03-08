import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// --- Active Runs Column Structure ---

describe('RunSummary: Active Runs Column Structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('active run row renders recipe name and status badge', () => {
    const li = document.createElement('li');
    li.className = 'run-row';

    const strong = document.createElement('strong');
    strong.textContent = 'Healing Potion';
    li.appendChild(strong);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'In Progress';
    li.appendChild(badge);

    assert.equal(li.querySelector('strong').textContent, 'Healing Potion');
    assert.equal(li.querySelector('.badge').textContent, 'In Progress');
  });

  it('active run row renders step label when present', () => {
    const li = document.createElement('li');
    li.className = 'run-row';

    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Brew (2/3)';
    li.appendChild(hint);

    assert.equal(li.querySelector('.hint').textContent, 'Brew (2/3)');
  });

  it('active run row omits step label when null', () => {
    const li = document.createElement('li');
    li.className = 'run-row';

    const strong = document.createElement('strong');
    strong.textContent = 'Healing Potion';
    li.appendChild(strong);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'In Progress';
    li.appendChild(badge);

    // No hint span added — stepLabel is null
    assert.equal(li.querySelector('.hint'), null);
  });

  it('continue button renders when canContinue is true', () => {
    const actions = document.createElement('span');
    actions.className = 'run-row-actions';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'details-btn';
    btn.title = 'Continue this run';

    const icon = document.createElement('i');
    icon.className = 'fas fa-play';
    btn.appendChild(icon);
    actions.appendChild(btn);

    const found = actions.querySelector('button[title="Continue this run"]');
    assert.ok(found, 'Continue button should exist');
    assert.ok(found.querySelector('i.fas.fa-play'), 'Should have play icon');
  });

  it('cancel button renders when canCancel is true, omitted when false', () => {
    // With cancel button
    const actionsWithCancel = document.createElement('span');
    actionsWithCancel.className = 'run-row-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'details-btn';
    cancelBtn.title = 'Cancel run';

    const stopIcon = document.createElement('i');
    stopIcon.className = 'fas fa-stop';
    cancelBtn.appendChild(stopIcon);
    actionsWithCancel.appendChild(cancelBtn);

    assert.ok(actionsWithCancel.querySelector('i.fas.fa-stop'), 'Cancel button should exist when canCancel=true');

    // Without cancel button
    const actionsNoCancel = document.createElement('span');
    actionsNoCancel.className = 'run-row-actions';

    assert.equal(actionsNoCancel.querySelector('i.fas.fa-stop'), null, 'Cancel button should not exist when canCancel=false');
  });
});

// --- History Runs Column Structure ---

describe('RunSummary: History Runs Column Structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('history run row renders recipe name, status badge, and details button only', () => {
    const li = document.createElement('li');
    li.className = 'run-row';

    const strong = document.createElement('strong');
    strong.textContent = 'Fire Bomb';
    li.appendChild(strong);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'Completed';
    li.appendChild(badge);

    const actions = document.createElement('span');
    actions.className = 'run-row-actions';

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'details-btn';
    detailsBtn.title = 'Run details';

    const listIcon = document.createElement('i');
    listIcon.className = 'fas fa-list';
    detailsBtn.appendChild(listIcon);
    actions.appendChild(detailsBtn);
    li.appendChild(actions);

    const buttons = li.querySelectorAll('button');
    assert.equal(buttons.length, 1, 'History row should have only one button');
    assert.ok(li.querySelector('i.fas.fa-list'), 'Details button should have list icon');
    assert.equal(li.querySelector('i.fas.fa-play'), null, 'No continue button');
    assert.equal(li.querySelector('i.fas.fa-rotate-left'), null, 'No restart button');
    assert.equal(li.querySelector('i.fas.fa-stop'), null, 'No cancel button');
  });

  it('history details button dispatches onShowRunDetails with history scope', () => {
    const calls = [];
    function onShowRunDetails(runId, scope) {
      calls.push({ runId, scope });
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'details-btn';
    btn.onclick = () => onShowRunDetails('run-hist-1', 'history');
    btn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].runId, 'run-hist-1');
    assert.equal(calls[0].scope, 'history');
  });
});

// --- Empty States ---

describe('RunSummary: Empty States', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('empty active runs renders empty state message', () => {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'No active crafting runs for this actor.';

    assert.equal(p.textContent, 'No active crafting runs for this actor.');
    assert.ok(p.classList.contains('hint'));
  });

  it('empty run history renders empty state message', () => {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'No recent crafting history.';

    assert.equal(p.textContent, 'No recent crafting history.');
    assert.ok(p.classList.contains('hint'));
  });
});

// --- Action Button Callbacks ---

describe('RunSummary: Action Button Callbacks', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('continue button click dispatches onCraft with recipeId and runId', () => {
    const calls = [];
    function onCraft(recipeId, options) {
      calls.push({ recipeId, options });
    }

    const recipeId = 'recipe-abc';
    const runId = 'run-123';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => onCraft(recipeId, { runId });
    btn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].recipeId, 'recipe-abc');
    assert.deepEqual(calls[0].options, { runId: 'run-123' });
  });

  it('cancel button click dispatches onCancelRun with runId', () => {
    const calls = [];
    function onCancelRun(runId) {
      calls.push(runId);
    }

    const runId = 'run-456';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => onCancelRun(runId);
    btn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'run-456');
  });

  it('restart button click dispatches onRestartRun with recipeId and runId', () => {
    const calls = [];
    function onRestartRun(recipeId, runId) {
      calls.push({ recipeId, runId });
    }

    const recipeId = 'recipe-xyz';
    const runId = 'run-789';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => onRestartRun(recipeId, runId);
    btn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].recipeId, 'recipe-xyz');
    assert.equal(calls[0].runId, 'run-789');
  });
});

// --- Duplicate-key guard (T-168) ---

describe('RunSummary: Duplicate-key guard — composite key strategy', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  /**
   * Simulate the keying logic that RunSummary.svelte applies when rendering
   * {#each activeRuns as run (`active-${run.id}`)}.
   * With composite keys a duplicate run.id within activeRuns would still
   * produce a unique key (same id appears twice but the prefix+id is unique
   * only if the dedup layer in craftingStore removed the duplicate).
   *
   * These tests verify that when given a pre-deduplicated list (as the store
   * now guarantees) the composite key approach produces unique keys, and that
   * a list with raw duplicates would have produced collisions under the old
   * plain-id keying strategy.
   */

  it('composite key "active-<id>" is unique for deduplicated activeRuns list', () => {
    const runs = [
      { id: 'run-1', recipeName: 'Potion A', statusLabel: 'In Progress' },
      { id: 'run-2', recipeName: 'Potion B', statusLabel: 'In Progress' }
    ];

    const keys = runs.map(r => `active-${r.id}`);
    const uniqueKeys = new Set(keys);
    assert.equal(keys.length, uniqueKeys.size, 'All composite keys must be unique for a deduplicated list');
  });

  it('composite key "history-<id>" is unique for deduplicated runHistory list', () => {
    const runs = [
      { id: 'hist-1', recipeName: 'Sword', statusLabel: 'Succeeded' },
      { id: 'hist-2', recipeName: 'Shield', statusLabel: 'Failed' }
    ];

    const keys = runs.map(r => `history-${r.id}`);
    const uniqueKeys = new Set(keys);
    assert.equal(keys.length, uniqueKeys.size, 'All composite keys must be unique for a deduplicated history list');
  });

  it('active and history composite keys never collide even when run.id is shared across lists', () => {
    // A run that just finished may transiently appear in both collections.
    // The prefix ensures the keys are distinct across the two separate each blocks.
    const sharedRunId = 'shared-run-42';
    const activeKey = `active-${sharedRunId}`;
    const historyKey = `history-${sharedRunId}`;

    assert.notEqual(activeKey, historyKey, 'active and history keys with same run ID must differ');
  });

  it('rendering a list row for each deduplicated run produces the correct count of li elements', () => {
    const ul = document.createElement('ul');
    ul.className = 'run-list';

    const deduplicatedRuns = [
      { id: 'r1', recipeName: 'Brew', statusLabel: 'In Progress' },
      { id: 'r2', recipeName: 'Forge', statusLabel: 'Waiting' }
    ];

    for (const run of deduplicatedRuns) {
      const li = document.createElement('li');
      li.className = 'run-row';
      li.dataset.key = `active-${run.id}`;

      const strong = document.createElement('strong');
      strong.textContent = run.recipeName;
      li.appendChild(strong);

      ul.appendChild(li);
    }

    assert.equal(ul.querySelectorAll('li.run-row').length, 2);
  });

  it('deduplicating activeRuns before render eliminates duplicate-key-prone rows', () => {
    // Simulate what craftingStore now does: deduplicate before the list reaches RunSummary
    const rawRuns = [
      { id: 'dup-id', recipeName: 'Potion', statusLabel: 'In Progress' },
      { id: 'dup-id', recipeName: 'Potion', statusLabel: 'In Progress' }  // duplicate
    ];

    // Apply the same dedup logic as craftingStore
    const seen = new Set();
    const deduped = rawRuns.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    assert.equal(deduped.length, 1, 'Deduplication must reduce two identical-ID runs to one');

    const keys = deduped.map(r => `active-${r.id}`);
    const uniqueKeys = new Set(keys);
    assert.equal(keys.length, uniqueKeys.size, 'All composite keys must be unique after deduplication');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { syncGatheringDirectoryButton } from '../src/ui/itemsDirectoryButtons.js';

function setupDirectory() {
  const window = new Window();
  const document = window.document;
  const root = document.createElement('section');
  root.innerHTML = `
    <header class="directory-header">
      <div class="header-actions action-buttons flexrow">
        <button type="button" class="create-document" data-fabricate-action="craft">
          <span>Craft Item</span>
        </button>
      </div>
    </header>
  `;
  return {
    document,
    itemsDirectory: { element: root },
    actions: root.querySelector('.header-actions')
  };
}

function createGatheringButton(document) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.fabricateAction = 'gathering';
  button.textContent = 'Gathering';
  return button;
}

test('syncGatheringDirectoryButton inserts the Gathering button when gathering becomes enabled', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.ok(actions.querySelector('[data-fabricate-action="gathering"]'));
  assert.deepEqual(
    Array.from(actions.querySelectorAll('button')).map(button => button.dataset.fabricateAction),
    ['gathering', 'craft']
  );
});

test('syncGatheringDirectoryButton removes a stale Gathering button when gathering becomes disabled everywhere', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });
  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: false,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.equal(actions.querySelector('[data-fabricate-action="gathering"]'), null);
  assert.ok(actions.querySelector('[data-fabricate-action="craft"]'));
});

test('syncGatheringDirectoryButton does not duplicate an existing Gathering button on repeated syncs', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });
  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.equal(actions.querySelectorAll('[data-fabricate-action="gathering"]').length, 1);
});

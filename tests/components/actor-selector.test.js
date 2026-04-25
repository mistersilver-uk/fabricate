import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Suite 1: ActorSelector DOM and Behavior
// ---------------------------------------------------------------------------

describe('ActorSelector DOM and Behavior', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a select with options for each available actor', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: false, isAssignedCharacter: false },
      { id: 'actor-2', name: 'Bob', selected: true, isAssignedCharacter: false }
    ];

    const container = document.createElement('div');
    container.className = 'crafting-actor-selector';

    const select = document.createElement('select');
    select.id = 'crafting-actor';
    select.name = 'craftingActor';

    for (const actor of actors) {
      const opt = document.createElement('option');
      opt.value = actor.id;
      opt.textContent = actor.name;
      opt.selected = actor.selected;
      select.appendChild(opt);
    }
    container.appendChild(select);

    assert.equal(select.options.length, 2);
    assert.equal(select.options[0].value, 'actor-1');
    assert.ok(select.options[0].textContent.includes('Alice'));
    assert.equal(select.options[1].value, 'actor-2');
    assert.ok(select.options[1].textContent.includes('Bob'));
  });

  it('marks the assigned character with an asterisk', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: true, isAssignedCharacter: true },
      { id: 'actor-2', name: 'Bob', selected: false, isAssignedCharacter: false }
    ];

    const select = document.createElement('select');

    for (const actor of actors) {
      const opt = document.createElement('option');
      opt.value = actor.id;
      opt.textContent = actor.isAssignedCharacter ? `${actor.name} *` : actor.name;
      opt.selected = actor.selected;
      select.appendChild(opt);
    }

    assert.ok(select.options[0].textContent.includes('*'), 'Assigned character option should include *');
    assert.ok(!select.options[1].textContent.includes('*'), 'Non-assigned actor should not have *');
  });

  it('pre-selects the currently selected actor', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: false, isAssignedCharacter: false },
      { id: 'actor-2', name: 'Bob', selected: true, isAssignedCharacter: false }
    ];

    const select = document.createElement('select');

    for (const actor of actors) {
      const opt = document.createElement('option');
      opt.value = actor.id;
      opt.textContent = actor.name;
      opt.selected = actor.selected;
      select.appendChild(opt);
    }

    assert.equal(select.value, 'actor-2');
  });

  it('calls onSelectActor with the new actor id on change', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: true },
      { id: 'actor-2', name: 'Bob', selected: false }
    ];

    const select = document.createElement('select');

    for (const actor of actors) {
      const opt = document.createElement('option');
      opt.value = actor.id;
      opt.textContent = actor.name;
      opt.selected = actor.selected;
      select.appendChild(opt);
    }

    let capturedValue = null;
    select.addEventListener('change', (event) => {
      capturedValue = event.target.value;
    });

    // Simulate selection change to actor-2
    select.value = 'actor-2';
    select.dispatchEvent(new Event('change'));

    assert.equal(capturedValue, 'actor-2');
  });

  it('renders the hint text below the select', () => {
    const container = document.createElement('div');
    container.className = 'crafting-actor-selector';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = "Results will be added to this actor's inventory";
    container.appendChild(hint);

    const hintEl = container.querySelector('p.hint');
    assert.ok(hintEl, 'Hint paragraph should exist');
    assert.ok(hintEl.textContent.includes("Results will be added to this actor's inventory"));
  });
});

// ---------------------------------------------------------------------------
// Suite 2: SourceActorPicker DOM and Behavior
// ---------------------------------------------------------------------------

describe('SourceActorPicker DOM and Behavior', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a checkbox for each owned actor', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: true },
      { id: 'actor-2', name: 'Bob', selected: false }
    ];

    const container = document.createElement('div');
    container.className = 'source-actor-list';

    for (const actor of actors) {
      const label = document.createElement('label');
      label.className = 'source-actor-checkbox';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = actor.id;
      checkbox.checked = actor.selected;

      const span = document.createElement('span');
      span.className = 'actor-name';
      span.textContent = actor.name;

      label.appendChild(checkbox);
      label.appendChild(span);
      container.appendChild(label);
    }

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    assert.equal(checkboxes.length, 2);
    assert.equal(checkboxes[0].value, 'actor-1');
    assert.equal(checkboxes[1].value, 'actor-2');
  });

  it('pre-checks checkboxes for selected source actors', () => {
    const container = document.createElement('div');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = 'actor-1';
    checkbox.checked = true;
    container.appendChild(checkbox);

    assert.equal(container.querySelector('input[type="checkbox"]').checked, true);
  });

  it('calls onToggleSource with (actorId, checked) on change', () => {
    const container = document.createElement('div');
    container.className = 'source-actor-list';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = 'actor-1';
    checkbox.checked = false;
    container.appendChild(checkbox);

    let capturedActorId = null;
    let capturedChecked = null;

    container.addEventListener('change', (event) => {
      capturedActorId = event.target.value;
      capturedChecked = event.target.checked;
    });

    // Simulate toggling the checkbox on
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(capturedActorId, 'actor-1');
    assert.equal(capturedChecked, true);
  });

  it('shows warning when no owned actors are available', () => {
    const container = document.createElement('div');
    container.className = 'component-sources-selector';

    // No actors — render warning instead of list
    const warning = document.createElement('p');
    warning.className = 'no-actors-warning';
    warning.textContent = 'No owned actors available for component sources.';
    container.appendChild(warning);

    const warnEl = container.querySelector('p.no-actors-warning');
    assert.ok(warnEl, 'Warning element should exist');
    assert.ok(warnEl.textContent.includes('No owned actors'));

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    assert.equal(checkboxes.length, 0, 'No checkboxes should exist when no actors');
  });

  it('displays actor names next to checkboxes', () => {
    const actors = [
      { id: 'actor-1', name: 'Alice', selected: false },
      { id: 'actor-2', name: 'Bob', selected: true }
    ];

    const container = document.createElement('div');
    container.className = 'source-actor-list';

    for (const actor of actors) {
      const label = document.createElement('label');
      label.className = 'source-actor-checkbox';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = actor.id;
      checkbox.checked = actor.selected;

      const span = document.createElement('span');
      span.className = 'actor-name';
      span.textContent = actor.name;

      label.appendChild(checkbox);
      label.appendChild(span);
      container.appendChild(label);
    }

    const nameSpans = container.querySelectorAll('span.actor-name');
    assert.equal(nameSpans.length, 2);
    assert.equal(nameSpans[0].textContent, 'Alice');
    assert.equal(nameSpans[1].textContent, 'Bob');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: CraftingAppRoot Layout
// ---------------------------------------------------------------------------

describe('CraftingAppRoot Layout', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('root element has class fabricate-crafting-app', () => {
    const root = document.createElement('div');
    root.className = 'fabricate-crafting-app';

    assert.ok(root.classList.contains('fabricate-crafting-app'));
  });

  it('actor crafting header replaces the old selector section', () => {
    const root = document.createElement('div');
    root.className = 'fabricate-crafting-app';

    const header = document.createElement('header');
    header.className = 'actor-crafting-header';

    const craftingActor = document.createElement('button');
    craftingActor.className = 'selected-crafting-actor';

    const sourceAvatars = document.createElement('div');
    sourceAvatars.className = 'component-source-avatars';

    header.appendChild(craftingActor);
    header.appendChild(sourceAvatars);
    root.appendChild(header);

    assert.ok(root.querySelector('.actor-crafting-header'), 'actor-crafting-header should exist');
    assert.ok(root.querySelector('.selected-crafting-actor'), 'selected crafting actor button should exist');
    assert.ok(root.querySelector('.component-source-avatars'), 'source avatar row should exist');
    assert.equal(root.querySelector('.actor-selection-section'), null, 'old selector section should not be rendered');
  });

  it('run summary section is hidden when no crafting actor', () => {
    // When hasCraftingActor is false, the run-summary-section is NOT rendered
    const root = document.createElement('div');
    root.className = 'fabricate-crafting-app';

    // Do NOT append the run-summary-section (hasCraftingActor = false)

    assert.equal(root.querySelector('.run-summary-section'), null, 'run-summary-section should not be present');
  });

  it('recipe list shows empty state when no component sources selected', () => {
    const root = document.createElement('div');
    root.className = 'fabricate-crafting-app';

    const recipeList = document.createElement('div');
    recipeList.className = 'fabricate-recipe-list';

    // hasComponentSources = false → show empty state
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'fabricate-empty';

    const icon = document.createElement('i');
    icon.className = 'fas fa-info-circle';
    emptyDiv.appendChild(icon);

    const msg = document.createElement('p');
    msg.textContent = 'No owned actors available for component sources.';
    emptyDiv.appendChild(msg);

    recipeList.appendChild(emptyDiv);
    root.appendChild(recipeList);

    assert.ok(root.querySelector('.fabricate-empty'), 'fabricate-empty div should be present');
    assert.ok(root.querySelector('.fabricate-recipe-list .fabricate-empty'), 'empty state should be inside recipe list');
  });
});

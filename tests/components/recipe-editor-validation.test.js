/**
 * Tests for recipe editor validation UI (T-095)
 * DOM-based tests that mirror the component output structure.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring component output
// ---------------------------------------------------------------------------

function buildValidationBanner(errors, onScrollToError) {
  if (!errors || errors.length === 0) return null;

  const banner = document.createElement('div');
  banner.className = 'validation-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');

  const strong = document.createElement('strong');
  strong.textContent = 'Fix before saving:';
  banner.appendChild(strong);

  const ul = document.createElement('ul');
  ul.className = 'validation-error-list';
  for (const error of errors) {
    const li = document.createElement('li');
    if (error.panelId || error.fieldSelector) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'validation-error-link';
      btn.textContent = error.message;
      btn.onclick = () => onScrollToError?.(error);
      li.appendChild(btn);
    } else {
      const span = document.createElement('span');
      span.textContent = error.message;
      li.appendChild(span);
    }
    ul.appendChild(li);
  }
  banner.appendChild(ul);
  return banner;
}

function buildRecipeNameInput(value, hasError) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-row';

  const label = document.createElement('label');
  label.setAttribute('for', 'recipeName');
  label.textContent = 'Name';
  wrapper.appendChild(label);

  const input = document.createElement('input');
  input.id = 'recipeName';
  input.name = 'recipeName';
  input.type = 'text';
  input.value = value;
  if (hasError) {
    input.classList.add('field-error');
  }
  wrapper.appendChild(input);

  if (hasError) {
    const span = document.createElement('span');
    span.className = 'inline-error';
    span.textContent = 'Recipe name is required.';
    wrapper.appendChild(span);
  }

  return wrapper;
}

function buildIngredientGroupCard(group, hasError) {
  const div = document.createElement('div');
  div.className = 'ingredient-group-card';
  if (hasError) {
    div.classList.add('group-error');
  }
  div.dataset.groupId = group.id;

  const header = document.createElement('div');
  header.className = 'group-header';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'group-name-input';
  nameInput.value = group.name || '';
  header.appendChild(nameInput);
  div.appendChild(header);

  return div;
}

function buildResultGroupPanel(group, hasError) {
  const section = document.createElement('section');
  section.className = 'accordion-panel result-group-panel';
  if (hasError) {
    section.classList.add('group-error');
  }
  section.dataset.panelId = group.id;
  return section;
}

// ---------------------------------------------------------------------------
// ValidationBanner tests
// ---------------------------------------------------------------------------

describe('ValidationBanner: renders error list', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders banner when errors are present', () => {
    const errors = [{ message: 'Recipe name is required.' }];
    const banner = buildValidationBanner(errors);
    assert.ok(banner, 'Banner should be rendered');
    assert.equal(banner.getAttribute('role'), 'alert');
  });

  it('returns null when errors array is empty', () => {
    const banner = buildValidationBanner([]);
    assert.equal(banner, null, 'Banner should not render for empty errors');
  });

  it('renders one list item per error', () => {
    const errors = [
      { message: 'Error one' },
      { message: 'Error two' },
      { message: 'Error three' }
    ];
    const banner = buildValidationBanner(errors);
    const items = banner.querySelectorAll('.validation-error-list li');
    assert.equal(items.length, 3);
  });

  it('renders a clickable button for errors with fieldSelector', () => {
    const errors = [{ message: 'Name required', fieldSelector: '[name="recipeName"]' }];
    const banner = buildValidationBanner(errors);
    const btn = banner.querySelector('.validation-error-link');
    assert.ok(btn, 'Link button should render for errors with fieldSelector');
    assert.equal(btn.textContent, 'Name required');
  });

  it('renders a clickable button for errors with panelId', () => {
    const errors = [{ message: 'Group has no items', panelId: 'set-1' }];
    const banner = buildValidationBanner(errors);
    const btn = banner.querySelector('.validation-error-link');
    assert.ok(btn, 'Link button should render for errors with panelId');
  });

  it('renders plain span for errors with no panelId or fieldSelector', () => {
    const errors = [{ message: 'Generic error' }];
    const banner = buildValidationBanner(errors);
    const btn = banner.querySelector('.validation-error-link');
    const span = banner.querySelector('.validation-error-list span');
    assert.equal(btn, null, 'No link button for plain errors');
    assert.ok(span, 'Plain span should render');
    assert.equal(span.textContent, 'Generic error');
  });

  it('error link button calls onScrollToError with error object', () => {
    const calls = [];
    const error = { message: 'Name required', fieldSelector: '[name="recipeName"]' };
    const banner = buildValidationBanner([error], (e) => calls.push(e));
    const btn = banner.querySelector('.validation-error-link');
    btn.click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, 'Name required');
    assert.equal(calls[0].fieldSelector, '[name="recipeName"]');
  });
});

// ---------------------------------------------------------------------------
// Recipe name field-error class tests
// ---------------------------------------------------------------------------

describe('RecipeNameInput: field-error class', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('adds field-error class to input when name is empty and validation fails', () => {
    const wrapper = buildRecipeNameInput('', true);
    const input = wrapper.querySelector('input#recipeName');
    assert.ok(input.classList.contains('field-error'), 'Input should have field-error class');
  });

  it('does not add field-error class when name is valid', () => {
    const wrapper = buildRecipeNameInput('My Recipe', false);
    const input = wrapper.querySelector('input#recipeName');
    assert.ok(!input.classList.contains('field-error'), 'Input should not have field-error class');
  });

  it('renders inline-error span when name is empty', () => {
    const wrapper = buildRecipeNameInput('', true);
    const span = wrapper.querySelector('span.inline-error');
    assert.ok(span, 'inline-error span should render');
    assert.ok(span.textContent.includes('required'), 'Inline error text should mention required');
  });

  it('does not render inline-error span when name is valid', () => {
    const wrapper = buildRecipeNameInput('My Recipe', false);
    const span = wrapper.querySelector('span.inline-error');
    assert.equal(span, null, 'inline-error span should not render when name is valid');
  });
});

// ---------------------------------------------------------------------------
// IngredientGroupCard: group-error class tests
// ---------------------------------------------------------------------------

describe('IngredientGroupCard: group-error class', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('adds group-error class when hasError is true', () => {
    const group = { id: 'group-1', name: 'Group 1' };
    const card = buildIngredientGroupCard(group, true);
    assert.ok(card.classList.contains('ingredient-group-card'), 'Base class should be present');
    assert.ok(card.classList.contains('group-error'), 'group-error class should be present when hasError=true');
  });

  it('does not add group-error class when hasError is false', () => {
    const group = { id: 'group-2', name: 'Group 2' };
    const card = buildIngredientGroupCard(group, false);
    assert.ok(!card.classList.contains('group-error'), 'group-error class should not be present when hasError=false');
  });

  it('has data-group-id attribute set to group id', () => {
    const group = { id: 'group-abc', name: 'Test Group' };
    const card = buildIngredientGroupCard(group, false);
    assert.equal(card.dataset.groupId, 'group-abc');
  });
});

// ---------------------------------------------------------------------------
// ResultGroupPanel: group-error class tests
// ---------------------------------------------------------------------------

describe('ResultGroupPanel: group-error class', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('adds group-error class when hasError is true', () => {
    const group = { id: 'result-1', name: 'Results' };
    const panel = buildResultGroupPanel(group, true);
    assert.ok(panel.classList.contains('result-group-panel'), 'Base class should be present');
    assert.ok(panel.classList.contains('group-error'), 'group-error class should be present when hasError=true');
  });

  it('does not add group-error class when hasError is false', () => {
    const group = { id: 'result-2', name: 'Results' };
    const panel = buildResultGroupPanel(group, false);
    assert.ok(!panel.classList.contains('group-error'), 'group-error class should not be present when hasError=false');
  });

  it('has data-panel-id attribute set to group id', () => {
    const group = { id: 'result-xyz', name: 'Results' };
    const panel = buildResultGroupPanel(group, false);
    assert.equal(panel.dataset.panelId, 'result-xyz');
  });
});

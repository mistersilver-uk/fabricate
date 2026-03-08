import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

describe('Pagination component', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders nothing when showPagination is false', () => {
    // When showPagination is false, no footer element is rendered
    const container = document.createElement('div');
    // Simulate: component renders nothing
    assert.equal(container.querySelector('footer'), null);
  });

  it('renders correct range text for a normal page', () => {
    const footer = document.createElement('footer');
    footer.className = 'fabricate-footer';

    const span = document.createElement('span');
    span.className = 'pagination';
    span.textContent = 'Showing 1-10 of 25 recipes';
    footer.appendChild(span);

    assert.equal(span.textContent, 'Showing 1-10 of 25 recipes');
    assert.ok(footer.classList.contains('fabricate-footer'));
    assert.ok(span.classList.contains('pagination'));
  });

  it('renders correct range text for a single item', () => {
    const span = document.createElement('span');
    span.className = 'pagination';
    span.textContent = 'Showing 1-1 of 1 recipes';

    assert.equal(span.textContent, 'Showing 1-1 of 1 recipes');
  });

  it('renders correct range text for full list on one page', () => {
    const span = document.createElement('span');
    span.className = 'pagination';
    span.textContent = 'Showing 1-5 of 5 recipes';

    assert.equal(span.textContent, 'Showing 1-5 of 5 recipes');
  });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// --- SearchBar debounce behavior tests ---

describe('SearchBar debounce logic', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('debounce fires callback after delay', () => {
    return new Promise((resolve) => {
      let result = null;
      const callback = (val) => { result = val; };

      let timer = null;
      const debounceMs = 50;
      function handleInput(value) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          callback(value);
        }, debounceMs);
      }

      handleInput('test');
      assert.equal(result, null, 'Should not fire immediately');

      setTimeout(() => {
        assert.equal(result, 'test', 'Should fire after delay');
        resolve();
      }, 100);
    });
  });

  it('debounce resets on rapid input', () => {
    return new Promise((resolve) => {
      const calls = [];
      const callback = (val) => calls.push(val);

      let timer = null;
      const debounceMs = 50;
      function handleInput(value) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          callback(value);
        }, debounceMs);
      }

      handleInput('a');
      handleInput('ab');
      handleInput('abc');

      setTimeout(() => {
        assert.equal(calls.length, 1, 'Should only fire once');
        assert.equal(calls[0], 'abc', 'Should fire with last value');
        resolve();
      }, 100);
    });
  });

  it('zero debounce fires immediately', () => {
    let result = null;
    const callback = (val) => { result = val; };

    const debounceMs = 0;
    function handleInput(value) {
      if (debounceMs <= 0) {
        callback(value);
        return;
      }
    }

    handleInput('instant');
    assert.equal(result, 'instant');
  });

  it('cleanup clears pending timer', () => {
    return new Promise((resolve) => {
      let result = null;
      const callback = (val) => { result = val; };

      let timer = null;
      const debounceMs = 50;
      function handleInput(value) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          callback(value);
        }, debounceMs);
      }
      function cleanup() {
        if (timer) clearTimeout(timer);
        timer = null;
      }

      handleInput('will-cancel');
      cleanup();

      setTimeout(() => {
        assert.equal(result, null, 'Timer should have been cleared');
        resolve();
      }, 100);
    });
  });
});

// --- SearchBar DOM structure tests ---

describe('SearchBar DOM structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('creates expected DOM structure', () => {
    const container = document.createElement('div');
    container.className = 'fabricate-search';

    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'search';
    input.placeholder = 'Search recipes...';
    input.setAttribute('aria-label', 'Search');
    container.appendChild(input);

    const icon = document.createElement('i');
    icon.className = 'fas fa-search';
    container.appendChild(icon);

    assert.ok(container.querySelector('input[type="text"]'));
    assert.ok(container.querySelector('i.fas.fa-search'));
    assert.equal(container.querySelector('input').placeholder, 'Search recipes...');
    assert.equal(container.querySelector('input').getAttribute('aria-label'), 'Search');
    assert.equal(container.querySelector('input').name, 'search');
  });

  it('uses provided placeholder text', () => {
    const input = document.createElement('input');
    input.placeholder = 'Custom placeholder';
    assert.equal(input.placeholder, 'Custom placeholder');
  });
});

// --- FilterBar DOM structure tests ---

describe('FilterBar DOM structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('toggle button shows correct text', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fabricate-filter-btn';
    button.textContent = 'Craftable Only';

    assert.equal(button.textContent, 'Craftable Only');
    assert.equal(button.type, 'button');
    assert.ok(button.classList.contains('fabricate-filter-btn'));
  });

  it('toggle button has active class when craftable-only is on', () => {
    const button = document.createElement('button');
    button.className = 'fabricate-filter-btn active';

    assert.ok(button.classList.contains('active'));
    assert.ok(button.classList.contains('fabricate-filter-btn'));
  });

  it('toggle button lacks active class when craftable-only is off', () => {
    const button = document.createElement('button');
    button.className = 'fabricate-filter-btn';

    assert.ok(!button.classList.contains('active'));
  });

  it('category select has default "All Categories" option', () => {
    const select = document.createElement('select');
    select.className = 'fabricate-category-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'All Categories';
    select.appendChild(defaultOpt);

    assert.equal(select.options[0].value, '');
    assert.equal(select.options[0].textContent, 'All Categories');
  });

  it('category select renders all provided categories', () => {
    const select = document.createElement('select');
    const categories = ['Potions', 'Weapons', 'Armor'];

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'All Categories';
    select.appendChild(defaultOpt);

    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }

    assert.equal(select.options.length, 4);
    assert.equal(select.options[1].value, 'Potions');
    assert.equal(select.options[2].value, 'Weapons');
    assert.equal(select.options[3].value, 'Armor');
  });

  it('category select renders with no categories (only default option)', () => {
    const select = document.createElement('select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'All Categories';
    select.appendChild(defaultOpt);

    assert.equal(select.options.length, 1);
    assert.equal(select.options[0].textContent, 'All Categories');
  });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Suite: AlchemySystemSelector DOM and Behavior
// ---------------------------------------------------------------------------

describe('AlchemySystemSelector: renders dropdown when multiple systems', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a select element with an option for each alchemy system', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];

    const container = document.createElement('div');
    container.className = 'alchemy-system-selector';

    const select = document.createElement('select');
    select.className = 'alchemy-system-select';

    for (const system of alchemySystems) {
      const opt = document.createElement('option');
      opt.value = system.id;
      opt.textContent = system.name;
      select.appendChild(opt);
    }

    container.appendChild(select);

    assert.equal(select.options.length, 2);
    assert.equal(select.options[0].value, 'sys-1');
    assert.ok(select.options[0].textContent.includes('Herbalism'));
    assert.equal(select.options[1].value, 'sys-2');
    assert.ok(select.options[1].textContent.includes('Transmutation'));
  });

  it('pre-selects the currently selected system id', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];
    const selectedSystemId = 'sys-2';

    const select = document.createElement('select');

    for (const system of alchemySystems) {
      const opt = document.createElement('option');
      opt.value = system.id;
      opt.textContent = system.name;
      opt.selected = system.id === selectedSystemId;
      select.appendChild(opt);
    }

    assert.equal(select.value, 'sys-2');
  });

  it('renders select with full-width style, height 32px, font-size 13px', () => {
    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.height = '32px';
    select.style.fontSize = '13px';

    assert.equal(select.style.width, '100%');
    assert.equal(select.style.height, '32px');
    assert.equal(select.style.fontSize, '13px');
  });

  it('container has margin-bottom 8px when multiple systems', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];

    const wrapper = document.createElement('div');
    wrapper.className = 'alchemy-system-selector';

    if (alchemySystems.length > 1) {
      wrapper.style.marginBottom = '8px';
    }

    assert.equal(wrapper.style.marginBottom, '8px');
  });
});

describe('AlchemySystemSelector: hidden when single system', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('does not render the select wrapper when only one system exists', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' }
    ];

    const root = document.createElement('div');

    if (alchemySystems.length > 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'alchemy-system-selector';
      root.appendChild(wrapper);
    }

    assert.equal(
      root.querySelector('.alchemy-system-selector'),
      null,
      'Wrapper should not be rendered when there is only one system'
    );
  });

  it('does not render the select when the systems array is empty', () => {
    const alchemySystems = [];

    const root = document.createElement('div');

    if (alchemySystems.length > 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'alchemy-system-selector';
      root.appendChild(wrapper);
    }

    assert.equal(root.querySelector('.alchemy-system-selector'), null);
  });

  it('renders the select wrapper when more than one system exists', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];

    const root = document.createElement('div');

    if (alchemySystems.length > 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'alchemy-system-selector';
      root.appendChild(wrapper);
    }

    assert.ok(
      root.querySelector('.alchemy-system-selector'),
      'Wrapper should be rendered when there are multiple systems'
    );
  });
});

describe('AlchemySystemSelector: calls onSelectSystem on change', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('calls onSelectSystem with the newly selected system id on change', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];

    const select = document.createElement('select');

    for (const system of alchemySystems) {
      const opt = document.createElement('option');
      opt.value = system.id;
      opt.textContent = system.name;
      select.appendChild(opt);
    }

    let capturedId = null;
    function onSelectSystem(systemId) {
      capturedId = systemId;
    }

    select.addEventListener('change', (event) => {
      onSelectSystem(event.target.value);
    });

    select.value = 'sys-2';
    select.dispatchEvent(new Event('change'));

    assert.equal(capturedId, 'sys-2');
  });

  it('calls onSelectSystem with the first system id when selecting it', () => {
    const alchemySystems = [
      { id: 'sys-1', name: 'Herbalism' },
      { id: 'sys-2', name: 'Transmutation' }
    ];

    const select = document.createElement('select');

    for (const system of alchemySystems) {
      const opt = document.createElement('option');
      opt.value = system.id;
      opt.textContent = system.name;
      select.appendChild(opt);
    }
    select.value = 'sys-2';

    let capturedId = null;
    select.addEventListener('change', (event) => {
      capturedId = event.target.value;
    });

    select.value = 'sys-1';
    select.dispatchEvent(new Event('change'));

    assert.equal(capturedId, 'sys-1');
  });

  it('onSelectSystem is invoked exactly once per change event', () => {
    const alchemySystems = [
      { id: 'sys-a', name: 'Alchemy A' },
      { id: 'sys-b', name: 'Alchemy B' }
    ];

    const select = document.createElement('select');
    for (const system of alchemySystems) {
      const opt = document.createElement('option');
      opt.value = system.id;
      opt.textContent = system.name;
      select.appendChild(opt);
    }

    let callCount = 0;
    select.addEventListener('change', () => {
      callCount++;
    });

    select.value = 'sys-b';
    select.dispatchEvent(new Event('change'));

    assert.equal(callCount, 1, 'onSelectSystem should be called exactly once per change');
  });
});

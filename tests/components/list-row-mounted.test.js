/**
 * Issue 1778 — `<ListRow>`. The dense read-only form is pinned first, as markup over a fixture
 * matrix and as the sheet's dense rules, so the selectable form provably leaves it unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-row-form-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
  rootClass: 'fabricate fabricate-app',
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));

/**
 * Rendered markup: elements, attributes in emitted order and text. Svelte's comment anchors and
 * whitespace-only text runs are dropped (neither renders inside the flex root), as is a scoping
 * hash, which belongs to the Medallion's stylesheet rather than to this row.
 */
function serialize(node) {
  if (node.nodeType === 3) return node.textContent.trim() === '' ? '' : node.textContent;
  if (node.nodeType !== 1) return '';
  const attributes = [...node.attributes]
    .map(({ name, value }) => {
      const kept = name === 'class' ? value.replaceAll(/\s*svelte-[a-z0-9]+/g, '').trim() : value;
      return ` ${name}="${kept}"`;
    })
    .join('');
  const tag = node.tagName.toLowerCase();
  return `<${tag}${attributes}>${[...node.childNodes].map(serialize).join('')}</${tag}>`;
}

const GLYPH =
  '<span class="fab-medallion" data-medallion="glyph" style="width: 22px; height: 22px;">';
const BOX = `${GLYPH}<i aria-hidden="true" class="fas fa-box"></i></span>`;
const NAME = (name) => `<span class="fabricate-list-row-name" title="${name}">${name}</span>`;

/** The dense matrix: every read-only prop the shipped form takes, and no prop the form adds. */
const DENSE_MATRIX = Object.freeze([
  [
    'name only',
    { name: 'Iron Ingot' },
    `<div class="fabricate-list-row" data-list-row="dense">${BOX}${NAME('Iron Ingot')}</div>`,
  ],
  [
    'art, quantity, detail and trailing',
    {
      name: 'Steel Ingot',
      art: 'icons/svg/item-bag.svg',
      quantity: '×2',
      detail: 'Stage 1',
      trailing: snippet('<span class="probe-trailing">42%</span>'),
    },
    '<div class="fabricate-list-row" data-list-row="dense">' +
      '<span class="fab-medallion" data-medallion="image" style="width: 22px; height: 22px;">' +
      '<img class="fab-medallion-img" src="icons/svg/item-bag.svg" alt=""></img></span>' +
      NAME('Steel Ingot') +
      '<span class="fabricate-list-row-detail">Stage 1</span>' +
      '<span class="fabricate-list-row-quantity">×2</span>' +
      '<span class="probe-trailing">42%</span></div>',
  ],
  [
    'a tinted glyph',
    { name: 'Ironwort', icon: 'fas fa-leaf', tint: 'sage', quantity: 3 },
    '<div class="fabricate-list-row" data-list-row="dense">' +
      '<span class="fab-medallion" data-medallion="glyph" data-medallion-tint="sage" ' +
      'style="width: 22px; height: 22px; --fab-medallion-tint: var(--fab-tag-sage);">' +
      '<i aria-hidden="true" class="fas fa-leaf"></i></span>' +
      NAME('Ironwort') +
      '<span class="fabricate-list-row-quantity">3</span></div>',
  ],
  [
    'tone neutral',
    { name: 'Copper', tone: 'neutral', quantity: '×1' },
    `<div class="fabricate-list-row" data-list-row="dense">${BOX}${NAME('Copper')}` +
      '<span class="fabricate-list-row-quantity">×1</span></div>',
  ],
  [
    'tone positive at a zero quantity',
    { name: 'Copper', tone: 'positive', quantity: 0 },
    `<div class="fabricate-list-row is-positive" data-list-row="dense">${BOX}${NAME('Copper')}` +
      '<span class="fabricate-list-row-quantity">0</span></div>',
  ],
  [
    'muted with no quantity',
    { name: 'Tin', muted: true, quantity: null, detail: 'Not recorded' },
    `<div class="fabricate-list-row is-muted" data-list-row="dense">${BOX}${NAME('Tin')}` +
      '<span class="fabricate-list-row-detail">Not recorded</span></div>',
  ],
  [
    'truncateName',
    { name: 'A very long material name', truncateName: true, detail: 'Consumed' },
    `<div class="fabricate-list-row is-truncated" data-list-row="dense">${BOX}` +
      NAME('A very long material name') +
      '<span class="fabricate-list-row-detail" title="Consumed">Consumed</span></div>',
  ],
  [
    'class and a root hook',
    { name: 'Bronze', class: 'probe-caller', 'data-probe-row': 'b1' },
    '<div class="fabricate-list-row probe-caller" data-probe-row="b1" data-list-row="dense">' +
      `${BOX}${NAME('Bronze')}</div>`,
  ],
]);

/** The sheet's dense rules exactly as issue 1648 shipped them, before the selectable form. */
const DENSE_CSS = [
  '.fabricate-list-row {',
  '  display: flex;',
  '  align-items: center;',
  '  min-width: 0;',
  '  gap: var(--fab-space-2);',
  '  padding: var(--fab-space-2) var(--fab-space-3);',
  '  border: 1px solid var(--fab-border);',
  '  border-radius: 9px;',
  '  background: var(--fab-bg-1);',
  '  color: var(--fab-text-subtle);',
  '  font-size: 10.5px;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-name {',
  '  min-width: 0;',
  '  flex: 1 1 auto;',
  '  color: var(--fab-text);',
  '  font-family: var(--font-primary, sans-serif);',
  '  font-size: 12px;',
  '  font-weight: 600;',
  '  overflow-wrap: anywhere;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-quantity {',
  '  flex: 0 0 auto;',
  '  font-family: var(--fab-font-mono);',
  '  font-weight: 500;',
  '  font-variant-numeric: tabular-nums;',
  '}',
  '',
  '.fabricate-list-row.is-truncated .fabricate-list-row-name,',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail {',
  '  overflow: hidden;',
  '  text-overflow: ellipsis;',
  '  white-space: nowrap;',
  '}',
  '',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail {',
  '  flex: 0 1 50%;',
  '}',
  '',
  '.fabricate-list-row .fabricate-list-row-detail {',
  '  min-width: 0;',
  '  overflow-wrap: anywhere;',
  '}',
  '',
  '.fabricate-list-row.is-positive {',
  '  border-color: var(--fab-success-border);',
  '  background: var(--fab-success-soft);',
  '}',
  '',
  '.fabricate-list-row.is-muted {',
  '  border-style: dashed;',
  '}',
  '',
  '.fabricate-list-row.is-muted .fabricate-list-row-name {',
  '  color: var(--fab-text-subtle);',
  '}',
].join('\n');

/** The classes the dense matrix emits on the row and its own children. */
const DENSE_CLASSES = new Set([
  'fabricate-list-row',
  'fabricate-list-row-name',
  'fabricate-list-row-detail',
  'fabricate-list-row-quantity',
  'is-positive',
  'is-muted',
  'is-truncated',
]);

const SHEET_PATH = resolve(repoRoot, 'styles/fabricate.css');
const SHEET = readFileSync(SHEET_PATH, 'utf8').replaceAll('\r\n', '\n');

/** Every sheet rule's selector list that names the row family, comments stripped. */
const familySelectors = (sheet) =>
  sheet
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .flatMap((block) => {
      const selector = block.slice(0, block.indexOf('{')).trim();
      if (!selector.includes('.fabricate-list-row')) return [];
      return selector.split(',').map((part) => part.trim());
    });

/** A selector the dense matrix could match: every class it names is one a dense row emits. */
const reachesDense = (selector) =>
  [...selector.matchAll(/\.([\w-]+)/g)].every(([, name]) => DENSE_CLASSES.has(name)) &&
  !/\[|:has\(/.test(selector);

describe('ListRow dense form is unchanged (issue 1778)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  for (const [label, props, markup] of DENSE_MATRIX) {
    it(`renders the pinned dense markup: ${label}`, async () => {
      const target = await harness.mount(props);
      const rows = target.querySelectorAll('[data-list-row]');
      assert.equal(rows.length, 1, 'one row');
      assert.equal(serialize(rows[0]), markup);
    });
  }

  it('keeps the dense rules of the sheet byte for byte, once', () => {
    assert.ok(SHEET.includes(DENSE_CSS), 'the dense block is present and unchanged');
    assert.equal(SHEET.indexOf(DENSE_CSS), SHEET.lastIndexOf(DENSE_CSS), 'and written once');
  });

  it('adds no rule outside the pinned block that a dense row could match', () => {
    const reaching = familySelectors(SHEET.replace(DENSE_CSS, '')).filter(reachesDense);
    assert.deepEqual(reaching, [], 'a new rule must name a class or state the dense row never has');
    assert.ok(reachesDense('.fabricate-list-row.is-muted'), 'the probe recognises a dense rule');
    assert.ok(!reachesDense('.fabricate-list-row.is-card'), 'and a form-only one');
  });
});

/** Content a native button may not hold: flow and grouping elements, and widget roles. */
const NON_PHRASING = 'div, p, ul, ol, li, section, table, h1, h2, h3, h4, h5, h6, meter, progress';
const BLOCK_ROLES = '[role="meter"], [role="group"], [role="progressbar"], [role="list"]';

/** A row with every region filled, so each assertion below is over the full form. */
function fullRow(overrides = {}) {
  return {
    name: 'Healing Potion',
    art: 'icons/svg/item-bag.svg',
    markSize: 30,
    badges: snippet('<span class="probe-badge">In progress</span>'),
    meta: snippet('<span class="probe-meta">Stage 1 of 2</span>'),
    children: snippet('<span class="probe-children">A gentle tonic.</span>'),
    aside: snippet('<div class="probe-aside"><div role="meter" aria-label="Progress"></div></div>'),
    trailing: snippet('<button type="button" class="probe-trailing">Favourite</button>'),
    ...overrides,
  };
}

const controlOf = (target) => target.querySelector('.fabricate-list-row-open');

describe('ListRow selectable form (issue 1778)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('draws one native button holding phrasing content only, with the block regions beside it', async () => {
    const target = await harness.mount(fullRow({ onOpen: () => {} }));
    const row = target.querySelector('[data-list-row]');
    const buttons = row.querySelectorAll('button.fabricate-list-row-open');
    assert.equal(buttons.length, 1, 'one control per row');
    const control = buttons[0];
    assert.equal(control.getAttribute('type'), 'button');
    assert.equal(control.getAttribute('data-keyboard-focus'), 'true');
    assert.ok(!row.querySelector(':scope button button'), 'no control nests another');
    const blocks = [...control.querySelectorAll(`${NON_PHRASING}, ${BLOCK_ROLES}`)];
    assert.deepEqual(
      blocks.map((node) => node.tagName.toLowerCase()),
      [],
      'no block content inside'
    );
    for (const part of ['probe-badge', 'probe-meta', 'probe-children']) {
      assert.ok(control.querySelector(`.${part}`), `${part} sits inside the control`);
    }
    const aside = row.querySelector('.fabricate-list-row-aside');
    assert.ok(aside?.querySelector('[role="meter"]'), 'the meter sits in the aside');
    assert.equal(aside.parentElement, row, 'the aside is a child of the root');
    assert.ok(!control.contains(row.querySelector('.probe-trailing')), 'trailing sits beside it');
    assert.ok(row.classList.contains('is-form'), 'the root carries the form class');
    assert.equal(row.querySelector('.fab-medallion').style.width, '30px', 'the 30px rung');
  });

  it('lists the region ids in aria-describedby, then the caller’s, each resolving', async () => {
    const target = await harness.mount(
      fullRow({ onOpen: () => {}, openProps: { 'aria-describedby': 'caller-note' } })
    );
    const ids = controlOf(target).getAttribute('aria-describedby').split(' ');
    assert.equal(ids.length, 4, ids.join(' '));
    assert.equal(ids.at(-1), 'caller-note', "the caller's id comes last");
    const regions = ids.slice(0, 3).map((id) => target.querySelector(`[id="${id}"]`));
    assert.deepEqual(
      regions.map((node) => node?.className),
      ['fabricate-list-row-meta', 'fabricate-list-row-children', 'fabricate-list-row-aside']
    );
  });

  it('states aria-pressed only when `selected` is given', async () => {
    const seen = [];
    for (const selected of [undefined, false, true]) {
      const target = await harness.mount({ name: 'Run', onOpen: () => {}, selected });
      seen.push(controlOf(target).getAttribute('aria-pressed'));
      harness.remount();
    }
    assert.deepEqual(seen, [null, 'false', 'true'], 'an action row states no pressed state');
  });

  it("merges the caller's class and drops the attributes the control owns", async () => {
    let siteClicks = 0;
    let opened = 0;
    const target = await harness.mount({
      name: 'Run',
      selected: true,
      onOpen: () => {
        opened += 1;
      },
      openProps: {
        class: ['journal-run-card', 'is-selected'],
        role: 'link',
        tabindex: '-1',
        type: 'submit',
        'aria-pressed': 'mixed',
        'data-keyboard-focus': 'false',
        onclick: () => {
          siteClicks += 1;
        },
        'data-run-id': 'r1',
        title: 'Open the run',
      },
    });
    const control = controlOf(target);
    assert.deepEqual(
      [...control.classList],
      ['fabricate-list-row-open', 'journal-run-card', 'is-selected']
    );
    assert.ok(!control.hasAttribute('role'), 'the caller cannot re-role the control');
    assert.ok(!control.hasAttribute('tabindex'), 'nor take it out of the tab order');
    assert.equal(control.getAttribute('type'), 'button');
    assert.equal(control.getAttribute('aria-pressed'), 'true', 'the pressed state is the row’s');
    assert.equal(control.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(control.getAttribute('data-run-id'), 'r1', 'a hook passes through');
    assert.equal(control.getAttribute('title'), 'Open the run');
    control.click();
    assert.deepEqual([opened, siteClicks], [1, 0], 'activation is onOpen alone');
  });

  it('hands onOpen the activating event, so a modifier reaches the caller', async () => {
    let received = null;
    const target = await harness.mount({
      name: 'Card',
      onOpen: (event) => {
        received = event;
      },
    });
    controlOf(target).dispatchEvent(
      new globalThis.MouseEvent('click', { bubbles: true, shiftKey: true })
    );
    assert.equal(received?.shiftKey, true);
  });

  it('passes other handlers through to the control', async () => {
    const keys = [];
    const target = await harness.mount({
      name: 'Card',
      onOpen: () => {},
      openProps: {
        onkeydown: (event) => {
          keys.push(event.key);
        },
        draggable: 'true',
      },
    });
    const control = controlOf(target);
    control.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(keys, ['Enter']);
    assert.equal(control.getAttribute('draggable'), 'true');
  });

  it('refuses a click while disabled', async () => {
    let opened = 0;
    const target = await harness.mount({
      name: 'Component',
      disabled: true,
      onOpen: () => {
        opened += 1;
      },
    });
    const control = controlOf(target);
    assert.equal(control.disabled, true);
    control.click();
    assert.equal(opened, 0);
  });

  it('opens nothing from a trailing control', async () => {
    let opened = 0;
    const target = await harness.mount(
      fullRow({
        onOpen: () => {
          opened += 1;
        },
      })
    );
    target.querySelector('.probe-trailing').click();
    assert.equal(opened, 0);
    target.querySelector('.probe-meta').click();
    assert.equal(opened, 1, 'while content inside the control opens it');
  });

  it('renders an inert div for openProps alone, and no wrapper with neither', async () => {
    const inert = await harness.mount(
      fullRow({
        openProps: { class: 'site-static', role: 'button', tabindex: '0', onclick: () => {} },
      })
    );
    const wrapper = controlOf(inert);
    assert.equal(wrapper.tagName, 'DIV');
    assert.ok(wrapper.classList.contains('site-static'));
    assert.ok(!wrapper.hasAttribute('role') && !wrapper.hasAttribute('tabindex'));
    assert.ok(!wrapper.hasAttribute('aria-pressed'));
    assert.equal(inert.querySelectorAll('button').length, 1, 'only the trailing button remains');
    harness.remount();
    const bare = await harness.mount(fullRow({ trailing: null }));
    assert.ok(!controlOf(bare), 'no wrapper');
    assert.equal(bare.querySelectorAll('button, [tabindex]').length, 0, 'nothing is focusable');
    assert.ok(bare.querySelector('.fabricate-list-row-body'), 'the regions still render');
  });

  it('draws each mark rung literally, and takes 22 for any other value', async () => {
    const widths = [];
    const warned = [];
    const warn = console.warn;
    console.warn = (message) => {
      warned.push(String(message));
    };
    try {
      for (const markSize of [22, 26, 30, 38, 34]) {
        const target = await harness.mount({ name: 'Mark', onOpen: () => {}, markSize });
        widths.push(target.querySelector('.fab-medallion').style.width);
        harness.remount();
      }
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(widths, ['22px', '26px', '30px', '38px', '22px']);
    assert.equal(warned.length, 1, warned.join(' | '));
    assert.match(warned[0], /markSize/);
  });

  it('lets `leading` replace the mark, and names the density, layout and danger tone', async () => {
    const target = await harness.mount({
      name: 'Glade',
      density: 'default',
      layout: 'card',
      tone: 'danger',
      nameClass: 'site-name',
      leading: snippet('<span class="probe-leading"></span>'),
    });
    const row = target.querySelector('[data-list-row]');
    assert.equal(row.getAttribute('data-list-row'), 'default');
    for (const name of ['is-form', 'is-default', 'is-card', 'is-danger']) {
      assert.ok(row.classList.contains(name), name);
    }
    assert.ok(row.querySelector('.probe-leading'), 'the leading snippet renders');
    assert.ok(!row.querySelector('.fab-medallion'), 'in place of the mark');
    assert.ok(row.querySelector('.fabricate-list-row-name.site-name'), 'the site name class');
  });
});

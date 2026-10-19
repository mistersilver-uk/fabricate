/**
 * The link field's faces as Chromium draws them (issue 2466): the 104px floor, the three grounds
 * and borders, the empty stack, the two-line caps, the action column, the compact face, the 38px
 * chip, the uuid line and the named group. The sheet sits in `@layer modules`, Foundry's `code` rule in `@layer
 * elements` and the scoped blocks unlayered, as Foundry loads them, so each clause measures the
 * cascade a selector reading cannot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const ZONE = 'src/ui/svelte/components/ItemDropZone.svelte';
const MEDALLION = 'src/ui/svelte/components/Medallion.svelte';

const noop = () => {};
const ACTIONS = { copyLabel: 'Copy uuid', unlinkLabel: 'Unlink', onCopy: noop, onUnlink: noop };
const RELINK = { relinkLabel: 'Relink', onRelink: noop };
const MISSING = { item: { name: 'Untitled' }, uuid: 'Item.9pQr2sT4uV6wX8yZ', state: 'missing' };
const PROMPT = { title: 'Drop a game-world item here', emptyIcon: 'fas fa-link' };
const LONG_TITLE = 'Drop a game-world item here to link it to this record. '.repeat(3).trim();
/** A compendium address standing in for a name: 44 characters with no break opportunity. */
const UUID_NAME = 'Compendium.dnd5e.items.Item.8RXjiddJ6VGyE7vB';
const LONG_NOTE = `From the Items directory or a compendium, ${'x'.repeat(40)} and from any pack this world has unlocked for editing.`;
const ART = 'icons/svg/item-bag.svg';

/** Each case: the host's width and the props the zone mounts with. */
const CASES = Object.freeze({
  empty: { width: 280, props: { ...PROMPT, hint: 'From the Items directory or a compendium' } },
  linked: {
    width: 280,
    props: {
      item: { name: 'Blacksmith’s Compendium' },
      uuid: 'Item.kR3nQ8sT1vW2xY4z',
      hint: 'Drop another Item here to replace the linked source.',
      ...ACTIONS,
    },
  },
  missing: {
    width: 280,
    props: {
      item: { name: 'Untitled' },
      uuid: 'Item.9pQr2sT4uV6wX8yZ',
      state: 'missing',
      hint: 'This document no longer resolves.',
    },
  },
  compact: {
    width: 280,
    props: {
      compact: true,
      title: 'Drop an item to replace the source',
      hint: 'World item or compendium entry',
      emptyIcon: 'fas fa-right-left',
    },
  },
  disabled: { width: 280, props: { ...PROMPT, disabled: true } },
  'long-empty': { width: 220, props: { ...PROMPT, title: LONG_TITLE, hint: LONG_NOTE } },
  'long-linked': {
    width: 220,
    props: { item: { name: LONG_TITLE }, hint: LONG_NOTE, subline: LONG_NOTE, ...ACTIONS },
  },
  'uuid-name': { width: 220, props: { item: { name: UUID_NAME }, uuid: UUID_NAME, ...ACTIONS } },
  'linked-art': {
    width: 280,
    props: {
      item: { name: 'Blacksmith’s Compendium', img: ART },
      uuid: 'Item.kR3n',
      hint: 'Drop another.',
      ...ACTIONS,
    },
  },
  'missing-art': {
    width: 280,
    props: { item: { name: 'Untitled', img: ART }, state: 'missing', emptyIcon: 'fas fa-link' },
  },
  'compact-missing': {
    width: 280,
    props: {
      ...MISSING,
      item: { name: 'Untitled', img: ART },
      compact: true,
      ...PROMPT,
      ...RELINK,
    },
  },
  'missing-relink': {
    width: 280,
    props: { ...MISSING, hint: 'This document no longer resolves.', ...RELINK, onUnlink: noop },
  },
  'disabled-linked': {
    width: 280,
    props: { item: { name: 'Blacksmith’s Compendium' }, ...ACTIONS, ...RELINK, disabled: true },
  },
  'disabled-missing': {
    width: 280,
    props: { ...MISSING, ...RELINK, unlinkLabel: 'Unlink', onUnlink: noop, disabled: true },
  },
  'missing-subline': {
    width: 280,
    props: { ...MISSING, hint: 'This document no longer resolves.', subline: 'Drop another.' },
  },
  'missing-hooked-hint': {
    width: 280,
    props: { ...MISSING, hint: 'Gone.', hookAttrs: { hint: { id: 'caller-hint' } } },
  },
});

/** The tokens the clauses compare against, each read from an element that declares it. */
const TOKENS = Object.freeze([
  'surface-soft',
  'bg-1',
  'bg-3',
  'danger-soft',
  'accent-soft',
  'border-strong',
  'danger-border',
  'accent',
  'text-secondary',
  'text-muted',
  'text-subtle',
  'danger-text',
]);

/** The page loads no Font Awesome, so the glyph is given a box; without one the stack has two rows. */
const GLYPH_BOX = String.raw`.fas{display:inline-block;line-height:1}.fas::before{content:"\25A0"}`;

/** Foundry 14.365's inline `code` rule, verbatim from `foundry2.css`, in the layer it ships in. */
const FOUNDRY_CODE = `@layer elements { code { display: inline-block; padding: 1px 0.25rem; margin: -1px 0; word-break: keep-all; white-space: nowrap } }`;

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>${FOUNDRY_CODE}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, ZONE)).css}</style>
<style>${scopedComponentCss(resolve(repoRoot, MEDALLION)).css}</style>
<style>${GLYPH_BOX}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${TOKENS.map((token) => `<span data-token="${token}" style="color:var(--fab-${token})"></span>`).join('')}
<span data-token="serif" style="font-family:var(--fab-font-serif)"></span>
<span data-token="none" style="color:transparent"></span>
${Object.entries(markup)
  .map(([key, html]) => `<div data-case="${key}" style="width:${CASES[key].width}px">${html}</div>`)
  .join('\n')}
</div></body></html>`;

/** Every case's parts, with the box, the computed style and the scroll extent of each. */
const readFaces = () => {
  const doc = globalThis.document;
  const STYLES = [
    'background-color',
    'border-top-color',
    'border-top-style',
    'border-top-width',
    'border-top-left-radius',
    'min-height',
    'padding-top',
    'padding-left',
    'margin-top',
    'margin-bottom',
    'opacity',
    'color',
    'font-size',
    'font-weight',
    'font-family',
    'line-height',
    'text-align',
  ];
  const PARTS = {
    root: '.manager-item-drop-zone',
    icon: '.manager-item-drop-zone-icon',
    glyph: '.manager-item-drop-zone-icon > i',
    name: '.manager-item-drop-zone-copy > strong',
    uuid: '.manager-item-drop-zone-uuid',
    hint: '.manager-item-drop-zone-copy > small:not([data-item-drop-zone-subline])',
    subline: '[data-item-drop-zone-subline]',
    chip: '.fab-medallion',
    chipGlyph: '.fab-medallion > i',
    chipArt: '.fab-medallion > img',
    actions: '.manager-item-drop-zone-actions',
  };
  const part = (node) => {
    if (!node) return null;
    const computed = globalThis.getComputedStyle(node);
    const { top, bottom, left, right, width, height } = node.getBoundingClientRect();
    return {
      box: { top, bottom, left, right, width, height },
      style: Object.fromEntries(STYLES.map((name) => [name, computed.getPropertyValue(name)])),
      scroll: {
        width: node.scrollWidth,
        height: node.scrollHeight,
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
      },
    };
  };
  const faces = {};
  for (const host of doc.querySelectorAll('[data-case]')) {
    const face = Object.fromEntries(
      Object.entries(PARTS).map(([name, selector]) => [name, part(host.querySelector(selector))])
    );
    face.buttons = [...host.querySelectorAll(':scope .manager-item-drop-zone-actions button')].map(
      (button) => part(button).box
    );
    face.actionButtons = [
      ...host.querySelectorAll(':scope .manager-item-drop-zone-actions button'),
    ].map((button) => ({
      box: part(button).box,
      disabled: button.disabled,
      relink: button.hasAttribute('data-item-drop-zone-relink'),
      text: button.textContent.trim(),
      classes: [...button.classList],
    }));
    const zone = host.querySelector(PARTS.root);
    const byId = (id) => host.querySelector(`[id="${id}"]`);
    const labelledBy = zone.getAttribute('aria-labelledby');
    const describedBy = zone.getAttribute('aria-describedby');
    face.group = {
      role: zone.getAttribute('role'),
      labelIsName: Boolean(labelledBy) && byId(labelledBy) === host.querySelector(PARTS.name),
      label: labelledBy ? (byId(labelledBy)?.textContent.trim() ?? '') : '',
      described:
        describedBy === null
          ? null
          : describedBy.split(' ').map((id) => byId(id)?.textContent.trim() ?? `#${id} unresolved`),
    };
    face.glyphClass = host.querySelector('.fab-medallion > i')?.className ?? '';
    const uuidLine = doc.createRange();
    const uuidNode = host.querySelector(PARTS.uuid);
    if (uuidNode) uuidLine.selectNodeContents(uuidNode);
    face.uuidLine = uuidNode ? uuidLine.getClientRects()[0]?.height : 0;
    faces[host.dataset.case] = face;
  }
  const tokens = {};
  for (const probe of doc.querySelectorAll('[data-token]')) {
    const computed = globalThis.getComputedStyle(probe);
    tokens[probe.dataset.token] =
      probe.dataset.token === 'serif' ? computed.fontFamily : computed.color;
  }
  return { faces, tokens };
};

let browser;
let tab;
let faces;
let tokens;
let renamed;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-link-field-faces-',
    rawModules: [
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      'src/ui/svelte/actions/dragDrop.js',
      'src/ui/svelte/util/dropUtils.js',
    ],
    compiledModules: [
      'src/ui/svelte/components/Button.svelte',
      'src/ui/svelte/components/IconButton.svelte',
      MEDALLION,
      ZONE,
    ],
    componentPath: ZONE,
  });
  const markup = {};
  await harness.setup();
  try {
    for (const [key, { props }] of Object.entries(CASES)) {
      markup[key] = (await harness.mount(props)).innerHTML;
      harness.remount();
    }
    const retitled = await harness.mount({ ...PROMPT, compact: true });
    await harness.setProps({ title: 'Drop a macro here' });
    const zone = retitled.querySelector('.manager-item-drop-zone');
    renamed = retitled.querySelector(`[id="${zone.getAttribute('aria-labelledby')}"]`)?.textContent;
    harness.remount();
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  ({ faces, tokens } = await tab.evaluate(readFaces));
});

after(async () => {
  await browser?.close();
});

const px = (value) => Number.parseFloat(value);
const centre = ({ left, right }) => (left + right) / 2;
const middle = ({ top, bottom }) => (top + bottom) / 2;

/** Whether a line is cut at its cap: more text than its box shows, in at most two of its lines. */
function assertCapped(line, label) {
  assert.ok(
    line.scroll.height > line.scroll.clientHeight,
    `${label} holds no more than it shows, so the cap is not reached and nothing is measured`
  );
  assert.ok(
    line.box.height <= 2 * px(line.style['line-height']) + 0.5,
    `${label} is ${line.box.height}px tall at a ${line.style['line-height']} line: more than two lines`
  );
}

it('reads each token from the page, and no two the clauses tell apart are equal', () => {
  const colours = TOKENS.map((token) => tokens[token]);
  assert.equal(new Set(colours).size, TOKENS.length, `two tokens compute alike: ${colours}`);
  assert.match(tokens.serif, /Spectral/u);
});

it('draws the empty prompt as a centred stack on a dashed 104px box', () => {
  const { root, icon, glyph, name, hint } = faces.empty;
  assert.equal(root.box.height, 104);
  assert.equal(root.style['border-top-left-radius'], '11px');
  assert.equal(root.style['border-top-style'], 'dashed');
  assert.equal(root.style['border-top-color'], tokens['border-strong']);
  assert.equal(root.style['background-color'], tokens['surface-soft']);

  assert.equal(glyph.style['font-size'], '18px');
  assert.equal(glyph.box.height, 18, 'the glyph has an 18px box, so the stack has three rows');
  assert.equal(icon.style.color, tokens['text-subtle']);
  assert.ok(Math.abs(centre(glyph.box) - centre(root.box)) <= 1, 'the glyph is centred on the box');

  assert.equal(name.style['font-size'], '12px');
  assert.equal(name.style['font-weight'], '600');
  assert.equal(name.style.color, tokens['text-secondary']);
  assert.equal(hint.style.color, tokens['text-muted']);
  const glyphGap = name.box.top - glyph.box.bottom;
  assert.ok(Math.abs(glyphGap - 4) <= 0.5, `the glyph sits ${glyphGap}px above the title, not 4px`);
  assert.ok(name.box.bottom <= hint.box.top, 'and the title above the hint');
  assert.ok(
    Math.abs((glyph.box.top + hint.box.bottom) / 2 - middle(root.box)) <= 1,
    'the stack is centred between the box`s top and bottom'
  );
});

it('draws a linked zone as a solid bg-1 row on the same floor, with its actions in a column', () => {
  const { root, name, uuid, hint, buttons } = faces.linked;
  assert.equal(root.style['min-height'], '104px');
  assert.ok(root.box.height >= 104, `the linked box is ${root.box.height}px, under its floor`);
  assert.equal(root.style['border-top-style'], 'solid');
  assert.equal(root.style['border-top-color'], tokens['border-strong']);
  assert.equal(root.style['background-color'], tokens['bg-1']);

  assert.equal(name.style['font-size'], '14px');
  assert.equal(name.style['font-weight'], '600');
  assert.equal(name.style['font-family'], tokens.serif);
  assert.equal(px(name.style['line-height']), 18.2);
  assert.equal(
    name.style['text-align'],
    'start',
    'the name and uuid start at the tile, not centred'
  );
  assert.equal(uuid.style.color, tokens['text-muted']);
  assert.equal(hint.style.color, tokens['text-muted']);

  assert.equal(buttons.length, 2);
  const buttonGap = buttons[1].top - buttons[0].bottom;
  assert.ok(Math.abs(buttonGap - 4) <= 0.5, `unlink sits ${buttonGap}px under copy, not 4px`);
});

it('draws a missing zone on the danger ground', () => {
  const { root, chipGlyph, name, uuid, hint } = faces.missing;
  assert.equal(root.style['border-top-style'], 'solid');
  assert.equal(root.style['border-top-color'], tokens['danger-border']);
  assert.equal(root.style['background-color'], tokens['danger-soft']);
  assert.equal(name.style.color, tokens['danger-text']);
  assert.equal(chipGlyph.style.color, tokens['danger-text']);
  assert.equal(uuid.style.color, tokens['text-secondary']);
  assert.equal(hint.style.color, tokens['text-secondary']);
});

it('draws a linked zone`s chip as an unbordered 38px bg-3 tile, centred, 12px from the name', () => {
  const { root, chip, name } = faces.linked;
  assert.deepEqual([chip.box.width, chip.box.height], [38, 38]);
  assert.equal(chip.style['border-top-left-radius'], '9px');
  assert.equal(chip.style['border-top-style'], 'none', 'the chip is unbordered');
  assert.equal(chip.style['border-top-width'], '0px');
  assert.equal(chip.style['background-color'], tokens['bg-3']);
  const gap = name.box.left - chip.box.right;
  assert.ok(Math.abs(gap - 12) <= 0.5, `the name starts ${gap}px right of the chip, not 12px`);
  const offset = middle(chip.box) - middle(root.box);
  assert.ok(Math.abs(offset) <= 1, `the chip sits ${offset}px off the box's vertical centre`);
  assert.ok(!faces.linked.chipArt, 'an item with no image draws the glyph');
  assert.ok(Boolean(faces['linked-art'].chipArt), 'and an item with one draws it in the chip');
});

it('draws a missing chip as the alert glyph in danger ink, never the document`s art', () => {
  for (const key of ['missing', 'missing-art']) {
    const { chip, chipGlyph, chipArt, glyphClass } = faces[key];
    assert.deepEqual([chip.box.width, chip.box.height], [38, 38], `${key}: the chip is 38px`);
    assert.ok(
      !chipArt,
      `${key}: a broken link draws no image, so it cannot look like a working one`
    );
    assert.match(glyphClass, /\bfa-triangle-exclamation\b/u, `${key}: the alert glyph`);
    assert.doesNotMatch(glyphClass, /\bfa-link\b/u, `${key}: not the caller's glyph`);
    assert.equal(chipGlyph.style.color, tokens['danger-text'], `${key}: in danger ink`);
  }
});

it('keeps the empty, the compact and a compact missing face`s glyph bare, with no chip', () => {
  for (const key of ['empty', 'compact', 'compact-missing']) {
    assert.ok(Boolean(faces[key].icon), `${key}: the bare glyph span renders`);
    assert.ok(!faces[key].chip, `${key}: and no chip`);
    assert.ok(!faces[key].chipArt, `${key}: and no art`);
  }
});

it('sets the uuid at 10px, flush with the name, with Foundry`s `code` box cleared', () => {
  for (const key of ['linked', 'missing', 'linked-art']) {
    const { name, uuid, hint } = faces[key];
    assert.equal(uuid.style['font-size'], '10px', `${key}: the uuid is 10px`);
    assert.equal(uuid.style['padding-left'], '0px', `${key}: Foundry's inline padding is cleared`);
    assert.equal(uuid.style['padding-top'], '0px', `${key}: and its block padding`);
    assert.deepEqual(
      [uuid.style['margin-top'], uuid.style['margin-bottom']],
      ['0px', '0px'],
      `${key}: and its -1px block margins, so the box keeps its line's height`
    );
    const offset = uuid.box.left - name.box.left;
    assert.ok(Math.abs(offset) <= 0.5, `${key}: the uuid starts ${offset}px right of the name`);
    const { uuidLine } = faces[key];
    assert.ok(uuidLine > 0, `${key}: the uuid's text has a line box to compare with`);
    assert.ok(
      Math.abs(uuid.box.height - uuidLine) <= 0.5,
      `${key}: the uuid's box is ${uuid.box.height}px around a ${uuidLine}px line`
    );
    for (const [label, gap] of [
      ['above', uuid.box.top - name.box.bottom],
      ['below', hint.box.top - uuid.box.bottom],
    ]) {
      assert.ok(Math.abs(gap - 4) <= 0.5, `${key}: the uuid sits ${gap}px from its ${label} line`);
    }
  }
});

it('draws Relink over unlink in a missing zone, on one right edge, inside the box', () => {
  const { root, actionButtons } = faces['missing-relink'];
  const [relink, unlink] = actionButtons;
  assert.equal(actionButtons.length, 2);
  assert.ok(relink.relink, 'Relink leads the column');
  assert.ok(relink.classes.includes('fabricate-button'), 'and is the shipped `<Button>`');
  assert.equal(relink.text, 'Relink');
  assert.ok(unlink.classes.includes('is-danger'), 'unlink sits under it');
  const edges = relink.box.right - unlink.box.right;
  assert.ok(Math.abs(edges) <= 0.5, `Relink's right edge is ${edges}px off unlink's`);
  for (const [label, { box }] of [
    ['Relink', relink],
    ['unlink', unlink],
  ]) {
    assert.ok(
      box.left >= root.box.left &&
        box.right <= root.box.right &&
        box.top >= root.box.top &&
        box.bottom <= root.box.bottom,
      `${label} is not wholly inside the zone`
    );
  }
});

it('draws Relink only in a missing zone with a handler, and no column when no action renders', () => {
  assert.ok(!faces.missing.actions, 'a missing zone with no handler draws no action column');
  for (const key of ['disabled-linked', 'compact-missing']) {
    assert.ok(
      faces[key].actionButtons.every((button) => !button.relink),
      `${key}: a handler alone does not draw Relink`
    );
  }
  assert.ok(!faces['compact-missing'].actions, 'a compact zone draws no actions at all');
});

it('disables every action of a disabled zone, and dims the zone to 0.55', () => {
  for (const [key, count] of [
    ['disabled-linked', 2],
    ['disabled-missing', 2],
  ]) {
    const { root, actionButtons } = faces[key];
    assert.equal(actionButtons.length, count, `${key}: the actions render`);
    assert.deepEqual(
      actionButtons.map((button) => button.disabled),
      Array.from({ length: count }, () => true),
      `${key}: every action is disabled`
    );
    assert.equal(root.style.opacity, '0.55', `${key}: the zone dims`);
  }
  assert.ok(faces['disabled-missing'].actionButtons[0].relink, 'Relink is among them');
});

it('names every face a group by its title or its document`s name', () => {
  const NAMES = {
    empty: PROMPT.title,
    linked: 'Blacksmith’s Compendium',
    missing: 'Untitled',
    compact: CASES.compact.props.title,
    'missing-relink': 'Untitled',
    'missing-art': 'Untitled',
    'compact-missing': PROMPT.title,
  };
  for (const [key, face] of Object.entries(faces)) {
    assert.equal(face.group.role, 'group', `${key}: the root is a group`);
    assert.ok(face.group.labelIsName, `${key}: aria-labelledby resolves to the <strong>`);
    if (NAMES[key]) assert.equal(face.group.label, NAMES[key], `${key}: named by its own line`);
  }
  assert.equal(renamed, 'Drop a macro here', 'the name follows a changed title');
});

it('describes a missing group by its hint and subline, and a linked one by nothing', () => {
  assert.deepEqual(faces.missing.group.described, ['This document no longer resolves.']);
  assert.deepEqual(faces['missing-subline'].group.described, [
    'This document no longer resolves.',
    'Drop another.',
  ]);
  assert.deepEqual(faces['missing-hooked-hint'].group.described, ['Gone.'], 'a caller`s hint id');
  assert.equal(faces['missing-art'].group.described, null, 'a missing zone with no lines has none');
  for (const key of ['linked', 'linked-art', 'empty', 'compact']) {
    assert.equal(faces[key].group.described, null, `${key}: no description`);
  }
});

it('lets a drag take the border, ground and ring of a linked, a missing and a compact zone', async () => {
  for (const face of ['linked', 'missing', 'compact']) {
    const dragged = await tab.evaluate((key) => {
      const zone = globalThis.document.querySelector(
        `[data-case="${key}"] .manager-item-drop-zone`
      );
      zone.classList.add('is-drop-active');
      const { borderTopColor, backgroundColor, boxShadow } = globalThis.getComputedStyle(zone);
      zone.classList.remove('is-drop-active');
      return { borderTopColor, backgroundColor, boxShadow };
    }, face);
    assert.equal(
      dragged.borderTopColor,
      tokens.accent,
      `a drag over a ${face} zone takes its border`
    );
    assert.equal(dragged.backgroundColor, tokens['accent-soft'], `and its ${face} ground`);
    assert.ok(
      dragged.boxShadow.includes(tokens.accent),
      `and draws the ring: ${dragged.boxShadow}`
    );
  }
});

it('draws the compact prompt with no ground, no floor and no tile, in muted ink', () => {
  const { root, icon, name, hint } = faces.compact;
  assert.equal(root.style['background-color'], tokens.none);
  assert.equal(root.style['padding-top'], '12px');
  assert.equal(root.style['border-top-left-radius'], '9px');
  assert.equal(root.style['border-top-style'], 'dashed');
  assert.equal(root.style['min-height'], '0px');
  assert.ok(root.box.height < 104, `the compact box is ${root.box.height}px, so it kept the floor`);

  assert.equal(icon.style['background-color'], tokens.none, 'no tile behind the glyph');
  assert.equal(icon.style.color, tokens['text-subtle']);
  assert.equal(name.style['font-size'], '10.08px');
  assert.equal(name.style['font-weight'], '500');
  assert.equal(name.style.color, tokens['text-muted']);
  assert.equal(hint.style.color, tokens['text-muted']);
});

it('dims a disabled zone to 0.55', () => {
  assert.equal(faces.disabled.root.style.opacity, '0.55');
});

it('caps a title, a hint and a subline at two lines, lets a linked name wrap, and grows the box', () => {
  const empty = faces['long-empty'];
  assertCapped(empty.name, 'the empty title');
  assertCapped(empty.hint, 'the empty hint');
  assert.ok(empty.root.box.height > 104, 'two capped lines of each stand taller than the floor');

  const linked = faces['long-linked'];
  assert.ok(linked.name.scroll.height <= linked.name.scroll.clientHeight, 'the linked name is cut');
  assert.ok(
    linked.name.box.height > 2 * px(linked.name.style['line-height']),
    'the linked name stops at two lines, so it is still capped'
  );
  assertCapped(linked.hint, 'the linked hint');
  assertCapped(linked.subline, 'the subline');

  for (const [label, { root }] of [
    ['the empty box', empty],
    ['the linked box', linked],
  ]) {
    assert.ok(root.scroll.width <= root.scroll.clientWidth, `${label} scrolls sideways`);
    assert.ok(root.scroll.height <= root.scroll.clientHeight, `${label} scrolls down`);
  }
});

it('wraps a uuid standing in for a linked name, never cutting it or overflowing sideways', () => {
  const { root, name } = faces['uuid-name'];
  assert.ok(name.scroll.width <= name.scroll.clientWidth, 'the name runs out of its column');
  assert.ok(name.scroll.height <= name.scroll.clientHeight, 'the name is clipped');
  assert.ok(root.scroll.width <= root.scroll.clientWidth, 'the zone scrolls sideways');
  assert.ok(root.scroll.height <= root.scroll.clientHeight, 'the zone scrolls down');
});

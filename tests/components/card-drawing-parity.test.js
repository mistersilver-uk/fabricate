/**
 * Issue 2315: the `<Card>` entry's `.k-card` kit declares the box `InspectorCard`'s family rule
 * ships and its inline flush unit the `flush` rule's padding; no caller rule, at any specificity,
 * restates that box outside a status tone; and a card never contains a card, in a template or a
 * mounted inspector. Declarations are read as written.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { Window } from 'happy-dom';

import { compoundClasses, compoundsOf } from '../../scripts/lib/stylesheetLiveClasses.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { sourceAstEntriesUnder } from '../helpers/parsedSource.js';
import { renderedNodes } from '../helpers/structureShapes.js';
import {
  collectStyleCorpus,
  rulesIn,
  splitSelectorList,
  stripCssComments,
} from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { attributeNamed } from '../helpers/svelteTemplateScan.js';
import { propertiesOf } from '../helpers/themePaletteContrast.js';
import { specBlocks, unitsOf } from '../view-lab/primitives/library.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ENTRY = '<Card> <Well> <RowDisclosure>';
const FLUSH_UNIT = 'collapsible card, body in a well';
const SHEET = 'styles/fabricate.css';
const ROOT = 'fabricate-card';
const BASE = `.${ROOT}.${ROOT}`;
const FLUSH = `${BASE}.is-flush`;
const BOX = /^(?:padding|background|border)(?:-|$)/u;
const STATUS_RAMPS = new Set(['success', 'danger', 'warning', 'info']);
const TRAVEL = 'src/ui/svelte/apps/manager/world/TravelInspector.svelte';

const { document } = new Window();
document.write(readDesignLibrary());
const kit = [...document.querySelectorAll('style')].flatMap((style) =>
  rulesIn(stripCssComments(style.textContent))
);
const corpus = collectStyleCorpus();
const entry = specBlocks(document.body).get(ENTRY);

const boxOf = (rule) => new Map([...propertiesOf(rule)].filter(([property]) => BOX.test(property)));

/** The one rule in `rules` that lists `selector` and declares any part of the box. */
function boxRule(rules, selector) {
  const found = rules.filter(
    (rule) => splitSelectorList(rule.selector).includes(selector) && boxOf(rule).size > 0
  );
  assert.equal(found.length, 1, `${found.length} rules draw a box on ${selector}`);
  return boxOf(found[0]);
}

const unwrapGlobal = (selector) =>
  selector.replaceAll(/:global\(([^()]*(?:\([^()]*\))?[^()]*)\)/gu, '$1');

/** Whether a component's scoped selector reaches another component's element: its subject is global. */
const subjectIsGlobal = (selector) => /:global\((?:[^()]|\([^()]*\))*\)\s*$/u.test(selector);

/** The class tokens one `InspectorCard` tag can write: its static text and its string literals. */
function classTokensOf(node) {
  const attribute = attributeNamed(node, 'class');
  if (!attribute) return [];
  const chunks = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
  const text = chunks.flatMap((chunk) =>
    chunk.type === 'Text'
      ? [chunk.data]
      : [...walkNodes(chunk.expression)].flatMap((part) => {
          if (part.type === 'Literal' && typeof part.value === 'string') return [part.value];
          return part.type === 'TemplateElement' ? [part.value.cooked] : [];
        })
  );
  return text.join(' ').split(/\s+/u).filter(Boolean);
}

const COMPONENTS = sourceAstEntriesUnder('src/ui/svelte').filter(([file]) =>
  file.endsWith('.svelte')
);

/** The classes a card carries besides its root, state classes aside: a caller rule's subjects. */
const CARD_CLASSES = new Set([
  ROOT,
  ...COMPONENTS.flatMap(([, ast]) =>
    renderedNodes(ast, 'InspectorCard').flatMap(classTokensOf)
  ).filter((name) => !name.startsWith('is-')),
]);

/** Border colour and a soft fill from one status ramp: a tone, which is not a restatement. */
function isStatusTone(box) {
  const ramps = [...box].map(([property, value]) => {
    if (property === 'border-color') return value.match(/^var\(--fab-([a-z]+)-border\)$/u)?.[1];
    if (property === 'background' || property === 'background-color') {
      return value.match(/^var\(--fab-([a-z]+)-soft\)$/u)?.[1];
    }
    return undefined;
  });
  return ramps.every((ramp) => STATUS_RAMPS.has(ramp)) && new Set(ramps).size === 1;
}

/** Every caller rule in `styles` whose subject is a card and that restates the card's box. */
function restatements(styles) {
  return Object.entries(styles).flatMap(([file, css]) =>
    rulesIn(css).flatMap((rule) => {
      const box = boxOf(rule);
      if (box.size === 0 || isStatusTone(box)) return [];
      return splitSelectorList(rule.selector)
        .filter((raw) => file === SHEET || (file.endsWith('.svelte') && subjectIsGlobal(raw)))
        .map(unwrapGlobal)
        .filter((selector) => !(file === SHEET && [BASE, FLUSH].includes(selector)))
        .filter((selector) =>
          compoundClasses(compoundsOf(selector).at(-1)).some((name) => CARD_CLASSES.has(name))
        )
        .map((selector) => `${file}: ${selector}`);
    })
  );
}

test('the kit card declares the shipped box', () => {
  const drawn = boxRule(kit, '.k-card');
  const shipped = boxRule(rulesIn(corpus[SHEET]), BASE);
  for (const property of ['padding', 'border', 'border-radius', 'background']) {
    assert.ok(shipped.get(property), `${BASE} declares no ${property}`);
    assert.equal(drawn.get(property), shipped.get(property), `.k-card ${property}`);
  }
});

test('the flush unit draws the padding the flush rule ships, and nothing else', () => {
  const card = unitsOf(entry).get(FLUSH_UNIT)?.querySelector(':scope .k-card');
  assert.ok(card, `the ${FLUSH_UNIT} unit draws no .k-card`);
  const inline = propertiesOf({ body: card.getAttribute('style') ?? '' });
  const flush = boxRule(rulesIn(corpus[SHEET]), FLUSH);
  assert.deepEqual([...flush.keys()], ['padding'], 'flush changes the padding alone');
  assert.equal(inline.get('padding'), flush.get('padding'));
});

test('no caller rule restates the card’s box outside a status tone', () => {
  assert.ok(CARD_CLASSES.size > 20, `${CARD_CLASSES.size} card classes read`);
  assert.deepEqual(restatements(corpus), []);
});

test('the census refuses a restatement at any specificity, and admits a tone and a scoped rule', () => {
  const sheet = (body) => restatements({ [SHEET]: body });
  for (const selector of [
    '.fabricate-card',
    '.fabricate-manager .x .fabricate-card',
    '.fabricate-card.fabricate-card.fabricate-card.manager-checks-card',
    '.fabricate-manager .manager-checks-card',
  ]) {
    assert.deepEqual(sheet(`${selector} { padding: 0 }`), [`${SHEET}: ${selector}`], selector);
  }
  assert.deepEqual(sheet('.fabricate-card.x { border-color: var(--fab-danger-border) }'), []);
  assert.deepEqual(
    sheet(
      '.fabricate-card.x { border-color: var(--fab-danger-border); background: var(--fab-info-soft) }'
    ),
    [`${SHEET}: .fabricate-card.x`],
    'a tone takes one ramp'
  );
  assert.equal(sheet('.fabricate-card.x { background: var(--fab-surface-soft) }').length, 1);
  assert.deepEqual(sheet('.fabricate-card > .x { padding: 0 }'), [], 'the subject is the content');
  const component = 'src/A.svelte';
  assert.deepEqual(restatements({ [component]: '.fabricate-card { padding: 0 }' }), []);
  assert.deepEqual(restatements({ [component]: ':global(.fabricate-card.y) { padding: 0 }' }), [
    `${component}: .fabricate-card.y`,
  ]);
});

test('no template renders a card inside a card', () => {
  const nested = COMPONENTS.flatMap(([file, ast]) =>
    renderedNodes(ast, 'InspectorCard')
      .filter((card) =>
        [...walkNodes(card.fragment)].some(
          (node) => node !== card && node.type === 'Component' && node.name === 'InspectorCard'
        )
      )
      .map(() => file)
  );
  assert.deepEqual(nested, []);
});

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-card-drawing-parity-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/apps/manager/InlineRenameField.svelte',
    TRAVEL,
  ],
  componentPath: TRAVEL,
});
before(() => harness.setup());
after(() => harness.teardown());

const nestedCards = (root) => [...root.querySelectorAll(`.${ROOT} .${ROOT}`)];

test('a mounted travel inspector draws its cards side by side, never one in another', async () => {
  const people = [{ id: 'p1', name: 'Wayfarers', img: '' }];
  for (const props of [
    {
      travelTab: 'realms',
      realm: { id: 'r1', name: 'Green March', environments: [], parties: people },
    },
    {
      travelTab: 'map',
      mapRegion: {
        id: 'm1',
        name: 'Ford',
        partiesInMapRegion: people,
        partiesInFabricateRealm: [],
      },
    },
  ]) {
    const target = await harness.mount(props);
    const cards = target.querySelectorAll(`.${ROOT}`);
    assert.ok(cards.length >= 3, `${props.travelTab} draws ${cards.length} cards`);
    assert.equal(nestedCards(target).length, 0, `${props.travelTab} nests a card`);
    harness.remount();
  }
  const control = new Window().document;
  control.body.innerHTML = `<section class="${ROOT}"><section class="${ROOT}"></section></section>`;
  assert.equal(nestedCards(control.body).length, 1, 'the probe sees a nested card');
});

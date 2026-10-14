/**
 * Issue 2464: the `<TabBar>` entry draws the tab the family rule ships, and that rule is the only
 * one that draws a tab. Declarations are read as written, with spacing tokens resolved.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { compoundClasses, compoundsOf } from '../../scripts/lib/stylesheetLiveClasses.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
import { sourceAstEntriesUnder } from '../helpers/parsedSource.js';
import { renderedNodes } from '../helpers/structureShapes.js';
import {
  collectCustomProperties,
  collectStyleCorpus,
  resolveValueCandidates,
  rulesIn,
  splitSelectorList,
  stripCssComments,
  varReferencesIn,
} from '../helpers/styleBlockScan.js';
import { attributeValue } from '../helpers/svelteStructureContract.js';
import { attributeNamed } from '../helpers/svelteTemplateScan.js';
import { propertiesOf } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const COMPONENT = 'src/ui/svelte/components/EditorTabs.svelte';
const ROOT = 'fabricate-tabs';
const DEFAULT_CONTAINER = 'manager-editor-tabs';
const DEFAULT_BUTTON = 'manager-editor-tab-button';
const DEFAULT_BADGE = 'manager-editor-tab-badge';
const ALIAS_BUTTON = 'manager-environment-tab-button';
const COUNT = 'manager-editor-tab-count';
const LOCK = 'manager-editor-tab-lock';

const corpus = collectStyleCorpus();
const definitions = collectCustomProperties(corpus);
const unwrapGlobal = (selector) =>
  selector.replaceAll(/:global\(([^()]*(?:\([^()]*\))?[^()]*)\)/gu, '$1');
const rules = Object.entries(corpus).flatMap(([file, css]) =>
  rulesIn(css).map((rule) => ({
    ...rule,
    file,
    selectors: splitSelectorList(unwrapGlobal(rule.selector)),
  }))
);

/** The one rule in `file` listing `selector`. */
function familyRule(selector, file = SHEET) {
  const found = rules.filter((rule) => rule.file === file && rule.selectors.includes(selector));
  assert.equal(found.length, 1, `${found.length} ${file} rules list ${selector}`);
  return found[0];
}
const FAMILY = Object.freeze({
  strip: familyRule(`.${ROOT}.${DEFAULT_CONTAINER}`),
  tab: familyRule(`.${ROOT} .${DEFAULT_BUTTON}`),
  hover: familyRule(`.${ROOT} .${DEFAULT_BUTTON}:hover`),
  current: familyRule(`.${ROOT} .${DEFAULT_BUTTON}.is-active`),
});
/** The tab-state rules beside the family, each read at its compound carrying the state. */
const STATE_RULES = Object.freeze({
  lock: familyRule(`.${ROOT} .${DEFAULT_BUTTON}.is-active .${LOCK}`),
  danger: familyRule(`.${DEFAULT_BUTTON}.is-danger`, COMPONENT),
  'current danger': familyRule(`.${DEFAULT_BUTTON}.is-danger.is-active`, COMPONENT),
});
const stateCompound = (selector) =>
  compoundsOf(selector).find((compound) => /\.is-(active|danger)(?![\w-])/u.test(compound));

/** Whether a class prop is anything but one static string, which the sites below could not read. */
const isComputed = (node, prop) => {
  const attribute = attributeNamed(node, prop);
  if (!attribute) return false;
  const [chunk, ...rest] = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
  return rest.length > 0 || chunk?.type !== 'Text';
};

const classTokens = (node, prop) =>
  new Set((attributeValue(node, prop) ?? '').split(' ').filter(Boolean));

/** Each `<EditorTabs>` render site that passes a literal container or button class. */
const allSites = sourceAstEntriesUnder('src/ui/svelte')
  .filter(([file]) => file.endsWith('.svelte'))
  .flatMap(([file, ast]) =>
    renderedNodes(ast, 'EditorTabs').map((node) => ({
      file,
      computed: ['containerClass', 'buttonClass'].filter((prop) => isComputed(node, prop)),
      container: classTokens(node, 'containerClass'),
      button: classTokens(node, 'buttonClass'),
      badge: classTokens(node, 'badgeClass'),
    }))
  );
const callSites = allSites.filter(({ container, button }) => container.size + button.size > 0);
const passed = (prop) => callSites.flatMap((site) => [...site[prop]]);
const callerContainers = new Set([DEFAULT_CONTAINER, ...passed('container')]);
const tabClasses = new Set([DEFAULT_BUTTON, ...passed('button')]);
const badgeClasses = new Set([DEFAULT_BADGE, ...allSites.flatMap((site) => [...site.badge])]);

const subjectOf = (selector) => compoundsOf(selector).at(-1);
const subjectHolds = (selector, classes) =>
  compoundClasses(subjectOf(selector)).some((name) => classes.has(name));

/** The entry's two drawn strips, the kit's `.k-count` rule, and each tab's inline declarations. */
function drawnEntry() {
  const { document } = new Window();
  document.write(readDesignLibrary());
  const entry = [...document.querySelectorAll('.spec')].find(
    (spec) => spec.querySelector(':scope .spec-head h4')?.textContent === '<PageHeader> <TabBar>'
  );
  assert.ok(entry, 'the library draws no <PageHeader> <TabBar> entry');
  const inline = (element) => propertiesOf({ body: element.getAttribute('style') ?? '' });
  const strips = [...entry.querySelector(':scope .stage > div').children].filter(
    (child) => inline(child).get('display') === 'flex'
  );
  const kit = rulesIn(
    stripCssComments([...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'))
  ).filter((rule) => splitSelectorList(rule.selector).includes('.k-count'));
  assert.equal(kit.length, 1, `the kit states .k-count ${kit.length} times`);
  return {
    kitCount: propertiesOf(kit[0]),
    tabs: strips.flatMap((strip) =>
      [...strip.children].map((tab, index) => ({
        name: tab.textContent.trim(),
        current: index === 0,
        declared: inline(tab),
        counts: [...tab.querySelectorAll('.k-count')].map(inline),
      }))
    ),
  };
}
const drawn = drawnEntry();

/** The family's declarations for an idle or a current tab, as the sheet writes them. */
function shippedTab(current) {
  const idle = propertiesOf(FAMILY.tab);
  const own = current ? propertiesOf(FAMILY.current) : new Map();
  const border = idle.get('border-bottom');
  return {
    padding: idle.get('padding'),
    gap: idle.get('gap'),
    'line-height': idle.get('line-height'),
    'font-size': idle.get('font-size'),
    'font-weight': own.get('font-weight') ?? idle.get('font-weight'),
    color: own.get('color') ?? idle.get('color'),
    'border-bottom': current ? border.replace(/\S+$/u, own.get('border-bottom-color')) : border,
  };
}

/** `value` with its tokens resolved, for the two properties the entry draws as literals. */
const RESOLVED = new Set(['padding', 'gap']);
function written(property, value) {
  if (!RESOLVED.has(property)) return [value];
  return resolveValueCandidates(value, definitions).candidates.filter(
    (candidate) => varReferencesIn(candidate).length === 0
  );
}

test('every drawn tab states the family rule’s box, type, ink and border, current and idle', () => {
  assert.deepEqual(
    drawn.tabs.map(({ current }) => current),
    [true, false, false, false, true, false, false, false],
    'the entry draws two strips of four tabs, each led by its current tab'
  );
  for (const tab of drawn.tabs) {
    for (const [property, value] of Object.entries(shippedTab(tab.current))) {
      assert.ok(value, `the family rule states no ${property}`);
      assert.deepEqual(
        written(property, value),
        [tab.declared.get(property)],
        `${tab.name}: ${property}`
      );
    }
  }
});

const STATE = /\.is-active|:hover|\[aria-selected/u;

test('every drawn tab count takes the shipped count’s ink, and the kit’s its face, size and weight', () => {
  const inked = rules.filter(
    (rule) =>
      rule.selectors.some((selector) => subjectHolds(selector, new Set([COUNT]))) &&
      propertiesOf(rule).has('color')
  );
  assert.equal(inked.length, 1, 'exactly one rule gives the count a colour');
  const shipped = propertiesOf(inked[0]);
  const counts = drawn.tabs.flatMap((tab) => tab.counts);
  assert.equal(counts.length, 4, 'the entry draws four tab counts');
  for (const count of counts) assert.equal(count.get('color'), shipped.get('color'));
  for (const property of ['font-family', 'font-size', 'font-weight']) {
    assert.ok(shipped.get(property), `the count rule states no ${property}`);
    assert.equal(drawn.kitCount.get(property), shipped.get(property), property);
  }
  assert.deepEqual(
    inked[0].selectors.flatMap(compoundsOf).filter((compound) => STATE.test(compound)),
    [],
    'the count is inked by its tab’s state'
  );
});

test('no <EditorTabs> call site passes a computed container or button class', () => {
  assert.ok(allSites.length >= callSites.length, 'the call sites are read');
  assert.deepEqual(
    allSites
      .filter(({ computed }) => computed.length > 0)
      .map(({ file, computed }) => `${file} ${computed}`),
    []
  );
});

test('each family and tab-state selector list names a class every caller passes', () => {
  assert.ok(callSites.length >= 7, `only ${callSites.length} call sites pass a class`);
  assert.ok(passed('button').includes(ALIAS_BUTTON), 'the alias button vocabulary is read');
  const lists = [
    ...Object.entries(FAMILY).map(([part, rule]) => [part, rule, subjectOf]),
    ...Object.entries(STATE_RULES).map(([part, rule]) => [part, rule, stateCompound]),
  ];
  for (const [part, rule, compoundOf] of lists) {
    const prop = part === 'strip' ? 'container' : 'button';
    const named = new Set(
      rule.selectors.flatMap((selector) => compoundClasses(compoundOf(selector)))
    );
    for (const site of callSites) {
      if (site[prop].size === 0) continue;
      assert.ok(
        [...site[prop]].some((name) => named.has(name)),
        `the ${part} list names no ${prop} class ${site.file} passes: ${[...site[prop]].join(' ')}`
      );
    }
  }
});

test('no rule draws the issue badge but the chip’s own: none names a badge class or a chip in a strip', () => {
  assert.ok(
    badgeClasses.has('manager-environment-tab-badge'),
    'the callers’ badge classes are read'
  );
  const strips = new Set([ROOT, ...callerContainers]);
  const inAStrip = (selector) => {
    const compounds = compoundsOf(selector);
    return (
      compoundClasses(compounds.at(-1)).includes('manager-chip') &&
      compounds
        .slice(0, -1)
        .some((compound) => compoundClasses(compound).some((name) => strips.has(name)))
    );
  };
  const offenders = rules.flatMap((rule) =>
    rule.selectors
      .filter(
        (selector) =>
          compoundsOf(selector).some((compound) =>
            compoundClasses(compound).some((name) => badgeClasses.has(name))
          ) || inAStrip(selector)
      )
      .map((selector) => `${rule.file} ${rule.context} ${selector}`.replaceAll(/\s+/gu, ' '))
  );
  assert.deepEqual(offenders, []);
});

const isButton = (compound) =>
  /^button(?![\w-])/u.test(compound) || /\[role=["']?tab["']?\]/u.test(compound);

/** Whether `selector` draws a tab: a tab class, or a button or its span under a strip. */
function drawsATab(selector) {
  const compounds = compoundsOf(selector);
  const subject = compounds.at(-1);
  if (compoundClasses(subject).some((name) => tabClasses.has(name))) return true;
  const strips = new Set([ROOT, ...callerContainers]);
  const under = compounds
    .slice(0, -1)
    .some((compound) => compoundClasses(compound).some((name) => strips.has(name)));
  if (!under) return false;
  return (
    isButton(subject) ||
    compoundClasses(subject).length === 0 ||
    (/^span(?![\w-])/u.test(subject) && isButton(compounds.at(-2)))
  );
}

/** The rules beside the family that may draw a tab: danger, under both vocabularies, the font floor and focus. */
const BESIDE_THE_FAMILY = Object.freeze([
  `${COMPONENT} .${DEFAULT_BUTTON}.is-danger`,
  `${COMPONENT} .${DEFAULT_BUTTON}.is-danger.is-active`,
  `${COMPONENT} .${ALIAS_BUTTON}.is-danger`,
  `${COMPONENT} .${ALIAS_BUTTON}.is-danger.is-active`,
  `${SHEET} .${ROOT} button`,
  `${SHEET} .${ROOT} button:focus`,
  `${SHEET} .${ROOT} button:focus-visible`,
]);

test('no rule beside the family draws a tab, at any container width', () => {
  const family = new Set([FAMILY.tab, FAMILY.hover, FAMILY.current]);
  const beside = rules.flatMap((rule) =>
    family.has(rule)
      ? []
      : rule.selectors.filter(drawsATab).map((selector) => `${rule.file} ${selector}`)
  );
  assert.equal(beside.length, BESIDE_THE_FAMILY.length, beside.join('\n'));
  assert.deepEqual(new Set(beside), new Set(BESIDE_THE_FAMILY));
  for (const rule of family) {
    assert.equal(rule.context, '', `${rule.selector} stands inside ${rule.context}`);
    assert.ok(rule.selectors.every(drawsATab), `${rule.selector} is read as drawing a tab`);
  }
});

const SITE_PROPERTIES = new Set([
  'padding',
  'padding-left',
  'padding-right',
  'grid-column',
  'grid-row',
  'flex',
  'background',
]);

test('a site rule on a strip states its inset, its grid place or its route’s fill and nothing else', () => {
  const site = rules.filter(
    (rule) =>
      rule !== FAMILY.strip &&
      rule.selectors.some((selector) => subjectHolds(selector, callerContainers))
  );
  assert.ok(site.length >= 7, `only ${site.length} site rules are read`);
  for (const rule of site) {
    assert.deepEqual(
      [...propertiesOf(rule).keys()].filter((property) => !SITE_PROPERTIES.has(property)),
      [],
      `${rule.file}: ${rule.selector}`
    );
  }
});

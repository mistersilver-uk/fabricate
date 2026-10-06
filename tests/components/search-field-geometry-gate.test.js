/**
 * THE SEARCH FIELD'S GEOMETRY HAS ONE OWNER (issue 1782, maintainer ruling 2). Every non-compact
 * search is the 38 / radius 9 shell, so no rule outside the `fabricate-search` family may re-size or
 * re-box the field or its input; a rule whose ROOT compound is positively `is-compact` is the ruled
 * exception, and the browser half pins the compact box at every site too. A rule naming
 * `input[type="search"]` reads as reaching the field even when it targets one of the raw search
 * inputs outside `SearchField`, so such a rule names its own class rather than that attribute.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { collectWorkingTreeSources } from '../helpers/sourceScan.js';
import {
  declarationsIn,
  maskNonStyleRegions,
  rulesIn,
  splitSelectorList,
  stripCssComments,
} from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { openingTagsNamed } from '../helpers/svelteTagScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHEET = 'styles/fabricate.css';
const FIELD = 'src/ui/svelte/components/SearchField.svelte';

/** The properties that size or box the field. */
const BOX = /^(?:height|min-height|border(?:-[\w-]+)?|background(?:-[\w-]+)?)$/;
/** The classes a family rule may name; any other class makes a rule a site's. */
const FAMILY_CLASSES = new Set(['fabricate-search', 'fabricate-search-field', 'is-compact']);

// ratchet-exempt(source-pin): issue 1782's geometry gate is a stylesheet scan; this reads the call sites' classes and the scoped blocks to scan, and asserts nothing about how either is written
const sources = collectWorkingTreeSources(['src'], ['.svelte']);

/** A `class=` value's literal text, or `null` when it is an expression, an interpolation or absent. */
function literalClassOf(tag) {
  const start = /(?<![\w:-])class=/.exec(tag);
  if (/\{\s*class\s*\}/.test(tag)) return null;
  if (!start) return '';
  const value = tag.slice(start.index + 'class='.length);
  const quoted = /^"([^"{]*)"|^'([^'{]*)'/.exec(value);
  if (quoted) return quoted[1] ?? quoted[2];
  return /^\{\s*(["'])([^"'{}]*)\1\s*\}/.exec(value)?.[2] ?? null;
}

/** A primitive composing the field forwards its callers' classes, so its own tags are read there. */
const COMPOSERS = Object.freeze({
  'src/ui/svelte/components/Typeahead.svelte': { tag: 'Typeahead', root: 'fabricate-typeahead' },
});

/** `fabricate-search` plus every class a call site hands the field, and the non-literal tags. */
function searchRoots() {
  const roots = new Set(['fabricate-search', ...Object.values(COMPOSERS).map(({ root }) => root)]);
  const tags = ['SearchField', ...Object.values(COMPOSERS).map(({ tag }) => tag)];
  const nonLiteral = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const tag of tags.flatMap((name) =>
      COMPOSERS[file] ? [] : openingTagsNamed(source, name)
    )) {
      const literal = literalClassOf(tag);
      if (literal === null) nonLiteral.push(`${file}: ${tag.replaceAll(/\s+/g, ' ')}`);
      for (const token of (literal ?? '').split(/\s+/)) if (token) roots.add(token);
    }
  }
  return { roots, nonLiteral };
}

const { roots: ROOTS, nonLiteral: NON_LITERAL_CLASSES } = searchRoots();

/** The CSS each file contributes: the sheet as written, a component's scoped block compiled. */
function corpus() {
  const files = { [SHEET]: stripCssComments(readFileSync(resolve(repoRoot, SHEET), 'utf8')) };
  const mentions = new RegExp(
    String.raw`\.(?:${[...ROOTS].join('|')})(?![\w-])|\[type=["']?search`
  );
  for (const [file, source] of Object.entries(sources)) {
    if (!mentions.test(stripCssComments(maskNonStyleRegions(source)))) continue;
    files[file] = stripCssComments(scopedComponentCss(resolve(repoRoot, file)).css);
  }
  return files;
}

/** A selector cut into its compound texts, at combinators outside parentheses and brackets. */
function compoundTexts(selector) {
  const parts = [''];
  let depth = 0;
  for (const character of selector.trim()) {
    if ('(['.includes(character)) depth++;
    if (')]'.includes(character)) depth--;
    if (depth === 0 && /[\s>+~]/.test(character)) {
      if (parts.at(-1)) parts.push('');
      continue;
    }
    parts[parts.length - 1] += character;
  }
  return parts.filter(Boolean);
}

/** `text` without its `:not(…)` arguments, which never make a compound what they name. */
function withoutNegations(text) {
  let plain = text;
  for (let previous = ''; previous !== plain; ) {
    previous = plain;
    plain = plain.replaceAll(/:not\([^()]*\)/g, '');
  }
  return plain;
}

/** A selector's compounds, each `{ tag, classes, attributes, compact }`, pseudo-classes dropped. */
function compoundsOf(selector) {
  return compoundTexts(selector).map((text) => {
    let plain = text;
    for (let previous = ''; previous !== plain; ) {
      previous = plain;
      plain = plain.replaceAll(/:{1,2}[\w-]+\([^()]*\)/g, '');
    }
    plain = plain.replaceAll(/:{1,2}[\w-]+/g, '');
    return {
      tag: /^[a-z][\w-]*/i.exec(plain)?.[0] ?? '',
      classes: [...plain.matchAll(/\.([\w-]+)/g)].map((match) => match[1]),
      attributes: [...plain.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].map(
        ([, name, value]) => [name, value ?? '']
      ),
      compact: /\.is-compact(?![\w-])/.test(withoutNegations(text)),
    };
  });
}

const isSearchInput = (compound) =>
  compound.tag === 'input' &&
  compound.attributes.some(([name, value]) => name === 'type' && value === 'search');

/** The index of the compound carrying the search root a selector reaches, or -1. */
function rootCompoundOf(compounds) {
  const isRoot = (compound) => compound.classes.some((name) => ROOTS.has(name));
  const subject = compounds.at(-1);
  if (!subject) return -1;
  if (isRoot(subject)) return compounds.length - 1;
  if (subject.tag === 'input' && compounds.length > 1 && isRoot(compounds.at(-2)))
    return compounds.length - 2;
  return isSearchInput(subject) ? compounds.length - 1 : -1;
}

/** A sheet rule built of family classes alone: no ancestor tag, attribute or other class. */
function isFamily(file, compounds, at) {
  return (
    file === SHEET &&
    compounds.every(
      ({ tag, classes, attributes }, index) =>
        classes.every((name) => FAMILY_CLASSES.has(name)) &&
        attributes.length === 0 &&
        (index >= at || (classes.length > 0 && !tag))
    )
  );
}

/** Every selector in the corpus that reaches a search field or its input. */
function reachingSelectors(files) {
  const found = [];
  for (const [file, css] of Object.entries(files)) {
    for (const rule of rulesIn(css)) {
      const boxes = declarationsIn(file, rule.body).filter(({ property }) => BOX.test(property));
      for (const selector of splitSelectorList(rule.selector)) {
        const compounds = compoundsOf(selector);
        const at = rootCompoundOf(compounds);
        if (at === -1) continue;
        found.push({
          file,
          selector,
          compounds,
          at,
          family: isFamily(file, compounds, at),
          compact: compounds[at].compact,
          boxes: boxes.map(({ property }) => property),
        });
      }
    }
  }
  return found;
}

const FILES = corpus();
const REACHING = reachingSelectors(FILES);

describe('no rule outside the search family re-sizes or re-boxes the field', () => {
  it('reads a live corpus, so the scan below is not vacuous', () => {
    assert.ok(ROOTS.size >= 8, `only ${ROOTS.size} search roots were found`);
    assert.ok(
      REACHING.filter((entry) => entry.family).length >= 4,
      'the family rules are visible to the scan'
    );
    assert.ok(
      REACHING.filter((entry) => !entry.family).length >= 10,
      'site rules are visible to the scan'
    );
    assert.ok(Object.keys(FILES).length >= 4, 'scoped blocks that name a search root are read');
  });

  it('decides compact from the root compound, so `:not(.is-compact)` is not compact', () => {
    const compact = (selector) => {
      const compounds = compoundsOf(selector);
      return compounds[rootCompoundOf(compounds)].compact;
    };
    assert.equal(compact('.x .fabricate-search:not(.is-compact) input'), false);
    assert.equal(compact('.is-compact .x .fabricate-search input'), false);
    assert.equal(compact('.x .fabricate-search:where(.is-compact) input'), true);
    assert.equal(compact('.x .fabricate-search.is-compact'), true);
  });

  it('hands `<SearchField class>` only string literals, so every search root is known', () => {
    assert.deepEqual(
      NON_LITERAL_CLASSES,
      [],
      'the scan reads a call site’s classes from its source, and an expression hides them, so a ' +
        `site rule keyed on one escapes it. Pass a literal:\n  ${NON_LITERAL_CLASSES.join('\n  ')}`
    );
  });

  it('finds no height, min-height, border or background outside the family, except compact', () => {
    const offenders = REACHING.filter(
      (entry) => !entry.family && entry.boxes.length > 0 && !entry.compact
    ).map((entry) => `${entry.file}: ${entry.selector} { ${entry.boxes.join(', ')} }`);
    assert.deepEqual(
      offenders,
      [],
      'every non-compact search is the library’s 38 / radius 9 shell (issue 1782, maintainer ' +
        'ruling 2), drawn by the `fabricate-search` family alone. A site rule that sets the ' +
        `field's height or box puts one search back off the specimen:\n  ${offenders.join('\n  ')}`
    );
  });
});

/** Host markup built from a selector's ancestor compounds, around the field's own markup. */
function hostFor({ compounds, at }, fieldMarkup) {
  const rootClasses = isSearchInput(compounds[at])
    ? []
    : compounds[at].classes.filter((name) => !FAMILY_CLASSES.has(name));
  let markup = fieldMarkup.replace(
    /class="fabricate-search(?=[ "])/,
    `class="fabricate-search ${rootClasses.join(' ')}`
  );
  for (const compound of compounds.slice(0, at).toReversed()) {
    if (['html', 'body'].includes(compound.tag)) continue;
    const tag = compound.tag || 'div';
    const attributes = compound.attributes.map(([name, value]) => ` ${name}="${value}"`).join('');
    markup = `<${tag} class="${compound.classes.join(' ')}"${attributes}>${markup}</${tag}>`;
  }
  return markup;
}

/** The compact box as shipped, and the sites whose own rule states a box of its own. */
const COMPACT_BOX = Object.freeze({
  input: 34,
  inputRadius: '6px',
  paddingLeft: '34px',
  glyph: 'absolute',
});
const COMPACT_SITE_BOXES = Object.freeze({
  'manager-drop-inspector-stack': { input: 28 },
  'manager-component-entry-systems-search': { input: 30, inputRadius: '7px' },
});

/**
 * Hosts that render inside one another (`GatheringTaskEditView.svelte` draws both control rows),
 * outermost first, so a box one host's rule states but the other's out-ranks is measured composed.
 */
const NESTED_COMPACT_HOSTS = Object.freeze([
  Object.freeze(['manager-gathering-task-edit-view', 'manager-task-drop-controls']),
  Object.freeze(['manager-gathering-task-edit-view', 'manager-task-component-browser-controls']),
]);

/** The box a compact probe must measure: the shipped box, or the one its site's rule states. */
function expectedCompactBox(entry) {
  const site = Object.keys(COMPACT_SITE_BOXES).find((name) =>
    entry.compounds.some(({ classes }) => classes.includes(name))
  );
  return { ...COMPACT_BOX, ...(site && COMPACT_SITE_BOXES[site]) };
}

/** A nested host's probe markup and the box its classes expect, as one compound chain. */
function nestedCompactProbe(chain, fieldMarkup) {
  const markup = chain
    .toReversed()
    .reduce((inner, name) => `<div class="${name}">${inner}</div>`, fieldMarkup);
  return {
    markup: `<div class="fabricate-manager">${markup}</div>`,
    expected: expectedCompactBox({ compounds: chain.map((name) => ({ classes: [name] })) }),
  };
}

describe('the real field measures its ruled box in each host that reaches it', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-search-geometry-',
    compiledModules: ['src/ui/svelte/components/Field.svelte', FIELD],
    componentPath: FIELD,
  });
  let browser = null;
  const markup = {};

  before(async () => {
    await harness.setup();
    for (const [name, props] of Object.entries({
      bare: { ariaLabel: 'Search' },
      labelled: { label: 'Search' },
      compact: { ariaLabel: 'Search', density: 'compact' },
    })) {
      markup[name] = (await harness.mount({ ...props, placeholder: 'Search…' })).innerHTML;
      harness.remount();
    }
    harness.teardown();
    browser = await chromium.launch();
  });
  after(async () => {
    if (browser) await browser.close();
  });

  /** A page holding every probe, styled by the corpus, at one window width. */
  async function pageWith(probes, width) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const scoped = Object.entries(FILES).filter(([file]) => file !== SHEET);
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <style>@layer modules { ${FILES[SHEET]} }</style>
      ${scoped.map(([, css]) => `<style>${css}</style>`).join('\n')}
      <style>html, body { margin: 0; } [data-probe] { width: ${width - 40}px; }</style></head>
      <body class="fabricate" data-fabricate-theme="fabricate">${probes.map((html, index) => `<div data-probe="${index}">${html}</div>`).join('')}</body></html>`);
    return page;
  }

  /** Each probe's shell, input and glyph box. */
  async function measure(probes, width) {
    const page = await pageWith(probes, width);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-probe]')].map((probe) => {
        const shell = probe.querySelector('.fabricate-search');
        const input = shell?.querySelector('input');
        const glyph = shell?.querySelector(':scope > i');
        const inputStyle = input ? getComputedStyle(input) : {};
        return {
          shell: shell ? shell.getBoundingClientRect().height : null,
          radius: shell ? getComputedStyle(shell).borderTopLeftRadius : null,
          input: input ? input.getBoundingClientRect().height : null,
          inputBorder: inputStyle.borderTopWidth ?? null,
          inputRadius: inputStyle.borderTopLeftRadius ?? null,
          inputFill: inputStyle.backgroundColor ?? null,
          paddingLeft: inputStyle.paddingLeft ?? null,
          glyph: glyph ? getComputedStyle(glyph).position : null,
        };
      })
    );
    await page.close();
    return boxes;
  }

  /** `names[i]` → measured box, for every probe whose box `expected(i)` rejects. */
  async function offendersAt(width, probes, names, accepts) {
    return (await measure(probes, width))
      .map((box, index) => ({ box, index }))
      .filter(({ box, index }) => !accepts(box, index))
      .map(({ box, index }) => `${names[index]} → ${JSON.stringify(box)}`);
  }

  it('is the 38 / radius 9 shell over a bare, borderless, unpadded input, in every host at a wide and a narrow window', async () => {
    const hosts = REACHING.filter((entry) => !entry.family && !entry.compact);
    assert.ok(hosts.length >= 10, `only ${hosts.length} hosts reach a non-compact search`);
    const probes = [
      markup.bare,
      markup.labelled,
      ...hosts.map((entry) => hostFor(entry, markup.bare)),
    ];
    const names = ['bare', 'labelled', ...hosts.map((entry) => `${entry.file}: ${entry.selector}`)];
    const accepts = (box) =>
      box.shell === 38 &&
      box.radius === '9px' &&
      box.input === 36 &&
      box.inputBorder === '0px' &&
      box.inputRadius === '0px' &&
      box.inputFill === 'rgba(0, 0, 0, 0)' &&
      box.paddingLeft === '0px';
    for (const width of [1280, 720]) {
      const offenders = await offendersAt(width, probes, names, accepts);
      assert.deepEqual(offenders, [], `at ${width}px:\n  ${offenders.join('\n  ')}`);
    }
  });

  it('keeps the compact box in every host that reaches a compact search', async () => {
    const hosts = REACHING.filter((entry) => !entry.family && entry.compact);
    assert.ok(hosts.length >= 5, `only ${hosts.length} hosts reach a compact search`);
    const live = new Set(
      hosts.flatMap((entry) => entry.compounds.flatMap(({ classes }) => classes))
    );
    const stale = Object.keys(COMPACT_SITE_BOXES).filter((name) => !live.has(name));
    assert.deepEqual(stale, [], 'every stated compact site box names a live site');
    const probes = [markup.compact, ...hosts.map((entry) => hostFor(entry, markup.compact))];
    const names = ['bare compact', ...hosts.map((entry) => `${entry.file}: ${entry.selector}`)];
    const expected = [COMPACT_BOX, ...hosts.map(expectedCompactBox)];
    const accepts = (box, index) =>
      Object.entries(expected[index]).every(([key, value]) => box[key] === value);
    const offenders = await offendersAt(1280, probes, names, accepts);
    assert.deepEqual(offenders, [], `the compact box moved:\n  ${offenders.join('\n  ')}`);
  });

  it('keeps the stated compact box where one host renders inside another', async () => {
    const live = new Set(
      REACHING.flatMap((entry) => entry.compounds.flatMap(({ classes }) => classes))
    );
    const dead = NESTED_COMPACT_HOSTS.flat().filter((name) => !live.has(name));
    assert.deepEqual(dead, [], 'every nested host names a class a search rule reaches through');
    const nested = NESTED_COMPACT_HOSTS.map((chain) => nestedCompactProbe(chain, markup.compact));
    const offenders = await offendersAt(
      1280,
      nested.map((probe) => probe.markup),
      NESTED_COMPACT_HOSTS.map((chain) => chain.join(' > ')),
      (box, index) =>
        Object.entries(nested[index].expected).every(([key, value]) => box[key] === value)
    );
    assert.deepEqual(
      offenders,
      [],
      'a compact box one host states and the host around it out-ranks never renders, so the ' +
        `gate must state the composed box:\n  ${offenders.join('\n  ')}`
    );
  });

  /** A colour token as the page resolves it. */
  function resolvedColour(page, token) {
    return page.evaluate((name) => {
      const swatch = document.createElement('div');
      swatch.style.color = `var(${name})`;
      document.body.append(swatch);
      return getComputedStyle(swatch).color;
    }, token);
  }

  it('inks the placeholder `--fab-text-muted`, which clears 4.5:1 on the shell', async () => {
    const page = await pageWith([markup.bare, markup.labelled], 1280);
    try {
      const muted = await resolvedColour(page, '--fab-text-muted');
      for (const index of [0, 1]) {
        const placeholder = await page.$eval(
          `[data-probe="${index}"] input`,
          (input) => getComputedStyle(input, '::placeholder').color
        );
        assert.equal(placeholder, muted, `probe ${index}'s placeholder is the muted ink`);
      }
    } finally {
      await page.close();
    }
  });

  it('lights the shell to the full accent while its input holds focus, bare and labelled', async () => {
    const page = await pageWith([markup.bare, markup.labelled], 1280);
    try {
      const borderOf = (index) =>
        page.$eval(
          `[data-probe="${index}"] .fabricate-search`,
          (shell) => getComputedStyle(shell).borderTopColor
        );
      const accent = await resolvedColour(page, '--fab-accent');
      for (const index of [0, 1]) {
        assert.notEqual(await borderOf(index), accent, `probe ${index} at rest is not the accent`);
        await page.focus(`[data-probe="${index}"] input`);
        assert.equal(await borderOf(index), accent, `probe ${index}'s focused shell is the accent`);
        await page.evaluate(() => document.activeElement.blur());
      }
    } finally {
      await page.close();
    }
  });
});

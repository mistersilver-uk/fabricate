/**
 * THE SEARCH FIELD'S GEOMETRY HAS ONE OWNER (issue 1782, maintainer ruling 2). Every non-compact
 * search is the 38 / radius 9 shell, so no rule outside the `fabricate-search` family may re-size or
 * re-box the field or its input; the four `density="compact"` sites are the one ruled exception.
 * The scan reads the module sheet and every scoped `<style>` that names a search root, compiled, and
 * the browser half renders the real field inside a host built from each selector that reaches it.
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
const FAMILY_CLASSES = new Set(['fabricate-search', 'is-compact']);

// ratchet-exempt(source-pin): issue 1782's geometry gate is a stylesheet scan; this reads the call sites' classes and the scoped blocks to scan, and asserts nothing about how either is written
const sources = collectWorkingTreeSources(['src'], ['.svelte']);

/** `fabricate-search` and every literal class a call site hands `<SearchField class>`. */
function searchRoots() {
  const roots = new Set(['fabricate-search']);
  for (const source of Object.values(sources)) {
    for (const tag of openingTagsNamed(source, 'SearchField')) {
      const declared = /(?<![\w-])class=(\{[^}]*\}|"[^"]*")/.exec(tag)?.[1] ?? '';
      for (const [, text] of declared.matchAll(/['"]([^'"]*)['"]/g)) {
        for (const token of text.split(/\s+/)) if (token) roots.add(token);
      }
    }
  }
  return roots;
}

const ROOTS = searchRoots();

/** The CSS each file contributes: the sheet as written, a component's scoped block compiled. */
function corpus() {
  const files = { [SHEET]: stripCssComments(readFileSync(resolve(repoRoot, SHEET), 'utf8')) };
  const mentions = new RegExp(String.raw`\.(?:${[...ROOTS].join('|')})(?![\w-])`);
  for (const [file, source] of Object.entries(sources)) {
    if (!mentions.test(stripCssComments(maskNonStyleRegions(source)))) continue;
    files[file] = stripCssComments(scopedComponentCss(resolve(repoRoot, file)).css);
  }
  return files;
}

/** A selector cut into compounds, each `{ tag, classes, attributes }`, pseudo-classes dropped. */
function compoundsOf(selector) {
  let plain = selector;
  for (let previous = ''; previous !== plain; ) {
    previous = plain;
    plain = plain.replaceAll(/:{1,2}[\w-]+\([^()]*\)/g, '');
  }
  plain = plain.replaceAll(/:{1,2}[\w-]+/g, '');
  return plain
    .split(/\s*[>+~]\s*|\s+/)
    .filter(Boolean)
    .map((compound) => ({
      tag: /^[a-z][\w-]*/i.exec(compound)?.[0] ?? '',
      classes: [...compound.matchAll(/\.([\w-]+)/g)].map((match) => match[1]),
      attributes: [...compound.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].map(
        ([, name, value]) => [name, value ?? '']
      ),
    }));
}

/** The index of the compound carrying the search root a selector reaches, or -1. */
function rootCompoundOf(compounds) {
  const isRoot = (compound) => compound.classes.some((name) => ROOTS.has(name));
  const subject = compounds.at(-1);
  if (subject && isRoot(subject)) return compounds.length - 1;
  if (subject?.tag === 'input' && compounds.length > 1 && isRoot(compounds.at(-2)))
    return compounds.length - 2;
  return -1;
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
        const family =
          file === SHEET &&
          compounds.every(({ classes }) => classes.every((name) => FAMILY_CLASSES.has(name)));
        found.push({
          file,
          selector,
          compounds,
          at,
          family,
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

  it('finds no height, min-height, border or background outside the family, except compact', () => {
    const offenders = REACHING.filter(
      (entry) => !entry.family && entry.boxes.length > 0 && !/is-compact/.test(entry.selector)
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
  const rootClasses = compounds[at].classes.filter((name) => name !== 'fabricate-search');
  let markup = fieldMarkup.replace(
    /class="fabricate-search"/,
    `class="fabricate-search ${rootClasses.join(' ')}"`
  );
  for (const compound of compounds.slice(0, at).toReversed()) {
    const tag = compound.tag || 'div';
    const attributes = compound.attributes.map(([name, value]) => ` ${name}="${value}"`).join('');
    markup = `<${tag} class="${compound.classes.join(' ')}"${attributes}>${markup}</${tag}>`;
  }
  return markup;
}

describe('every non-compact search renders the 38px shell in each host that reaches it', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-search-geometry-',
    compiledModules: ['src/ui/svelte/components/Field.svelte', FIELD],
    componentPath: FIELD,
  });
  let browser = null;
  let fieldMarkup = '';
  let labelledMarkup = '';

  before(async () => {
    await harness.setup();
    fieldMarkup = (await harness.mount({ ariaLabel: 'Search', placeholder: 'Search…' })).innerHTML;
    harness.remount();
    labelledMarkup = (await harness.mount({ label: 'Search', placeholder: 'Search…' })).innerHTML;
    harness.teardown();
    browser = await chromium.launch();
  });
  after(async () => {
    if (browser) await browser.close();
  });

  /** Each probe's shell and input box, at one window width. */
  async function measure(probes, width) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const scoped = Object.entries(FILES).filter(([file]) => file !== SHEET);
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <style>@layer modules { ${FILES[SHEET]} }</style>
      ${scoped.map(([, css]) => `<style>${css}</style>`).join('\n')}
      <style>html, body { margin: 0; } [data-probe] { width: ${width - 40}px; }</style></head>
      <body class="fabricate">${probes.map((markup, index) => `<div data-probe="${index}">${markup}</div>`).join('')}</body></html>`);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-probe]')].map((probe) => {
        const shell = probe.querySelector('.fabricate-search');
        const input = shell?.querySelector('input');
        return {
          shell: shell ? shell.getBoundingClientRect().height : null,
          radius: shell ? getComputedStyle(shell).borderTopLeftRadius : null,
          input: input ? input.getBoundingClientRect().height : null,
          inputBorder: input ? getComputedStyle(input).borderTopWidth : null,
        };
      })
    );
    await page.close();
    return boxes;
  }

  it('is 38 high, radius 9, with a borderless 36px input, in every host at a wide and a narrow window', async () => {
    const hosts = REACHING.filter((entry) => !/is-compact/.test(entry.selector));
    assert.ok(hosts.length >= 10, `only ${hosts.length} hosts reach a non-compact search`);
    const probes = [
      fieldMarkup,
      labelledMarkup,
      ...hosts.map((entry) => hostFor(entry, fieldMarkup)),
    ];
    const names = ['bare', 'labelled', ...hosts.map((entry) => `${entry.file}: ${entry.selector}`)];
    for (const width of [1280, 720]) {
      const offenders = (await measure(probes, width))
        .map((box, index) => ({ box, name: names[index] }))
        .filter(
          ({ box }) =>
            box.shell !== 38 ||
            box.radius !== '9px' ||
            box.input !== 36 ||
            box.inputBorder !== '0px'
        )
        .map(({ box, name }) => `${name} → ${JSON.stringify(box)}`);
      assert.deepEqual(offenders, [], `at ${width}px:\n  ${offenders.join('\n  ')}`);
    }
  });
});

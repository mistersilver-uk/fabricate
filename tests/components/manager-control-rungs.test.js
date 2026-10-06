/**
 * The two control-ladder rulings of issue 1371's parity round 5 (maintainer rulings M12a and
 * M12b), held as a contract over the sheet and over the one primitive that emits the opt-in.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { INSPECTOR_VERB_SITES } from '../helpers/inspectorVerbRoles.js';
import { importedModules, literalStrings, walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf, sourceAstEntriesUnder } from '../helpers/parsedSource.js';
import { renderedNodes } from '../helpers/structureShapes.js';
import { stripCssComments } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  attributeValue,
  declaresAttribute,
  rendersComponent,
  styleRules
} from '../helpers/svelteStructureContract.js';
import { LADDER_RUNGS } from './control-height-known-literals.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHEET = 'styles/fabricate.css';
const css = stripCssComments(readFileSync(resolve(repoRoot, SHEET), 'utf8'));

/** The rung band the radius ladder gives 9px to, and the one below it, both from the spec text. */
const BAND_9 = Object.freeze([34, 38]);
const BAND_7 = Object.freeze([26, 32]);

/**
 * Every rule in the sheet, as `{ selector, body }`. A flat walk is enough here.
 *
 * @returns {Array<{ selector: string, body: string }>}
 */
function rules() {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '),
    body
  }));
}

/**
 * The value of one property in a rule body, or `null`.
 *
 * @param {string} body
 * @param {string} property
 * @returns {string | null}
 */
function valueOf(body, property) {
  const match = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`).exec(body);
  return match ? match[1].trim() : null;
}

/** The pixel number a value states, or `null` when it states something else. */
function pixels(value) {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(String(value ?? ''));
  return match ? Number(match[1]) : null;
}

/** The rule bodies of one exact selector, in source order. */
function bodiesOf(selector) {
  const found = rules().filter((rule) => rule.selector === selector);
  assert.ok(found.length > 0, `the sheet still declares \`${selector}\``);
  return found.map((rule) => rule.body);
}

describe('M12a — a manager button takes the corner its height is on', () => {
  const PRIMITIVE = '.fabricate-button.fabricate-button.fab-manager-button';

  it('publishes both ladders, so the numbers below are read and not restated', () => {
    // Non-vacuity for the whole file.
    const spec = readFileSync(resolve(repoRoot, 'openspec/specs/design-system/spec.md'), 'utf8');
    assert.match(
      spec,
      /Radius tracks the size of the thing: 6 for chips at or below 24px, 7 for controls of 26 to 32px, 9 for controls of 34 to 38px/,
      'the radius ladder still puts 7 on the 26-32px band and 9 on the 34-38px band'
    );
    for (const rung of [...BAND_9, ...BAND_7]) {
      assert.ok(LADDER_RUNGS.includes(rung) || rung === 32, `${rung} still bounds a published band`);
    }
  });

  it('states the 34px control AND its 9px corner on one rule', () => {
    const [body] = bodiesOf(PRIMITIVE);
    assert.equal(pixels(valueOf(body, 'min-height')), 34, 'this is still the rule that sizes the control');
    assert.equal(
      pixels(valueOf(body, 'border-radius')),
      9,
      'and it states the 34-38px band’s corner, rather than falling through to the base rule’s chip rung'
    );
  });

  it('and the base rule it supersedes still states the chip rung, so the fix is a real change', () => {
    // The negative control. If the base rule had been edited instead.
    const base = rules().find(
      (rule) =>
        rule.selector === '.fabricate-button.fabricate-button, .fabricate-icon-button.fabricate-icon-button'
    );
    assert.ok(base, 'the shared base control rule is still spelled as one selector list');
    assert.equal(pixels(valueOf(base.body, 'border-radius')), 6, 'the base control is still on 6px');
  });

  /**
   * Every converted-button selector that pulls the control BELOW the 34-38px band.
   *
   * @returns {Array<{ selector: string, height: number, radius: number | null }>}
   */
  function convertedButtonsBelowTheBand() {
    const all = rules();
    const heights = new Map();
    for (const { selector, body } of all) {
      if (!selector.includes('fab-manager-button') || selector === PRIMITIVE) continue;
      const height = pixels(valueOf(body, 'height')) ?? pixels(valueOf(body, 'min-height'));
      if (height === null || height >= BAND_9[0]) continue;
      for (const part of selector.split(',').map((one) => one.trim())) {
        if (part.includes('fab-manager-button')) heights.set(part, height);
      }
    }
    return [...heights].map(([selector, height]) => {
      let radius = null;
      for (const rule of all) {
        if (!rule.selector.split(',').some((part) => part.trim() === selector)) continue;
        const stated = pixels(valueOf(rule.body, 'border-radius'));
        if (stated !== null) radius = stated;
      }
      return { selector, height, radius };
    });
  }

  it('DERIVES the pairing: no converted button below the band inherits a 34px control’s corner', () => {
    // The guard the fix earns, and it is scoped to the hazard the fix creates rather than to
    // radius correctness in general. Any rule more specific than the primitive's that pulls a
    // converted button's height below the band must state a corner SOMEWHERE, or it silently
    // wears the 34-38px band's 9px. What it must not do is state 9 — that is the exact
    // inheritance this guard exists to make visible, and `design-system-debt-ratchets` cannot see
    // it, because 9 is a legal radius value everywhere in the sheet.
    const offenders = convertedButtonsBelowTheBand()
      .filter(({ radius }) => radius === null || radius === 9)
      .map(({ selector, height, radius }) => `${selector} — ${height}px control, radius ${radius}`);
    assert.deepEqual(
      offenders,
      [],
      'a converted button below the 34-38px band states its own corner rather than taking the primitive’s'
    );
  });

  it('and the two sites this ruling moved take the 26-32px band’s 7px exactly', () => {
    const bySelector = new Map(
      convertedButtonsBelowTheBand().map((entry) => [entry.selector, entry])
    );
    for (const selector of [
      '.fabricate-button.fabricate-button.fab-manager-button.manager-clear-filters',
      '.fabricate-manager .manager-drop-inspector-stack .fabricate-button.fab-manager-button'
    ]) {
      const entry = bySelector.get(selector);
      assert.ok(entry, `\`${selector}\` is still a converted button below the band`);
      assert.ok(
        entry.height >= BAND_7[0] && entry.height <= BAND_7[1],
        `${selector} is ${entry.height}px, which is the 26-32px band`
      );
      assert.equal(entry.radius, 7, `${selector} takes that band’s corner`);
    }
  });

  it('and that derivation really walks a populated set, so the empty answer means something', () => {
    assert.ok(
      convertedButtonsBelowTheBand().length >= 3,
      `the sheet still holds converted buttons below the band (${convertedButtonsBelowTheBand().length})`
    );
  });
});

describe('M12b — the 38px rung is reachable on the toolbar controls the reference draws at 38', () => {
  const FIELD = 'src/ui/svelte/components/SearchField.svelte';
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-search-field-rung-',
    compiledModules: ['src/ui/svelte/components/Field.svelte', FIELD],
    componentPath: FIELD
  });

  before(async () => {
    await harness.setup();
  });
  after(() => harness.teardown());

  // THE FIELD IS 38 BY DEFAULT (issue 1782, maintainer ruling 2), so it needs no opt-in; the
  // converted select triggers still opt in, one member per host bar.
  const fieldRule = '.fabricate-search.fabricate-search:not(.is-compact)';
  const triggerRule =
    '.fabricate-manager .manager-scoped-list-toolbar .is-size-38 .fabricate-select-trigger, ' +
    '.fabricate-manager .manager-component-toolbar .is-size-38 .fabricate-select-trigger';

  it('is on the published height ladder, which is why it needs no deviation', () => {
    assert.ok(LADDER_RUNGS.includes(38), '38 is a rung, so drawing it is compliance and not drift');
  });

  it('states 38px and the band’s 9px corner for the field and for a toolbar select', () => {
    for (const [label, selector, heightProperty] of [
      ['field', fieldRule, 'height'],
      ['converted select trigger', triggerRule, 'min-height']
    ]) {
      const [body] = bodiesOf(selector);
      assert.equal(pixels(valueOf(body, heightProperty)), 38, `the ${label} stands at the 38px rung`);
      assert.equal(
        pixels(valueOf(body, 'border-radius')),
        9,
        `and the ${label} takes the 34-38px band’s corner with it`
      );
    }
  });

  it('and the shipped select it overrides is still 34px, so the opt-in is a real change', () => {
    assert.equal(
      pixels(
        valueOf(
          bodiesOf('.fabricate-select .fabricate-select-trigger-toolbar')[0],
          'min-height'
        )
      ),
      34
    );
    for (const selector of triggerRule.split(', ')) {
      const classes = (selector.match(/\.[\w-]+/g) ?? []).length;
      assert.ok(classes >= 3, `\`${selector}\` carries a third class, so it wins on specificity`);
    }
  });

  it('keeps no field rung in the sheet, because the field takes none', () => {
    assert.ok(
      rules().every(({ selector }) => !/fabricate-search[^,]*is-size-/.test(selector)),
      'a `.fabricate-search … is-size-*` rule paints a rung the field no longer emits'
    );
  });

  it('emits NO size class by default, so the root is the family alone', async () => {
    const root = await harness.mount({ ariaLabel: 'Search' });
    // THIS EQUALITY IS ALSO THE FAMILY'S ROOT-EMISSION PROOF ON THE RENDERED DOM (issue 1508).
    assert.equal(
      root.querySelector('label').className.replace(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-search',
      'a field that passes no class is the family root and nothing else'
    );
    harness.remount();
  });

  it('retired `size`: no rung class for any value, and the documented class order', async () => {
    for (const size of ['38', '30', 40, '']) {
      const root = await harness.mount({
        size,
        density: 'compact',
        ariaLabel: 'Search',
        class: 'manager-access-roster-search'
      });
      assert.equal(
        root.querySelector('label').className.replace(/ ?svelte-[a-z0-9]+/g, ''),
        'fabricate-search is-compact manager-access-roster-search',
        `\`size=${JSON.stringify(size)}\` emits nothing: the family root, the density, then the caller class`
      );
      harness.remount();
    }
  });

  it('names no rung in its script, so the dead-rule gate sees no customer for one', () => {
    const source = readFileSync(resolve(repoRoot, FIELD), 'utf8');
    const script = source.slice(source.indexOf('<script>'), source.indexOf('</script>'));
    assert.ok(!/is-size-/.test(script), 'the field writes no `is-size-*` class');
  });

  // ── THE BUTTON TAKES THE SAME RUNG, AND THE SAME TOKEN (issue 1371, round 6) ───────────────
  const BUTTON = 'src/ui/svelte/components/Button.svelte';
  const buttonRule = '.fabricate-button.fabricate-button.fab-manager-button.is-size-38';

  it('gives the button the rung and NOT a second corner, because 34 and 38 share one', () => {
    const [body] = bodiesOf(buttonRule);
    assert.equal(pixels(valueOf(body, 'min-height')), 38, 'the button opts into the 38px rung');
    // `min-height`, matching the property the rule it overrides declares.
    assert.equal(valueOf(body, 'height'), null, 'the rung states min-height, as the rule it overrides does');
    // AND NO RADIUS. Both rungs are inside the 34-38px band.
    assert.equal(
      valueOf(body, 'border-radius'),
      null,
      'the rung restates a corner the primitive already declares for this whole band'
    );
    const [primitive] = bodiesOf('.fabricate-button.fabricate-button.fab-manager-button');
    assert.equal(
      pixels(valueOf(primitive, 'border-radius')),
      9,
      'and that corner is 9 — the band’s, which is why the rung needs none of its own'
    );
    assert.ok(38 >= BAND_9[0] && 38 <= BAND_9[1], '38 is inside the band whose corner the primitive states');
  });

  it('and the shipped button it overrides is still 34px, so the opt-in is a real change', () => {
    const [primitive] = bodiesOf('.fabricate-button.fabricate-button.fab-manager-button');
    assert.equal(pixels(valueOf(primitive, 'min-height')), 34);
    // A specificity claim, not a source-order one.
    assert.equal((buttonRule.match(/\.[\w-]+/g) ?? []).length, 4);
  });

  it('emits the token the select triggers are opted in by, as a LITERAL, for the dead-rule gate', () => {
    const source = readFileSync(resolve(repoRoot, BUTTON), 'utf8');
    const script = source.slice(source.indexOf('<script>'), source.indexOf('</script>'));
    assert.match(script, /'is-size-38'/, 'the class is written out, not composed');
    // ONE RUNG, ONE TOKEN: the button and the select opt-in spell the rung the same way.
    assert.ok(triggerRule.includes('.is-size-38 '), 'the select triggers opt in by the same token');
  });
});

describe('M12a — an inspector rail’s verbs take the manager button’s rung (issue 1521)', () => {
  const MANAGER = 'src/ui/svelte/apps/manager';
  const FILES = [...new Set(INSPECTOR_VERB_SITES.map(({ file }) => file))];
  const GEOMETRY = new Set(['min-height', 'height', 'border-radius', 'font-size', 'padding']);
  const BUTTON_CLASSES = new Set(['fabricate-button', 'fab-manager-button', 'is-full-width']);

  /** The value a bare attribute (`true`) or a static one gives, for matching a site's hook. */
  function hookValue(node, name) {
    const attribute = (node.attributes ?? []).find((candidate) => candidate.name === name);
    if (!attribute) return undefined;
    return attribute.value === true ? true : (attributeValue(node, name) ?? '');
  }

  it('renders each of the eight verbs as a full-width Button in the role its verb names', () => {
    for (const { file, hook, value, role } of INSPECTOR_VERB_SITES) {
      const hooked = renderedNodes(componentAstOf(file), 'Button').filter(
        (node) => hookValue(node, hook) !== undefined
      );
      const sites = INSPECTOR_VERB_SITES.filter((site) => site.file === file && site.hook === hook);
      assert.equal(hooked.length, sites.length, `${file} renders no ${hook} Button the table omits`);
      const matches = hooked.filter((node) => hookValue(node, hook) === value);
      assert.equal(matches.length, 1, `${file} renders one Button carrying ${hook}`);
      assert.equal(attributeValue(matches[0], 'role'), role, `${file} ${hook}=${value} is ${role}`);
      assert.ok(declaresAttribute(matches[0], 'fullWidth'), `${file} ${hook} spans its rail`);
    }
  });

  it('states no rung or corner of its own on the primary', () => {
    // The retired 36px primary is gone; `control-height-ladder.test.js` reports it as shrunk.
    for (const body of bodiesOf('.fabricate-button.fabricate-button.fab-manager-button.is-primary')) {
      assert.equal(valueOf(body, 'min-height'), null, 'the primary states no height of its own');
      assert.equal(valueOf(body, 'border-radius'), null, 'and no corner of its own');
    }
  });

  it('lets no rail restate a verb’s geometry in its own scoped block', () => {
    const offenders = [];
    for (const file of FILES) {
      for (const rule of styleRules(componentAstOf(file))) {
        const names = [...walkNodes(rule.prelude)]
          .filter((node) => node.type === 'ClassSelector')
          .map((node) => node.name);
        if (names.every((name) => !BUTTON_CLASSES.has(name))) continue;
        const restated = (rule.block?.children ?? []).filter(
          (node) => node.type === 'Declaration' && GEOMETRY.has(node.property)
        );
        for (const node of restated) offenders.push(`${file}: ${node.property} ${node.value}`);
      }
    }
    assert.deepEqual(offenders, [], 'a scoped rule moves a verb off the primitive’s rung');
  });

  it('retires the rail button: no file, import or render of it remains', () => {
    const retired = 'InspectorActionButton';
    assert.equal(existsSync(resolve(repoRoot, `${MANAGER}/${retired}.svelte`)), false);
    const users = [...sourceAstEntriesUnder('src'), ...sourceAstEntriesUnder('scripts')]
      .filter(
        ([, ast]) =>
          importedModules(ast).some((specifier) => specifier.endsWith(`/${retired}.svelte`)) ||
          (ast.fragment !== undefined && rendersComponent(ast, retired))
      )
      .map(([path]) => path);
    assert.deepEqual(users, []);
  });

  it('leaves the two removal verbs on ArmedDangerButton', () => {
    for (const [file, key] of [
      [`${MANAGER}/scoped/MembershipActions.svelte`, 'FABRICATE.Admin.Manager.Scoped.Membership.Remove'],
      [`${MANAGER}/tools/ToolBreakageTab.svelte`, 'FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystem']
    ]) {
      const armed = renderedNodes(componentAstOf(file), 'ArmedDangerButton').filter((node) =>
        literalStrings(node.attributes).includes(key)
      );
      assert.equal(armed.length, 1, `${file} arms ${key} through ArmedDangerButton`);
    }
  });
});

describe('epic 1997 — the banded Modal frame and the Select glyph (rulings 2026-09-28)', () => {
  it('pins the rung rule the close takes: IconButton’s 26px square in the module sheet', () => {
    const [box] = bodiesOf('.fabricate-icon-button.fabricate-icon-button.is-size-26');
    for (const property of ['width', 'height', 'min-width', 'min-height']) {
      assert.equal(pixels(valueOf(box, property)), 26, `the rung states a 26px ${property}`);
    }
  });

  it('draws every rung’s glyphs at the specimen’s 12px `.k-field .i`, never at the rung’s type', () => {
    const [body] = bodiesOf('.fabricate-select-trigger > i');
    assert.equal(pixels(valueOf(body, 'font-size')), 12);
    const restated = rules().filter(
      (rule) => /fabricate-select-trigger[^,]*> i\b/.test(rule.selector) && valueOf(rule.body, 'font-size')
    );
    assert.deepEqual(
      restated.map((rule) => rule.selector),
      ['.fabricate-select-trigger > i'],
      'no rung or call site restates the glyph size'
    );
    const library = readFileSync(resolve(repoRoot, 'openspec/specs/design-system/library.html'), 'utf8');
    assert.match(library, /\.k-field \.i\{width:12px;height:12px;/, 'the specimen still states 12px');
  });
});

/**
 * The two control-ladder rulings of issue 1371's parity round 5 (maintainer rulings M12a and
 * M12b), held as a contract over the sheet and over the one primitive that emits the opt-in.
 *
 * ── M12a: A MANAGER BUTTON'S CORNER FOLLOWS ITS HEIGHT ──────────────────────────────────────
 * `openspec/specs/design-system/spec.md` publishes both ladders: control height is one of
 * 26 / 28 / 30 / 34 / 38 / 44, and "Radius tracks the size of the thing: 6 for chips at or below
 * 24px, 7 for controls of 26 to 32px, 9 for controls of 34 to 38px…". A `<ManagerButton>` is a
 * 34px control and painted a 6px corner — the chip rung — on every manager screen, because
 * `.fabricate-manager .manager-button.fab-manager-button` declared the height and no radius and
 * the base `.fabricate-manager .manager-button` rule's 6px reached it. Four parity regions on
 * three screens measured the same one-line drift.
 *
 * THE HAZARD THE FIX CREATES IS WHAT THE DERIVED GUARD BELOW IS FOR. Stating a corner on the
 * primitive's own (0,3,0) control rule means every MORE specific rule that overrides the height
 * DOWNWARD and states no corner of its own now inherits a 34px control's corner at 28px or 30px.
 * Two such rules existed and take the 26-32px rung explicitly. A third written later would be
 * silently off the ladder, in a direction no ratchet sees: `design-system-debt-ratchets` reads the
 * radius VALUES in the sheet and 9 is a legal value everywhere, so a 30px control wearing it is
 * invisible to that gate. This file derives the pairing from the sheet instead.
 *
 * ── M12b: 38 IS A RUNG AND IS REACHABLE ─────────────────────────────────────────────────────
 * The reference draws the world catalogue's toolbar search and membership filter and the system
 * rules list's search and two filters at 38px (`proto:577-578`, `proto:1053-1055`); all five ship
 * at 34. 38 is a published rung, so nothing licensed the drop — the size becomes reachable rather
 * than the reference being adapted to the shipped control.
 *
 * IT IS A CLASS FOR THE SELECTS AND A PROP FOR THE FIELD, and the asymmetry is the tree's rather
 * than a choice: `ManagerSearchField` is a component, and the manager has no select COMPONENT at
 * all — `ManagerToolbar`'s own header records that the control beside the field is three different
 * things across eleven bars and that the bar takes a slot rather than choosing between them. So
 * the contract a caller opts into for a `<select>` is the class, and the field's prop emits that
 * same class.
 *
 * ── ROUND 6 ADDED ONE CONTROL TO EACH HALF ──────────────────────────────────────────────────
 * The BUTTON joins M12b: `+ Register item` (`proto:570`) and `+ Add from catalogue`
 * (`proto:1046`) are both drawn at 38, so `ManagerButton` emits the same `is-size-38` token the
 * field does, and the sheet gives it the height alone — 34 and 38 are both inside the radius
 * ladder's 34-38px band, so the corner the primitive already states is right at either height.
 *
 * `InspectorActionButton` joins M12a: its own scoped block declared `min-height: 34px` with
 * `border-radius: 6px`, which is the identical off-ladder pairing on a second primitive, and the
 * rules list measured it as the last line on `sys-inspector-foot-action`. It is a scoped block
 * rather than a sheet rule, so it is read from the component's own source below — and that is
 * also why no rule in `styles/fabricate.css` could have corrected it: that sheet ships at
 * `layer(modules)` and an injected scoped block is unlayered, so a layered rule loses at any
 * specificity.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { stripCssComments } from '../helpers/styleBlockScan.js';
import { LADDER_RUNGS } from './control-height-known-literals.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHEET = 'styles/fabricate.css';
const css = stripCssComments(readFileSync(resolve(repoRoot, SHEET), 'utf8'));

/** The rung band the radius ladder gives 9px to, and the one below it, both from the spec text. */
const BAND_9 = Object.freeze([34, 38]);
const BAND_7 = Object.freeze([26, 32]);

/**
 * Every rule in the sheet, as `{ selector, body }`. A flat walk is enough here: the two
 * properties this file reads are never nested inside an at-rule in the corpus it inspects, and a
 * `@media` copy of a rule would appear as its own entry with the same selector, which is the
 * behaviour the pairing guard wants anyway.
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
  const PRIMITIVE = '.fabricate-manager .manager-button.fab-manager-button';

  it('publishes both ladders, so the numbers below are read and not restated', () => {
    // Non-vacuity for the whole file: every assertion here is an arithmetic claim about two
    // published ladders, and a rung set that had silently changed would make all of them
    // meaningless while every one still passed.
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
    // The negative control. If the base rule had been edited instead, the assertion above would
    // pass while `.manager-icon-button` — which shares that rule and is a different control at a
    // different size — had been repainted as a side effect.
    const base = rules().find(
      (rule) =>
        rule.selector === '.fabricate-manager .manager-button, .fabricate-manager .manager-icon-button'
    );
    assert.ok(base, 'the shared base control rule is still spelled as one selector list');
    assert.equal(pixels(valueOf(base.body, 'border-radius')), 6, 'the base control is still on 6px');
  });

  /**
   * Every converted-button selector that pulls the control BELOW the 34-38px band, with the
   * radius the sheet gives it — read across the whole sheet rather than from the one rule that
   * happens to state the height, because a corner may legitimately be stated by a later rule
   * that lists several selectors together.
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
    //
    // A sub-band button that states an off-ladder corner of its OWN is out of scope here and
    // stays visible to the radius ratchet: the Checks Studio's preset row is 30px on 8px, which
    // predates this ruling and is not something this edit moved.
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
      '.fabricate-manager .manager-button.fab-manager-button.manager-clear-filters',
      '.fabricate-manager .manager-drop-inspector-stack .manager-button.fab-manager-button'
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
  const FIELD = 'src/ui/svelte/components/ManagerSearchField.svelte';
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-search-field-rung-',
    compiledModules: [FIELD],
    componentPath: FIELD
  });

  before(async () => {
    await harness.setup();
  });
  after(() => harness.teardown());

  const fieldRule = '.fabricate-manager .manager-search.is-size-38 input';
  const selectRule =
    '.fabricate-manager .manager-filter.is-size-38 select, .fabricate-manager .manager-toolbar select.is-size-38, .fabricate-manager .manager-scoped-list-toolbar select.is-size-38';

  it('is on the published height ladder, which is why it needs no deviation', () => {
    assert.ok(LADDER_RUNGS.includes(38), '38 is a rung, so drawing it is compliance and not drift');
  });

  it('states 38px and the band’s 9px corner for the field and for a toolbar select', () => {
    for (const [label, selector] of [
      ['field', fieldRule],
      ['select', selectRule]
    ]) {
      const [body] = bodiesOf(selector);
      assert.equal(pixels(valueOf(body, 'height')), 38, `the ${label} opts into the 38px rung`);
      assert.equal(
        pixels(valueOf(body, 'border-radius')),
        9,
        `and the ${label} takes the 34-38px band’s corner with it, rather than keeping the 34px control’s`
      );
    }
  });

  it('and the shipped controls it overrides are still 34px, so the opt-in is a real change', () => {
    // Non-vacuity again, and a specificity claim: both shipped rules are (0,2,1) and both state
    // the height, so an opt-in written at the same weight would be decided by source order.
    assert.equal(pixels(valueOf(bodiesOf('.fabricate-manager .manager-search input')[0], 'height')), 34);
    assert.equal(
      pixels(valueOf(bodiesOf('.fabricate-manager .manager-scoped-list-toolbar select')[0], 'height')),
      34
    );
    for (const selector of [fieldRule, ...selectRule.split(', ')]) {
      const classes = (selector.match(/\.[\w-]+/g) ?? []).length;
      assert.ok(classes >= 3, `\`${selector}\` carries a third class, so it wins on specificity`);
    }
  });

  it('emits NO size class by default, so every shipped field is unchanged', async () => {
    const root = await harness.mount({ ariaLabel: 'Search' });
    assert.equal(
      root.querySelector('label').className.replace(/ ?svelte-[a-z0-9]+/g, ''),
      'manager-search',
      'a field that does not ask for a rung is the hook class and nothing else'
    );
    harness.remount();
  });

  it('emits is-size-38 when asked, and keeps the documented class order', async () => {
    const root = await harness.mount({
      size: '38',
      compact: true,
      class: 'manager-access-roster-search'
    });
    assert.equal(
      root.querySelector('label').className.replace(/ ?svelte-[a-z0-9]+/g, ''),
      'manager-search is-compact is-size-38 manager-access-roster-search',
      'the rung sits between the density and the caller class, which is where every hand-rolled site already writes its own extra'
    );
    harness.remount();
  });

  it('DROPS an unrecognised rung rather than emitting a class the sheet does not paint', async () => {
    for (const size of ['37', 40, 'tall', '']) {
      const root = await harness.mount({ size });
      assert.ok(
        !root.querySelector('label').className.includes('is-size-'),
        `\`${size}\` is not a rung this field offers, so it renders the shipped control`
      );
      harness.remount();
    }
  });

  it('names the class as a LITERAL, so the dead-rule gate can see a customer for the sheet rule', () => {
    // `scripts/lib/stylesheetLiveClasses.js` never widens an `is-`/`has-` class through a
    // positional wildcard, so a class this component only ever BUILT from a template would leave
    // `.manager-search.is-size-38 input` looking like a rule with no caller.
    const source = readFileSync(resolve(repoRoot, FIELD), 'utf8');
    const script = source.slice(source.indexOf('<script>'), source.indexOf('</script>'));
    assert.match(script, /'is-size-38'/, 'the class is written out, not composed');
  });

  // ── THE BUTTON TAKES THE SAME RUNG, AND THE SAME TOKEN (issue 1371, round 6) ───────────────
  const BUTTON = 'src/ui/svelte/components/ManagerButton.svelte';
  const buttonRule = '.fabricate-manager .manager-button.fab-manager-button.is-size-38';

  it('gives the button the rung and NOT a second corner, because 34 and 38 share one', () => {
    const [body] = bodiesOf(buttonRule);
    assert.equal(pixels(valueOf(body, 'min-height')), 38, 'the button opts into the 38px rung');
    // `min-height`, matching the property the rule it overrides declares: a `height` here would
    // win the size argument while leaving a 34px floor underneath it.
    assert.equal(valueOf(body, 'height'), null, 'the rung states min-height, as the rule it overrides does');
    // AND NO RADIUS. Both rungs are inside the 34-38px band, so restating 9 here would be a
    // second source of truth for one value — the failure the primitive's docblock exists to end.
    assert.equal(
      valueOf(body, 'border-radius'),
      null,
      'the rung restates a corner the primitive already declares for this whole band'
    );
    const [primitive] = bodiesOf('.fabricate-manager .manager-button.fab-manager-button');
    assert.equal(
      pixels(valueOf(primitive, 'border-radius')),
      9,
      'and that corner is 9 — the band’s, which is why the rung needs none of its own'
    );
    assert.ok(
      BAND_9.includes(38) === false ? false : 38 >= BAND_9[0] && 38 <= BAND_9[1],
      '38 is inside the band whose corner the primitive states'
    );
  });

  it('and the shipped button it overrides is still 34px, so the opt-in is a real change', () => {
    const [primitive] = bodiesOf('.fabricate-manager .manager-button.fab-manager-button');
    assert.equal(pixels(valueOf(primitive, 'min-height')), 34);
    // A specificity claim, not a source-order one: the shipped rule is (0,3,0) and states the
    // height, so an opt-in written at the same weight would be decided by where it was written.
    assert.equal((buttonRule.match(/\.[\w-]+/g) ?? []).length, 4);
  });

  it('emits the same token the field does, as a LITERAL, for the dead-rule gate', async () => {
    const source = readFileSync(resolve(repoRoot, BUTTON), 'utf8');
    const script = source.slice(source.indexOf('<script>'), source.indexOf('</script>'));
    assert.match(script, /'is-size-38'/, 'the class is written out, not composed');
    // ONE RUNG, ONE TOKEN. Two primitives spelling the same rung differently is the drift the
    // shared name exists to prevent, and nothing else in the tree can see it.
    const fieldScript = readFileSync(resolve(repoRoot, FIELD), 'utf8');
    assert.equal(
      (script.match(/'is-size-\d+'/g) ?? []).join(' '),
      (fieldScript.match(/'is-size-\d+'/g) ?? []).join(' '),
      'the button and the field name different rungs, so one ladder is spelled two ways'
    );
  });
});

describe('M12a — the inspector rail’s action button takes the corner its height is on', () => {
  const ACTION = 'src/ui/svelte/apps/manager/InspectorActionButton.svelte';

  /** One rule body from a component's own scoped block, comments stripped. */
  function scopedRule(componentPath, selector) {
    const source = readFileSync(resolve(repoRoot, componentPath), 'utf8');
    const block = stripCssComments(source.slice(source.search(/^<style>$/m) + '<style>'.length));
    const found = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
      ([, head]) => head.trim().replaceAll(/\s+/g, ' ') === selector
    );
    assert.equal(found.length, 1, `${componentPath} still declares exactly one \`${selector}\` rule`);
    return found[0][2];
  }

  it('states the 34px control AND the band’s 9px corner on one rule', () => {
    const body = scopedRule(ACTION, '.fab-inspector-action');
    assert.equal(pixels(valueOf(body, 'min-height')), 34, 'this is still the rule that sizes the control');
    assert.equal(
      pixels(valueOf(body, 'border-radius')),
      9,
      'a 34px control is painting the chip rung the ladder gives to something at or below 24px'
    );
  });

  it('is unreachable from the sheet, which is why the fix is in the component', () => {
    // The measurement, not an opinion: `styles/fabricate.css` ships at `layer(modules)` and this
    // block is injected unlayered, so a rule there is emitted, matches, and has its declaration
    // discarded. A future author reaching for the sheet needs to find this stated.
    const declarations = css
      .split('}')
      .filter((block) => /\.fab-inspector-action[^{]*\{/.test(block));
    assert.deepEqual(
      declarations,
      [],
      'a rule in the global sheet targets this primitive’s own element, where it cannot win'
    );
  });

  it('leaves the primary’s retired 36px rung exactly as it stands, which is booked debt', () => {
    // 36 is NOT on the ladder — `control-height-known-literals.js` already books it — and paying
    // it down is a separate change with its own repaint. What matters here is that this edit did
    // not quietly move it, and that 36 is inside the band the corner above serves, so the two
    // are not in conflict.
    const body = scopedRule(ACTION, '.fab-inspector-action.is-primary');
    assert.equal(pixels(valueOf(body, 'min-height')), 36, 'the primary’s height is unchanged by this edit');
    assert.ok(!LADDER_RUNGS.includes(36), '36 is still a retired rung, so this stays booked debt');
    assert.equal(valueOf(body, 'border-radius'), null, 'and it states no corner, so it takes the 9 above');
  });
});

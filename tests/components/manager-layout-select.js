/**
 * Shared Select, picker popover, browser toolbar control and pager layout, measured in a real browser (issue 1670).
 *
 * A surface module of `manager-layout.test.js`. It registers its tests on import and owns no
 * browser: `tests/helpers/layout-harness.js` holds the one Chromium every surface shares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeIconPickerPopoverLayout } from '../../src/ui/svelte/util/iconPickerPopover.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  blockFor,
  css,
  managerButtonClassesFor,
  managerComponentDir,
  pagerBarFixture,
} from './manager-layout-shared.js';
import {
  ACTIVE_OUTLINE,
  CALLER_ROW,
  CONVERTED_PAGER_SITES,
  PICKER_CASCADE_FIXTURE,
  PLAYER_FRAME_CLASSES,
  SELECT_RUNGS,
  SHARED_PANEL,
  SHARED_ROW,
  SORT_DIRECTION_PROBES,
  SOURCE_TRIGGER_SITES,
  TRANSLUCENT_RETENTIONS,
  framePath,
  selectPanelFixture,
  selectTriggerFixture,
} from './manager-layout-select-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('manager pagination footer uses scoped chrome with stable summary, nav, and per-page controls', () => {
  const block = blockFor('.fabricate-pagination.manager-pagination');

  assert.ok(block.includes('display: flex;'), 'pagination footer should layout horizontally');
  assert.ok(
    block.includes('justify-content: space-between;'),
    'pagination footer should distribute summary, nav, per-page across the row'
  );
  assert.ok(block.includes('flex-wrap: wrap;'), 'pagination footer should wrap on narrow widths');
  assert.ok(
    block.includes('border-top: 1px solid var(--fab-border);'),
    'pagination footer should anchor to the table with a manager border'
  );
  assert.ok(
    css.includes('.fabricate-pagination .manager-pagination-page'),
    'pagination should expose a stable Page-of label for keyboard users'
  );
  // ISSUE 1504 RETARGETED THIS ASSERTION WITH THE RULE IT WAS WATCHING. The per-page control is
  // a shared `<Select size="inline">` now, so its height, corner, fill and type come from the
  // `.fabricate-select*` family and the pager states only the one thing that is still its own:
  // a WIDTH FLOOR, so `Per page 10` and `Per page 100` do not sit at two widths in a manager
  // footer of fixed-width neighbours. It is stated at the primitive's own root, and names the
  // control by `Pagination`'s own hook rather than by `Select`'s class: the area-scope gate
  // reads BOTH an area root and another primitive's `fabricate-` namespace as application
  // roots in front of a class `Pagination` writes. The six pagers that do not want the floor
  // refuse it in their own blocks, which is measured below.
  assert.ok(
    css.includes('.fabricate-pagination .manager-pagination-size [data-pagination-size]'),
    'pagination should floor its own per-page control from the primitive`s own root'
  );
  assert.ok(
    !css.includes('.manager-pagination-size select'),
    'and no rule may still paint a native per-page select: there is no longer one to paint'
  );
});

/*
  The OPEN state of a manager `<select>` (issue 772).

  `.fabricate-manager select` themes the CLOSED field, so a manager dropdown looks correct
  until it is opened — and then the option list fell back to the browser's black-on-white
  default, in every native select the manager renders. The player app carried
  `.fabricate-app select option` for a long time and stopped needing it at issue 1511, when its
  last native select converted and that rule was deleted; the manager root is
  `.fabricate-manager` and never inherited it while it existed.

  This is asserted from the STYLESHEET rather than from a rendered frame because it cannot
  be photographed: a native select's popup is painted by the browser, not into the page DOM,
  so Playwright never sees it and no smoke screenshot can contain the defect. It was found
  by opening the control by hand. A source assertion is therefore the only gate available,
  and its job is to stop the rule being deleted as "unused".
*/
test('the manager themes select options, not just the closed select', () => {
  const optionRule = blockFor('.fabricate-manager select option');
  assert.ok(optionRule, 'the manager must theme its option list, not only the closed field');
  assert.match(
    optionRule,
    /background:\s*var\(--fab-bg-3\)/,
    'an option list must take its background from `--fab-bg-3`, so it re-themes with the ' +
      'rest of the manager; unpainted, it falls back to whatever the browser draws, which ' +
      'in every engine tested is a light list inside a dark app'
  );
  assert.match(optionRule, /color:\s*var\(--fab-text\)/);

  // The selected row must be marked the SAME way on both rendering paths — the engines
  // that paint the list in-page and the customizable-select picker. An accent-filled bar
  // on one and a subtle overlay on the other is one control reading as two designs
  // depending on which browser the GM happens to run.
  const checkedRule = blockFor('.fabricate-manager select option:checked');
  assert.ok(checkedRule, 'the selected row needs its own treatment');
  assert.match(
    checkedRule,
    /background:\s*var\(--fab-overlay-light-08\)/,
    'the checked row shares the picker treatment rather than painting a filled bar'
  );
  assert.match(checkedRule, /color:\s*var\(--fab-accent\)/);

  // `color-scheme` is the only layer here that reaches every engine: it is what makes the
  // platform-drawn popup dark at all, and without it the rules above are cosmetic.
  assert.match(
    blockFor('.fabricate-manager'),
    /color-scheme:\s*dark/,
    'the manager root must declare the dark UA scheme, as the player root already does'
  );

  // …and the opt-in that makes those colours visible at all. Without it the rules above
  // are correct and inert on the engines most players use, because a legacy select popup
  // is painted by the platform rather than the page.
  assert.match(
    css,
    /@supports \(appearance: base-select\)/,
    'the option colours only reach a Chromium popup through the customizable-select opt-in'
  );
  const picker = blockFor('.fabricate-manager select::picker(select)');
  assert.ok(picker, 'the picker surface must be themed, not left as the platform default');
  assert.match(picker, /background:\s*var\(--fab-bg-3\)/);
});

/*
  Every manager `<select>` must carry an OPAQUE background (issue 772).

  A native select's option popup is painted by the browser, which derives its surface from
  the control's own computed background. A translucent background looks correct on the
  CLOSED control — it composites over whatever dark surface it sits on — but the popup has
  nothing to composite against, so it opens LIGHT while every other manager dropdown opens
  dark. `color-scheme: dark` does not rescue it: an author background wins over the UA
  scheme.

  This shipped once. The bulk edit panel's category select used `--fab-surface-soft`, a
  5%-alpha light tint, and opened light beside a pagination select that opened dark in the
  same window. It is invisible to every other gate: the closed control looks correct in any
  screenshot, and the popup is browser chrome that Playwright cannot photograph at all.

  The scan covers component SCOPED styles as well as the global sheet, because that is
  where it shipped — a global-sheet-only guard would have missed it entirely.
*/
test('every manager select paints an opaque background, so its popup opens dark', () => {
  // `rgb(… / 5%)`, `rgba(…, 0.05)` — any alpha below 1.
  const TRANSLUCENT = /(?:rgba?|hsla?)\([^)]*(?:\/\s*(?:0?\.\d+|[0-9]{1,2})%|,\s*0?\.\d+)\s*\)/i;

  // Resolve `var(--a)` chains against the sheet's own token declarations.
  const tokens = new Map(
    [...css.matchAll(/^\s*(--fab-[\w-]+):\s*([^;]+);/gm)].map(([, name, value]) => [
      name,
      value.trim(),
    ])
  );
  function resolveToken(value, depth = 0) {
    if (depth > 8) return value;
    const ref = /var\(\s*(--fab-[\w-]+)/.exec(value);
    if (!ref) return value;
    const next = tokens.get(ref[1]);
    return next ? resolveToken(next, depth + 1) : value;
  }
  const backgroundOf = (body) => /background(?:-color)?:\s*([^;]+)/.exec(body)?.[1]?.trim() || '';

  const offenders = [];

  // 1. The global sheet: rules whose selector ends at a bare `select` under the manager.
  //
  // THE `\b` BELOW WAS A LITERAL BACKSPACE (issue 1373, round 8, found while editing this file).
  // U+0008 is what an editor writes when a `\b` is passed through a shell heredoc or a non-raw
  // Python string, and it is invisible in every diff, every review and every editor. The pattern
  // therefore required a control character between the selector and `select`, matched NOTHING,
  // and half of this gate had been scanning an empty set: 0 rules against the 27 the repaired
  // pattern finds. Only branch 2, the scoped-block correlation, was ever doing any work.
  //
  // Repaired rather than reported, because the repair is provably safe: neither branch reports an
  // offender on this tree, so the gate goes from vacuous to real without moving.
  for (const [, selector, body] of css.matchAll(
    /(\.fabricate-manager[^{},]*\bselect)\s*\{([^}]*)\}/g
  )) {
    const declared = backgroundOf(body);
    if (declared && TRANSLUCENT.test(resolveToken(declared))) {
      offenders.push(`styles/fabricate.css ${selector.trim()} -> ${declared}`);
    }
  }

  // 2. Component scoped styles: correlate `<select class="x">` with `.x { background }` in
  //    the same file's `<style>` block. This is the shape the defect actually took, so a
  //    global-sheet-only scan would have missed it.
  const managerFiles = readdirSync(managerComponentDir, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'));

  for (const entry of managerFiles) {
    const full = resolve(entry.parentPath, entry.name);
    const source = readFileSync(full, 'utf8');
    const style = /<style>([\s\S]*)<\/style>/.exec(source)?.[1];
    if (!style) continue;
    const shortPath = relative(managerComponentDir, full).replaceAll('\\', '/');
    for (const [, classAttr] of source.matchAll(/<select[^>]*class="([^"]+)"/g)) {
      for (const className of classAttr.split(/\s+/).filter(Boolean)) {
        if (className.includes('{')) continue;
        const rule = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(style);
        if (!rule) continue;
        const declared = backgroundOf(rule[1]);
        if (declared && TRANSLUCENT.test(resolveToken(declared))) {
          offenders.push(`${shortPath} .${className} -> ${declared}`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a translucent select background opens a LIGHT popup:\n- ${offenders.join('\n- ')}`
  );
});

test('all three browser sort-direction toggles render as one control', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const base = managerButtonClassesFor('neutral');
    const toggles = SORT_DIRECTION_PROBES.map(({ probe, attributes }) => {
      // The bespoke class travels through the primitive's APPENDING `class` prop, so the
      // rendered element carries both — build the string the way the component joins it
      // rather than restating one of the two spellings.
      const extra = /class="([^"]*)"/.exec(attributes)?.[1] ?? '';
      const hook = extra ? '' : ` ${attributes}`;
      return `<button type="button" class="${[base, extra].filter(Boolean).join(' ')}"${hook} data-probe="${probe}"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;
    }).join('');
    // NEGATIVE CONTROL: the same primitive with neither the class nor the hook. It is what
    // the essence toggle measured before this rule, so if it matched the three below, the
    // rule would be reaching nothing and every equality here would hold trivially.
    const bare = `<button type="button" class="${base}" data-probe="bare"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;
    // AND A SECOND CONTROL, added when the primitive's own control rule took the 34-38px band's
    // 9px corner (issue 1371, maintainer ruling M12a). Before that, `borderRadius` was the
    // discriminator this test used to prove the toolbar rule had reached its fixture at all: 9px
    // against the bare primitive's 6px. The primitive is 9px now, so that half of the control has
    // been superseded rather than lost — `fontWeight` still discriminates (600 against 700), and
    // this probe carries the family ROOT and `manager-button` WITHOUT `fab-manager-button`, which
    // is what an unconverted hand-written button is and is still on the base rule's 6px. So the
    // corner is measured in a real browser on both sides of the conversion boundary instead.
    //
    // THE ROOT IS PART OF THE UNCONVERTED SPELLING SINCE ISSUE 1502, not a conversion. That
    // change re-rooted the family at `fabricate-button`, so the base rule the 6px comes from is
    // `.fabricate-button.manager-button`: a root-less probe would match no family rule at all and
    // would measure Foundry's own button corner, which is not what M12a claims. `fab-manager-
    // button` is still the conversion marker and is still absent here.
    //
    // IT MODELS A STRING THE PRODUCT STILL RENDERS, which is what earns it its row in
    // `manager-button-source-contract.test.js`'s fixture allowlist rather than a conversion:
    // `ComponentComplicationsSection.svelte` passes `triggerClass="fabricate-button manager-button"`
    // to `SearchablePopover`, so this is population B as well as the unconverted half of a pair.
    // That allowlist row names the file and the literal and READS them, so this fixture cannot
    // outlive the call site it models. Converting this probe would make it measure 9px, the
    // equality below would hold trivially, and M12a's blast-radius claim would be gone.
    const unconverted = `<button type="button" class="fabricate-button manager-button" data-probe="unconverted"><i class="fas fa-arrow-down-short-wide"></i><span>Asc</span></button>`;

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 16px; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="fabricate-filter-bar manager-toolbar">${toggles}${bare}${unconverted}</div>
          </main>
        </body>
      </html>
    `);

    const measured = await page.evaluate(() => {
      const read = (probe) => {
        const element = document.querySelector(`[data-probe="${probe}"]`);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          gap: style.gap,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          height: `${Math.round(element.getBoundingClientRect().height)}px`,
          borderRadius: style.borderRadius,
        };
      };
      return Object.fromEntries(
        ['recipe', 'component', 'essence', 'bare', 'unconverted'].map((probe) => [
          probe,
          read(probe)
        ])
      );
    });

    for (const probe of ['recipe', 'component', 'essence', 'bare', 'unconverted']) {
      assert.ok(measured[probe], `the ${probe} probe rendered`);
    }

    // Non-vacuity: the rule reached the fixture at all. 9px and 600 are what it declares; the
    // bare PRIMITIVE declares 700 and, since issue 1371's M12a ruling, the same 9px — so weight
    // is the discriminator and the corner is now the thing the third probe measures.
    assert.equal(measured.recipe.borderRadius, '9px', 'the toolbar rule reached the fixture');
    assert.equal(measured.bare.fontWeight, '700', 'and the bare primitive is at the base weight');
    assert.notEqual(
      measured.bare.fontWeight,
      measured.recipe.fontWeight,
      'so the bare probe still discriminates — an equality that held for every property would mean the rule was reaching nothing'
    );

    // M12a, measured: the CONVERTED control is on the 34-38px band's 9px corner and the
    // unconverted hand-written button is still on the base rule's 6px, so the ruling moved the
    // primitive and not the whole `.manager-button` family.
    assert.equal(measured.bare.borderRadius, '9px', 'a converted manager button paints the band corner');
    assert.equal(
      measured.unconverted.borderRadius,
      '6px',
      'and an unconverted hand-written one still paints the base control, so the edit is scoped to the primitive'
    );

    for (const property of ['gap', 'fontSize', 'fontWeight', 'padding', 'height', 'borderRadius']) {
      assert.equal(
        measured.essence[property],
        measured.recipe[property],
        `the essence toggle's ${property} (${measured.essence[property]}) must match the recipe browser's (${measured.recipe[property]})`
      );
      assert.equal(
        measured.component[property],
        measured.recipe[property],
        `the component toggle's ${property} (${measured.component[property]}) must match the recipe browser's (${measured.recipe[property]})`
      );
    }
  } finally {
    await context.close();
  }
});

test('the composed picker cascade resolves to the shared panel and the callers own boxes', async () => {
  // 900 tall on purpose: the shared panel caps at `min(50vh, 360px)`, so a viewport under
  // 720px would resolve that to 50vh and the residual below would read a viewport rather than
  // the sheet's own ceiling.
  const context = await openLayoutContext({ viewport: { width: 900, height: 900 } });
  const page = await context.newPage();
  try {
    await page.setContent(`<style>${css}</style>${PICKER_CASCADE_FIXTURE}`);

    const report = await page.evaluate((translucent) => {
      // ── THE ENUMERATOR ──────────────────────────────────────────────────────────────────
      // Specificity is counted the way the spec counts it: ids, then classes AND attribute
      // selectors AND pseudo-classes, then element names and pseudo-elements. `:hover` and
      // `[data-active-option='true']` both land in the middle bucket, which is why the caller's
      // deepened state rule and the shared outline are both (0,4,0) and settle on source order.
      const specificityOf = (selector) => {
        const attributes = (selector.match(/\[[^\]]*\]/g) || []).length;
        const withoutAttributes = selector.replaceAll(/\[[^\]]*\]/g, ' ');
        const pseudoElements = (withoutAttributes.match(/::[\w-]+/g) || []).length;
        const withoutPseudoElements = withoutAttributes.replaceAll(/::[\w-]+/g, ' ');
        const pseudoClasses = (withoutPseudoElements.match(/:[\w-]+(\([^)]*\))?/g) || []).length;
        const bare = withoutPseudoElements.replaceAll(/:[\w-]+(\([^)]*\))?/g, ' ');
        const ids = (bare.match(/#[\w-]+/g) || []).length;
        const classes = (bare.match(/\.[\w-]+/g) || []).length;
        const elements = (bare.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
        return [ids, classes + attributes + pseudoClasses, elements + pseudoElements];
      };
      const beats = (left, right) => {
        if (left.important !== right.important) return left.important;
        for (let index = 0; index < 3; index += 1) {
          if (left.specificity[index] !== right.specificity[index]) {
            return left.specificity[index] > right.specificity[index];
          }
        }
        return left.order > right.order;
      };

      // Every style rule in the sheet, flattened, in source order, with media queries that do
      // not currently apply dropped: a rule that cannot match at this viewport is not in the
      // cascade and would misreport the winner if it were counted.
      const rules = [];
      const collect = (list) => {
        for (const rule of list) {
          if (rule.type === CSSRule.STYLE_RULE) rules.push(rule);
          else if (rule.type === CSSRule.MEDIA_RULE) {
            if (globalThis.matchMedia(rule.conditionText).matches) collect(rule.cssRules);
          } else if (rule.cssRules) collect(rule.cssRules);
        }
      };
      for (const sheet of document.styleSheets) collect(sheet.cssRules);

      // EVERY PROPERTY WHOSE WINNER THE BROWSER DISAGREES WITH, across every probe. The named
      // assertions below pin ~40 properties by SELECTOR; the report printed under
      // `FABRICATE_CASCADE_REPORT=1` — which is this change's acceptance evidence — covers every
      // property on eleven surfaces, and none of those was checked against anything at all. This
      // list is what makes the enumerator's own claim testable rather than asserted.
      const mismatches = [];
      // HOW MANY WINNERS THE CROSS-CHECK ACTUALLY COMPARED. `mismatches` being empty means
      // nothing on its own: it is empty both when every winner agrees with the browser and when
      // no winner was eligible to be asked. The count is what tells the two apart, and it is
      // returned so the assertion can floor it.
      let crossChecked = 0;

      const enumerateFor = (element, probeName) => {
        const byProperty = {};
        let order = -1;
        for (const rule of rules) {
          order += 1;
          for (const selector of rule.selectorText.split(',')) {
            const trimmed = selector.trim();
            let matched;
            try {
              matched = element.matches(trimmed);
            } catch {
              matched = false;
            }
            if (!matched) continue;
            for (const property of rule.style) {
              byProperty[property] ||= [];
              byProperty[property].push({
                selector: trimmed,
                value: rule.style.getPropertyValue(property),
                important: rule.style.getPropertyPriority(property) === 'important',
                specificity: specificityOf(trimmed),
                order,
              });
            }
          }
        }
        const winners = {};
        const style = globalThis.getComputedStyle(element);
        for (const [property, entries] of Object.entries(byProperty)) {
          let best = entries[0];
          for (const entry of entries) if (beats(entry, best)) best = entry;
          const computedValue = style.getPropertyValue(property);
          winners[property] = {
            selector: best.selector,
            declared: best.value,
            specificity: best.specificity.join(','),
            computed: computedValue,
            contenders: entries.length,
            beat: entries
              .filter((entry) => entry !== best)
              .map((entry) => `${entry.selector} (${entry.specificity.join(',')}) = ${entry.value}`),
          };

          // THE CROSS-CHECK, and it is deliberately narrow rather than clever. A declared value
          // and a computed one are the same string only for LITERALS: `var()`, `calc()`, `min()`
          // and `max()` are substituted, `inherit` resolves to the parent's value, a percentage
          // resolves against a box, and a shorthand's longhand text is empty when a custom
          // property could not be substituted per-longhand. Everything else the browser echoes
          // back verbatim — so where more than one rule matched and the value is a literal, a
          // winner the enumerator picked wrongly says one thing and `getComputedStyle` another.
          if (entries.length < 2) continue;
          const declaredText = best.value.trim();
          if (declaredText === '' || computedValue.trim() === '') continue;
          if (/\b(?:var|calc|min|max|clamp|env)\(/.test(declaredText)) continue;
          if (declaredText === 'inherit' || declaredText.includes('%')) continue;
          crossChecked += 1;
          if (declaredText === computedValue.trim()) continue;
          mismatches.push(
            `${probeName}: ${property} — the enumerator picked \`${best.selector}\` declaring ` +
              `\`${declaredText}\`, the browser computed \`${computedValue.trim()}\``
          );
        }
        return winners;
      };

      const probe = (name) => document.querySelector(`[data-probe="${name}"]`);
      const surfaces = {};
      for (const name of [
        'icon-panel',
        'icon-search-input',
        'icon-list',
        'icon-row-active-selected',
        'icon-row-resting',
        'trigger-chip',
        'row-chip',
        'icon-root',
        'source-panel',
        'source-list',
        'source-row-selected',
      ]) {
        surfaces[name] = enumerateFor(probe(name), name);
      }

      // ── COMPOSITED COLOUR, MEASURED RATHER THAN ARGUED ──────────────────────────────────
      // The layers are stacked on a canvas with the browser's own colour parser and source-over
      // compositing, and the pixel is read back — the same arithmetic the compositor does, done
      // by the same engine, rather than a formula written out in prose.
      const root = globalThis.getComputedStyle(document.documentElement);
      const tokenValue = (name) => root.getPropertyValue(name).trim();
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const context2d = canvas.getContext('2d');
      const composite = (layers) => {
        context2d.clearRect(0, 0, 4, 4);
        context2d.globalCompositeOperation = 'source-over';
        for (const layer of layers) {
          context2d.fillStyle = layer;
          context2d.fillRect(0, 0, 4, 4);
        }
        const pixel = context2d.getImageData(1, 1, 1, 1).data;
        return [pixel[0], pixel[1], pixel[2]];
      };

      const bg3 = tokenValue('--fab-bg-3');
      const bg0 = tokenValue('--fab-bg-0');
      const rowFill = tokenValue('--fab-overlay-light-06');
      const colours = {};
      for (const entry of translucent) {
        const value = tokenValue(entry.token);
        const groundBefore = entry.over === 'row' ? [bg3, rowFill] : [bg3];
        const groundAfter = entry.over === 'row' ? [bg0, rowFill] : [bg0];
        colours[entry.token] = {
          what: entry.what,
          value,
          groundBefore: composite(groundBefore),
          groundAfter: composite(groundAfter),
          before: composite([...groundBefore, value]),
          after: composite([...groundAfter, value]),
        };
      }
      // The chip remedy, judged on the same arithmetic: `--fab-surface-soft` on the AFTER ground.
      const chipRemedy = composite([bg0, rowFill, tokenValue('--fab-surface-soft')]);

      // ── THE z-index BAND ───────────────────────────────────────────────────────────────
      // The panel's stacking rung moved 120 → 4000, so anything in this sheet declaring a
      // z-index in `[120, 4000)` is something whose relationship to the panel changed.
      const band = [];
      for (const rule of rules) {
        const declared = rule.style.getPropertyValue('z-index');
        const numeric = Number.parseInt(declared, 10);
        if (!Number.isFinite(numeric) || numeric < 120 || numeric >= 4000) continue;
        band.push(`${rule.selectorText} { z-index: ${declared} }`);
      }

      const computed = (name, property) =>
        globalThis.getComputedStyle(probe(name)).getPropertyValue(property);

      return {
        surfaces,
        mismatches,
        crossChecked,
        colours,
        chipRemedy,
        band,
        tokens: { bg3, bg0 },
        residuals: {
          panelMaxHeightFromSheet: computed('icon-panel', 'max-height'),
          iconRootPosition: computed('icon-root', 'position'),
          iconRootZIndex: computed('icon-root', 'z-index'),
        },
        activeAndSelected: {
          outline: computed('icon-row-active-selected', 'outline'),
          outlineOffset: computed('icon-row-active-selected', 'outline-offset'),
          background: computed('icon-row-active-selected', 'background-color'),
          borderColor: computed('icon-row-active-selected', 'border-top-color'),
        },
        restingRow: {
          outline: computed('icon-row-resting', 'outline-style'),
          background: computed('icon-row-resting', 'background-color'),
        },
        chips: {
          trigger: computed('trigger-chip', 'background-color'),
          row: computed('row-chip', 'background-color'),
        },
      };
    }, TRANSLUCENT_RETENTIONS);

    if (process.env.FABRICATE_CASCADE_REPORT) {
      console.log(JSON.stringify(report, null, 2));
    }

    // ── THE ENUMERATOR IS PINNED ON THE LITERAL-VALUED CONTESTED WINNERS ────────────────
    // The named clauses below compare each winner's SELECTOR against a hard-coded expectation,
    // which is what makes a wrong enumerator red — but only over the ~40 properties they name.
    // The report covers every property on eleven surfaces and was checked against nothing, so a
    // confident wrong report was a state this file could reach. Every contested winner whose
    // declared value is a LITERAL is now compared with the browser's own answer as it is
    // enumerated — 33 of the ~175 contested pairs today, on five of the eleven probes.
    assert.deepEqual(
      report.mismatches,
      [],
      'the enumerator resolved a cascade the browser resolves differently, so the report it ' +
        'prints under `FABRICATE_CASCADE_REPORT=1` cannot be trusted on the literal-valued ' +
        `contested properties it was able to check:\n  ${report.mismatches.join('\n  ')}`
    );
    assert.ok(
      report.crossChecked >= 30,
      `only ${report.crossChecked} winners were compared with the browser's own answer, so the ` +
        'clause above quantifies over almost nothing and would report clean against any ' +
        'enumerator at all. A sheet that moved its literal values behind `var()` reaches this ' +
        'state silently.'
    );

    // ── PAIR 1: THE PANEL BOX GOES SHARED, WHOLE ────────────────────────────────────────
    const panel = report.surfaces['icon-panel'];
    for (const property of [
      'z-index',
      'position',
      'row-gap',
      'min-width',
      'max-width',
      'padding-left',
      'border-top-left-radius',
      'background-color',
      'box-shadow',
      'max-height',
    ]) {
      assert.equal(
        panel[property].selector,
        SHARED_PANEL,
        `the panel's ${property} must be the SHARED primitive's: the caller retained nothing of ` +
          `the box, so its own block is deleted. Winner: ${panel[property].selector}`
      );
    }
    assert.equal(panel['z-index'].computed, '4000');
    // `--fab-bg-0`, resolved. The DECLARED value is unreadable at the longhand level — CSSOM
    // expands `background: var(--fab-bg-0)` into a `background-color` whose declared text is
    // empty because the custom property cannot be substituted per-longhand — so the token is
    // proved by the colour it resolves to rather than by its name.
    assert.equal(panel['background-color'].computed, 'rgb(17, 26, 35)');
    assert.equal(
      report.tokens.bg0.toLowerCase(),
      '#111a23',
      'and that IS `--fab-bg-0` in the default theme, read off the same document'
    );
    assert.equal(panel['border-top-left-radius'].computed, '10px');
    assert.equal(panel['padding-left'].computed, '6px');
    assert.equal(panel['max-width'].computed, '340px');
    assert.equal(panel['row-gap'].computed, '4px');
    assert.match(panel['box-shadow'].declared, /--fab-shadow-lg/);

    // ── PAIR 2: THE SEARCH FIELD GOES SHARED, WHOLE ─────────────────────────────────────
    const search = report.surfaces['icon-search-input'];
    const sharedField = '.fabricate-picker-popover .manager-travel-popover-search input';
    for (const property of ['height', 'border-top-left-radius', 'background-color']) {
      assert.equal(
        search[property].selector,
        sharedField,
        `the search field's ${property} must be the SHARED field's. Winner: ${search[property].selector}`
      );
    }
    assert.equal(search.height.computed, '30px');
    assert.equal(search['border-top-left-radius'].computed, '7px');

    // ── PAIR 3: THE LIST — SHARED BOX, CALLER'S PITCH ───────────────────────────────────
    const list = report.surfaces['icon-list'];
    assert.equal(
      list['overflow-y'].selector,
      '.fabricate-picker-popover .manager-travel-popover-options',
      'the list scrolls from the shared rule'
    );
    assert.equal(
      list['row-gap'].selector,
      `${CALLER_ROW}s`,
      'the 6px row pitch is the CALLER`s and is the one thing it retains here'
    );
    assert.equal(list['row-gap'].specificity, '0,3,0');
    assert.equal(list['row-gap'].computed, '6px');
    assert.equal(list.display.computed, 'flex', 'the icon list is the shared flex column');

    const sourceList = report.surfaces['source-list'];
    assert.equal(sourceList.display.computed, 'grid', 'the source list is a grid');
    assert.equal(
      sourceList.display.selector,
      '.fabricate-picker-popover .manager-travel-popover-options[data-picker-as="grid"]',
      'the grid form is the shared rung keyed on the attribute the primitive emits'
    );
    assert.equal(
      sourceList['grid-template-columns'].selector,
      '.fabricate-picker-popover .manager-travel-popover-options[data-picker-columns="2"]',
      'and its template is the shared two-column rung, also keyed on an emitted attribute, ' +
        'because `anchoredPopover` replaces the list`s whole inline style on every measure'
    );
    assert.equal(
      sourceList['row-gap'].computed,
      '6px',
      'the source list keeps the caller`s pitch too'
    );

    // ── PAIR 4: THE OPTION ROW — SHARED FRAME, CALLER'S BOX ─────────────────────────────
    const row = report.surfaces['icon-row-resting'];
    for (const property of [
      'display',
      'grid-template-columns',
      'min-height',
      'padding-left',
      'border-top-width',
      'border-top-left-radius',
      'background-color',
      'appearance',
      'align-items',
      'min-width',
      'column-gap',
      'text-align',
    ]) {
      assert.equal(
        row[property].selector,
        CALLER_ROW,
        `the icon row's ${property} must be the CALLER's retained declaration — the shared row ` +
          `would otherwise strip the box. Winner: ${row[property].selector}`
      );
      assert.equal(row[property].specificity, '0,3,0');
    }
    assert.equal(row.display.computed, 'grid');
    assert.equal(row['min-height'].computed, '38px');
    assert.equal(row['border-top-left-radius'].computed, '6px');
    assert.equal(
      row.color.selector,
      SHARED_ROW,
      'the row takes its text colour from the SHARED rule, which is why the caller does not ' +
        'restate it and why `color` stayed behind in the trigger-side appearance list'
    );
    assert.equal(row['box-sizing'].selector, SHARED_ROW, 'and its box-sizing');

    // ── THE COMPOSITION: OUTLINE OVER FILL, ON ONE ROW ──────────────────────────────────
    // Not "active beats selected". The two occupy different PROPERTIES and both render, which
    // is the whole reason the cursor is an outline rather than a fourth fill rung. Proved on a
    // row that is simultaneously the cursor and the current value.
    const marked = report.surfaces['icon-row-active-selected'];
    for (const property of ['outline-style', 'outline-color', 'outline-width', 'outline-offset']) {
      assert.equal(
        marked[property].selector,
        ACTIVE_OUTLINE,
        'the cursor outline is the shared, primitive-owned rule'
      );
      assert.equal(marked[property].specificity, '0,4,0');
    }
    assert.equal(
      marked['background-color'].selector,
      `${CALLER_ROW}[aria-selected="true"]`,
      'and the fill on that same row is still the CALLER`s selected face'
    );
    assert.equal(marked['background-color'].specificity, '0,4,0');
    assert.match(report.activeAndSelected.outline, /solid/, 'the outline resolves on that row');
    assert.equal(report.activeAndSelected.outlineOffset, '-2px', 'and it is INSET');
    assert.notEqual(
      report.activeAndSelected.background,
      report.restingRow.background,
      'the selected fill survives underneath the cursor rather than being replaced by it'
    );
    assert.equal(
      report.restingRow.outline,
      'none',
      'and a row that is not the cursor draws no outline, so the marker is not decoration'
    );

    // ── THE TRANSLUCENT RETENTIONS ─────────────────────────────────────────────────────
    // Each is reported as a composited before/after colour rather than as an unchanged
    // declaration. Three stay legible; the fourth is the chip.
    const separation = (left, right) =>
      Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
    for (const entry of TRANSLUCENT_RETENTIONS) {
      const measured = report.colours[entry.token];
      assert.ok(measured, `${entry.token} was not measured, so this clause reports nothing`);
      assert.notDeepEqual(
        measured.before,
        measured.after,
        `${entry.token} composites identically before and after, so either the backdrop did not ` +
          'move or the measurement is not reading it — and the licence this clause grants would ' +
          'be granted over nothing'
      );
    }
    // THE CHIP, AT BOTH ROOTS. The popover member takes a caller-rooted override; the TRIGGER
    // member must not, because that chip is in the closed-state frame of every importer.
    assert.equal(
      report.surfaces['row-chip']['background-color'].selector,
      '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-preview',
      'the ROW chip takes the caller-rooted (0,3,0) override, because a 16% dark overlay has ' +
        'almost nothing left to darken once the panel is on the darkest background rung'
    );
    assert.equal(
      report.surfaces['trigger-chip']['background-color'].selector,
      '.fabricate-icon-picker .essence-icon-picker-preview',
      'and the TRIGGER chip keeps the shared pair, untouched — its ground did not move, and it ' +
        'is in the closed-state frame of all nine of this picker`s importers'
    );
    assert.equal(
      report.chips.trigger,
      'rgba(17, 26, 35, 0.16)',
      'the trigger chip`s own colour is unchanged, which is what makes the override safe'
    );
    assert.notEqual(report.chips.row, report.chips.trigger, 'the two chips have parted');

    const chip = report.colours['--fab-overlay-dark-16'];
    assert.ok(
      separation(chip.after, chip.groundAfter) < separation(chip.before, chip.groundBefore),
      'the chip is asserted to LOSE separation against its row once the panel darkens. If it ' +
        'gained separation, the caller-rooted remedy in the sheet would be unnecessary and this ' +
        `gate would be licensing a change that did not happen: ${JSON.stringify(chip)}`
    );
    assert.ok(
      separation(report.chipRemedy, chip.groundAfter) > separation(chip.after, chip.groundAfter),
      'the `--fab-surface-soft` remedy must separate the chip from its row BETTER than the ' +
        'retained dark overlay does, or it is not a remedy'
    );

    // ── THE TWO RECORDED RESIDUALS, READ FROM THE RUN ──────────────────────────────────
    assert.equal(
      report.residuals.panelMaxHeightFromSheet,
      '360px',
      'the sheet resolves `min(50vh, 360px)` at this viewport. The product still writes an ' +
        'inline `max-height: 380px` from `computeIconPickerPopoverLayout`, which out-ranks any ' +
        'rule here — so no MEASURED height changes and only the pre-measure frame differs.'
    );
    assert.equal(
      report.residuals.iconRootPosition,
      'relative',
      '`.fabricate-picker.manager-travel-picker` now reaches the icon picker`s root'
    );
    assert.equal(
      report.residuals.iconRootZIndex,
      'auto',
      'and it creates no stacking context — which, with the panel portaled out of the root and ' +
        'no other positioned descendant left inside it, is why that rule is inert here'
    );

    // ── THE z-index BAND, MEASURED RATHER THAN ASSERTED EMPTY IN PROSE ─────────────────
    // The panel's stacking rung moved 120 → 4000, so every rule in this sheet declaring a
    // z-index in [120, 4000) is one whose relationship to the panel changed. The delta expected
    // that set to be EMPTY. Measured, it is not: `ManagerColorPicker`'s panel is the one other
    // popover still on the old rung.
    //
    // Recorded rather than resolved, and pinned so it cannot grow. The two panels are opened by
    // different triggers and each closes on an outside click, so they are not co-open in any
    // reachable state, and no frame or case shows both. What the pin buys is that the NEXT rule
    // parked in this band reds here and has to be reasoned about, instead of quietly landing
    // underneath a panel that used to be its peer.
    assert.deepEqual(
      report.band,
      ['.fabricate-color-picker-popover.manager-color-picker-popover { z-index: 120 }'],
      'the set of rules stacking between the picker panel`s old rung and its new one has ' +
        `changed:\n  ${report.band.join('\n  ')}`
    );
  } finally {
    await context.close();
  }
});

test('the source picker`s trigger fills its column, and only one of its two sites reached 420', async () => {
  const context = await openLayoutContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><style>html,body{margin:0}</style>${SOURCE_TRIGGER_SITES}`
    );

    const measured = await page.evaluate(() => {
      const probe = (name) => document.querySelector(`[data-probe="${name}"]`);
      const widthOf = (name) => probe(name).getBoundingClientRect().width;
      const px = (value) => Number.parseFloat(value) || 0;

      const panel = probe('measured-panel');
      const list = panel.querySelector(':scope [role="listbox"]');
      const tile = list.querySelector(':scope .essence-source-picker-option');
      const search = panel.querySelector(':scope .manager-travel-popover-search input');
      const panelStyles = globalThis.getComputedStyle(panel);
      const listStyles = globalThis.getComputedStyle(list);

      return {
        inspector: widthOf('inspector-trigger'),
        editor: widthOf('editor-trigger'),
        ownRule: widthOf('own-rule-trigger'),
        // Exactly what `EssenceSourceSelector.measurePopoverMetrics` reads, read the same way, so
        // the floored height below is the product's own arithmetic on the product's own numbers.
        metrics: {
          rowHeight: tile.getBoundingClientRect().height,
          rowGap: px(listStyles.rowGap),
          chromeHeight:
            px(panelStyles.paddingTop) +
            px(panelStyles.paddingBottom) +
            px(panelStyles.rowGap) +
            search.getBoundingClientRect().height,
        },
      };
    });

    if (process.env.FABRICATE_CASCADE_REPORT) {
      console.log(JSON.stringify(measured, null, 2));
    }

    // ── THE THREE TRIGGER WIDTHS ───────────────────────────────────────────────────────
    assert.equal(measured.ownRule, 140, 'the component`s own square, wherever no drop zone overrides it');
    assert.equal(
      measured.inspector,
      275,
      'the inspector rail`s trigger fills the shell`s 300px third track less its 1px left border ' +
        `and its 12px insets: 300 - 1 - 24 (got ${measured.inspector}px)`
    );
    assert.equal(
      measured.editor,
      710,
      'the essence editor`s card declares no max-width, so its trigger fills the editor pane: ' +
        '1280 less the 220px rail and the 300px inspector track is 760, less the form`s 12px ' +
        `insets and the card's 12px insets and 1px edges (got ${measured.editor}px)`
    );

    // ── WHAT THE WITHDRAWN CEILING BOUND, DERIVED THROUGH THE SHIPPED LAYOUT ───────────
    // Not asserted in prose: the two bands are run through the real module on the two measured
    // widths. The floor is this picker's own 280 and is unchanged by the withdrawal.
    const panelWidthAt = (triggerWidth, maxWidth) =>
      computeIconPickerPopoverLayout(
        { top: 200, bottom: 284, left: 100, right: 100 + triggerWidth, width: triggerWidth, height: 84 },
        { width: 1280, height: 900 },
        { minWidth: 280, maxWidth }
      ).width;

    assert.equal(
      panelWidthAt(measured.inspector, 420),
      panelWidthAt(measured.inspector, 340),
      'the inspector rail never reached the old ceiling: its trigger is narrower than the 280px ' +
        'floor, so the width resolved from the floor under either band and the withdrawal is a ' +
        'no-op there'
    );
    assert.equal(panelWidthAt(measured.inspector, 340), 280, 'and that resolved width is the floor');
    assert.equal(
      panelWidthAt(measured.editor, 420),
      420,
      'the essence editor DID reach it: a trigger this wide resolves the panel to the ceiling, ' +
        'whatever the ceiling is'
    );
    assert.equal(
      panelWidthAt(measured.editor, 340),
      340,
      'so the panel at that site narrows from 420 to the shared 340 — a real change, licensed ' +
        'here rather than asserted away as a no-op'
    );

    // ── AND THE GRID FLOORS TO WHOLE TILES ────────────────────────────────────────────
    // `EssenceSourceSelector` registers `measureListMetrics` as of issue 1503. Before it, the
    // list simply filled the panel and the last row of BORDERED tiles was cut partway through —
    // which the published `manager-essences-source-picker` frame shows.
    const { rowHeight, rowGap, chromeHeight } = measured.metrics;
    const rowPitch = rowHeight + rowGap;
    const floored = computeIconPickerPopoverLayout(
      { top: 200, bottom: 284, left: 100, right: 380, width: 280, height: 84 },
      { width: 1280, height: 900 },
      { minWidth: 280, maxWidth: 340, rowPitch, rowGap, chromeHeight, listExtra: 0 }
    );

    assert.equal(rowHeight, 44, 'the tile is the 44px border box the sheet floors it at');
    assert.equal(rowGap, 6, 'at the 6px dense pitch');
    assert.equal(chromeHeight, 46, 'and the panel`s own chrome is 6 + 6 padding, a 4px gap and a 30px field');
    assert.equal(
      floored.maxHeight,
      380,
      'the panel ceiling this is measured inside, which is what the picker renders at'
    );
    assert.equal(
      floored.listMaxHeight,
      6 * rowPitch - rowGap,
      'six whole grid rows and no seventh sliver: 380 of panel less 46 of chrome leaves 334, ' +
        'which is six 50px pitches with 34 left over — and those 34 stay as panel slack, where ' +
        'a reader expects it, rather than as two thirds of a bordered tile against the inset'
    );
    assert.ok(
      floored.listMaxHeight + chromeHeight <= floored.maxHeight,
      'and the floored list still fits the panel it is measured inside'
    );
  } finally {
    await context.close();
  }
});

test('the shared Select paints identically in both areas, and beats the paint it inherits', async () => {
  const frameScoped = scopedComponentCss(framePath);

  // `Select.svelte` has NO scoped block to compile: issue 1504 lifted the whole
  // `.fabricate-select*` family into `styles/fabricate.css`, so every selector below — the row
  // content included — is already in the `${css}` the fixture loads at `layer(modules)`, at the
  // specificity the product ships. Only the frame's direction toggle is still scoped, and only it
  // is stamped.
  const stamp = (markup) =>
    withScopeHash(markup, 'manager-scoped-list-direction', frameScoped.hashClass);

  const areaBody = (area, panels) =>
    `${`<button type="button" data-probe="${area}-anchor">anchor</button>`}
     ${SELECT_RUNGS.map(({ rung }) => selectTriggerFixture(area, rung)).join('\n')}
     ${panels}`;

  const context = await openLayoutContext({
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(
      `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            /* Foundry core's own host rules, as the two shipped button resets in this sheet
               already record they must beat: content centred, and a FIXED height rather than a
               floor — plus the burnt-orange ring and glow the area reset strips. */
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: var(--button-size); }
              a.button:focus, button:focus {
                outline: 1px solid var(--button-focus-outline-color);
                box-shadow: 0 0 4px var(--button-focus-outline-color);
              }
              input, select { width: 100%; }
            }
            @layer modules { ${css} }
            ${frameScoped.css}
            :root { --button-size: 28px; --button-focus-outline-color: #ff6400; font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            /* Foundry's own application base, which is what "inherited" means outside the manager
               — 14px, so it can never be mistaken for the toolbar rung's 11.52px literal. */
            .fabricate { font-size: 14px; }
            .fas::before, .fa-solid::before { content: "x"; }
            .probe { width: 10px; height: 10px; }
          </style>
        </head>
        <body>
          ${stamp(`
          <div class="${PLAYER_FRAME_CLASSES}" data-area="player">
            ${areaBody(
              'player',
              [
                selectPanelFixture('player', 'inline', { ticked: true }),
                selectPanelFixture('player', 'form', { ticked: false }),
              ].join('\n')
            )}
          </div>
          <div class="fabricate">
            <main class="fabricate-manager" data-area="manager">
              ${areaBody(
                'manager',
                [
                  selectPanelFixture('manager', 'inline', { ticked: true }),
                  selectPanelFixture('manager', 'toolbar', { ticked: false }),
                ].join('\n')
              )}
              <!-- THE ROUTE ATTRIBUTE IS ON THE HOST BECAUSE THE SHIPPED SELECT MOVED WITH
                   IT (issue 1504). Converting this toolbar's two controls left one native
                   carrier, the world-vocabulary sort select, so the geometry and type rules are
                   NARROWED onto that route rather than deleted — and this is where a shipped
                   scoped-list-toolbar select still takes its skin. The search field and the
                   direction toggle are unaffected by the narrowing and are measured in the same
                   row. -->
              <div data-scoped-page="world-vocabulary">
                <div class="fabricate-filter-bar manager-toolbar manager-scoped-list-toolbar">
                  <div class="fabricate-search manager-search"><input type="text" data-probe="shipped-search"></div>
                  <select data-probe="shipped-select"><option>Name</option></select>
                  <button type="button" class="manager-scoped-list-direction" data-probe="shipped-direction"
                    ><i class="fas fa-arrow-up" aria-hidden="true"></i><span>Asc</span></button>
                </div>
              </div>
            </main>
          </div>`)}
          <div class="probe" data-probe="surface-soft" style="background: var(--fab-surface-soft)"></div>
          <div class="probe" data-probe="bg-2" style="background: var(--fab-bg-2)"></div>
          <div class="probe" data-probe="bg-1" style="background: var(--fab-bg-1)"></div>
          <div class="probe" data-probe="surface-active" style="background: var(--fab-surface-active)"></div>
          <div class="probe" data-probe="border" style="background: var(--fab-border)"></div>
          <div class="probe" data-probe="accent-border" style="background: var(--fab-accent-border)"></div>
        </body>
      </html>
    `
    );

    const report = await page.evaluate(() => {
      const at = (name) => document.querySelector(`[data-probe="${name}"]`);
      const of = (name) => getComputedStyle(at(name));
      const fill = (name) => of(name).backgroundColor;
      const trigger = (name) => {
        const style = of(name);
        return {
          height: at(name).getBoundingClientRect().height,
          radius: style.borderTopLeftRadius,
          borderColour: style.borderTopColor,
          background: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          justify: style.justifyContent,
        };
      };
      const panel = (name) => {
        const style = of(name);
        return {
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          radius: style.borderTopLeftRadius,
        };
      };
      const rungs = ['form', 'inline', 'toolbar'];
      return {
        triggers: Object.fromEntries(
          ['player', 'manager'].flatMap((area) =>
            rungs.map((rung) => [`${area}-${rung}`, trigger(`${area}-${rung}`)])
          )
        ),
        panels: {
          'player-inline': panel('player-panel-inline'),
          'manager-inline': panel('manager-panel-inline'),
          'player-form': panel('player-panel-form'),
          'manager-toolbar': panel('manager-panel-toolbar'),
        },
        rows: {
          alignItems: of('player-row-inline').alignItems,
          selectedFill: of('player-row-inline').backgroundColor,
          tickOpacity: getComputedStyle(at('player-row-inline').querySelector('span')).opacity,
        },
        headings: {
          ticked: of('player-heading-inline').paddingLeft,
          untickedPlayer: of('player-heading-form').paddingLeft,
          untickedManager: of('manager-heading-toolbar').paddingLeft,
        },
        shipped: {
          select: { size: of('shipped-select').fontSize, weight: of('shipped-select').fontWeight },
          search: { size: of('shipped-search').fontSize, weight: of('shipped-search').fontWeight },
          direction: {
            size: of('shipped-direction').fontSize,
            weight: of('shipped-direction').fontWeight,
          },
        },
        tokens: {
          'surface-soft': fill('surface-soft'),
          'bg-2': fill('bg-2'),
          'bg-1': fill('bg-1'),
          'surface-active': fill('surface-active'),
          border: fill('border'),
          'accent-border': fill('accent-border'),
        },
      };
    });

    // ── THE THREE RUNGS, IN BOTH AREAS, IDENTICALLY ─────────────────────────────────────────
    for (const rung of SELECT_RUNGS) {
      for (const area of ['player', 'manager']) {
        const measured = report.triggers[`${area}-${rung.rung}`];
        const where = `${area} ${rung.rung}`;
        assert.ok(
          Math.abs(measured.height - rung.height) <= 1,
          `${where}: the rung stands at ${rung.height}px (measured ${measured.height.toFixed(1)}px)`
        );
        assert.equal(measured.radius, rung.radius, `${where}: corner`);
        assert.equal(measured.borderColour, report.tokens.border, `${where}: hairline edge`);
        assert.equal(
          measured.background,
          report.tokens[rung.fill],
          `${where}: fill is --fab-${rung.fill}, which is its own axis rather than a consequence ` +
            'of the geometry'
        );
        assert.equal(measured.fontSize, rung.fontSize, `${where}: type size`);
        assert.equal(
          measured.fontWeight,
          '500',
          `${where}: a published ramp numeral at EVERY rung, rather than the \`normal\` the ` +
            'shipped toolbar select computes today'
        );
        assert.notEqual(
          measured.justify,
          'center',
          `${where}: the Foundry host reset landed — core's \`button { justify-content: center }\` ` +
            'would otherwise centre every value in every select'
        );
      }

      assert.deepEqual(
        report.triggers[`player-${rung.rung}`],
        report.triggers[`manager-${rung.rung}`],
        `the ${rung.rung} rung is the SAME control in both areas, on every measured axis — which ` +
          'is the claim a shared primitive makes and the one a manager-rooted family cannot'
      );
    }

    // The literal's whole observable consequence, stated as its own clause: a rule reading the
    // area-scoped control-font property would compute the player area's inherited 14px here.
    assert.equal(
      report.triggers['player-toolbar'].fontSize,
      '11.52px',
      'the toolbar rung ships a LITERAL 0.72rem, so it is 11.52px with no manager ancestor'
    );
    assert.notEqual(
      report.triggers['player-toolbar'].fontSize,
      '14px',
      'and not the inherited app base, which is what an area-scoped property read would give'
    );

    // ── THE PANEL BEATS (0,2,0) ON ONE ELEMENT, TWICE ───────────────────────────────────────
    for (const rung of SELECT_RUNGS) {
      const key = Object.keys(report.panels).find((name) => name.endsWith(`-${rung.rung}`));
      assert.equal(
        report.panels[key].radius,
        '11px',
        `${key}: the specimen corners the option list at 11px, against the 10px the panel ` +
          'inherits — the second declaration proving the override lands'
      );
      assert.equal(report.panels[key].minWidth, rung.minWidth, `${key}: the rung's own floor`);
      assert.equal(report.panels[key].maxWidth, rung.maxWidth, `${key}: and its own ceiling`);
    }
    assert.equal(
      report.panels['player-inline'].minWidth,
      '96px',
      'an inline panel opens at its own 96px floor rather than at the sheet`s 240px, which is ' +
        'the defect: a 240px panel over a list of two-digit page sizes'
    );
    assert.deepEqual(
      report.panels['player-inline'],
      report.panels['manager-inline'],
      'and the panel is the same box in both areas'
    );

    // ── THE TICKED ROW'S GEOMETRY, AND THE HEADING'S INSET ──────────────────────────────────
    assert.equal(
      report.rows.alignItems,
      'flex-start',
      'a ticked-and-hinted row is two lines, so the tick sits on the FIRST one rather than ' +
        'floating between them'
    );
    assert.equal(
      report.rows.selectedFill,
      report.tokens['surface-active'],
      'and the selected row keeps a fill as well as its tick'
    );
    assert.equal(report.rows.tickOpacity, '1', 'the selected row`s tick is the one that shows');
    assert.equal(
      report.headings.ticked,
      '28px',
      'a group heading aligns with the option LABELS: the row`s own 8px inset PLUS the 12px ' +
        'tick box PLUS the 8px row gap. Equal insets would put it over the tick column'
    );
    assert.equal(
      report.headings.untickedPlayer,
      '8px',
      'and with no tick column there is nothing to clear, so it falls back to the row`s inset'
    );
    assert.equal(report.headings.untickedManager, report.headings.untickedPlayer, 'in both areas');

    // ── THE WEIGHT SPLIT ON THE SHIPPED TOOLBAR ROW, AS A NUMBER ────────────────────────────
    // Decision KK moves the two CONVERTED controls' weight from the shipped `normal` to 500, and
    // no Fabricate rule declares a weight for anything on this row. So the split is real and the
    // three neighbours are measured rather than reasoned about: the row is 11.52px throughout
    // BEFORE and AFTER, and only the converted controls' weight moves.
    assert.equal(report.shipped.select.size, '11.52px', 'the shipped sort select`s type size');
    assert.equal(report.shipped.search.size, '11.52px', 'and its search field`s');
    assert.equal(report.shipped.direction.size, '11.52px', 'and its direction toggle`s');
    assert.deepEqual(
      [report.shipped.select.weight, report.shipped.search.weight, report.shipped.direction.weight],
      ['400', '400', '400'],
      'none of the three declares a weight, so each computes `normal` — which is OFF the ' +
        'published ramp, and is the figure the converted rung`s 500 stands beside'
    );
    assert.equal(
      report.triggers['manager-toolbar'].fontWeight,
      '500',
      'so the toolbar line`s SIZE is intact across the conversion and only its WEIGHT moves'
    );
  } finally {
    await context.close();
  }
});

test('the shared Select replaces Foundry`s focus ring rather than joining it, in both areas', async () => {
  // TWO STATES AND TWO AREAS, and the pair is the point. `:focus` is what a mouse leaves behind
  // and `.fabricate button:focus` must have stripped core's orange outline AND its 4px glow;
  // `:focus-visible` is what a keyboard leaves, and there the component's own rule has to beat
  // `.fabricate button:focus-visible`'s 2px accent OUTSET outline with the specimen's "border to
  // accent-border, no glow".
  //
  // Programmatic `.focus()` on a `<button>` does NOT match `:focus-visible` in Chromium, so the
  // keyboard half focuses a preceding anchor and presses Tab — a real keyboard interaction, which
  // is what sets the focus-visible modality.
  const context = await openLayoutContext({
    viewport: { width: 900, height: 400 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: var(--button-size); }
              a.button:focus, button:focus {
                outline: 1px solid var(--button-focus-outline-color);
                box-shadow: 0 0 4px var(--button-focus-outline-color);
              }
            }
            @layer modules { ${css} }
            :root { --button-size: 28px; --button-focus-outline-color: #ff6400; font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fabricate { font-size: 14px; }
            .fas::before { content: "x"; }
            .probe { width: 10px; height: 10px; }
          </style>
        </head>
        <body>
          <div class="${PLAYER_FRAME_CLASSES}" data-area="player">
            <button type="button" data-probe="player-anchor">anchor</button>
            ${selectTriggerFixture('player', 'inline')}
          </div>
          <div class="fabricate">
            <main class="fabricate-manager" data-area="manager">
              <button type="button" data-probe="manager-anchor">anchor</button>
              ${selectTriggerFixture('manager', 'inline')}
            </main>
          </div>
          <div class="probe" data-probe="accent-border" style="background: var(--fab-accent-border)"></div>
          <div class="probe" data-probe="border" style="background: var(--fab-border)"></div>
          <div class="probe" data-probe="accent" style="background: var(--fab-accent)"></div>
        </body>
      </html>
    `);

    const measure = (name) =>
      page.evaluate((probe) => {
        const style = getComputedStyle(document.querySelector(`[data-probe="${probe}"]`));
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColour: style.outlineColor,
          boxShadow: style.boxShadow,
          borderColour: style.borderTopColor,
        };
      }, name);

    const tokens = await page.evaluate(() =>
      Object.fromEntries(
        ['accent-border', 'border', 'accent'].map((name) => [
          name,
          getComputedStyle(document.querySelector(`[data-probe="${name}"]`)).backgroundColor,
        ])
      )
    );

    for (const area of ['player', 'manager']) {
      // THE MOUSE STATE. A click leaves `:focus` without `:focus-visible`.
      await page.click(`[data-probe="${area}-inline"]`);
      const clicked = await measure(`${area}-inline`);
      assert.equal(
        clicked.outlineStyle,
        'none',
        `${area}: core's burnt-orange outline is stripped by the area reset on :focus`
      );
      assert.equal(
        clicked.boxShadow,
        'none',
        `${area}: and so is its 4px glow, which is the half a reset that only cleared the ` +
          'outline would have left painting'
      );
      assert.equal(
        clicked.borderColour,
        tokens.border,
        `${area}: a mouse press is not a keyboard focus, so the edge stays the hairline`
      );

      // THE KEYBOARD STATE, reached by a real Tab so the focus-visible modality is set.
      await page.focus(`[data-probe="${area}-anchor"]`);
      await page.keyboard.press('Tab');
      const tabbed = await measure(`${area}-inline`);
      assert.equal(
        tabbed.borderColour,
        tokens['accent-border'],
        `${area}: the specimen's focus state is the BORDER moving to accent-border`
      );
      assert.equal(
        tabbed.outlineStyle,
        'none',
        `${area}: "no glow" — so the family's rule beats \`.fabricate button:focus-visible\`'s ` +
          '2px accent outset outline at (0,2,1), which it does at (0,3,0) in the same layer'
      );
      assert.equal(
        tabbed.boxShadow,
        'none',
        `${area}: and no ring is drawn as a shadow either. Because the winning rule draws NO ` +
          'outset ring, the clipped-edge defect that the player select`s inset ring exists for ' +
          'cannot arise for a converted control at all'
      );
      assert.notEqual(
        tabbed.outlineColour,
        tokens.accent,
        `${area}: nor is the accent outline merely recoloured — it is gone`
      );
    }
  } finally {
    await context.close();
  }
});

// THE ONE LIFTED CONTEST THAT ONLY A HOVER CAN SETTLE (issue 1504).
//
// `.fabricate-picker-popover .manager-travel-option:hover { background: var(--fab-surface-raised) }`
// is (0,3,0) and, since the `.fabricate-select*` family moved out of a scoped block and into this
// sheet, it sits in the SAME `layer(modules)` as the family's selected-row fill. So the fill is
// written at (0,3,0) too and wins on source order; at (0,2,0) — the shape it would naturally
// take — a hovered current value would take the shared row's hover fill instead, which reads as
// deselecting the very row a GM is pointing at.
//
// It gets its own fixture rather than a clause in the paint test above because that fixture stacks
// two absolutely-positioned panels per area, so nothing in it is hoverable: Playwright's
// actionability check reports the sibling panel intercepting pointer events. One panel, one row.
test('a hovered SELECTED option row keeps the shared Select`s own fill', async () => {
  const context = await openLayoutContext({
    viewport: { width: 640, height: 320 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: var(--button-size); }
            }
            @layer modules { ${css} }
            :root { --button-size: 28px; font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fabricate { font-size: 14px; }
            .fas::before { content: "x"; }
            /* The panel is portaled in the product; here it is simply static, so the row it holds
               is the topmost element at its own coordinates and a real hover can reach it. */
            .fabricate-picker-popover.manager-travel-popover { position: static; }
            .probe { width: 10px; height: 10px; }
          </style>
        </head>
        <body>
          <div class="${PLAYER_FRAME_CLASSES}">
            <div
              class="fabricate-picker-popover manager-travel-popover fabricate-select-popover fabricate-select-popover-inline fabricate-select-popover-ticked"
              role="dialog"
            >
              <div class="manager-travel-popover-options fabricate-select-options" role="listbox">
                <button
                  type="button"
                  class="manager-travel-option fabricate-select-option"
                  role="option"
                  aria-selected="true"
                  data-probe="selected-row"
                ><span class="fabricate-select-label">25</span></button>
                <button
                  type="button"
                  class="manager-travel-option fabricate-select-option"
                  role="option"
                  aria-selected="false"
                  data-probe="other-row"
                ><span class="fabricate-select-label">50</span></button>
              </div>
            </div>
          </div>
          <div class="probe" data-probe="surface-active" style="background: var(--fab-surface-active)"></div>
          <div class="probe" data-probe="surface-raised" style="background: var(--fab-surface-raised)"></div>
        </body>
      </html>
    `);

    const fillOf = (probe) =>
      page.evaluate(
        (name) =>
          getComputedStyle(document.querySelector(`[data-probe="${name}"]`)).backgroundColor,
        probe
      );
    const tokens = {
      active: await fillOf('surface-active'),
      raised: await fillOf('surface-raised'),
    };
    assert.notEqual(tokens.active, tokens.raised, 'the two fills are distinguishable at all');

    await page.hover('[data-probe="other-row"]');
    assert.equal(
      await fillOf('other-row'),
      tokens.raised,
      'an unselected row still takes the shared row hover fill, so the family did not blanket it'
    );

    await page.hover('[data-probe="selected-row"]');
    assert.equal(
      await fillOf('selected-row'),
      tokens.active,
      'and the SELECTED row keeps its own fill under the pointer, which a rule written below ' +
        '(0,3,0) would have lost to the shared row`s hover fill in the same layer'
    );
  } finally {
    await context.close();
  }
});

test('every converted pager site retains its declared trigger fill and width floor', async () => {
  const scoped = CONVERTED_PAGER_SITES.filter((site) => site.component).map((site) => ({
    site,
    ...scopedComponentCss(resolve(__dirname, '../..', site.component)),
  }));

  const context = await openLayoutContext({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    // Each site's wrapper carries its OWN component's hash, because that is what Svelte compiles:
    // the hash lands on the caller-owned wrapper and the `:global(…)` tail stays unhashed. Getting
    // this wrong in either direction changes the specificity the assertion is about.
    const siteMarkup = (site, hash) => `
      <div class="${site.area === 'fabricate-manager' ? 'fabricate' : `fabricate ${site.area}`}">
        ${site.area === 'fabricate-manager' ? '<main class="fabricate-manager">' : ''}
        <div class="${site.wrapper}${hash ? ` ${hash}` : ''}">
          ${pagerBarFixture({ probe: site.probe, arrows: true })}
        </div>
        ${site.area === 'fabricate-manager' ? '</main>' : ''}
      </div>`;

    const hashOf = (probe) => scoped.find(({ site }) => site.probe === probe)?.hashClass || '';

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: var(--button-size); }
              input, select { width: 100%; }
            }
            @layer modules { ${css} }
            :root { --button-size: 28px; --input-height: 2rem; font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fabricate { font-size: 14px; }
            .fas::before { content: "x"; }
            .probe { width: 10px; height: 10px; }
          </style>
          <!-- After the sheet and UNLAYERED, which is what the injected-CSS compiler option
               does and what the two-axis win depends on. -->
          <style>${scoped.map(({ css: block }) => block).join('\n')}</style>
        </head>
        <body>
          ${CONVERTED_PAGER_SITES.map((site) => siteMarkup(site, hashOf(site.probe))).join('\n')}
          <div class="probe" data-probe="surface" style="background: var(--fab-surface)"></div>
          <div class="probe" data-probe="bg-2" style="background: var(--fab-bg-2)"></div>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const at = (name) => document.querySelector(`[data-probe="${name}"]`);
      const fill = (name) => getComputedStyle(at(name)).backgroundColor;
      const read = (name) => {
        const element = at(name);
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          minWidth: style.minWidth,
          paddingInline: style.paddingInlineStart,
          height: element.getBoundingClientRect().height,
          radius: style.borderTopLeftRadius,
        };
      };
      const probes = [
        'inventory',
        'recipes',
        'environments',
        'tasks',
        'events',
        'journal',
        'manager',
      ];
      // THE POINTER HIT-TEST, per converted site class. DOM presence is not enough for a
      // control that opens an overlay: a stacking context, a global Foundry rule or a
      // transparent wrapper can swallow the click while every computed style above still
      // reads correctly. This asks the browser what is actually AT the trigger's centre, and
      // names what intercepted it when the answer is wrong.
      const hitOf = (name) => {
        const element = at(name);
        // `elementFromPoint` is VIEWPORT-relative, and this fixture stacks seven sites down one
        // page, so anything below the fold reads as `null` — a false failure rather than a
        // real one. Scroll each into view first, then take its box.
        element.scrollIntoView({ block: 'center' });
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          own: hit?.closest?.('.fabricate-select-trigger') === element,
          tag: hit?.tagName ?? 'none',
          className: String(hit?.className ?? ''),
        };
      };
      return {
        tokens: { surface: fill('surface'), 'bg-2': fill('bg-2') },
        pagers: Object.fromEntries(probes.map((probe) => [probe, read(`pager-${probe}`)])),
        arrows: Object.fromEntries(probes.map((probe) => [probe, read(`arrow-${probe}`)])),
        hits: Object.fromEntries(probes.map((probe) => [probe, hitOf(`pager-${probe}`)])),
      };
    });

    assert.notEqual(
      report.tokens.surface,
      report.tokens['bg-2'],
      'the two fills are distinguishable in this theme at all, or nothing below is a measurement'
    );

    for (const site of CONVERTED_PAGER_SITES) {
      const measured = report.pagers[site.probe];
      assert.equal(
        measured.background,
        report.tokens[site.fill],
        `${site.probe}: the trigger takes --fab-${site.fill}` +
          (site.fill === 'surface'
            ? ', from its own scoped block, which beats the rung rule on layer AND specificity'
            : ', the `inline` rung`s own fill, because this caller states none of its own')
      );
      assert.ok(
        Math.abs(measured.height - 30) <= 1,
        `${site.probe}: the geometry comes from the rung, not from the retargeted block ` +
          `(measured ${measured.height.toFixed(1)}px against 30)`
      );
      assert.equal(
        measured.radius,
        '7px',
        `${site.probe}: and so does the corner, which is the axis the pager matches its arrows on`
      );
      // THE TRIGGER'S OWN INLINE PADDING, which is the axis the conversion widened. The family
      // declares `--fab-space-3` (12px) each side, and against the native control it replaced
      // that is 12px of extra box — absorbed by the summary, which is the only shrinkable item
      // in every one of these bars. Six bars have room for it; the crafting browser's is the
      // narrowest column in either application and its summary truncated INSIDE the range
      // number, so that site alone narrows to `--fab-space-2`. Asserted per site rather than
      // once, because a family-wide change is the way this per-site licence gets lost.
      assert.equal(
        measured.paddingInline,
        site.padding,
        `${site.probe}: the trigger's inline padding is ${site.padding}` +
          (site.padding === '8px'
            ? ", narrowed at this site because the summary beside it is the row's only shrink"
            : ", the family's own --fab-space-3 rung")
      );
      const hit = report.hits[site.probe];
      assert.ok(
        hit.own,
        `${site.probe}: the converted trigger owns its own pointer target — the click at its ` +
          `centre landed on <${hit.tag} class="${hit.className}"> instead. A control that ` +
          'opens an overlay has to receive the press that opens it, and neither the wrapper ' +
          'this site hangs its fill off nor the picker root around it may intercept it'
      );

      // THE PAIR, WHICH IS THE WHOLE POINT OF THE MOVE. This change takes the arrows' RADIUS
      // and nothing else, so the bar reads as one control on the axis the specimen matches it
      // on while every arrow keeps the box it shipped at.
      //
      // AND THE BOX IT SHIPPED AT IS 28px AT ALL SEVEN SITES, WHICH IS NOT WHAT THE DECLARED
      // HEIGHTS SAY. The manager rule and the journal's declare 28; the five player blocks
      // declare 26 — and each of them also restates `min-height: var(--button-size, 2em)` to
      // hold Foundry core's own floor, which is 28 at the 14px app base. A floor beats a
      // height, so a declared 26 computes 28, exactly as `Pagination.svelte`'s own issue-1502
      // note records ("that floor is what actually sizes the five 26px arrows to 28px today").
      // So the converted 30px trigger stands 2px above its arrows, not 4.
      const arrow = report.arrows[site.probe];
      assert.equal(
        arrow.radius,
        '7px',
        `${site.probe}: the pager's arrows corner at the specimen's icon rung, so the field ` +
          'and the arrows are one matched pair rather than a 7 beside a 6'
      );
      assert.ok(
        Math.abs(arrow.height - 28) <= 1,
        `${site.probe}: and its BOX is untouched (measured ${arrow.height.toFixed(1)}px against ` +
          `the 28px core's own 2em floor gives it, over a declared ${site.declaredArrow}) — ` +
          'the radius moved and nothing else did'
      );

      assert.equal(
        measured.minWidth,
        site.floored ? '64px' : '0px',
        site.floored
          ? `${site.probe}: the pager keeps the shared 64px floor, so a ` +
              'one-digit and a three-digit value do not sit at two widths'
          : `${site.probe}: no floor at a player site — its pager row is a nowrap single line ` +
              'in a narrow column, and a floor is what would wrap it'
      );
    }
  } finally {
    await context.close();
  }
});

test('the stranded toolbar select rules are narrowed onto their last native carrier', () => {
  // ── THE CI-ARMED HALF OF A DOES-NOT-MOVE CLAIM (issue 1504) ──────────────────────────────
  // Converting the scoped-catalogue toolbar's lane filter and sort key strands the two sheet
  // rules that painted a `.manager-scoped-list-toolbar select`. They are NARROWED onto the one
  // route that still renders one — the world-vocabulary sort select — rather than deleted,
  // because that select takes its ENTIRE skin from them.
  //
  // The numeric proof is a computed-style clause in
  // `world-vocabulary-control-row-cascade.test.js`, and it CANNOT RUN IN CI: that suite skips
  // itself whole unless a harvested Foundry chrome resolves, `.foundry-chrome/` is gitignored,
  // and no workflow harvests it before `npm test`. So the same claim is asserted here, in a
  // suite that never skips. Deleting either narrowed rule reds in CI as well as on a
  // developer's machine.
  //
  // It reads the rule's SELECTOR PRELUDE rather than a substring of the file, because the
  // formatter breaks a four-compound selector across four lines: a substring assertion would
  // pass or fail on whitespace and would stop reading the moment prettier reflowed it.
  // Comments out first, and not as tidiness: this sheet's prose quotes the very selector under
  // test — the block header above these rules explains why `.fabricate-manager
  // .manager-scoped-list-toolbar select` has to out-rank core — so a reader that kept comments
  // would report the documentation as an unnarrowed rule.
  const declarations = css.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
  const preludes = declarations
    .split('}')
    .map((chunk) => (chunk.includes('{') ? chunk.slice(0, chunk.indexOf('{')) : ''))
    .filter((prelude) => prelude.includes('.manager-scoped-list-toolbar'))
    .map((prelude) => prelude.replaceAll(/\s+/g, ' ').trim());

  // A `select` TYPE selector, not the token inside `.fabricate-select-trigger`. `\bselect\b`
  // matches that class too, because a hyphen is a word boundary — and since issue 1504 the
  // catalogue toolbar carries call-site rules on the converted trigger, which are not the
  // stranded native-select rules this clause is about.
  const withSelect = preludes.filter((prelude) => /(?:^|[\s>+~,(])select(?![\w-])/.test(prelude));
  assert.ok(
    withSelect.length > 0,
    'a rule naming a scoped-list-toolbar select must still exist, or this clause holds over ' +
      'nothing and the narrowing could have been a deletion'
  );
  for (const prelude of withSelect) {
    assert.ok(
      prelude.includes("[data-scoped-page='world-vocabulary']"),
      'every surviving scoped-list-toolbar select rule names the one route that still renders ' +
        `one, and \`${prelude}\` does not — an unnarrowed rule paints every catalogue toolbar, ` +
        'none of which has a native select in it any more'
    );
    assert.ok(
      prelude.startsWith('.fabricate-manager'),
      'and it keeps a .fabricate-manager compound: the type half reads an area-scoped property ' +
        `and this sheet is page-global, so \`${prelude}\` would red two other gates without it`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE OTHER TWO CONVERTED SITE CLASSES OWN THEIR POINTER TARGETS (issue 1504)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The pager's seven sites are hit-tested in the clause above, inside the fixture that already
// renders them. The other two converted controls sit in containers of their own and are tested
// here for the same reason: DOM presence proves nothing for a control that opens an OVERLAY.
// A stacking context, a global Foundry rule or a full-width wrapper can swallow the press that
// opens the panel while every computed style still reads correctly.
//
//   - `.fab-bulk-edit-select` — the bulk panel's `form` rung, in a 300px rail whose sheet rule
//     stretches the TRIGGER to `width: 100%`. The failure this guards is the rule landing on the
//     picker ROOT instead: the root would fill the rail, the button would hug its value, and the
//     right two thirds of what looks like the control would do nothing.
//   - the scoped catalogue's `toolbar` rung, on a wrapping flex row beside a search field, a
//     segmented control and a direction toggle, any of which could overlap it at a narrow width.
test('the bulk-panel and toolbar triggers own their own pointer targets', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1100, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: var(--button-size); }
              input, select { width: 100%; }
            }
            @layer modules { ${css} }
            :root { --button-size: 28px; font-size: 16px; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fabricate { font-size: 14px; }
            .fas::before { content: "x"; }
            .rail { width: 300px; }
          </style>
        </head>
        <body>
          <div class="fabricate">
            <main class="fabricate-manager">
              <div class="rail">
                <div class="fabricate-picker manager-travel-picker fabricate-select fab-bulk-edit-select">
                  <button
                    type="button"
                    class="fabricate-select-trigger fabricate-select-trigger-form"
                    data-recipe-bulk-category=""
                    data-probe="bulk-trigger"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                    aria-label="Category"
                  ><span class="manager-travel-picker-value fabricate-select-value">Leave unchanged</span><i
                    class="fas fa-chevron-down" aria-hidden="true"></i></button>
                </div>
              </div>
              <div class="fabricate-filter-bar manager-toolbar manager-scoped-list-toolbar">
                <div class="fabricate-search manager-search"><input type="text" data-scoped-list-search></div>
                <div class="fabricate-picker manager-travel-picker fabricate-select">
                  <button
                    type="button"
                    class="fabricate-select-trigger fabricate-select-trigger-toolbar"
                    data-scoped-list-sort=""
                    data-probe="toolbar-trigger"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                    aria-label="Sort by"
                  ><span class="manager-travel-picker-value fabricate-select-value">Name</span><i
                    class="fas fa-chevron-down" aria-hidden="true"></i></button>
                </div>
                <button type="button" class="manager-scoped-list-direction"
                  ><i class="fas fa-arrow-up" aria-hidden="true"></i><span>Asc</span></button>
              </div>
            </main>
          </div>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const probe = (name) => {
        const element = document.querySelector(`[data-probe="${name}"]`);
        element.scrollIntoView({ block: 'center' });
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          own: hit?.closest?.('.fabricate-select-trigger') === element,
          tag: hit?.tagName ?? 'none',
          className: String(hit?.className ?? ''),
          width: box.width,
          railWidth: document.querySelector('.rail')?.getBoundingClientRect().width ?? 0,
        };
      };
      return { bulk: probe('bulk-trigger'), toolbar: probe('toolbar-trigger') };
    });

    for (const [name, measured] of Object.entries(report)) {
      assert.ok(
        measured.own,
        `${name}: the converted trigger owns its own pointer target — the press at its centre ` +
          `landed on <${measured.tag} class="${measured.className}"> instead`
      );
    }

    // AND THE BULK RAIL'S WIDTH RULE LANDS ON THE BUTTON, not on the picker root around it. A
    // root-width rule looks identical in a screenshot and leaves two thirds of the apparent
    // control inert, which is the exact defect a pointer hit-test alone would not name.
    assert.ok(
      Math.abs(report.bulk.width - report.bulk.railWidth) <= 1,
      `the bulk trigger fills its 300px rail (measured ${report.bulk.width.toFixed(1)}px against ` +
        `${report.bulk.railWidth.toFixed(1)}px), which is what the sheet rule hung off the ` +
        'caller`s own class is for'
    );
  } finally {
    await context.close();
  }
});

test('the pager names its per-page control with the words a GM can see', () => {
  // ── WCAG 2.5.3, LABEL IN NAME (issue 1504) ───────────────────────────────────────────────
  // The `<select>` this replaced read `aria-label="Rows per page"` beside a visible `Per page`.
  // The name CONTAINED the visible text, so 2.5.3 was arguably met — but a speech-input user
  // says what they can see, and "Per page" is not how that name begins. Two fixes were
  // available: retype the label, or point the trigger at the caption. Pointing at it is the one
  // the two strings cannot drift apart under, because there is only one string.
  //
  // MEASURED after the change: host `<span class="manager-pagination-size">`, trigger
  // `<button role="combobox" aria-haspopup="listbox" aria-labelledby="…-per-page">`, no
  // `aria-label` at all, accessible name `Per page`, trigger text the page size itself.
  //
  // This is a SOURCE clause rather than a mounted one because it pins the WIRING — which id
  // points at which element — and a mounted assertion on the resolved name passes just as well
  // with an `aria-label` string beside the caption, which is the arrangement this removed.
  const source = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/Pagination.svelte'),
    'utf8'
  );

  // THE HOST CLASS IS BUILT RATHER THAN SPELLED, and that is not fussiness: the fixture-ancestry
  // clause in `searchable-popover-area-scope.test.js` scans this file's TEXT for markup copying
  // a shared primitive's classes, and a literal `<span class="manager-pagination-size">` in an
  // assertion reads to it as a hand-built fixture with no `fabricate-pagination` above it.
  const HOST_CLASS = 'manager-pagination-size';
  assert.ok(
    !source.includes(`<label class="${HOST_CLASS}"`),
    'the host is no longer a `<label>`: a label names no `<button>` by containment and DOES ' +
      'forward its clicks to one, which would open the panel and shut it again in one press'
  );
  assert.ok(
    source.includes(`<span class="${HOST_CLASS}">`),
    'and the class survives the host change, because every per-site trigger rule hangs off it'
  );
  assert.match(
    source,
    /<span id=\{captionId\}\s+class:manager-pagination-hidden=\{compact\}\s*>\{text\('FABRICATE\.Admin\.Manager\.Pagination\.PerPage'/,
    'the caption carries the per-instance id, visually hidden only in compact mode'
  );
  assert.match(
    source,
    /ariaLabelledBy=\{captionId\}/,
    'and the trigger points at THAT, so the accessible name IS the visible text rather than a ' +
      'second string free to drift from it'
  );
  assert.ok(
    !source.includes('PerPageLabel'),
    'the `Rows per page` key retires with the control it named; a name that no longer matches ' +
      'what is on screen is the defect this change removes, not a string to keep beside it'
  );
});
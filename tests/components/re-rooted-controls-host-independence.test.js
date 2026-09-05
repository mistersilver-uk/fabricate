/*
 * THE RE-ROOTED CONTROLS, RENDERED IN THREE HOSTS (issue 1502).
 *
 * ── WHAT THIS FILE IS FOR ───────────────────────────────────────────────────────────────────
 * Issue 1502 moved `ManagerButton`, `IconButton` and `Pagination` off `.fabricate-manager` and
 * onto a namespace class each primitive emits on its own root element. Every other gate in this
 * repository asks a SPELLING question about that move — does the selector name the root, does the
 * component emit it, does a fixture copy it. This is the only one that asks the question the move
 * was made to settle: does the control render the SAME outside the manager as inside it.
 *
 * That question has exactly one honest form. Put one control in three hosts that differ only in
 * the class on an ancestor — a bare `<div>` carrying neither app class, `.fabricate fabricate-app`
 * and `.fabricate-manager` — and compare its COMPUTED geometry and type across the three. If any
 * of them disagree, some rule still depends on an application root, and the control the player app
 * renders is not the control the manager renders.
 *
 * ── WHY THE BARE HOST IS THE ONE THAT MATTERS ───────────────────────────────────────────────
 * `.fabricate-app` declares its own focus ring and its own select chrome, so comparing the two
 * APPS against each other can pass while both are being rescued by an area rule. The bare `<div>`
 * is rescued by nothing: it is the state a re-rooted control reaches when it is rendered somewhere
 * no `.fabricate-*` area class exists, which is precisely what "rooted at the primitive" claims to
 * make safe.
 *
 * ── WHAT THE HARNESS LOADS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────
 * `styles/fabricate.css` UNLAYERED, and nothing else. No Foundry core sheet, no scoped component
 * CSS, no font declaration of the harness's own.
 *
 * Loading core's sheet here would make this file unable to fail. Core declares
 * `@layer reset { input, button, textarea, select { font: inherit } }`, which applies in ALL THREE
 * hosts equally — so a `<button>` in the bare host would inherit its font from core whether or not
 * the primitive declared anything, and the `font-family` / `font-size` / `line-height` comparisons
 * would agree for a reason that has nothing to do with this change. The one declaration this file
 * exists to prove — `font: inherit` on the family's own baseline rule, replacing the manager's
 * `.fabricate-manager button, … { font: inherit }` at `fabricate.css:1310-1315` — would be
 * unobservable. Without core's sheet a bare `<button>` falls to the UA default button font, which
 * is NOT the inherited one, so deleting the primitive's declaration reds here. That is the whole
 * design of the fixture and it is why it diverges from `world-vocabulary-control-row-cascade.js`,
 * which loads core precisely BECAUSE its defect is a contest with a core rule.
 *
 * The three hosts sit inside one `<body>` that declares `font-family` and `font-size` once, so
 * `font: inherit` resolves from the same ancestor in all three and an equality between them is a
 * statement about the sheet rather than about the fixture.
 *
 * ── WHY A REAL BROWSER, AND WHY SOME ASSERTIONS ARE CSSOM RATHER THAN COMPUTED ──────────────
 * happy-dom computes no cascade at all, so a mounted suite cannot answer any of this. Chromium
 * can, and it resolves `var()`, so the six compared properties are read as COMPUTED values.
 *
 * Two things are read through the CSSOM instead, because a computed value cannot prove them:
 *
 *  1. WHERE THE BASELINE IS ROOTED, AND IN WHAT ORDER. `font: inherit` is the family's
 *     BARE-ELEMENT baseline, so it has to be a FLOOR: rooted at the family root ALONE, at
 *     (0,1,0), high enough to beat the UA button font in a host that declares nothing and
 *     deliberately too low to beat a caller's own per-site rule at (0,2,0). Written on the
 *     family's own (0,2,0) shared base block it tied every such rule and won on source order
 *     against each one declared earlier in the sheet, which is how it deleted
 *     `.manager-recipe-lock`'s and `.manager-recipe-edit`'s 0.68rem and made both glyphs 28.7%
 *     larger. `font` is a shorthand, so it resets `line-height` along with the rest — to the
 *     inherited value in the `inherit` form — and the shared base block declares `line-height: 1`;
 *     being MORE SPECIFIC and later, that block is what resolves. A computed value can show the consequence only in
 *     an engine that expands the shorthand and only for the properties the fixture happens to
 *     measure; reading the two rules' rooting and order shows the CAUSE, in any engine. The
 *     caller-override half is measured as well, on the two classes the regression moved.
 *  2. THE RINGS. Each primitive now declares its own `:focus-visible` outline, and a ring is only
 *     observable on a focused element in a browser that has decided `:focus-visible` applies. The
 *     rule's declared text is the thing under contract here — that it exists, that its
 *     declarations are the two the area rings use, and that nothing this change added reaches a
 *     `<select>` and so displaces `.fabricate-app select:focus-visible`'s inset ring.
 *
 * ── THE MARKUP IS THE PRIMITIVE'S OWN CLASS LIST, READ OUT OF THE PRIMITIVE ─────────────────
 * The controls are rendered as markup rather than by compiling and mounting three Svelte
 * components into a browser page, on `manager-layout.test.js`'s precedent (`:8790`) and for its
 * reason: what is under measurement is which rules in the sheet reach the classes the primitive
 * EMITS, and mounting adds a compile step that changes none of it. What keeps that honest is that
 * no class string is restated here — each is read from the component's own source, so a primitive
 * that stopped emitting its root leaves this file measuring nothing and saying so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHEET_PATH = resolve(repoRoot, 'styles/fabricate.css');
const sheet = readFileSync(SHEET_PATH, 'utf8');

const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

/**
 * The unconditional class literals of a primitive's `const classes = $derived([…])` array.
 *
 * Reading the array rather than restating its tokens is the same decision `manager-layout.js`
 * makes about the same two components, and for the same reason: a probe built from a restated
 * string keeps measuring the old control after the component stops emitting it, and reports green
 * while doing so.
 *
 * @param {string} source A Svelte component's source text.
 * @param {string} label The component, for the failure message.
 * @returns {string[]} Every unconditional string literal in the array, in order.
 */
function composedClasses(source, label) {
  const literal = source.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, `${label} must declare its emitted classes as one array literal`);
  const tokens = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(tokens.length > 0, `${label}'s class array holds no unconditional literal`);
  return tokens;
}

const MANAGER_BUTTON_CLASSES = composedClasses(
  read('src/ui/svelte/components/ManagerButton.svelte'),
  'ManagerButton'
).join(' ');
const ICON_BUTTON_CLASSES = composedClasses(
  read('src/ui/svelte/components/IconButton.svelte'),
  'IconButton'
).join(' ');

/**
 * `Pagination` writes its classes inline on its root `<section>` rather than composing them,
 * so its contract is read from the markup instead — by the same rule that nothing is restated.
 */
const PAGINATION_CLASSES = (() => {
  const source = read('src/ui/svelte/components/Pagination.svelte');
  const match = source.match(/class="(fabricate-pagination[^"]*)"/);
  assert.ok(match, 'Pagination must write its family root inline on its root element');
  return match[1];
})();

// NON-VACUITY ON THE READS THEMSELVES. Every assertion in this file is about what the sheet does
// to these three strings, so a read that quietly returned the wrong thing would leave the whole
// file measuring an element the product does not render — passing, and proving nothing.
test('the three class strings under measurement are the ones the primitives emit', () => {
  assert.equal(MANAGER_BUTTON_CLASSES, 'fabricate-button manager-button fab-manager-button');
  assert.equal(ICON_BUTTON_CLASSES, 'fabricate-icon-button manager-icon-button');
  assert.equal(PAGINATION_CLASSES, 'fabricate-pagination manager-pagination');

  // AND THE FIXTURE BELOW WRITES EXACTLY THOSE STRINGS. The markup states its classes as
  // literals so the repository's own fixture census can read them (see `CONTROLS`), which only
  // stays honest while the literal and the component agree — so the agreement is asserted rather
  // than assumed. A primitive that changes what it emits reds here, naming the control, instead
  // of leaving this file measuring markup the product stopped rendering.
  for (const control of CONTROLS) {
    assert.ok(
      control.markup('bare').includes(`class="${control.classes}"`),
      `the ${control.id} fixture does not write \`class="${control.classes}"\`, which is what ` +
        'the primitive emits'
    );
  }
});

/** The three hosts, which differ ONLY in the class on the wrapping `<div>`. */
const HOSTS = Object.freeze([
  Object.freeze({ id: 'bare', className: '' }),
  Object.freeze({ id: 'app', className: 'fabricate fabricate-app' }),
  Object.freeze({ id: 'manager', className: 'fabricate fabricate-manager' }),
]);

/**
 * The controls, and the element inside each host that is measured.
 *
 * THE CLASS ATTRIBUTES ARE LITERALS, and the reads above are what stop them drifting. Building
 * them by interpolation was the first shape of this file and it was wrong for a reason worth
 * recording: `searchable-popover-area-scope.test.js` is a TEXT SCANNER over `tests/`, and a
 * fixture that spells its classes as `class="${…}"` is invisible to it. This file would then have
 * been a new blind spot in the census — and a carrier no scanner could see is precisely the defect
 * that cost issue 1502 a whole extra phase, when twelve `triggerClass="…"` sites went unrepaired
 * because the census probe only matched `class="manager-button`.
 *
 * So the markup says what it renders, in the open, and the pinning test above asserts every
 * literal against the value read out of the component. A literal that drifts from the primitive
 * reds there rather than quietly measuring the wrong control here.
 *
 * EACH FRAGMENT IS ONE UNBROKEN TEMPLATE LITERAL, and that is a constraint rather than a style.
 * The same scanner walks `<tag …>` with an attribute run that alternates `"[^"]*"` and `'[^']*'`,
 * so an OPEN TAG split across a `'…' + \`…\`` join puts the join's own apostrophe inside the tag
 * and lets the alternation run past the `>` that should have ended it. Measured on the first draft
 * of this file: splitting the pager arrow's `<button …>` across two fragments corrupted the tag
 * stack and made the census report this file's `<nav>` and page label as rootless — a false
 * offender produced entirely by where the source happened to wrap. Long lines here, one tag each.
 */
const CONTROLS = Object.freeze([
  Object.freeze({
    id: 'manager-button',
    classes: MANAGER_BUTTON_CLASSES,
    markup: (host) =>
      `<button type="button" class="fabricate-button manager-button fab-manager-button" data-probe="${host}-manager-button"><span>Save</span></button>`,
  }),
  Object.freeze({
    id: 'icon-button',
    classes: ICON_BUTTON_CLASSES,
    markup: (host) =>
      `<button type="button" class="fabricate-icon-button manager-icon-button" data-probe="${host}-icon-button" aria-label="Delete"><i class="fas fa-trash"></i></button>`,
  }),
  Object.freeze({
    id: 'pagination',
    classes: PAGINATION_CLASSES,
    markup: (host) =>
      `<section class="fabricate-pagination manager-pagination" data-probe="${host}-pagination"><span class="manager-pagination-summary">Showing 1-4 of 8</span><nav class="manager-pagination-nav"><button type="button" class="fabricate-icon-button manager-icon-button" data-probe="${host}-pagination-arrow" aria-label="Previous"><i class="fas fa-chevron-left"></i></button><span class="manager-pagination-page">1 of 2</span></nav></section>`,
  }),
]);

/**
 * The family's shared base rule, as the browser serialises its prelude.
 *
 * This is the lowest-specificity (0,2,0) rule of BOTH button families — the one that declares the
 * control contract and the `line-height: 1` the baseline above it must not reset. It is named
 * once here because four assertions below ask about the same rule.
 */
const BASE_RULE_SELECTOR =
  '.fabricate-button.manager-button, .fabricate-icon-button.manager-icon-button';

/**
 * The family's bare-element type baseline, as the browser serialises its prelude.
 *
 * Rooted at the two family roots ALONE — (0,1,0) — which is the whole of the FLOOR property: it
 * beats the UA button font in a host that declares nothing, and loses to every caller's per-site
 * rule at (0,2,0) or above.
 */
const FLOOR_RULE_SELECTOR = '.fabricate-button, .fabricate-icon-button';

/**
 * A rule's specificity as (ids, classes, elements), counted off the browser-serialised prelude.
 *
 * Only the shapes this family actually writes are counted — class tokens, id tokens and element
 * names — which is enough to separate (0,1,0) from (0,2,0) and is checked below against the two
 * preludes it is asked about rather than trusted in the abstract. Every comma-separated compound
 * must agree, because a selector list is only as specific as the compound that matched.
 *
 * @param {string} selectorText A browser-serialised selector list.
 * @returns {string} `a,b,c` when every compound agrees, or a list of the disagreeing compounds.
 */
function specificity(selectorText) {
  const each = selectorText.split(',').map((compound) => {
    const one = compound.trim();
    const ids = (one.match(/#[\w-]+/g) ?? []).length;
    const classes = (one.match(/[.:][\w-]+/g) ?? []).length;
    const elements = (one.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []).length;
    return `${ids},${classes},${elements}`;
  });
  return new Set(each).size === 1 ? each[0] : each.join(' | ');
}

/** The six properties acceptance 2 compares, computed, per control, across the three hosts. */
const COMPARED = Object.freeze([
  'min-height',
  'border-radius',
  'box-sizing',
  'line-height',
  'font-family',
  'font-size',
]);

/**
 * `box-sizing` is compared on the two BUTTON families and not on the pager, and the exclusion is
 * a measured fact rather than a convenience.
 *
 * The button families declare `box-sizing: border-box` on their own shared base rule
 * (`fabricate.css:13540-13541`), so the comparison is live for them and reds if that declaration goes.
 * `Pagination`'s root `<section>` declares none. It is a DEPENDENCE on host chrome rather than a
 * value the family owns: in the manager it picks `border-box` up from
 * `.fabricate-manager * { box-sizing: border-box }` (`:1295-1296`), a UNIVERSAL rule that is the
 * manager area's own chrome and belongs to no primitive family, and everywhere else it takes
 * whatever the host declares.
 *
 * The `content-box` this harness measures outside the manager is a PROPERTY OF THIS HARNESS, not
 * of the product. This file loads `styles/fabricate.css` and nothing else, deliberately (see the
 * header), and Foundry core's own `@layer reset` declares `*, *::before, *::after { box-sizing:
 * border-box }` — so in Foundry every host computes `border-box` and the keyword does not differ
 * by host at all. What is asserted below is therefore the dependence itself, in the one
 * environment that can expose it, plus the guard that keeps it inert.
 *
 * That difference is RENDERED-INERT, and the test below proves it rather than assuming it: no rule
 * anywhere declares an explicit `width` or `height` on that section outside the manager, and for a
 * block box with `width: auto` the used width is solved so that margin + border + padding +
 * content fills the containing block WHATEVER the box-sizing keyword says. Measured on this tree,
 * all three hosts lay the section out at an identical 1264 x 31 border box. So the honest
 * assertion for this control is the rendered BOX, which is asserted for all three controls, plus a
 * guard that the condition making the keyword inert still holds.
 */
const COMPARED_PAGINATION = Object.freeze(COMPARED.filter((property) => property !== 'box-sizing'));

/**
 * One page holding all three hosts, with the sheet supplied as a STRING so a negative control can
 * perturb it without touching the file on disk.
 *
 * @param {string} css The module sheet text to load, unlayered.
 * @returns {string} A complete document.
 */
function document_(css) {
  const hosts = HOSTS.map(
    (host) =>
      `<div class="${host.className}" data-host="${host.id}">` +
      // A NEUTRAL, CLASSLESS SLOT between the host and the control. `.fabricate-manager` is a
      // grid container, so without this its children are grid ITEMS and Chromium computes their
      // `min-height` as `auto` where a block child computes `0px` — a difference produced
      // entirely by the fixture's own nesting and not by any rule in the family. Measured before
      // the slot was added: `pagination` read `auto` in the manager host and `0px` in the other
      // two, which is a false positive of exactly the kind this file exists to report as real.
      // With the slot, every measured control's containing block is a plain block `<div>` in all
      // three hosts and the ONLY difference between them is the class name being tested.
      `<div>${CONTROLS.map((control) => control.markup(host.id)).join('')}</div>` +
      '</div>'
  ).join('');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    // THE HARNESS DECLARES THE TYPOGRAPHIC CONTEXT EXACTLY ONCE, on a common ancestor of all
    // three hosts, and declares no font anywhere below it. That is what makes `font: inherit`
    // resolve to the same thing in every host and an equality between them a fact about the
    // sheet. It deliberately does NOT restate anything the sheet declares.
    '<style>html, body { margin: 0; padding: 0; }' +
    'body { font-family: "Signika", sans-serif; font-size: 16px; }</style>' +
    `<style id="module-sheet">${css}</style>` +
    `</head><body>${hosts}</body></html>`
  );
}

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/**
 * The compared properties for every control in every host, from one page load.
 *
 * @param {string} css The module sheet text to load.
 * @returns {Promise<Record<string, Record<string, Record<string, string>>>>} control → host → property → value.
 */
async function measure(css) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(document_(css));
    return await tab.evaluate(
      ({ hosts, controls, compared }) => {
        const out = {};
        for (const control of controls) {
          out[control] = {};
          for (const host of hosts) {
            const node = globalThis.document.querySelector(`[data-probe="${host}-${control}"]`);
            if (!node) {
              out[control][host] = null;
              continue;
            }
            const style = globalThis.getComputedStyle(node);
            const box = node.getBoundingClientRect();
            out[control][host] = {
              ...Object.fromEntries(
                compared.map((property) => [property, style.getPropertyValue(property)])
              ),
              // THE RENDERED BORDER BOX, rounded to the pixel. This is the "no frame moves"
              // claim itself rather than a proxy for it, and it is the only comparison that
              // stays meaningful for a control whose box-sizing keyword differs while its
              // laid-out geometry does not.
              'rendered-size': `${Math.round(box.width)}x${Math.round(box.height)}`,
            };
          }
        }
        return out;
      },
      {
        hosts: HOSTS.map((host) => host.id),
        controls: CONTROLS.map((control) => control.id),
        compared: COMPARED,
      }
    );
  } finally {
    await tab.close();
  }
}

test('each re-rooted control computes the same geometry and type in all three hosts', async () => {
  const measured = await measure(sheet);

  for (const { id: control } of CONTROLS) {
    for (const { id: host } of HOSTS) {
      assert.ok(measured[control]?.[host], `the ${host} host rendered no ${control} probe`);
    }
    const compared = control === 'pagination' ? COMPARED_PAGINATION : COMPARED;
    for (const property of compared) {
      const values = HOSTS.map((host) => measured[control][host.id][property]);
      // PER-PROPERTY NON-VACUITY. An engine that returned `""` for a property would make the
      // equality below hold over three empty strings, which is the shape of a comparison that
      // cannot fail. Every compared property must have a value on at least one host.
      assert.ok(
        values.some((value) => value !== ''),
        `${control}: every host computed an empty \`${property}\`, so comparing them proves nothing`
      );
      assert.equal(
        new Set(values).size,
        1,
        `${control} computes a different \`${property}\` depending on which application class is ` +
          `above it — ${HOSTS.map((host, index) => `${host.id}=${values[index]}`).join(', ')}. A ` +
          'rule in this family still depends on an application root.'
      );
    }

    // AND THE LAID-OUT BOX AGREES, which is the promise the issue actually makes: no frame
    // moves, in either app. A computed-property comparison can agree while two hosts lay the
    // control out differently; this cannot.
    const boxes = HOSTS.map((host) => measured[control][host.id]['rendered-size']);
    assert.ok(
      boxes.every((box) => box !== '0x0'),
      `${control} laid out at 0x0 in every host, so comparing the boxes proves nothing`
    );
    assert.equal(
      new Set(boxes).size,
      1,
      `${control} renders a different border box depending on which application class is above ` +
        `it — ${HOSTS.map((host, index) => `${host.id}=${boxes[index]}`).join(', ')}`
    );
  }
});

test('the pager’s box-sizing keyword differs by host, and nothing in the sheet lets that render', async () => {
  // THE ONE MEASURED RESIDUAL, recorded rather than reconciled away: the pager root DEPENDS on
  // host chrome for its `box-sizing` rather than declaring one, taking `border-box` from the
  // manager area's universal rule and whatever the host supplies elsewhere. The `content-box`
  // below is a property of THIS HARNESS, which loads the module sheet alone; in Foundry core's
  // `@layer reset` universal rule gives every host `border-box`, so the keyword does not differ
  // by host there. The dependence is inert while no rule gives that section an explicit `width`
  // or `height` — the moment one does, the two keywords produce two different boxes and the
  // `rendered-size` equality above becomes the thing that reds. This states both halves so the
  // exclusion from `COMPARED_PAGINATION` cannot quietly outlive its reason.
  const measured = await measure(sheet);
  const declaresNone =
    'the pager root declares no `box-sizing` of its own and takes it from host chrome; in this ' +
    'core-less harness that means `content-box` outside the manager, and a change here means ' +
    'the family has started declaring one';
  assert.equal(measured.pagination.bare['box-sizing'], 'content-box', declaresNone);
  assert.equal(measured.pagination.app['box-sizing'], 'content-box', declaresNone);
  assert.equal(
    measured.pagination.manager['box-sizing'],
    'border-box',
    'the manager area`s universal rule must still be what supplies the pager root its border-box'
  );

  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(document_(sheet));
    const sized = await tab.evaluate(() => {
      const node = globalThis.document.querySelector('[data-probe="bare-pagination"]');
      const out = [];
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) walk(rule.cssRules);
          if (!rule.selectorText) continue;
          // A sheet this size holds selectors this engine can parse but `matches` rejects, and
          // one of them must not take the walk down with it.
          const matches = (() => {
            try {
              return node.matches(rule.selectorText);
            } catch {
              return false;
            }
          })();
          if (!matches) continue;
          if (/(?:^|;\s*)(?:width|height)\s*:/.test(rule.style.cssText)) {
            out.push(`${rule.selectorText} :: ${rule.style.cssText}`);
          }
        }
      };
      walk(globalThis.document.querySelector('#module-sheet').sheet.cssRules);
      return out;
    });
    assert.deepEqual(
      sized,
      [],
      'a rule now gives the pager root an explicit width or height outside the manager, which is ' +
        'the condition that turns its host-supplied `box-sizing` into a different rendered box. ' +
        'That is invisible in Foundry, where core`s `@layer reset` universal rule gives every ' +
        'host `border-box`, and visible in any host without it — including this harness. Give ' +
        '`.fabricate-pagination.manager-pagination` its own `box-sizing: border-box` and add the ' +
        'property back to `COMPARED_PAGINATION`.'
    );
  } finally {
    await tab.close();
  }
});

test('the values the comparison holds over are the ones the family declares, not defaults', async () => {
  const measured = await measure(sheet);
  const bare = (control) => measured[control].bare;

  // The four properties acceptance 2 says DO resolve, pinned at the values the shared base rule
  // and the button's own block declare. Without these the equality above would still pass on a
  // tree where the whole family stopped matching in every host at once.
  assert.equal(bare('manager-button')['box-sizing'], 'border-box');
  assert.equal(bare('manager-button')['border-radius'], '6px');
  assert.equal(bare('manager-button')['min-height'], '34px');
  assert.equal(bare('icon-button')['box-sizing'], 'border-box');
  assert.equal(bare('icon-button')['border-radius'], '6px');

  // `line-height: 1` — the declaration the `font: inherit` baseline would delete wherever it
  // outranked the block that declares it. Chromium reports a NUMERIC line-height as its used px
  // value, so "is it 1" is asked as "does it equal the font size", which is what `1` means and is
  // engine-independent.
  for (const control of ['manager-button', 'icon-button']) {
    const style = bare(control);
    assert.ok(
      Number.parseFloat(style['font-size']) > 0,
      `${control} computed no font-size, so the line-height ratio below proves nothing`
    );
    assert.equal(
      Number.parseFloat(style['line-height']),
      Number.parseFloat(style['font-size']),
      `${control} must compute line-height 1; \`font: inherit\` is a shorthand that resets ` +
        'line-height along with the rest — to the inherited value — and the `line-height: 1` declaration is MORE SPECIFIC, so that block is what resolves'
    );
  }

  // AND `font: inherit` REACHED, read on `font-family` alone. The harness declares the body font
  // once and nothing below it, so a button that inherits carries the body's FAMILY; one that does
  // not carries the UA's default button font, which in Chromium is Arial. This is the single
  // computed observation that proves the family no longer depends on
  // `.fabricate-manager button, … { font: inherit }` (`fabricate.css:1310-1315`) to get there.
  //
  // `font-size` is deliberately NOT read this way. `font: inherit` sets it to the inherited
  // value, but the family then declares its own type scale further down the sheet — measured
  // 11.52px (0.72rem) on the manager button — so a "did it inherit 16px" assertion would fail
  // against a value the design states on purpose. What matters about `font-size` is that all
  // three hosts agree on it, which the equality above already requires.
  for (const control of ['manager-button', 'icon-button']) {
    assert.match(
      bare(control)['font-family'],
      /Signika/,
      `${control} in a bare host does not inherit the ambient font family, so the family's own ` +
        '`font: inherit` is not reaching it'
    );
  }
});

/**
 * Every rule in the sheet, as parsed by the browser, flattened out of any layer or media block.
 *
 * @param {import('playwright').Page} tab An open page holding the module sheet.
 * @returns {Promise<Array<{selectorText: string, cssText: string, properties: string[]}>>} The rules.
 */
function readRules(tab) {
  return tab.evaluate(() => {
    const out = [];
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (!rule.selectorText) continue;
        out.push({
          selectorText: rule.selectorText,
          cssText: rule.style.cssText,
          properties: [...rule.style],
        });
      }
    };
    walk(globalThis.document.querySelector('#module-sheet').sheet.cssRules);
    return out;
  });
}

test('the `font: inherit` rule is above the `line-height: 1` rule, and the latter is more specific', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    // Both rules by their exact preludes, not by "a rule in the family that declares one" —
    // `.manager-checks-card-head-link` also declares both properties, and matching loosely
    // catches it too, which would make these assertions depend on which one sorted first.
    const floorIndex = rules.findIndex((rule) => rule.selectorText === FLOOR_RULE_SELECTOR);
    const floors = rules.filter((rule) => rule.selectorText === FLOOR_RULE_SELECTOR);
    assert.equal(
      floors.length,
      1,
      `\`${FLOOR_RULE_SELECTOR}\` must be declared exactly once; found ${floors.length}. It is ` +
        "the family's bare-element type baseline and the only rule that carries `font: inherit`."
    );
    const baseIndex = rules.findIndex((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    const base = rules.filter((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    assert.equal(
      base.length,
      1,
      `\`${BASE_RULE_SELECTOR}\` must be declared exactly once; found ${base.length}. It is the ` +
        "family's shared control contract and the rule that declares `line-height: 1`."
    );

    // THE DECLARED VALUE IS `inherit`, on the FLOOR rule. The computed comparison can only ever
    // show that the three hosts agree; this shows WHAT they agree on, which is the declaration
    // acceptance 2 asks to be proved by reach rather than by a resolved value.
    //
    // EITHER SERIALISATION IS ACCEPTED, and the alternation is a measured fact rather than
    // caution. Chromium round-trips `font: inherit` as the SHORTHAND on this rule, because every
    // longhand the shorthand covers holds the same CSS-wide keyword and nothing else in the block
    // disturbs that; on the shared base block, where it stood beside a dozen other declarations,
    // the same engine serialised it into `font-family: inherit` and its siblings. Pinning one
    // spelling would make this assertion a statement about the engine.
    assert.match(
      floors[0].cssText,
      /font(?:-family)?:\s*inherit/,
      'the family baseline must declare `font: inherit`, which is what frees the family from the ' +
        `manager's bare-element baseline; declared: ${floors[0].cssText}`
    );
    assert.ok(
      base[0].properties.includes('line-height'),
      'the shared base rule must still declare the `line-height: 1` that the `font` shorthand ' +
        `above it would otherwise reset; declared: ${base[0].properties.join(', ')}`
    );

    // ORDER. The baseline is written ABOVE the block that declares `line-height: 1`. Order alone
    // does not decide this pair — the specificity below does — but the two together are what make
    // the resolution independent of any engine's shorthand expansion, and a baseline that drifted
    // BELOW the base block would be decided by order alone if the two ever tied again.
    assert.ok(
      floorIndex !== -1 && baseIndex !== -1,
      `neither rule index resolved: floor=${floorIndex}, base=${baseIndex}`
    );
    assert.ok(
      floorIndex < baseIndex,
      'the `font: inherit` baseline must be declared ABOVE the block that declares ' +
        `\`line-height: 1\`; found floor at ${floorIndex} and base at ${baseIndex}`
    );

    // AND SPECIFICITY, which is the half that actually decides it and the half issue 1502's r2
    // pass got wrong. The baseline is rooted at the family root ALONE at (0,1,0); the base block
    // chains a per-app class onto it at (0,2,0). That gap is the FLOOR: it is why the base
    // block's `line-height: 1` survives the shorthand, and — the same fact, measured on real
    // controls in the test below — why a caller's own per-site `font-size` at (0,2,0) still
    // beats the baseline instead of being silently deleted by it.
    assert.equal(
      specificity(FLOOR_RULE_SELECTOR),
      '0,1,0',
      'the family baseline must be rooted at the family root ALONE. At the base block`s own ' +
        '(0,2,0) it TIES every caller per-site rule and wins on source order against each one ' +
        'declared earlier in the sheet, which is the regression this rooting exists to prevent'
    );
    assert.equal(
      specificity(BASE_RULE_SELECTOR),
      '0,2,0',
      'the shared base block must stay the more specific of the two, or its `line-height: 1` is ' +
        'no longer what resolves'
    );

    // AND THE BASELINE HAS NOT CRAWLED BACK ONTO THE BASE BLOCK. This is the regression itself,
    // stated as its own assertion so a re-added `font: inherit` there reds by name rather than
    // as a font-size number in some other file.
    assert.ok(
      base[0].properties.every((property) => !property.startsWith('font')),
      'the shared base block must declare no `font` longhand at all: the baseline belongs on the ' +
        `family root alone, at (0,1,0). Declared: ${base[0].properties.join(', ')}`
    );
  } finally {
    await tab.close();
  }
});

/*
 * WHAT THE FLOOR IS FOR, MEASURED ON THE TWO CONTROLS THAT PROVED IT MATTERS.
 *
 * The specificity assertion above states the rooting; this states its CONSEQUENCE, on real
 * classes, in the host that renders them. `.fabricate-manager .manager-recipe-lock` and
 * `.manager-recipe-edit` size the recipe row's lock and pencil at 0.68rem — the deliberate
 * compact scale of that row, beside `manager-recipe-io` at 0.68rem and
 * `manager-recipe-table-head` at 0.72rem. They are app-rooted rules naming a class the CALLER
 * passes through to `IconButton`, so no family gate in this repository can see them: the family
 * detector keys on the literal `manager-icon-button` token, and these carry neither family class
 * in their prelude.
 *
 * That is what made them the ones a baseline written at the family's own (0,2,0) deleted. It tied
 * them and won on source order, and both glyphs rendered 28.7% larger — the only pixel change in
 * the whole conversion, and one no gate in the tree could see. The floor rooting is what puts
 * them back, so this measures the outcome rather than the rule.
 */
const CALLER_SIZED = Object.freeze([
  Object.freeze({
    id: 'recipe-lock',
    passThrough: 'manager-recipe-lock',
    markup:
      '<button type="button" class="fabricate-icon-button manager-icon-button manager-recipe-lock" data-probe="caller-recipe-lock" aria-label="Lock"><i class="fas fa-lock"></i></button>',
  }),
  Object.freeze({
    id: 'recipe-edit',
    passThrough: 'manager-recipe-edit',
    markup:
      '<button type="button" class="fabricate-icon-button manager-icon-button manager-recipe-edit" data-probe="caller-recipe-edit" aria-label="Edit"><i class="fas fa-pen"></i></button>',
  }),
]);

/** The compact scale those two rules declare, read out of the sheet rather than restated. */
const CALLER_FONT_SIZE = '0.68rem';

/**
 * The two caller-sized controls in the manager host, plus a bare-host icon button beside them.
 *
 * @param {string} css The module sheet text to load.
 * @returns {Promise<Record<string, {fontSize: string, lineHeight: string, fontFamily: string, box: string}>>} probe → measurement.
 */
async function measureCallerSized(css) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.setContent(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html, body { margin: 0; padding: 0; }' +
        'body { font-family: "Signika", sans-serif; font-size: 14px; }</style>' +
        `<style id="module-sheet">${css}</style></head><body>` +
        `<div class="fabricate fabricate-manager"><div>${CALLER_SIZED.map((one) => one.markup).join('')}</div></div>` +
        '<div><div><button type="button" class="fabricate-icon-button manager-icon-button" data-probe="caller-bare-icon" aria-label="Delete"><i class="fas fa-trash"></i></button></div></div>' +
        '</body></html>'
    );
    return await tab.evaluate(() => {
      const out = {};
      for (const node of globalThis.document.querySelectorAll('[data-probe]')) {
        const style = globalThis.getComputedStyle(node);
        const box = node.getBoundingClientRect();
        out[node.dataset.probe] = {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontFamily: style.fontFamily,
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      }
      return out;
    });
  } finally {
    await tab.close();
  }
}

test('a caller`s per-site font rule still beats the family`s baseline', async () => {
  // NON-VACUITY, BOTH WAYS. The rules must still declare the compact scale, and the components
  // must still pass those classes through — a probe measuring a class the product stopped
  // rendering, or a rule that stopped declaring a size, would pass while proving nothing.
  const recipesBrowserSource = read('src/ui/svelte/apps/manager/RecipesBrowserView.svelte');
  const declaredSize = CALLER_FONT_SIZE.replaceAll('.', String.raw`\.`);
  for (const { id, passThrough } of CALLER_SIZED) {
    assert.match(
      sheet,
      new RegExp(
        String.raw`\.fabricate-manager \.${passThrough} \{[^}]*font-size: ${declaredSize}`
      ),
      `\`.fabricate-manager .${passThrough}\` must still declare \`font-size: ${CALLER_FONT_SIZE}\`, ` +
        `or the ${id} measurement below holds over a value nothing states`
    );
    assert.match(
      recipesBrowserSource,
      new RegExp(String.raw`${passThrough}(?![\w-])`),
      `RecipesBrowserView must still pass \`${passThrough}\` through to IconButton, or this ` +
        'probe measures markup the product no longer renders'
    );
  }

  const measured = await measureCallerSized(sheet);
  // 0.68rem against the ROOT font size, which the harness leaves at the browser default while
  // declaring 14px on the body — so a control that took the baseline instead reads the body's
  // 14px and a control that took the caller's rule reads 10.88px. The two differ, which is the
  // whole point, and the expected value is computed rather than hard-coded.
  const expected = `${Number.parseFloat(CALLER_FONT_SIZE) * 16}px`;
  for (const { id } of CALLER_SIZED) {
    const probe = measured[`caller-${id}`];
    assert.ok(probe, `the manager host rendered no ${id} probe`);
    assert.equal(
      probe.fontSize,
      expected,
      `\`.manager-${id}\` must compute the ${CALLER_FONT_SIZE} its own rule declares. A ` +
        '`font: inherit` on the family`s (0,2,0) shared base block ties that rule and wins on ' +
        'source order, which renders this glyph 28.7% larger in the recipe row'
    );
    assert.equal(
      probe.lineHeight,
      expected,
      `\`.manager-${id}\` must keep line-height 1 against its own font size`
    );
  }

  // AND THE FLOOR STILL REACHES A HOST THAT DECLARES NOTHING, which is the half a narrower fix
  // would have kept while giving up. Without the baseline this button falls to the UA button
  // font, which in Chromium is 13.3333px Arial rather than the ambient 14px Signika.
  assert.equal(measured['caller-bare-icon'].fontSize, '14px');
  assert.match(
    measured['caller-bare-icon'].fontFamily,
    /Signika/,
    'a bare-host icon button must still inherit the ambient font, or the baseline is not a floor ' +
      'but simply gone'
  );
});

/*
 * THE SECOND NEGATIVE CONTROL, ON THE FLOOR ITSELF.
 *
 * The measurement above is only evidence once it has been shown to break, and the way it breaks
 * is the exact spelling this fix retired: the baseline written on the family's own (0,2,0) shared
 * base block. This re-roots it there in the sheet TEXT, asserts the substitution applied, and
 * requires the two caller-sized controls to leave 0.68rem.
 */
const FLOOR_RULE_PRELUDE = '.fabricate-button,\n.fabricate-icon-button {\n  font: inherit;\n}';
const RE_FAMILY_ROOTED_FLOOR =
  '.fabricate-button.manager-button,\n.fabricate-icon-button.manager-icon-button {\n  font: inherit;\n}';

test('the caller-override measurement reds when the baseline is written at the family`s own (0,2,0)', async () => {
  assert.equal(
    sheet.split(FLOOR_RULE_PRELUDE).length - 1,
    1,
    'the family baseline is not spelled as this control expects, so the control below would ' +
      'perturb nothing and pass. Re-derive the prelude from `styles/fabricate.css`.'
  );
  const perturbed = sheet.replace(FLOOR_RULE_PRELUDE, RE_FAMILY_ROOTED_FLOOR);
  assert.notEqual(
    perturbed,
    sheet,
    'the substitution must apply before the run below means anything'
  );

  const measured = await measureCallerSized(perturbed);
  const expected = `${Number.parseFloat(CALLER_FONT_SIZE) * 16}px`;
  const kept = CALLER_SIZED.filter(({ id }) => measured[`caller-${id}`].fontSize === expected);
  assert.deepEqual(
    kept.map(({ id }) => id),
    [],
    'writing the baseline at the family`s own (0,2,0) left the caller-sized controls at ' +
      `${expected}, so the measurement above is not actually testing the rooting`
  );
  // AND THE PERTURBATION IS THE REGRESSION, not merely A change: they take the ambient instead.
  for (const { id } of CALLER_SIZED) {
    assert.equal(measured[`caller-${id}`].fontSize, '14px');
  }
});

test('each re-rooted family declares its own focus ring, and none of them reaches a select', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);

    // `getComputedStyle` returns `''` for `outline` in a non-focused element and cannot be asked
    // "which rule said so" at all, so the ring is read as a DECLARED rule — the same route
    // `import-folder-mapping-modal-focus.test.js` takes for the same reason.
    //
    // THE CHROME A FAMILY DECLARES IS A PAIR, and only the pair is host-independent. Foundry core
    // paints every focused button with an orange outline and a 4px glow (`a.button:focus,
    // button:focus` in core's `elements` layer), and the two AREA resets strip it only inside
    // `.fabricate-app` and `.fabricate-manager`. A control rooted at a class the primitive emits
    // renders in hosts carrying neither, where the repaint half alone would lay the accent ring
    // OVER core's glow instead of replacing it. So each family declares the strip at `:focus` as
    // well as the repaint at `:focus-visible` — the same pairing CONTRIBUTING.md states for an
    // area — and the strip must be declared FIRST, because the two halves tie on specificity and
    // a `:focus-visible` element matches both.
    for (const [strip, repaint] of [
      ['.fabricate-button:focus', '.fabricate-button:focus-visible'],
      ['.fabricate-icon-button:focus', '.fabricate-icon-button:focus-visible'],
      ['.fabricate-pagination button:focus', '.fabricate-pagination button:focus-visible'],
    ]) {
      const ring = rules.filter((rule) => rule.selectorText === repaint);
      assert.equal(ring.length, 1, `${repaint} must be declared exactly once`);
      assert.match(
        ring[0].cssText,
        /outline:\s*2px solid var\(--fab-accent\)/,
        `${repaint} must carry the same outline the two area rings declare`
      );
      assert.match(
        ring[0].cssText,
        /outline-offset:\s*2px/,
        `${repaint} must carry the area rings' outline offset`
      );

      const reset = rules.filter((rule) => rule.selectorText === strip);
      assert.equal(
        reset.length,
        1,
        `${strip} must be declared exactly once: without the strip half, a control in a host ` +
          "carrying neither area class keeps Foundry core's orange focus outline and 4px glow " +
          'under the accent ring instead of having it replaced'
      );
      assert.match(
        reset[0].cssText,
        /outline:\s*none/,
        `${strip} must strip core's focus outline, as the two area resets do`
      );
      assert.match(
        reset[0].cssText,
        /box-shadow:\s*none/,
        `${strip} must strip core's 4px focus glow, which is a box-shadow rather than an outline`
      );
      assert.ok(
        rules.findIndex((rule) => rule.selectorText === strip) <
          rules.findIndex((rule) => rule.selectorText === repaint),
        `${strip} and ${repaint} tie on specificity, so the strip must be declared above the ` +
          'repaint or source order deletes the accent ring it exists to supply'
      );
    }

    // THE SELECT'S INSET RING IS INTACT. `.fabricate-pagination :is(button, select)` would have
    // tied `.fabricate-app select:focus-visible` and won on source order, deleting its
    // `outline: none` + inset `box-shadow` and reinstating the clipped-outline defect that rule
    // exists to prevent. Proved twice: the rule still says what it said, and no rule rooted at
    // one of the three new namespace classes names a `select` at all.
    const selectRing = rules.filter(
      (rule) => rule.selectorText === '.fabricate-app select:focus-visible'
    );
    assert.equal(selectRing.length, 1, 'the player app`s select ring must still be declared once');
    assert.match(selectRing[0].cssText, /outline:\s*none/, 'the select ring stays outline-less');
    assert.match(
      selectRing[0].cssText,
      /box-shadow:\s*inset 0(?:px)? 0(?:px)? 0(?:px)? 2px var\(--fab-accent\)/,
      'the select ring stays an INSET box-shadow, which is the part that is never clipped'
    );

    const roots = ['fabricate-button', 'fabricate-icon-button', 'fabricate-pagination'];
    const selectReach = rules
      .filter((rule) => roots.some((root) => rule.selectorText.includes(`.${root}`)))
      .filter((rule) =>
        rule.selectorText
          .split(',')
          .some((one) => /(?:^|[\s>+~])select(?![\w-])/.test(one.trim()) && /:focus/.test(one))
      );
    assert.deepEqual(
      selectReach.map((rule) => rule.selectorText),
      [],
      'a rule rooted at one of the three new namespace classes reaches a focused `select`, which ' +
        'is what would displace the inset ring above'
    );
  } finally {
    await tab.close();
  }
});

test('the family base rule declares its background rather than inheriting one', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    // `background: var(--fab-overlay-light-06)` resolves through a custom property, and a host
    // that failed to define it computes the same `rgba(0, 0, 0, 0)` a control with NO background
    // computes — so a computed comparison would agree for the wrong reason. The declared value is
    // read instead, which is what acceptance 2 asks for.
    const base = rules.filter((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    assert.equal(
      base.length,
      1,
      `the shared base rule must be declared once, found ${base.length}`
    );
    assert.match(
      base[0].cssText,
      /background-color:\s*var\(--fab-overlay-light-06\)|background:\s*var\(--fab-overlay-light-06\)/,
      'the family declares its own resting background on its lowest-specificity rule'
    );
  } finally {
    await tab.close();
  }
});

/*
 * THE NEGATIVE CONTROL, PERMANENT AND IN-FILE.
 *
 * A three-host equality is only evidence once it has been shown to break. This re-prefixes the
 * family's shared base rule with `.fabricate-manager` — the exact spelling this issue retired —
 * in the sheet TEXT, asserts the substitution actually applied before loading it, and then
 * requires the bare host to diverge from the manager host. A substitution that silently matched
 * nothing would leave this passing while perturbing nothing, which is the failure mode that makes
 * a negative control worthless, so the count is asserted first.
 *
 * It mutates a string, never the file: the sheet on disk is read once at module load.
 */
const BASE_RULE_PRELUDE =
  '.fabricate-button.manager-button,\n.fabricate-icon-button.manager-icon-button {';
const RE_APP_ROOTED_PRELUDE =
  '.fabricate-manager .manager-button,\n.fabricate-manager .manager-icon-button {';

test('the comparison reds when the family base rule is app-rooted again', async () => {
  assert.equal(
    sheet.split(BASE_RULE_PRELUDE).length - 1,
    1,
    'the shared base rule is not spelled as this control expects, so the control below would ' +
      'perturb nothing and pass. Re-derive the prelude from `styles/fabricate.css`.'
  );
  const perturbed = sheet.replace(BASE_RULE_PRELUDE, RE_APP_ROOTED_PRELUDE);
  assert.notEqual(
    perturbed,
    sheet,
    'the substitution must apply before the run below means anything'
  );

  const measured = await measure(perturbed);
  const divergent = [];
  for (const control of ['manager-button', 'icon-button']) {
    for (const property of COMPARED) {
      if (measured[control].bare[property] !== measured[control].manager[property]) {
        divergent.push(`${control}.${property}`);
      }
    }
  }
  assert.ok(
    divergent.length > 0,
    'app-rooting the family base rule again left the bare host identical to the manager host, so ' +
      'the equality this file asserts is not actually measuring that rule'
  );
});

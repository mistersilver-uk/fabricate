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
 * exists to prove — `font: inherit` on the family's own shared base rule, replacing the manager's
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
 *  1. DECLARATION ORDER. `font` is a shorthand that resets `line-height` to `normal` when it is
 *     not given one, and the family's shared base rule declares `line-height: 1` further down the
 *     same block. Written BELOW that line, `font: inherit` would silently delete the primitive's
 *     line-height in both apps. A computed `line-height` can only show the consequence in an
 *     engine that expands the shorthand; reading the rule's own declaration order shows the CAUSE,
 *     in any engine.
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
 * This is the lowest-specificity (0,2,0) rule of BOTH button families — the one rule this issue
 * added `font: inherit` to, and the one whose declaration ORDER the whole `line-height` question
 * turns on. It is named once here because three assertions below ask about the same rule.
 */
const BASE_RULE_SELECTOR =
  '.fabricate-button.manager-button, .fabricate-icon-button.manager-icon-button';

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
 * (`fabricate.css:13496`), so the comparison is live for them and reds if that declaration goes.
 * `Pagination`'s root `<section>` declares none, and in the manager it picks one up from
 * `.fabricate-manager * { box-sizing: border-box }` (`:1295-1296`) — a UNIVERSAL rule that is the
 * manager area's own chrome and belongs to no primitive family. Outside the manager the section
 * therefore computes `content-box`.
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
  // THE ONE MEASURED RESIDUAL, recorded rather than reconciled away. `Pagination`'s root section
  // takes `border-box` from the manager area's universal rule and computes `content-box`
  // everywhere else. It is inert only while no rule gives that section an explicit `width` or
  // `height` — the moment one does, the two keywords produce two different boxes and the
  // `rendered-size` equality above becomes the thing that reds. This states both halves so the
  // exclusion from `COMPARED_PAGINATION` cannot quietly outlive its reason.
  const measured = await measure(sheet);
  assert.equal(measured.pagination.bare['box-sizing'], 'content-box');
  assert.equal(measured.pagination.app['box-sizing'], 'content-box');
  assert.equal(measured.pagination.manager['box-sizing'], 'border-box');

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
        'the condition that turns its `content-box` keyword into a different rendered box. Give ' +
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

  // `line-height: 1` — the declaration `font: inherit` would have deleted had it been written
  // below it. Chromium reports a NUMERIC line-height as its used px value, so "is it 1" is asked
  // as "does it equal the font size", which is what `1` means and is engine-independent.
  for (const control of ['manager-button', 'icon-button']) {
    const style = bare(control);
    assert.ok(
      Number.parseFloat(style['font-size']) > 0,
      `${control} computed no font-size, so the line-height ratio below proves nothing`
    );
    assert.equal(
      Number.parseFloat(style['line-height']),
      Number.parseFloat(style['font-size']),
      `${control} must compute line-height 1; \`font: inherit\` written below the ` +
        '`line-height: 1` declaration would reset it to `normal`'
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

test('the shared base rule declares `font` above `line-height`, so the shorthand cannot reset it', async () => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(document_(sheet));
    const rules = await readRules(tab);
    assert.ok(rules.length > 2000, `only ${rules.length} rules parsed; the sheet did not load`);

    // The SHARED BASE RULE by its exact prelude, not by "a rule in the family that declares
    // both" — `.manager-checks-card-head-link` is a second such rule and matching loosely
    // catches it too, which would make this assertion depend on which one sorted first.
    const base = rules.filter((rule) => rule.selectorText === BASE_RULE_SELECTOR);
    assert.equal(
      base.length,
      1,
      `\`${BASE_RULE_SELECTOR}\` must be declared exactly once; found ${base.length}. It is the ` +
        "family's lowest-specificity rule and the one this issue added `font: inherit` to."
    );
    assert.ok(
      base[0].properties.includes('line-height'),
      'the shared base rule must still declare the `line-height: 1` that the `font` shorthand ' +
        `above it could reset; declared: ${base[0].properties.join(', ')}`
    );
    // AND THE DECLARED VALUE IS `inherit`. The computed comparison can only ever show that the
    // three hosts agree; this shows WHAT they agree on, which is the declaration acceptance 2
    // asks to be proved by reach rather than by a resolved value.
    assert.match(
      base[0].cssText,
      /font-family:\s*inherit/,
      'the shared base rule must declare `font: inherit`, which is what frees the family from the ' +
        `manager's bare-element baseline; declared: ${base[0].cssText}`
    );

    // THE ORDER, read off the rule the browser parsed. `font` is a shorthand, and Chromium
    // serialises it into its longhands — so the question is asked of the FIRST font longhand
    // rather than of the literal `font`, which is the same question: every longhand the
    // shorthand sets, `line-height` among them, is written at the shorthand's position.
    const [rule] = base;
    const firstFont = rule.properties.findIndex((property) => property.startsWith('font'));
    const lineHeight = rule.properties.indexOf('line-height');
    assert.ok(firstFont !== -1 && lineHeight !== -1, `neither index resolved in ${rule.cssText}`);
    assert.ok(
      firstFont < lineHeight,
      'the `font: inherit` shorthand must be the FIRST declaration of the family base block: ' +
        'written below the `line-height: 1` at the end of it, it resets line-height to `normal` ' +
        `and silently deletes it in both apps. Declared order: ${rule.properties.join(', ')}`
    );
  } finally {
    await tab.close();
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
    for (const selector of [
      '.fabricate-button:focus-visible',
      '.fabricate-icon-button:focus-visible',
      '.fabricate-pagination button:focus-visible',
    ]) {
      const ring = rules.filter((rule) => rule.selectorText === selector);
      assert.equal(ring.length, 1, `${selector} must be declared exactly once`);
      assert.match(
        ring[0].cssText,
        /outline:\s*2px solid var\(--fab-accent\)/,
        `${selector} must carry the same outline the two area rings declare`
      );
      assert.match(
        ring[0].cssText,
        /outline-offset:\s*2px/,
        `${selector} must carry the area rings' outline offset`
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

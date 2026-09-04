/**
 * A SHARED PICKER MUST PAINT WHEREVER IT IS MOUNTED (issues 1464 and 1470).
 *
 * `SearchablePopover` was the first case. The primitive is shared, but for its whole life every
 * rule it needed was written under `.fabricate-manager`. A caller outside that root —
 * `ActorSelectTopBar` in the player window — portalled its panel to a host the selectors could not
 * reach and drew entirely unstyled, which is why #1458 could not convert it. Issue 1464 moved all
 * thirty rules off the manager root.
 *
 * Issue 1470 finished the set. `IconPicker`, `EssenceSourceSelector`, `ManagerColorPicker` and
 * `ManagerColorPopover` all live in `src/ui/svelte/components/`, THE SHARED DIRECTORY WHOSE WHOLE
 * PREMISE IS THAT A COMPONENT THERE WORKS WHEREVER IT IS MOUNTED, and none of them could. Issue
 * 1466 had already given them a correctly resolved portal host, which made the remaining half of
 * the defect louder rather than quieter: the panel now landed in the right host and still drew
 * `position: static`, because the rule that positions it was rooted at an application the panel
 * was no longer inside. So this gate covers four primitives, not one.
 *
 * THE ROOT COULD NOT SIMPLY BE DROPPED, and that is the constraint this gate encodes rather
 * than the one the issue anticipated. `styles/fabricate.css` is loaded page-wide into the Foundry
 * document, so `tests/styles-namespacing.test.js` requires EVERY selector in it to begin with
 * `.fabricate` — an unnamespaced `.manager-travel-option` would bleed into other modules' sheets,
 * which has happened before. The replacement therefore has to be a `.fabricate-*` root, and the
 * only one that travels with a shared primitive is one the PRIMITIVE ITSELF emits:
 * `fabricate-picker` on its root element and `fabricate-picker-popover` on the panel it portals.
 *
 * That is the whole rule, and both halves are load-bearing:
 *
 *   - a picker rule MUST be rooted at one of the primitive's own namespace classes, so it
 *     matches in every app; and
 *   - the primitive MUST actually write those classes, or the rules root at nothing.
 *
 * A rule whose ancestor chain names a CALLER's container — `.fabricate-manager
 * .manager-recipe-or-popover .manager-travel-option-name` — is exempt and stays where it is. It
 * is the caller's override of its own markup, it can only ever match inside that caller's app,
 * and it is reachable there whatever the primitive does.
 *
 * HOW MANY NAMESPACE ROOTS A PRIMITIVE NEEDS IS A PROPERTY OF ITS PORTAL SHAPE, not a count to
 * copy. A portalled node keeps its classes and loses its ancestors, so a component that portals a
 * panel out of its own root needs one class on each — `SearchablePopover`, `IconPicker` and
 * `EssenceSourceSelector` do. `ManagerColorPicker` portals nothing itself (its panel is a separate
 * component, which it drives `anchoredPopover` against) and `ManagerColorPopover`'s root element
 * IS the panel that gets portaled, so those two carry one class each. They are listed here as ONE
 * primitive because they render one class family between them, and `.manager-color-swatch` —
 * painted by both, in two different subtrees after the portal — is why that family's rules need
 * both roots.
 *
 * WHY IT NEEDS A GATE
 * -------------------
 * Re-rooting the family back onto `.fabricate-manager` is a one-word change per rule that looks
 * like tidying, costs nothing to make, and re-breaks every caller outside the manager without
 * failing anything else in the repository: the manager keeps rendering correctly, and the player
 * window has no case that would notice.
 *
 * WHAT MAKES THIS NOT VACUOUS
 * ---------------------------
 * An absence gate over an empty selector set passes forever, and this one derives BOTH of its
 * populations, so either could silently go empty:
 *
 *   1. The class set is read out of each component's MARKUP, not hard-coded. A floor on its size
 *      and on named anchors reds if the extractor stops finding classes — which would otherwise
 *      make the sheet look clean by examining nothing.
 *   2. A floor on the number of picker selectors found, for the same reason on the other side.
 *   3. The application-root detector is proved to FIRE on a synthetic selector, and proved not to
 *      fire on a shipped one, so a predicate rewritten to match everything or nothing reds here
 *      rather than greening the assertions below.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { collectWorkingTreeSources, repoRoot } from '../helpers/sourceScan.js';
import { splitSelectorList, stripCssComments } from '../helpers/styleBlockScan.js';

const STYLESHEET = 'styles/fabricate.css';

/**
 * The four shared pickers, each with the namespace roots it writes and the class family it owns.
 *
 * `family` is a PREFIX pattern rather than a class list because the list is derived from markup:
 * it decides which of the component's classes belong to the primitive's own family, so that
 * generic utilities it also writes (`hint`, `fas`, `fa-chevron-down`) are not mistaken for rules
 * this gate governs. Those are the manager's and Font Awesome's vocabulary, not the primitive's.
 *
 * The floors are the counts measured when each primitive was re-rooted, minus a small margin.
 * They exist to red when a reader has stopped finding the population, not to pin its size.
 */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    name: 'SearchablePopover',
    components: Object.freeze(['src/ui/svelte/components/SearchablePopover.svelte']),
    roots: Object.freeze(['fabricate-picker', 'fabricate-picker-popover']),
    family: 'manager-travel-[\\w-]+',
    anchors: Object.freeze([
      'manager-travel-picker',
      'manager-travel-popover',
      'manager-travel-option',
      'manager-travel-portrait',
    ]),
    // Measured today: 18 written, 32 family selectors, 26 owned. Thirty rules were re-rooted by
    // issue 1464 and six are caller overrides.
    writtenFloor: 12,
    familyFloor: 25,
    ownedFloor: 25,
    // The class attribute that copies the primitive's root markup, and the namespace class that
    // must ride beside it in any hand-built fixture.
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-travel-picker', root: 'fabricate-picker' }),
      Object.freeze({ anchor: 'manager-travel-popover', root: 'fabricate-picker-popover' }),
    ]),
  }),
  Object.freeze({
    name: 'IconPicker',
    components: Object.freeze(['src/ui/svelte/components/IconPicker.svelte']),
    roots: Object.freeze(['fabricate-icon-picker', 'fabricate-icon-picker-popover']),
    family: 'essence-icon-picker[\\w-]*',
    anchors: Object.freeze([
      'essence-icon-picker',
      'essence-icon-picker-popover',
      'essence-icon-picker-trigger',
      'essence-icon-picker-option',
    ]),
    // Measured today: 10 written, 29 family selectors, 14 owned. Fifteen are caller overrides —
    // the vocabulary tile, the two condition chips and the essence icon actions all re-shape the
    // trigger from their own markup.
    writtenFloor: 8,
    familyFloor: 24,
    ownedFloor: 12,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'essence-icon-picker', root: 'fabricate-icon-picker' }),
      Object.freeze({
        anchor: 'essence-icon-picker-popover',
        root: 'fabricate-icon-picker-popover',
      }),
    ]),
  }),
  Object.freeze({
    name: 'EssenceSourceSelector',
    components: Object.freeze(['src/ui/svelte/components/EssenceSourceSelector.svelte']),
    roots: Object.freeze(['fabricate-source-picker', 'fabricate-source-picker-popover']),
    family: 'essence-source-[\\w-]+',
    anchors: Object.freeze([
      'essence-source-selector',
      'essence-source-picker-popover',
      'essence-source-trigger',
      'essence-source-picker-option',
    ]),
    // Measured today: 12 written, 26 family selectors, 20 owned, 6 caller overrides.
    writtenFloor: 10,
    familyFloor: 22,
    ownedFloor: 17,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'essence-source-selector', root: 'fabricate-source-picker' }),
      Object.freeze({
        anchor: 'essence-source-picker-popover',
        root: 'fabricate-source-picker-popover',
      }),
    ]),
  }),
  Object.freeze({
    name: 'ActionMenu',
    components: Object.freeze(['src/ui/svelte/components/ActionMenu.svelte']),
    roots: Object.freeze(['fabricate-action-menu', 'fabricate-action-menu-panel']),
    family: 'manager-action-menu[\\w-]*',
    anchors: Object.freeze([
      'manager-action-menu',
      'manager-action-menu-panel',
      'manager-action-menu-item',
    ]),
    // Measured today: 3 written, 9 family selectors, 9 owned, 0 caller overrides. The family is
    // BORN at the primitive rather than re-rooted onto it (issue 1477) — it was
    // `.manager-environment-comp-menu*` under `.fabricate-manager`, named for one of its two
    // callers — so the floors sit just under the measured counts rather than under a re-rooting
    // margin. The one caller-anchored rule the conversion leaves behind,
    // `.manager-component-identity-name-row .manager-component-overflow-trigger`, names the
    // TRIGGER class the caller passes in and is not in this family at all.
    writtenFloor: 3,
    familyFloor: 8,
    ownedFloor: 8,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-action-menu', root: 'fabricate-action-menu' }),
      Object.freeze({ anchor: 'manager-action-menu-panel', root: 'fabricate-action-menu-panel' }),
    ]),
  }),
  Object.freeze({
    name: 'ManagerColorPicker + ManagerColorPopover',
    components: Object.freeze([
      'src/ui/svelte/components/ManagerColorPicker.svelte',
      'src/ui/svelte/components/ManagerColorPopover.svelte',
    ]),
    roots: Object.freeze(['fabricate-color-picker', 'fabricate-color-picker-popover']),
    family: 'manager-color-[\\w-]+',
    anchors: Object.freeze([
      'manager-color-picker',
      'manager-color-picker-popover',
      'manager-color-picker-trigger',
      'manager-color-preset',
    ]),
    // Measured today: 12 written, 16 family selectors, 15 owned, 1 caller override.
    writtenFloor: 10,
    familyFloor: 13,
    ownedFloor: 12,
    mirrored: Object.freeze([
      Object.freeze({ anchor: 'manager-color-picker', root: 'fabricate-color-picker' }),
      Object.freeze({
        anchor: 'manager-color-picker-popover',
        root: 'fabricate-color-picker-popover',
      }),
    ]),
  }),
]);

const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * An APPLICATION root, from one primitive's point of view: the class a Foundry app puts on its own
 * window root. Every namespace class shares the `fabricate-` prefix by necessity — the namespacing
 * gate demands it — so the two are told apart by name rather than by shape.
 *
 * @param {string} cls A class name.
 * @param {{roots: readonly string[]}} primitive The primitive whose rules are being judged.
 * @returns {boolean} True when `cls` roots the rule at an application rather than at the primitive.
 */
const isApplicationRoot = (cls, primitive) =>
  cls.startsWith('fabricate-') && !primitive.roots.includes(cls);

/**
 * The markup region of a component: after its `<script>`, before any scoped `<style>`.
 *
 * The `<script>` names classes as PORTAL HOST and SELECTOR strings and the `<style>` block is
 * scoped by the compiler, so neither holds a class the component writes onto its own elements.
 * Three of these components have no `<style>` at all, so its absence is not an error.
 *
 * @param {string} file Repository-relative component path.
 * @returns {string} The markup region.
 */
function markupRegion(file) {
  const source = read(file);
  const afterScript = source.indexOf('</script>');
  assert.ok(
    afterScript !== -1,
    `${file} no longer has a <script>, so the markup region this gate reads cannot be located. ` +
      'Retarget the extractor rather than deleting the assertion.'
  );
  const beforeStyle = source.lastIndexOf('<style>');
  return beforeStyle > afterScript ? source.slice(afterScript, beforeStyle) : source.slice(afterScript);
}

/** Every class-attribute VALUE in a markup region — `class="..."` and `class={`...`}` alike. */
function classAttributeValues(markup) {
  return [...markup.matchAll(/class=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (match) => match[1] ?? match[2] ?? ''
  );
}

/** Every family class the primitive puts on an element of its own. */
function classesWrittenBy(primitive) {
  const written = new Set();
  for (const file of primitive.components) {
    for (const cls of markupRegion(file).match(new RegExp(primitive.family, 'g')) ?? []) {
      written.add(cls);
    }
  }
  return written;
}

/** Selector-level view of a stylesheet, comments stripped so prose cannot match. */
function selectorsIn(css) {
  const out = [];
  const text = stripCssComments(css);
  const pattern = /(^|[};])\s*([^{};@]+?)\s*\{/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const head = match[2].trim();
    if (head.includes('.') || head.includes('[') || /^[a-zA-Z]/.test(head)) {
      for (const selector of splitSelectorList(head)) out.push(selector.replace(/\s+/g, ' ').trim());
    }
    match = pattern.exec(text);
  }
  return out;
}

const compoundsOf = (selector) => selector.split(/\s*(?:>|\+|~|\s)\s*/).filter(Boolean);
const classesOf = (compound) => [...compound.matchAll(/\.([\w-]+)/g)].map((entry) => entry[1]);

/**
 * The stylesheet's selector list, parsed once.
 *
 * Four primitives times a dozen classes times nine thousand selectors is a hundred thousand regex
 * constructions per run if this is re-derived per lookup, which turned one assertion into eighteen
 * seconds. Nothing mutates the sheet mid-run.
 */
let stylesheetSelectors = null;
const allSelectors = () => (stylesheetSelectors ??= selectorsIn(read(STYLESHEET)));

/** Selectors that name at least one class the primitive writes. */
function pickerSelectors(written) {
  const patterns = [...written].map((cls) => new RegExp(`\\.${cls}(?![\\w-])`));
  return allSelectors().filter((selector) => patterns.some((pattern) => pattern.test(selector)));
}

/**
 * A selector belongs to the PRIMITIVE when every class in it, APPLICATION ROOTS ASIDE, is one the
 * primitive writes or one of its own namespace roots. A selector naming anything else is a
 * CALLER's override of the caller's own markup and is exempt.
 *
 * Excluding application roots from the ownership question rather than letting one disqualify a
 * selector is the whole point: the regression this gate exists for ADDS an application root, so
 * an ownership test that counted it would hand the offending selector straight to the exemption.
 * That version of this function passed a control that re-rooted `.manager-travel-option` onto
 * `.fabricate-manager`, which is the exact defect, so the ordering here is load-bearing.
 */
function isPrimitiveOwned(selector, written, primitive) {
  return classesOf(selector)
    .filter((cls) => !isApplicationRoot(cls, primitive))
    .every((cls) => written.has(cls) || primitive.roots.includes(cls) || cls.startsWith('is-'));
}

test('the class set this gate reads is the one each primitive actually writes', () => {
  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);

    for (const anchor of primitive.anchors) {
      assert.ok(
        written.has(anchor),
        `\`${anchor}\` is no longer written by ${primitive.name}. Either the primitive has been ` +
          'renamed — in which case retarget this gate — or the markup extractor has stopped ' +
          'reading it, in which case every assertion below is examining a smaller set than it claims.'
      );
    }

    assert.ok(
      written.size >= primitive.writtenFloor,
      `only ${written.size} ${primitive.name} family classes were found in its markup, against a ` +
        `floor of ${primitive.writtenFloor}. A collapse to a handful means the markup region is ` +
        'being sliced wrongly and the sheet is about to be declared clean on the strength of a ' +
        'few selectors.'
    );
  }
});

test('every primitive writes the namespace roots its rules are anchored on', () => {
  for (const primitive of PRIMITIVES) {
    // Read from CLASS ATTRIBUTES rather than from the markup text, because every one of these
    // components also NAMES its roots in a comment explaining them. A prose mention would satisfy
    // a substring search while the class itself had been deleted, which is precisely the state
    // this clause exists to catch.
    const attributes = classAttributeValues(markupRegion(primitive.components[0]));
    const emitted = new Set(
      primitive.components.flatMap((file) =>
        classAttributeValues(markupRegion(file)).flatMap((value) => value.split(/\s+/))
      )
    );
    assert.ok(
      attributes.length > 0,
      `no class attributes were read out of ${primitive.name}'s markup, so the assertion below ` +
        'holds over nothing'
    );

    for (const root of primitive.roots) {
      assert.ok(
        emitted.has(root),
        `${primitive.name} no longer writes \`${root}\` on an element of its own, so every rule ` +
          'rooted at it matches nothing. The picker would draw unstyled EVERYWHERE — including ' +
          'the manager — which is a louder failure than the one this gate was written for, and ' +
          'no CSS-only check would see it.'
      );
    }
  }
});

test('the application-root detector fires', () => {
  for (const primitive of PRIMITIVES) {
    assert.ok(
      isApplicationRoot('fabricate-manager', primitive),
      `the detector no longer recognises \`fabricate-manager\` for ${primitive.name}, so this ` +
        'gate cannot see the exact regression it exists to catch'
    );
    for (const root of primitive.roots) {
      assert.ok(
        !isApplicationRoot(root, primitive),
        `the detector treats ${primitive.name}'s OWN namespace root \`${root}\` as an application ` +
          'root, so it would red on the shipped tree and be "fixed" by deleting it'
      );
    }
    assert.ok(
      !isApplicationRoot(primitive.anchors[0], primitive),
      `the detector matches the plain family class \`${primitive.anchors[0]}\`, so it is deciding ` +
        'on the wrong population'
    );
  }
});

test('every rule a primitive owns is rooted at the primitive, not at an application', () => {
  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);
    const family = pickerSelectors(written);

    assert.ok(
      family.length >= primitive.familyFloor,
      `only ${family.length} selectors in ${STYLESHEET} name a class ${primitive.name} writes, ` +
        `against a floor of ${primitive.familyFloor}. A number this low means the family has been ` +
        'renamed or the reader has stopped finding it, and the assertions below guard an empty set.'
    );

    const owned = family.filter((selector) => isPrimitiveOwned(selector, written, primitive));

    assert.ok(
      owned.length >= primitive.ownedFloor,
      `only ${owned.length} of ${family.length} ${primitive.name} selectors are owned by the ` +
        `primitive, against a floor of ${primitive.ownedFloor}. The exemption is for a CALLER's ` +
        'override of the caller’s own markup; a number this low means the ownership test has ' +
        'widened into an escape hatch.'
    );

    const gated = owned.filter((selector) =>
      classesOf(selector).some((cls) => isApplicationRoot(cls, primitive))
    );
    assert.deepEqual(
      gated,
      [],
      `these selectors put an application root in front of a class ${primitive.name} renders, so ` +
        'the primitive paints only inside that one app and every caller elsewhere draws unstyled ' +
        '— the blocker issue 1464 removed and #1458 hit first:\n  ' +
        gated.join('\n  ') +
        '\n\nThe sheet is page-global, so the root cannot just be deleted: use the primitive’s own ' +
        `namespace class instead (${primitive.roots.map((root) => `.${root}`).join(' / ')}), which ` +
        'is the same specificity and travels with the component.'
    );

    const rootless = owned.filter(
      (selector) =>
        !primitive.roots.some((root) => classesOf(compoundsOf(selector)[0]).includes(root))
    );
    assert.deepEqual(
      rootless,
      [],
      `these selectors are ${primitive.name}'s own but are not rooted at one of its namespace ` +
        'classes, so they either bleed page-wide or match nothing:\n  ' + rootless.join('\n  ')
    );
  }
});

/**
 * The fixture half, and it is not hypothetical: re-rooting the travel family broke
 * `recipe-studio-font-size.test.js`, whose Playwright page hand-writes a copy of the popover and
 * measured a 14px option meta against the 9.92px the real one renders. A fixture that copies the
 * primitive's markup is a hand-maintained mirror, and a mirror missing the root MEASURES SOMETHING
 * ELSE while still reporting on the primitive by name. Issue 1470 hit it twice more, in
 * `manager-layout.test.js`, where two hand-written copies of the icon picker's trigger omitted the
 * picker's own root element entirely.
 *
 * ── THE ONE EXEMPTION, AND WHY IT IS NOT A LOOPHOLE ─────────────────────────────────────────────
 * The premise above is about a mirror that gets RENDERED and MEASURED. A source-contract detector
 * fixture is the opposite: it is a string handed to a regex to prove the detector finds a RAW,
 * unconverted site, and it is deliberately non-conforming because depicting the defect is its
 * entire job. Namespacing one would make it depict a CONVERTED site, and the clause it feeds would
 * stop discriminating — a guard weakened to satisfy another guard.
 *
 * So the exemption is by FILE and pinned by EXACT COUNT: it cannot grow silently, and a file that
 * starts rendering its fixtures rather than pattern-matching them fails here until someone says so.
 *
 * TWO counts, because the two clauses below count different things over the same fixture. The
 * attribute clause sees the three `class="…"` attributes that name a ROOT anchor; the ancestry
 * clause sees four ELEMENTS, because one of the fixture's descendants (`manager-travel-picker-value`)
 * carries a family class without being a root itself. Generalising the gate moved the second number,
 * so it is recorded rather than reconciled away.
 */
const DETECTOR_FIXTURE_EXEMPTIONS = Object.freeze([
  Object.freeze({
    file: 'tests/components/searchable-popover-source-contract.test.js',
    primitive: 'SearchablePopover',
    attributeCount: 3,
    elementCount: 4,
    why:
      'the `DETECTOR_FIXTURE` source string, which exists to prove the raw-site detector fires. ' +
      'Its attributes depict UNCONVERTED markup on purpose; namespacing them would make the ' +
      'fixture depict a converted site and the discrimination clause would pass vacuously.',
  }),
]);

/**
 * Every element in a hand-written markup string, with the class names of its ancestors.
 *
 * A fixture is a STRING, so this is a tag scanner rather than a parser: it walks `<tag …>` and
 * `</tag>` in order and keeps a stack. It is deliberately forgiving — an unmatched close tag pops
 * to the nearest open one of that name and is otherwise ignored — because these strings are HTML
 * FRAGMENTS spliced together through template placeholders, not documents.
 *
 * @param {string} text A JavaScript source file that contains fixture markup.
 * @returns {Array<{name: string, classes: string[], ancestry: string[]}>} One entry per open tag.
 */
function elementsWithAncestry(text) {
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track',
    'wbr',
  ]);
  const out = [];
  const stack = [];
  const pattern = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const [, closing, rawName, attributes, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      const open = stack.map((entry) => entry.name).lastIndexOf(name);
      if (open !== -1) stack.length = open;
    } else {
      const classes = (attributes.match(/class="([^"]*)"/) ?? [, ''])[1].split(/\s+/).filter(Boolean);
      out.push({ name, classes, ancestry: [...stack.flatMap((entry) => entry.classes), ...classes] });
      if (!selfClosing && !VOID_ELEMENTS.has(name)) stack.push({ name, classes });
    }
    match = pattern.exec(text);
  }
  return out;
}

test('hand-built fixture markup carries the namespace roots the primitive writes', () => {
  const sources = collectWorkingTreeSources(['tests'], ['.js']);
  const exempt = new Set(DETECTOR_FIXTURE_EXEMPTIONS.map((entry) => `${entry.file}|${entry.primitive}`));
  const exemptHits = new Map();
  const offenders = [];
  let attributes = 0;

  for (const primitive of PRIMITIVES) {
    for (const [file, text] of Object.entries(sources)) {
      for (const match of text.matchAll(/class="([^"]*)"/g)) {
        const classes = match[1].split(/\s+/);
        for (const { anchor, root } of primitive.mirrored) {
          if (!classes.includes(anchor)) continue;
          attributes += 1;
          if (classes.includes(root)) continue;
          const key = `${file}|${primitive.name}`;
          if (exempt.has(key)) {
            exemptHits.set(key, (exemptHits.get(key) ?? 0) + 1);
            continue;
          }
          offenders.push(`${file}: class="${match[1]}" (needs \`${root}\`)`);
        }
      }
    }
  }

  assert.ok(
    attributes >= 4,
    `only ${attributes} fixture class attributes copy a primitive's root markup. Seven do today; ` +
      'a lower number means the scan is not reading the fixtures and the assertion below holds ' +
      'over nothing.'
  );

  assert.deepEqual(
    offenders,
    [],
    'these fixtures write a primitive’s root class without the namespace class beside it, so ' +
      'they render a copy no rule in the sheet reaches and measure a default rather than the ' +
      'product:\n  ' + offenders.join('\n  ')
  );

  // The exemption is only earned while it is still USED, and at the count it was recorded with.
  // A detector fixture that gains an attribute, loses one, or gets namespaced silently is a
  // permission nobody is exercising — which is how an allowlist entry outlives its reason.
  for (const entry of DETECTOR_FIXTURE_EXEMPTIONS) {
    const hits = exemptHits.get(`${entry.file}|${entry.primitive}`) ?? 0;
    assert.equal(
      hits,
      entry.attributeCount,
      `${entry.file} is exempted for ${entry.attributeCount} non-namespaced fixture attribute(s) ` +
        `against ${entry.primitive} and has ${hits}. Reason on record: ${entry.why}`
    );
  }
});

test('every fixture element in a picker’s family sits under one of its namespace roots', () => {
  // THE ATTRIBUTE CLAUSE ABOVE ONLY SEES A COPY OF THE ROOT ELEMENT, and the mirrors issue 1470
  // had to repair did not copy one. Two in `manager-layout.test.js` wrote the picker's TRIGGER
  // straight into a caller's container, omitting the picker's own root element altogether, and one
  // in `recipe-studio-font-size.test.js` — left behind by issue 1464 — dropped the primitive's
  // classes from the progressive stage row's picker while keeping the portrait inside it. Each
  // rendered a copy no rule could reach and measured its intrinsic size, while still reporting on
  // the primitive by name.
  //
  // So the question is ANCESTRY, not co-location: every element carrying a class the primitive
  // writes must have one of the primitive's namespace roots on itself or on an ancestor. That is
  // what the browser asks, and it is the only form of the question a file-wide substring search
  // cannot be talked out of — one conforming fixture elsewhere in the same file would satisfy that
  // one while the broken copy went on measuring a default.
  const sources = collectWorkingTreeSources(['tests'], ['.js']);
  const exempt = new Set(
    DETECTOR_FIXTURE_EXEMPTIONS.map((entry) => `${entry.file}|${entry.primitive}`)
  );
  const exemptHits = new Map();
  const offenders = [];
  let elements = 0;

  for (const primitive of PRIMITIVES) {
    const written = classesWrittenBy(primitive);
    for (const [file, text] of Object.entries(sources)) {
      for (const element of elementsWithAncestry(text)) {
        const copied = element.classes.filter((cls) => written.has(cls));
        if (copied.length === 0) continue;
        elements += 1;
        if (element.ancestry.some((cls) => primitive.roots.includes(cls))) continue;
        const key = `${file}|${primitive.name}`;
        if (exempt.has(key)) {
          exemptHits.set(key, (exemptHits.get(key) ?? 0) + 1);
          continue;
        }
        offenders.push(
          `${file}: <${element.name} class="${element.classes.join(' ')}"> copies ` +
            `${primitive.name}'s ${copied.join(', ')} with no ` +
            `${primitive.roots.map((root) => `\`${root}\``).join(' or ')} above it`
        );
      }
    }
  }

  assert.ok(
    elements >= 15,
    `only ${elements} fixture elements copy a shared picker's markup. Twenty-five do today; a ` +
      'lower number means the tag scanner has stopped reading the fixtures and the assertion ' +
      'below holds over nothing.'
  );

  assert.deepEqual(
    offenders,
    [],
    'these fixture elements render part of a shared picker outside the namespace root that makes ' +
      'the sheet reach them, so they measure an unstyled default while naming the primitive:\n  ' +
      offenders.join('\n  ')
  );

  for (const entry of DETECTOR_FIXTURE_EXEMPTIONS) {
    const hits = exemptHits.get(`${entry.file}|${entry.primitive}`) ?? 0;
    assert.equal(
      hits,
      entry.elementCount,
      `${entry.file} is exempted for ${entry.elementCount} rootless fixture element(s) against ` +
        `${entry.primitive} and has ${hits}. Reason on record: ${entry.why}`
    );
  }
});

test('each primitive’s own scoped styles name no application root either', () => {
  let blocks = 0;
  for (const primitive of PRIMITIVES) {
    for (const file of primitive.components) {
      const source = read(file);
      const styleAt = source.lastIndexOf('<style>');
      if (styleAt === -1) continue;
      blocks += 1;
      const gated = selectorsIn(source.slice(styleAt)).filter((selector) =>
        classesOf(selector).some((cls) => isApplicationRoot(cls, primitive))
      );

      assert.deepEqual(
        gated,
        [],
        `${file}'s scoped block reaches for an application root, which pins the primitive to one ` +
          'app from the inside — the same defect as the global sheet’s, one file further in:\n  ' +
          gated.join('\n  ')
      );
    }
  }

  assert.ok(
    blocks >= 2,
    `only ${blocks} of the five component files carry a scoped <style> block. Two do today ` +
      '(`SearchablePopover` and `ManagerColorPopover`); a lower number means the reader has ' +
      'stopped finding them and this clause examined nothing.'
  );
});

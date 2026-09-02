/**
 * `SearchablePopover` must paint wherever it is mounted (issue 1464).
 *
 * The primitive is shared, but for its whole life every rule it needs was written under
 * `.fabricate-manager`. A caller outside that root — `ActorSelectTopBar` in the player window —
 * portalled its panel to a host the selectors could not reach and drew entirely unstyled, which
 * is why #1458 could not convert it. Issue 1464 moved all thirty rules off the manager root.
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
 *   1. The class set is read out of the component's MARKUP, not hard-coded. A floor on its size
 *      and on four named anchors reds if the extractor stops finding classes — which would
 *      otherwise make the sheet look clean by examining nothing.
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

const COMPONENT = 'src/ui/svelte/apps/manager/SearchablePopover.svelte';
const STYLESHEET = 'styles/fabricate.css';

/** The namespace classes the primitive writes on the two elements a rule can root at. */
const PRIMITIVE_ROOTS = Object.freeze(['fabricate-picker', 'fabricate-picker-popover']);

/**
 * An APPLICATION root: the class a Foundry app puts on its own window root. `fabricate-picker`
 * and `fabricate-picker-popover` share the `fabricate-` prefix by necessity — the namespacing
 * gate demands it — so the two are told apart by name rather than by shape.
 */
const isApplicationRoot = (cls) => cls.startsWith('fabricate-') && !PRIMITIVE_ROOTS.includes(cls);

const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * The markup region only. The `<script>` names two travel classes as PORTAL HOST selectors and
 * the `<style>` block is scoped by the compiler, so neither is a class this component writes
 * onto its own elements.
 */
function markupRegion(source) {
  const afterScript = source.indexOf('</script>');
  const beforeStyle = source.lastIndexOf('<style>');
  assert.ok(
    afterScript !== -1 && beforeStyle > afterScript,
    `${COMPONENT} no longer has a <script> followed by a <style>, so the markup region this gate ` +
      'reads cannot be located. Retarget the extractor rather than deleting the assertion.'
  );
  return source.slice(afterScript, beforeStyle);
}

/** Every `manager-travel-*` class the primitive puts on an element of its own. */
function classesWrittenByPrimitive() {
  return new Set(markupRegion(read(COMPONENT)).match(/manager-travel-[\w-]+/g) ?? []);
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

/** Selectors that name at least one class the primitive writes. */
function pickerSelectors(written) {
  return selectorsIn(read(STYLESHEET)).filter((selector) =>
    [...written].some((cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(selector))
  );
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
function isPrimitiveOwned(selector, written) {
  return classesOf(selector)
    .filter((cls) => !isApplicationRoot(cls))
    .every((cls) => written.has(cls) || PRIMITIVE_ROOTS.includes(cls) || cls.startsWith('is-'));
}

test('the class set this gate reads is the one the primitive actually writes', () => {
  const written = classesWrittenByPrimitive();

  for (const anchor of [
    'manager-travel-picker',
    'manager-travel-popover',
    'manager-travel-option',
    'manager-travel-portrait',
  ]) {
    assert.ok(
      written.has(anchor),
      `\`${anchor}\` is no longer written by ${COMPONENT}. Either the primitive has been renamed ` +
        '— in which case retarget this gate — or the markup extractor has stopped reading it, in ' +
        'which case every assertion below is examining a smaller set than it claims to.'
    );
  }

  assert.ok(
    written.size >= 12,
    `only ${written.size} travel classes were found in the primitive's markup. It writes eighteen; ` +
      'a collapse to a handful means the markup region is being sliced wrongly and the sheet is ' +
      'about to be declared clean on the strength of four selectors.'
  );
});

test('the primitive writes the namespace roots its rules are anchored on', () => {
  const markup = markupRegion(read(COMPONENT));

  for (const root of PRIMITIVE_ROOTS) {
    assert.ok(
      new RegExp(`(^|[\\s\`"'])${root}(?![\\w-])`).test(markup),
      `${COMPONENT} no longer writes \`${root}\`, so every rule rooted at it matches nothing. ` +
        'The picker would draw unstyled EVERYWHERE — including the manager — which is a louder ' +
        'failure than the one this gate was written for, and no CSS-only check would see it.'
    );
  }
});

test('the application-root detector fires', () => {
  assert.ok(
    isApplicationRoot('fabricate-manager'),
    'the detector no longer recognises `fabricate-manager`, so this gate cannot see the exact ' +
      'regression it exists to catch'
  );
  assert.ok(
    !isApplicationRoot('fabricate-picker') && !isApplicationRoot('fabricate-picker-popover'),
    'the detector treats one of the primitive’s OWN namespace roots as an application root, so ' +
      'it would red on the shipped tree and be "fixed" by deleting it'
  );
  assert.ok(
    !isApplicationRoot('manager-travel-option'),
    'the detector matches a plain family class, so it is deciding on the wrong population'
  );
});

test('every rule the primitive owns is rooted at the primitive, not at an application', () => {
  const written = classesWrittenByPrimitive();
  const family = pickerSelectors(written);

  assert.ok(
    family.length >= 25,
    `only ${family.length} selectors in ${STYLESHEET} name a class the primitive writes. Thirty ` +
      'rules were re-rooted by issue 1464, so a number this low means the family has been renamed ' +
      'or the reader has stopped finding it, and the assertions below guard an empty set.'
  );

  const owned = family.filter((selector) => isPrimitiveOwned(selector, written));

  assert.ok(
    owned.length >= 25,
    `only ${owned.length} of ${family.length} picker selectors are owned by the primitive. The ` +
      'exemption is for a CALLER’s override of the caller’s own markup and there were six of ' +
      'those; a number this low means the ownership test has widened into an escape hatch.'
  );

  const gated = owned.filter((selector) =>
    classesOf(selector).some((cls) => isApplicationRoot(cls))
  );
  assert.deepEqual(
    gated,
    [],
    'these selectors put an application root in front of a class `SearchablePopover` renders, so ' +
      'the primitive paints only inside that one app and every caller elsewhere draws unstyled — ' +
      'the blocker issue 1464 removed and #1458 hit first:\n  ' +
      gated.join('\n  ') +
      `\n\nThe sheet is page-global, so the root cannot just be deleted: use the primitive’s own ` +
      `namespace class instead (${PRIMITIVE_ROOTS.map((root) => `.${root}`).join(' / ')}), which ` +
      'is the same specificity and travels with the component.'
  );

  const rootless = owned.filter(
    (selector) => !PRIMITIVE_ROOTS.some((root) => classesOf(compoundsOf(selector)[0]).includes(root))
  );
  assert.deepEqual(
    rootless,
    [],
    'these selectors are the primitive’s own but are not rooted at one of its namespace classes, ' +
      'so they either bleed page-wide or match nothing:\n  ' + rootless.join('\n  ')
  );
});

/**
 * The fixture half, and it is not hypothetical: re-rooting the family broke
 * `recipe-studio-font-size.test.js`, whose Playwright page hand-writes a copy of the popover and
 * measured a 14px option meta against the 9.92px the real one renders. A fixture that copies the
 * primitive's markup is a hand-maintained mirror, and a mirror missing the root MEASURES SOMETHING
 * ELSE while still reporting on the primitive by name.
 */
test('hand-built fixture markup carries the namespace roots the primitive writes', () => {
  const mirrored = [
    { anchor: 'manager-travel-picker', root: 'fabricate-picker' },
    { anchor: 'manager-travel-popover', root: 'fabricate-picker-popover' },
  ];

  const offenders = [];
  let attributes = 0;
  for (const [file, text] of Object.entries(collectWorkingTreeSources(['tests'], ['.js']))) {
    for (const match of text.matchAll(/class="([^"]*)"/g)) {
      const classes = match[1].split(/\s+/);
      for (const { anchor, root } of mirrored) {
        if (!classes.includes(anchor)) continue;
        attributes += 1;
        if (!classes.includes(root)) offenders.push(`${file}: class="${match[1]}"`);
      }
    }
  }

  assert.ok(
    attributes >= 4,
    `only ${attributes} fixture class attributes copy the primitive's root markup. Four did when ` +
      'this was written; a lower number means the scan is not reading the fixtures and the ' +
      'assertion below holds over nothing.'
  );

  assert.deepEqual(
    offenders,
    [],
    'these fixtures write the primitive’s root class without the namespace class beside it, so ' +
      'they render a copy no rule in the sheet reaches and measure a default rather than the ' +
      'product:\n  ' + offenders.join('\n  ')
  );
});

test('the primitive’s own scoped styles name no application root either', () => {
  const source = read(COMPONENT);
  const styleBlock = source.slice(source.lastIndexOf('<style>'));
  const gated = selectorsIn(styleBlock).filter((selector) =>
    classesOf(selector).some((cls) => isApplicationRoot(cls))
  );

  assert.deepEqual(
    gated,
    [],
    'the component’s scoped block reaches for an application root, which pins the primitive to ' +
      'one app from the inside — the same defect as the global sheet’s, one file further in:\n  ' +
      gated.join('\n  ')
  );
});

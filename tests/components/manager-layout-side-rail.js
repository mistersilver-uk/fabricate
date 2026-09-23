/**
 * The side-rail routes below the 1120px rung, measured in a real browser (issue 1976): none of
 * the fourteen restacks, so each keeps a full-height rail and its own content-column scroller
 * instead of the shared stacked-rail cap and a page-scrolling body.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  declaration,
  isManagerBodySubject,
  routeIdOf,
  splitTopLevel,
  topLevelRules,
  trackCount,
} from '../helpers/fullWidthRoute.js';

import { SIDE_RAIL_ROUTES, readSideRailGeometry } from './manager-layout-side-rail-fixtures.js';
import { compareStrings, css } from './manager-layout-shared.js';

const LADDER = [1212, 1121, 1120, 1000, 880, 832, 831, 700, 600];

function assertSideRailLayout(route, report, label, { width }) {
  const tag = `${route.id} ${label}`;
  assert.equal(report.bodyTracks, 2, `${tag} the body keeps its two tracks`);
  for (const part of ['rail', 'main']) {
    assert.ok(
      Math.abs(report[part].bottom - report.body.bottom) <= 1,
      `${tag} ${part} bottom ${report[part].bottom} reaches the body bottom ${report.body.bottom}`
    );
  }
  assert.ok(
    report.bodyScroll.scrollHeight <= report.bodyScroll.clientHeight + 1,
    `${tag} the body does not scroll (${report.bodyScroll.scrollHeight} > ${report.bodyScroll.clientHeight})`
  );
  assert.match(
    report.ownerScroll.overflowY,
    /^(auto|scroll)$/,
    `${tag} ${report.ownerSelector} is a vertical scroller`
  );
  assert.ok(
    report.ownerScroll.scrollHeight > report.ownerScroll.clientHeight,
    `${tag} ${report.ownerSelector} owns the overflow (${report.ownerScroll.scrollHeight} <= ${report.ownerScroll.clientHeight})`
  );
  if (width <= 1120) {
    assert.ok(
      report.railScroll.scrollHeight > report.railScroll.clientHeight,
      `${tag} the full-height rail scrolls its own navigation`
    );
  }
  assert.equal(report.railBorder.right, '1px', `${tag} the rail keeps its right divider`);
  assert.equal(report.railBorder.bottom, '0px', `${tag} the full-height rail has no bottom rule`);
}

function assertStackedCatalogue(route, report, label) {
  const tag = `${route.id} ${label}`;
  assert.equal(report.stacked, true, `precondition: ${tag} the list frame has stacked`);
  assert.match(
    report.list.layoutScroll.overflowY,
    /^(auto|scroll)$/,
    `${tag} the stacked list layout is the scroller`
  );
  assert.ok(
    report.list.layoutScroll.scrollHeight > report.list.layoutScroll.clientHeight,
    `${tag} the stacked list layout owns the overflow`
  );
  assert.ok(
    report.list.rows.height >= 62,
    `${tag} the list rows keep at least one row's height (${report.list.rows.height}px)`
  );
}

for (const route of SIDE_RAIL_ROUTES) {
  test(`${route.id} keeps a full-height rail and its own scroller at every width below 1212px`, async () => {
    const wide = await readSideRailGeometry(route, { width: 1212 });
    assert.ok(
      wide.ownerScroll.scrollHeight > wide.ownerScroll.clientHeight,
      `precondition: ${route.id} content overflows ${wide.ownerSelector} at 1212px`
    );
    for (const width of LADDER) {
      const report = width === 1212 ? wide : await readSideRailGeometry(route, { width });
      assertSideRailLayout(route, report, `${width}px`, { width });
      if (route.catalogue && (width === 880 || width === 700)) {
        assertStackedCatalogue(route, report, `${width}px`);
      }
    }
    assertSideRailLayout(
      route,
      await readSideRailGeometry(route, { width: 880, collapsed: true }),
      '880px collapsed',
      { width: 880 }
    );
    // A 640px window is a 606px Manager, #1972's floor.
    assertSideRailLayout(
      route,
      await readSideRailGeometry(route, { width: 1024, height: 606 }),
      '1024x640',
      { width: 1024 }
    );
  });
}

// ── The membership guard: the side-rail set is derived from the sheet, not listed ─────────────

const RESTACK_QUERY = '@container fabricate-manager (max-width: 1120px) {';

/** The 1120px block's own contents. */
function restackBlock() {
  const start = css.indexOf(RESTACK_QUERY);
  assert.ok(start !== -1, 'the sheet no longer declares the 1120px restack');
  let depth = 0;
  for (let index = start + RESTACK_QUERY.length - 1; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(start + RESTACK_QUERY.length, index);
  }
  throw new Error('the 1120px restack is not terminated');
}

const normalized = (selector) => selector.replaceAll(/\s+/g, ' ').trim();

/** The route compound a `.manager-body` or `.manager-rail` subject hangs off. */
function compoundOf(selector, subject) {
  return normalized(selector).replace(
    new RegExp(String.raw` \.${subject}(\.is-rail-collapsed)?$`),
    ''
  );
}

/** Route compounds whose `.manager-body` rules in `rules` resolve to `accept(tracks)`. */
function bodyCompounds(rules, accept) {
  const compounds = new Set();
  for (const rule of rules) {
    const columns = declaration(rule.declarations, 'grid-template-columns');
    if (!columns || !accept(trackCount(columns))) continue;
    for (const selector of splitTopLevel(rule.prelude, ',')) {
      if (!isManagerBodySubject(selector) || !routeIdOf(selector)) continue;
      compounds.add(compoundOf(selector, 'manager-body'));
    }
  }
  return compounds;
}

function selectorsOf(rule) {
  return splitTopLevel(rule.prelude, ',').map(normalized);
}

const sorted = (values) => [...values].sort(compareStrings);
const compound = (route) => `.fabricate-manager[data-manager-view="${route}"]`;

// The three band routes that keep their own row model rather than the shared bounded row.
const OWN_ROW_MODEL = Object.freeze({
  // Its own 1120px body rule already bounds the row and restates its columns.
  [compound('world-downtime')]: 'Downtime',
  // The Tool Rules library declares its own three-row template (out of scope for issue 1976).
  [compound('tools')]: 'Tool Rules library',
  // The Tool editor declares its own `max-content max-content minmax(0, 1fr)` rows.
  [compound('tool-edit')]: 'Tool editor',
});

test('the shared side-rail rail reset and band body rule name exactly the routes that keep a side rail', () => {
  const band = topLevelRules(restackBlock());
  const restacked = bodyCompounds(band, (tracks) => tracks === 1);
  const sideRail = new Set(
    [...bodyCompounds(topLevelRules(css), (tracks) => tracks >= 2)].filter(
      (entry) => !restacked.has(entry)
    )
  );
  const expected = [
    // The compound each fixture renders under, so the ladder and the sheet name one set.
    ...SIDE_RAIL_ROUTES.map(
      (route) =>
        `.fabricate-manager${route.rootAttributes
          .split(' ')
          .map((attribute) => `[${attribute}]`)
          .join('')}`
    ),
    compound('knowledge'),
    ...Object.keys(OWN_ROW_MODEL),
  ];
  assert.equal(expected.length, 18, 'the fourteen side-rail routes and the four precedents');
  assert.deepEqual(
    sorted(sideRail),
    sorted(expected),
    'the sheet derives the side-rail set: every route-scoped body of two or more tracks that ' +
      'the 1120px block does not restack. A route that left or joined it must leave or join ' +
      'the rendered ladder too.'
  );

  const reset = topLevelRules(css).find(
    (rule) =>
      selectorsOf(rule).includes(`${compound('tools')} .manager-rail`) &&
      declaration(rule.declarations, 'max-height') === 'none'
  );
  assert.ok(reset, 'the shared side-rail rail reset is still a top-level rule');
  const resetSet = selectorsOf(reset).map((selector) => compoundOf(selector, 'manager-rail'));
  assert.deepEqual(
    sorted(resetSet),
    sorted(sideRail),
    'every side-rail route, and only those, lifts the stacked-rail cap'
  );

  const bodyRule = band.find((rule) =>
    selectorsOf(rule).includes(`${compound('knowledge')} .manager-body`)
  );
  assert.ok(bodyRule, 'the band body rule is still inside the 1120px block');
  assert.equal(declaration(bodyRule.declarations, 'grid-template-rows'), 'minmax(0, 1fr)');
  assert.equal(declaration(bodyRule.declarations, 'overflow'), 'hidden');
  // First, so `blockFor` on the Knowledge body still resolves the top-level rule.
  assert.equal(selectorsOf(bodyRule)[0], `${compound('knowledge')} .manager-body`);
  const bodySet = selectorsOf(bodyRule).map((selector) => compoundOf(selector, 'manager-body'));
  assert.deepEqual(
    sorted(bodySet),
    sorted([...sideRail].filter((entry) => !(entry in OWN_ROW_MODEL))),
    'every side-rail route bounds its body row in the band, except the three that own theirs'
  );
});

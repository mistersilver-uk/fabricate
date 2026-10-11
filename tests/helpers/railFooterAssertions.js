/**
 * The browse-column footer assertions (`design-system`, "A browse column closes with a pager")
 * shared by the crafting and gathering rendered suites, over `railFooterGeometry` boxes named
 * `host`, `column`, `pager`, `list`, `centre` and `right`.
 */
import assert from 'node:assert/strict';

/** Assert two edges coincide to within half a pixel. */
export const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${label}: ${actual}, expected ${expected}`);

/** Side by side: the pager meets the nav rail, the window bottom and the centre pane's rule. */
export function assertFooterSideBySide({ host, pager, centre, right }) {
  near(pager.left, host.left, 'the pager left edge against the nav rail');
  near(pager.bottom, host.bottom, 'the pager bottom edge against the window');
  near(pager.right, centre.left, 'the pager right edge against the centre pane');
  near(right.left, centre.right, 'the right pane against the centre pane');
  for (const [name, pane] of Object.entries({ centre, right })) {
    assert.equal(pane.borderLeft, '1px', `the ${name} pane is divided by one 1px rule`);
    assert.equal(pane.borderTop, '0px', `the ${name} pane has no top rule side by side`);
    assert.equal(pane.radius, '0px', `the ${name} pane is square`);
    near(pane.top, host.top, `the ${name} pane at the top edge`);
    near(pane.bottom, host.bottom, `the ${name} pane at the bottom edge`);
  }
  near(right.right, host.right, 'the right pane at the right edge');
}

/**
 * Stacked: the pager spans the window on one row, with the centre pane's rule beneath it and its
 * left rule gone. The harness's headless Chromium hides scrollbars, so "spans the window" is
 * measured against the grid's box.
 */
export function assertFooterStacked({ host, pager, centre }) {
  near(pager.left, host.left, 'the pager left edge against the nav rail');
  near(pager.right, host.right, 'the pager right edge against the window');
  near(centre.top, pager.bottom, 'the centre pane directly beneath the pager');
  assert.equal(centre.borderTop, '1px', 'the centre pane takes the top rule stacked');
  assert.equal(centre.borderLeft, '0px', 'the centre pane drops its left rule stacked');
  const middles = pager.childMiddles;
  assert.ok(middles.length >= 3, `the pager has at least three parts, found ${middles.length}`);
  assert.ok(
    Math.max(...middles) - Math.min(...middles) < 1,
    `the pager is one row stacked, its parts centred at ${middles.join(', ')}`
  );
}

/** No bar: the list stays at least the column's 16px padding inside the column bottom. */
export function assertNoFooterKeepsPadding({ column, list }) {
  const inset = column.bottom - list.bottom;
  assert.ok(
    inset >= 16,
    `the list ends ${inset}px inside the column bottom, expected 16px or more`
  );
}

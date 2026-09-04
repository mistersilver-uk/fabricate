/*
 * THE CLIPPING BOUNDARIES ARE VALUES NOW, SO THEY NEED VALUE PINS (issue 1500).
 *
 * ── WHAT CHANGED, AND WHAT IT COST ──────────────────────────────────────────────────────────
 * Until this change each overlay component carried its own `closest('.admin-main, .manager-main,
 * …')` walk, and the walk was CODE: it sat inside the component that used it, in the same file as
 * the panel it bounded, where a reader editing the panel could see it. Issue 1500 lifted all four
 * walks out into `util/overlayBounds.js` and handed the strings to `anchoredPopover` as a `bounds`
 * option, which is the right shape — a shared component under `components/` must not name an
 * application's own scroller — and which also moved four selectors into a module no shipped test
 * asserted anything about.
 *
 * The cost is measurable. With the constants gutted to `''` the repository's overlay suites stay
 * green: nothing compares them to anything. That is the state this file exists to end.
 *
 * ── WHY A UNIT TEST CANNOT DO IT ANY OTHER WAY ──────────────────────────────────────────────
 * The honest test would be behavioural: open each picker inside its real scroller and measure that
 * the panel stops at the scroller's edge. happy-dom gives every element a zero-valued
 * `getBoundingClientRect`, so a mounted test can prove that a boundary was CONSULTED (see
 * `tests/actions/anchored-popover.test.js`, which stubs rects to do exactly that) but never that
 * the right ancestors are named in it. Naming the right ancestors is the whole content of these
 * three constants, and the failure mode is silent in every direction: a class dropped here does
 * not throw, does not warn, and does not change a single line of rendered markup. It changes where
 * a panel is allowed to be, in a browser, at a scroll position, in one pane.
 *
 * So the pin is on the STRINGS, and it is exact rather than a substring match. A substring pin
 * answers "is this class still mentioned", which is satisfied by a value that has lost three of
 * its four classes; the defect these boundaries were written for is a MISSING member, so the
 * assertion has to be about the whole set.
 *
 * ── WHAT THIS DOES NOT DUPLICATE ────────────────────────────────────────────────────────────
 * `tests/components/gathering-parties-tab.test.js` already asserts that
 * `PICKER_SCROLLER_SELECTOR` mentions `.manager-table-scroll` and `.manager-travel-parties`, and
 * that `SearchablePopover` still defaults to it. That pin is about the PARTIES pane and is where
 * a reader of the parties rebuild will look for it; it is a substring pin, so it survives the loss
 * of `.admin-main`, of `.manager-main`, and of `-content` (which `\.manager-travel-parties`
 * matches as a prefix — and `-content` is the class issue 1182 was actually about). The other two
 * constants have no pin anywhere. This file is the value contract for all three.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  MANAGER_MAIN_SELECTOR,
  MANAGER_SCROLLER_SELECTOR,
  PICKER_SCROLLER_SELECTOR,
} from '../../src/ui/svelte/util/overlayBounds.js';
import { repoRoot } from '../helpers/sourceScan.js';

/**
 * The three shipped boundaries, each with the components that are clipped by it.
 *
 * The `why` is not decoration. A boundary is a list of class names with nothing in it that says
 * what any of them is for, so the only defence against a member being dropped as noise is a
 * written record of which surface stops working when it goes.
 */
const BOUNDARIES = [
  {
    name: 'MANAGER_SCROLLER_SELECTOR',
    value: MANAGER_SCROLLER_SELECTOR,
    expected: '.admin-main, .manager-main, .manager-table-scroll',
    callers: [
      ['src/ui/svelte/components/IconPicker.svelte', 'bounds = MANAGER_SCROLLER_SELECTOR'],
      [
        'src/ui/svelte/components/EssenceSourceSelector.svelte',
        'bounds = MANAGER_SCROLLER_SELECTOR',
      ],
    ],
    // THE THREE BOXES A PICKER MAY BE INSIDE, and it is three rather than one because the manager
    // is not the only application that renders these pickers and the manager itself scrolls in two
    // places. `.admin-main` is the admin application's column; `.manager-main` is the crafting
    // system manager's; `.manager-table-scroll` is the inner scroller a table-shaped screen puts
    // around its rows, which is the box that actually clips a picker opened from a table cell —
    // the column outside it does not scroll with the row. `IconPicker` and `EssenceSourceSelector`
    // both default to this walk, and both are rendered from table rows and from plain cards, so
    // dropping any one member leaves a picker in that context bounded by whatever ancestor is
    // found next — in the worst case none, which means the host's own inset edges and a panel
    // laid out over the rows it came from.
    why: 'the icon picker and the essence source selector, in the admin column, the manager column and a table scroller',
  },
  {
    name: 'MANAGER_MAIN_SELECTOR',
    value: MANAGER_MAIN_SELECTOR,
    expected: '.manager-main',
    callers: [
      ['src/ui/svelte/components/ManagerColorPicker.svelte', 'bounds = MANAGER_MAIN_SELECTOR'],
      ['src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte', 'bounds: MANAGER_MAIN_SELECTOR'],
    ],
    // DELIBERATELY NARROWER THAN THE ONE ABOVE, and the narrowness is the content. Both callers
    // are colour controls that only ever render inside the manager's own column — the swatch grid
    // in `ManagerColorPicker`, and the biome vocabulary's combined trigger in
    // `EnvironmentsBrowserView`, which is the seventh hand-written positioning copy this change
    // converted. Widening this to the scroller list would not be a tidy-up: a colour popover
    // opened from a row inside `.manager-table-scroll` would then be clipped to that scroller
    // rather than to the column, and the palette is taller than a table row's scroller is.
    why: 'the manager colour picker and the biome colour popover, which render in the manager column and nowhere else',
  },
  {
    name: 'PICKER_SCROLLER_SELECTOR',
    value: PICKER_SCROLLER_SELECTOR,
    expected:
      '.admin-main, .manager-main, .manager-table-scroll, ' +
      '.manager-travel-parties-content, .manager-travel-parties',
    callers: [['src/ui/svelte/components/SearchablePopover.svelte', 'bounds = pickerScrollerBounds']],
    // THE SCROLLER LIST PLUS THE PARTIES PANE'S OWN SCROLLER (issue 1182). `SearchablePopover` is
    // the primitive behind every travel-actor, realm-override, tag and book picker, and one of its
    // call sites is a party card in World > Parties. That pane scrolls ITSELF rather than sitting
    // inside `.manager-table-scroll`, so a walk that knows only the three manager boxes falls
    // through the pane to the shell and lays a card's picker out past the pane's right edge —
    // which is the defect issue 1182 filed. `-content` is the inner element and the one that
    // actually scrolls; `.manager-travel-parties` is its container and is kept as the fallback for
    // a render in which the inner element is absent. A substring pin cannot tell the two apart,
    // because the shorter string is a prefix of the longer, which is why this one is exact.
    why: 'every SearchablePopover picker, including the party card pickers in World > Parties',
  },
];

describe('the overlay clipping boundaries', () => {
  for (const boundary of BOUNDARIES) {
    it(`${boundary.name} still names every box it clips against`, () => {
      assert.equal(
        boundary.value,
        boundary.expected,
        `\`${boundary.name}\` has changed. It bounds ${boundary.why}, and every class in it is a ` +
          'box one of those surfaces can be inside — so a member removed here is a panel allowed ' +
          'to lay itself out past an edge it used to stop at, silently, in a browser, at one ' +
          'scroll position. If the change is intended, restate the value here WITH the reason ' +
          'the surface no longer needs that ancestor; do not relax the assertion.'
      );
    });
  }

  it('the picker walk is the manager walk plus the parties pane, not a second copy of it', () => {
    // DERIVED, so the two constants cannot drift apart. `PICKER_SCROLLER_SELECTOR` is written out
    // in full rather than composed from `MANAGER_SCROLLER_SELECTOR`, which means a class added to
    // the manager walk for a new scroller reaches `IconPicker` and `EssenceSourceSelector` and
    // silently does NOT reach `SearchablePopover` — the primitive with the most call sites of the
    // three. This is the assertion that reds on that, and it is the reason the exact pins above
    // are not the whole of the contract.
    assert.equal(
      PICKER_SCROLLER_SELECTOR,
      `${MANAGER_SCROLLER_SELECTOR}, .manager-travel-parties-content, .manager-travel-parties`,
      'the picker walk is no longer the manager walk extended. Either a manager scroller was ' +
        'added without reaching the pickers, or the picker list was edited independently — in ' +
        'both cases the two lists now disagree about which boxes clip an overlay, and which ' +
        'answer a panel gets depends on which component opened it.'
    );
  });

  it('every boundary is still the default its callers take', () => {
    // A VALUE PIN ALONE IS SATISFIED BY A CONSTANT NOTHING IMPORTS. These constants exist only as
    // defaults on a `bounds` prop, so the pins above are a contract about dead configuration
    // unless the components still take them — and "still takes it" is exactly what a refactor
    // that inlines a boundary back into a component would break while leaving the constant in
    // place and correct.
    const missing = [];
    for (const { name, callers } of BOUNDARIES) {
      for (const [file, binding] of callers) {
        const source = readFileSync(join(repoRoot, file), 'utf8');
        if (!source.includes(binding)) missing.push(`${file}: ${binding} (for ${name})`);
      }
    }

    assert.deepEqual(
      missing,
      [],
      'these components no longer take the shipped boundary, so the value pins above are ' +
        'asserting facts about constants that bound nothing:\n  ' +
        missing.join('\n  ')
    );
  });
});

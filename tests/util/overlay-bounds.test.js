/** THE CLIPPING BOUNDARIES ARE VALUES NOW, SO THEY NEED VALUE PINS (issue 1500). */
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

/** The three shipped boundaries, each with the components that are clipped by it. */
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
    // places.
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
    // DELIBERATELY NARROWER THAN THE ONE ABOVE, and the narrowness is the content.
    why: 'the manager colour picker and the biome colour popover, which render in the manager column and nowhere else',
  },
  {
    name: 'PICKER_SCROLLER_SELECTOR',
    value: PICKER_SCROLLER_SELECTOR,
    expected:
      '.admin-main, .manager-main, .manager-table-scroll, ' +
      '.manager-travel-parties-content, .manager-travel-parties',
    callers: [['src/ui/svelte/components/SearchablePopover.svelte', 'bounds = pickerScrollerBounds']],
    // THE SCROLLER LIST PLUS THE PARTIES PANE'S OWN SCROLLER (issue 1182).
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
    // DERIVED, so the two constants cannot drift apart.
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
    // A VALUE PIN ALONE IS SATISFIED BY A CONSTANT NOTHING IMPORTS.
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

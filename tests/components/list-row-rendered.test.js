/**
 * Issue 1778 — ListRow's selectable form, measured in Chromium: the card layout's button keeps its
 * content's height, a default row's button outgrows Foundry's fixed button height, a focused row's
 * ring sits inside the row where a scrolling list cannot clip it, and a truncated name keeps 6ch
 * before its badges wrap beneath it. Issue 2547: an untruncated name's badges follow the name.
 * Issue 2793: a point on the aside presses the button. Issue 2843: a point on a `trailing` control
 * reaches it, and on content in `leading`, `badges` and `meta` reaches that content.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-row-rendered-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const open = () => {};
const CONTROL =
  '<button type="button" data-keyboard-focus="true" class="probe-control">Edit</button>';

/** The rows measured below, by the case each is placed in. */
const CASES = Object.freeze({
  card: {
    name: 'Moonlit Glade',
    layout: 'card',
    onOpen: open,
    meta: snippet('<span>Forest, three tasks</span>'),
  },
  tall: {
    name: 'Moonlit Glade',
    density: 'default',
    onOpen: open,
    leading: snippet('<span class="probe-leading"></span>'),
    children: snippet('<span>A clearing under the old oaks,<br>where moonflowers open.</span>'),
  },
  focus: { name: 'Healing Potion', onOpen: open, selected: false },
  floor: {
    name: 'Forge a Pattern-Welded Blade of the Deep Seam',
    truncateName: true,
    onOpen: open,
    badges: snippet(`<span class="probe-badges">${'<span></span>'.repeat(3)}</span>`),
  },
  // Issue 2547: an untruncated name, its badges after it.
  untruncated: {
    name: 'Moonlit Glade',
    onOpen: open,
    badges: snippet(`<span class="probe-badges">${'<span></span>'.repeat(2)}</span>`),
  },
  railName: {
    name: 'Forge a Pattern-Welded Blade of the Deep Seam',
    onOpen: open,
    badges: snippet(`<span class="probe-badges">${'<span></span>'.repeat(2)}</span>`),
  },
  // Issue 2321: a read-only row and an opening one, side by side in one cross-reference list.
  still: { name: 'Carve Bone Idol', detail: 'Recipe', truncateName: true, detailAlign: 'end' },
  opening: {
    name: 'Carve Bone Idol',
    detail: 'Recipe',
    truncateName: true,
    detailAlign: 'end',
    onOpen: open,
    inset: 'row',
  },
  longDetail: {
    name: 'Harvest Beast',
    detail: 'A gathering task drawn from the deep seam of the northern ridge',
    truncateName: true,
    detailAlign: 'end',
    onOpen: open,
    inset: 'row',
  },
  // Issue 2793: the aside the published seam fills, beneath the overlay.
  aside: {
    name: 'Moonpetal tincture',
    onOpen: open,
    aside: snippet('<div class="probe-aside"><span>Stage 2 of 3</span></div>'),
  },
  // Issue 2843: the control the published seam fills `trailing` with, with `onOpen` and an aside,
  // and bare in a row with no form; and content with a native `title` in each slot.
  trailing: { name: 'Moonpetal tincture', onOpen: open, trailing: snippet(CONTROL) },
  trailingAside: {
    name: 'Moonpetal tincture',
    onOpen: open,
    aside: snippet('<div class="probe-aside"><span>Stage 2 of 3</span></div>'),
    trailing: snippet(CONTROL),
  },
  bareTrailing: { name: 'Ember salt reserve', trailing: snippet(CONTROL) },
  trailingDisabled: {
    name: 'Moonpetal tincture',
    onOpen: open,
    disabled: true,
    trailing: snippet(CONTROL),
  },
  hints: {
    name: 'Moonpetal tincture',
    onOpen: open,
    leading: snippet('<span class="probe-hint" title="A leading hint">L</span>'),
    badges: snippet('<span class="probe-hint" title="A badges hint">B</span>'),
    meta: snippet('<span class="probe-hint" title="A meta hint">M</span>'),
    aside: snippet('<div class="probe-aside"><span class="probe-hint">A</span></div>'),
  },
});

/**
 * Core first, with Foundry's fixed button height in its own layer; the module sheet in
 * `layer(modules)`; the mark's scoped styles unlayered.
 */
const page = (
  markup,
  sheet = readStylesheet()
) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${sheet}}</style>
<style>${scopedComponentCss(resolve(repoRoot, component('Medallion'))).css}</style>
<style>:root{--font-primary:Arial,sans-serif}
.probe-leading{display:block;width:56px;height:56px}
.probe-badges{display:flex;gap:4px}.probe-badges>span{display:block;width:48px;height:14px}
.probe-hint{display:inline-block;min-width:14px;min-height:14px}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  <div data-case="card" style="width:220px">${markup.card}</div>
  <div data-case="tall" style="width:320px">${markup.tall}</div>
  <div data-case="scroller" style="overflow-y:auto;width:320px;height:120px">${markup.focus}</div>
  <div data-case="narrow" style="width:220px">${markup.floor}</div>
  <div data-case="wide" style="width:360px">${markup.floor}</div>
  <div data-case="untruncated" style="width:360px">${markup.untruncated}</div>
  <div data-case="rail" style="width:200px">${markup.railName}</div>
  <div data-case="still" style="width:320px">${markup.still}</div>
  <div data-case="opening" style="width:320px">${markup.opening}</div>
  <div data-case="long-detail" style="width:320px">${markup.longDetail}</div>
  <div data-case="aside" style="width:320px">${markup.aside}</div>
  <div data-case="trailing" style="width:320px">${markup.trailing}</div>
  <div data-case="trailing-aside" style="width:320px">${markup.trailingAside}</div>
  <div data-case="bare-trailing" style="width:320px">${markup.bareTrailing}</div>
  <div data-case="trailing-disabled" style="width:320px">${markup.trailingDisabled}</div>
  <div data-case="hints" style="width:320px">${markup.hints}</div>
</div></body></html>`;

/** The rule that lifts a trailing wrapper and the button's children above the button's overlay. */
const LIFT =
  '.fabricate-list-row > .fabricate-list-row-trailing,\n.fabricate-list-row > .fabricate-list-row-open > * {';

let browser;
let tab;
let unlifted;

before(async () => {
  const markup = {};
  await harness.setup();
  try {
    for (const [key, props] of Object.entries(CASES)) {
      markup[key] = (await harness.mount(props)).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  // Tall enough to hold every case, which `elementFromPoint` needs: it answers null off-screen.
  tab = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  // The same page without the `z-index: 2` rule on a trailing wrapper, the negative control.
  const sheet = readStylesheet();
  assert.equal(sheet.split(LIFT).length - 1, 1, 'the rule the control drops is in the sheet once');
  const lifted = sheet.replace(LIFT, '.fabricate-list-row > .fabricate-list-row-open > * {');
  assert.notEqual(lifted, sheet, 'and the control changed the sheet');
  unlifted = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await unlifted.setContent(page(markup, lifted), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** Whether `inner` lies within `outer`, to a hundredth of a pixel. */
const within = (inner, outer) =>
  ['left', 'top'].every((side) => inner[side] >= outer[side] - 0.01) &&
  ['right', 'bottom'].every((side) => inner[side] <= outer[side] + 0.01);

describe('ListRow selectable form, rendered (issue 1778)', () => {
  it("keeps the card layout's button the height of its content", async () => {
    const card = await tab.evaluate(() => {
      const button = document.querySelector('[data-case="card"] .fabricate-list-row-open');
      const name = button.querySelector('.fabricate-list-row-name').getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom, nameBottom: name.bottom };
    });
    assert.ok(card.height > 0, 'a zero flex basis in the column collapsed the button');
    assert.ok(
      card.bottom >= card.nameBottom - 0.01,
      `the name overflows a ${card.height}px button`
    );
  });

  it("grows a default row's button past Foundry's fixed button height to hold its content", async () => {
    const tall = await tab.evaluate(() => {
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const button = document.querySelector('[data-case="tall"] .fabricate-list-row-open');
      return { button: box(button), children: [...button.children].map(box) };
    });
    assert.equal(tall.children.length, 2, 'the leading mark and the body');
    for (const child of tall.children) {
      assert.ok(
        within(child, tall.button),
        `${JSON.stringify(child)} leaves the button ${JSON.stringify(tall.button)}`
      );
    }
  });

  it('rings a focused row inside the row, where the list scrolling around it cannot clip it', async () => {
    await tab.keyboard.press('Tab');
    await tab.focus('[data-case="scroller"] .fabricate-list-row-open');
    const ring = await tab.evaluate(() => {
      const px = (value) => Number.parseFloat(value) || 0;
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const button = document.querySelector('[data-case="scroller"] .fabricate-list-row-open');
      const row = button.parentElement;
      const scroller = row.parentElement;
      const overlay = getComputedStyle(button, '::after');
      // The overlay is placed against the row's padding box; its outline reaches past its edge
      // by the offset plus the width.
      const padding = box(row);
      padding.left += row.clientLeft;
      padding.top += row.clientTop;
      padding.right = padding.left + row.clientWidth;
      padding.bottom = padding.top + row.clientHeight;
      const reach = px(overlay.outlineOffset) + px(overlay.outlineWidth);
      const clip = box(scroller);
      clip.left += scroller.clientLeft;
      clip.top += scroller.clientTop;
      clip.right = clip.left + scroller.clientWidth;
      clip.bottom = clip.top + scroller.clientHeight;
      return {
        focusVisible: button.matches(':focus-visible'),
        ownOutline: getComputedStyle(button).outlineStyle,
        ringStyle: overlay.outlineStyle,
        ring: {
          left: padding.left + px(overlay.left) - reach,
          top: padding.top + px(overlay.top) - reach,
          right: padding.right - px(overlay.right) + reach,
          bottom: padding.bottom - px(overlay.bottom) + reach,
        },
        row: box(row),
        clip,
      };
    });
    assert.equal(ring.focusVisible, true, 'the row took keyboard focus');
    assert.deepEqual(
      [ring.ownOutline, ring.ringStyle],
      ['none', 'solid'],
      'one ring, the overlay’s'
    );
    assert.ok(within(ring.ring, ring.row), `the ring ${JSON.stringify(ring)} leaves the row`);
    assert.ok(within(ring.ring, ring.clip), 'and the scrolling list clips it');
  });

  it('presses the button from a point on the aside, which sits beneath its overlay', async () => {
    const hit = await tab.evaluate(() => {
      const row = document.querySelector('[data-case="aside"] .fabricate-list-row');
      const at = (element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return document.elementFromPoint(left + width / 2, top + height / 2);
      };
      const button = row.querySelector('.fabricate-list-row-open');
      return {
        aside: at(row.querySelector(':scope .probe-aside span')) === button,
        name: at(row.querySelector('.fabricate-list-row-name')).className,
      };
    });
    assert.equal(hit.aside, true, 'a point on the aside’s text lands on the button');
    assert.match(hit.name, /fabricate-list-row-name/, 'the name stays above the overlay');
  });

  it('draws the aside beneath the button, across the row’s inner width', async () => {
    const box = await tab.evaluate(() => {
      const row = document.querySelector('[data-case="aside"] .fabricate-list-row');
      const style = getComputedStyle(row);
      const rect = (element) => element.getBoundingClientRect();
      const inner =
        rect(row).width -
        ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce(
          (sum, side) => sum + Number.parseFloat(style[side]),
          0
        );
      const aside = rect(row.querySelector(':scope > .fabricate-list-row-aside'));
      const button = rect(row.querySelector(':scope > .fabricate-list-row-open'));
      return { top: aside.top, bottom: button.bottom, width: aside.width, inner };
    });
    assert.ok(box.top >= box.bottom - 0.01, `the aside ${JSON.stringify(box)} starts under it`);
    assert.ok(Math.abs(box.width - box.inner) < 0.5, `and spans ${box.inner}px`);
  });

  it('keeps a truncated name 6ch wide, wrapping its badges beneath it rather than past the row', async () => {
    const measure = (id) =>
      tab.evaluate((caseId) => {
        const row = document.querySelector(`[data-case="${caseId}"] .fabricate-list-row`);
        const head = row.querySelector('.fabricate-list-row-head');
        const name = head.querySelector('.fabricate-list-row-name');
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:6ch';
        name.append(probe);
        const sixCh = probe.getBoundingClientRect().width;
        probe.remove();
        const named = name.getBoundingClientRect();
        const badges = head.querySelector('.fabricate-list-row-badges').getBoundingClientRect();
        return {
          sixCh,
          nameWidth: named.width,
          badgesBelow: badges.top >= named.bottom - 0.01,
          overflow: head.scrollWidth - head.clientWidth,
        };
      }, id);
    const narrow = await measure('narrow');
    const wide = await measure('wide');
    assert.ok(narrow.sixCh > 0, 'the 6ch probe measured nothing');
    assert.ok(narrow.nameWidth >= narrow.sixCh - 0.01, `the name shrank to ${narrow.nameWidth}px`);
    assert.equal(narrow.badgesBelow, true, 'the badges wrap beneath the name');
    assert.ok(narrow.overflow <= 0, `the head overflows the row by ${narrow.overflow}px`);
    assert.equal(wide.badgesBelow, false, 'where the line has room, the badges stay beside it');
    assert.ok(wide.nameWidth >= wide.sixCh - 0.01);
  });
});

describe('ListRow badges after an untruncated name, rendered (issue 2547)', () => {
  /** The head's gap and the name's and badges' boxes, for one case. */
  const head = (caseId) =>
    tab.evaluate((id) => {
      const box = (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const row = document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
      const headEl = row.querySelector('.fabricate-list-row-head');
      // The name's text, not its box: a growing box would close the gap however far the text ends.
      const text = document.createRange();
      text.selectNodeContents(headEl.querySelector('.fabricate-list-row-name'));
      return {
        gap: Number.parseFloat(getComputedStyle(headEl).columnGap),
        name: box(text),
        badges: box(headEl.querySelector('.fabricate-list-row-badges')),
        overflow: headEl.scrollWidth - headEl.clientWidth,
      };
    }, caseId);

  it('sets the badges beside the name, one head gap after it, where the line has room', async () => {
    const { gap, name, badges } = await head('untruncated');
    assert.ok(gap > 0, 'the head gap measured nothing');
    assert.ok(badges.top < name.bottom, 'the badges share the name’s line');
    assert.ok(
      badges.left - name.right <= gap + 0.01,
      `the badges start ${badges.left - name.right}px after the name, past the ${gap}px gap`
    );
  });

  it('wraps the badges beneath a long name in a narrow rail without overflowing it', async () => {
    const { name, badges, overflow } = await head('rail');
    assert.ok(badges.top >= name.bottom - 0.01, 'the badges wrap beneath the name');
    assert.ok(overflow <= 0, `the head overflows the row by ${overflow}px`);
  });
});

describe('ListRow inset and detailAlign, rendered (issue 2321)', () => {
  /** A row's border box and the right edge of its content box. */
  const rowBox = (caseId) =>
    tab.evaluate((id) => {
      const row = document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
      const box = row.getBoundingClientRect();
      const paddingRight = Number.parseFloat(getComputedStyle(row).paddingRight);
      const detail = row.querySelector('.fabricate-list-row-detail');
      const area = detail.parentElement.getBoundingClientRect();
      return {
        height: box.height,
        contentRight: box.left + row.clientLeft + row.clientWidth - paddingRight,
        detailRight: detail.getBoundingClientRect().right,
        detailWidth: detail.getBoundingClientRect().width,
        areaWidth: area.width,
        clipped: detail.scrollWidth > detail.clientWidth,
      };
    }, caseId);

  it('stands a dense form given `inset="row"` the height of a read-only dense row', async () => {
    const still = await rowBox('still');
    const opening = await rowBox('opening');
    assert.ok(still.height > 0, 'the read-only row measured nothing');
    assert.ok(
      Math.abs(opening.height - still.height) < 0.01,
      `the opening row is ${opening.height}px against the read-only ${still.height}px`
    );
  });

  it("holds an end-aligned detail at the row's content edge, ellipsizing at 40%", async () => {
    for (const id of ['still', 'opening', 'long-detail']) {
      const row = await rowBox(id);
      assert.ok(
        Math.abs(row.detailRight - row.contentRight) < 0.5,
        `${id}: the detail ends at ${row.detailRight}px, the content edge at ${row.contentRight}px`
      );
    }
    const long = await rowBox('long-detail');
    assert.equal(long.clipped, true, 'the long detail ellipsizes');
    assert.ok(
      Math.abs(long.detailWidth - long.areaWidth * 0.4) < 0.5,
      `the clipped detail is ${long.detailWidth}px of ${long.areaWidth}px`
    );
  });
});

describe('ListRow slots, rendered (issue 2843)', () => {
  /** What the element at the centre of `selector` in `caseId` is, in `page`: the control or the button. */
  const hitAt = (view, caseId, selector) =>
    view.evaluate(
      ({ id, target }) => {
        const row = document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
        const element = row.querySelector(target);
        const { left, top, width, height } = element.getBoundingClientRect();
        const hit = document.elementFromPoint(left + width / 2, top + height / 2);
        return {
          element: hit === element,
          button: hit === row.querySelector(':scope > .fabricate-list-row-open'),
        };
      },
      { id: caseId, target: selector }
    );

  for (const caseId of ['trailing', 'trailing-aside']) {
    it(`reaches a trailing control from a point on it in ${caseId}, above the button’s overlay`, async () => {
      assert.deepEqual(await hitAt(tab, caseId, '.probe-control'), {
        element: true,
        button: false,
      });
    });
  }

  it('hits the button instead where the page drops the rule that lifts the trailing wrapper', async () => {
    for (const caseId of ['trailing', 'trailing-aside']) {
      assert.deepEqual(await hitAt(unlifted, caseId, '.probe-control'), {
        element: false,
        button: true,
      });
    }
  });

  it('draws the trailing wrapper a child of the root after the button, and a bare trailing as a child of the root', async () => {
    const order = await tab.evaluate(() => {
      const rowOf = (id) => document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
      const follows = (first, second) =>
        Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      return ['trailing', 'trailing-aside'].map((id) => {
        const row = rowOf(id);
        const button = row.querySelector(':scope > .fabricate-list-row-open');
        const wrapper = row.querySelector('.fabricate-list-row-trailing');
        return {
          wrapperIsChild: wrapper.parentElement === row,
          holdsControl: wrapper.querySelector('.probe-control') !== null,
          buttonFirst: follows(button, wrapper),
          buttonHoldsNone: button.querySelector('.probe-control') === null,
        };
      });
    });
    for (const drawn of order) {
      assert.deepEqual(drawn, {
        wrapperIsChild: true,
        holdsControl: true,
        buttonFirst: true,
        buttonHoldsNone: true,
      });
    }
    const bare = await tab.evaluate(() => {
      const row = document.querySelector('[data-case="bare-trailing"] .fabricate-list-row');
      const control = row.querySelector('.probe-control');
      return {
        child: control.parentElement === row,
        wrapped: row.querySelector('.fabricate-list-row-trailing') !== null,
        form: row.classList.contains('is-form'),
      };
    });
    assert.deepEqual(bare, { child: true, wrapped: false, form: false });
  });

  it('dims a disabled row on its root, so an enabled trailing control inside it dims too', async () => {
    const drawn = await tab.evaluate(() => {
      const row = document.querySelector('[data-case="trailing-disabled"] .fabricate-list-row');
      const control = row.querySelector('.probe-control');
      return {
        rootOpacity: getComputedStyle(row).opacity,
        controlOpacity: getComputedStyle(control).opacity,
        buttonDisabled: row.querySelector(':scope > .fabricate-list-row-open').disabled,
        controlDisabled: control.disabled,
        inside: row.contains(control),
      };
    });
    assert.deepEqual(drawn, {
      rootOpacity: '0.62',
      controlOpacity: '1',
      buttonDisabled: true,
      controlDisabled: false,
      inside: true,
    });
  });

  it('shows the title of content in leading, badges and meta, and presses the button from the same point in the aside', async () => {
    for (const hint of ['leading', 'badges', 'meta']) {
      const hit = await tab.evaluate((slot) => {
        const row = document.querySelector('[data-case="hints"] .fabricate-list-row');
        const element = row.querySelector(`.fabricate-list-row-${slot} .probe-hint`);
        const { left, top, width, height } = element.getBoundingClientRect();
        return document.elementFromPoint(left + width / 2, top + height / 2) === element;
      }, hint);
      assert.equal(hit, true, `a point on the ${hint} content lands on it, where its title shows`);
    }
    assert.deepEqual(await hitAt(tab, 'hints', '.fabricate-list-row-aside .probe-hint'), {
      element: false,
      button: true,
    });
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

test('manager establishes a positioning root for portaled picker overlays', () => {
  const match = css.match(/\.fabricate-manager \{[\s\S]*?\}/);

  assert.ok(match, 'manager root block should exist');
  const block = match[0];

  assert.ok(block.includes('position: relative;'), 'manager root should anchor absolutely positioned overlays');
  assert.ok(block.includes('isolation: isolate;'), 'manager root should isolate picker z-index from host chrome');
});

test('essence icon picker popover uses an absolute layered overlay', () => {
  // RETARGETED (issue 1503). Both pickers render through `SearchablePopover` now, so the panel
  // node carries `fabricate-picker-popover manager-travel-popover` as well as each caller's own
  // pair — and the caller's own panel block, which used to own these three declarations, is gone.
  // The panel box is the SHARED primitive's, and this is where that is pinned.
  //
  // `z-index` is the one figure that moved rather than merely relocating: 120 was the caller's,
  // 4000 is the shared panel's, so the panel now stacks above anything between the two. Issue
  // 1503's real-browser enumeration measures that band (`manager-layout.test.js`) rather than
  // asserting it is empty; what this clause pins is the value itself.
  //
  // Issue 1470 had re-rooted the old rule off `.fabricate-manager` and onto the namespace class
  // each primitive writes on the panel it portals; the same principle holds here, one primitive
  // further out.
  const match = css.match(/\.fabricate-picker-popover\.manager-travel-popover \{[\s\S]*?\}/);

  assert.ok(match, 'the shared picker panel block should exist');
  const block = match[0];

  assert.ok(block.includes('position: absolute;'), 'popover should be removed from scroll-layout flow and anchored to its trigger');
  assert.ok(block.includes('z-index: 4000;'), 'the panel takes the SHARED stacking rung, not the caller`s old 120');
  assert.ok(block.includes('overflow: hidden;'), 'popover should clip its own interior scroll region');
  // The governing width ceiling, which is what bounds the inline `width: Npx` the layout writes
  // (criterion 3(a)(i)). It is also the reason a caller asking for more than 340 gets 340.
  assert.ok(block.includes('max-width: 340px;'), 'the shared panel is what bounds the inline width the layout writes');
});

test('essence icon picker options use a fixed icon column with compact padding', () => {
  // DEEPENED (issue 1503). The row is the primitive's element now and carries
  // `manager-travel-option` beside `essence-icon-picker-option`; the shared row rule ties the
  // caller's old (0,2,0) and wins on source order, so the box the caller keeps is written at
  // (0,3,0) — the caller's own two roots on the panel compound.
  const match = css.match(
    /\.fabricate-icon-picker-popover\.essence-icon-picker-popover \.essence-icon-picker-option \{[\s\S]*?\}/
  );

  assert.ok(match, 'icon picker option layout block should exist');
  const block = match[0];

  assert.ok(block.includes('grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr);'), 'option rows should reserve a fixed icon column');
  assert.ok(block.includes('padding: var(--fab-space-1) var(--fab-space-2);'), 'option rows should use compact row padding');
  // Was `min-height: 34px`, pinned as "a stable row height" — which is how a row 4px too short
  // for its own 28px chip stayed green for so long. The height is DERIVED now (issue 1280); the
  // arithmetic behind the token is asserted at the bottom of this file.
  assert.ok(block.includes('min-height: var(--fab-icon-picker-row);'), 'option rows should derive their height from the chip they contain');
});

test('essence icon picker trigger shares the option icon column and padding', () => {
  const match = css.match(
    /\.fabricate-icon-picker \.essence-icon-picker-trigger \{[\s\S]*?\}/
  );

  assert.ok(match, 'icon picker trigger block should exist');
  const block = match[0];

  assert.ok(
    block.includes('grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr) 16px;'),
    'trigger should share the icon column with option rows'
  );
  assert.ok(
    block.includes('min-height: var(--fab-icon-picker-row);'),
    'the trigger regressed alongside the row at 36px for the same 38px of content, so it is pinned too'
  );
  assert.ok(
    block.includes('padding: var(--fab-space-1) var(--fab-space-2);'),
    'trigger should use the same compact padding as picker rows'
  );
});

// --- Row metrics (issue 1280) -----------------------------------------------------------
// The row must be able to CONTAIN the chip it draws. This is arithmetic, not taste, and it is
// guarded because it silently broke once: the chip is 28px, the row carried `min-height: 34px`,
// and 4px of padding plus a 1px border on each edge needs 38px. `align-items: center` centres
// nothing that overflows its track, so the chip spilled past the row's padding AND its border to
// sit 1px from the outer edge — which reads as two faults at once, icons that are not vertically
// centred and rows with no bottom padding. The assertions above pin the token; these pin that the
// token's arithmetic actually holds.

function declaration(selector, property) {
  const block = css.split(selector)[1];
  assert.ok(block, `selector not found: ${selector}`);
  const match = block.slice(0, block.indexOf('}')).match(new RegExp(`${property}:\\s*([^;]+);`));
  assert.ok(match, `${selector} declares no ${property}`);
  return match[1].trim();
}

function token(name) {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `token not declared: ${name}`);
  return match[1].trim();
}

test('the row height is DERIVED from the chip, never restated as a literal', () => {
  assert.equal(token('--fab-icon-picker-chip'), '28px');
  assert.equal(
    token('--fab-icon-picker-row'),
    'calc(var(--fab-icon-picker-chip) + (2 * var(--fab-space-1)) + 2px)',
    'the row must be computed from the chip, its vertical padding, and its border'
  );
});

test('the row arithmetic actually holds: chip + padding + border fits', () => {
  const chip = Number.parseFloat(token('--fab-icon-picker-chip'));
  const padding = Number.parseFloat(token('--fab-space-1'));
  const border = 1;
  // What the derived token resolves to, computed here independently of the calc() string so a
  // rewritten-but-wrong calc is caught rather than merely a changed one.
  assert.equal(chip + 2 * padding + 2 * border, 38);
});

test('both the option row and the trigger size themselves from that token', () => {
  // The trigger regressed alongside the row, at 36px for the same 38px of content, so both are
  // pinned: fixing one and leaving the other is exactly what happened last time.
  for (const selector of [
    '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option {',
    '.fabricate-icon-picker .essence-icon-picker-trigger {',
  ]) {
    assert.equal(
      declaration(selector, 'min-height'),
      'var(--fab-icon-picker-row)',
      `${selector} must derive its height, not restate it`
    );
  }
});

test('the chip column is the chip token too, so the grid cannot narrow it independently', () => {
  for (const selector of [
    '.fabricate-icon-picker-popover.essence-icon-picker-popover .essence-icon-picker-option {',
    '.fabricate-icon-picker .essence-icon-picker-trigger {',
  ]) {
    assert.match(
      declaration(selector, 'grid-template-columns'),
      /^var\(--fab-icon-picker-chip\)/,
      `${selector} must size its first column from the chip token`
    );
  }
});

test('the chip itself is square and sized from the token', () => {
  // TWO selectors share this block, and both are load-bearing (issue 1470): the chip is painted
  // once in the trigger, which stays inside the picker's own root, and once per option row, which
  // travels with the portaled panel and therefore loses that root. A single-rooted rule would
  // size one of the two and leave the other at its intrinsic size.
  const selector = '.fabricate-icon-picker-popover .essence-icon-picker-preview {';
  assert.ok(
    /\.fabricate-icon-picker \.essence-icon-picker-preview,\s*\.fabricate-icon-picker-popover \.essence-icon-picker-preview \{/.test(
      css
    ),
    'the chip rule must be written at BOTH of the picker’s namespace roots, or the trigger chip ' +
      'and the option-row chip stop being the same size outside the manager'
  );
  assert.equal(declaration(selector, 'width'), 'var(--fab-icon-picker-chip)');
  assert.equal(declaration(selector, 'height'), 'var(--fab-icon-picker-chip)');
});

// --- What the shared primitive now owns (issue 1503) ------------------------------------
// Three rules the pickers depend on that no frame can photograph, pinned in this file's own
// idiom — a sheet-TEXT read of the global sheet — because that is the only instrument that
// reaches a `styles/fabricate.css` rule at all. A mounted harness compiles components with
// `css: 'injected'` and never loads this sheet (`tests/helpers/scoped-component-css.js`), so a
// `document.styleSheets` walk cannot see any of them, and happy-dom cannot compute a cascade.
//
// What this file CANNOT do is witness a rendered cascade: it reads rule text, not a resolved
// winner. The composition these rules take part in — the active outline over the selected fill,
// the list's computed `display` — is proved in the real browser by `manager-layout.test.js`.

test('the keyboard cursor is an inset outline, and composes over the fill it does not own', () => {
  // CRITERION 3(b). The cursor cannot be photographed: the View Lab's capture verbs are
  // `Enter`/`Space` only, so no case can press an arrow key, and `activeIndex` starts at the -1
  // sentinel — no row carries the marker until one is pressed. So the RULE is pinned here and
  // its COMPOSITION is proved in the real browser.
  //
  // The three properties this asserts are the whole design decision. The interaction ladder has
  // three FILL rungs — rest, hover, pressed/selected — and a listbox that also marks a current
  // value has spent all three. A keyboard cursor is a fourth, orthogonal state (a row can be
  // active AND selected AND hovered at once), so it takes a different CHANNEL rather than a
  // fourth rung. Declaring a `background` or a `border-color` here would be that fourth rung,
  // and on `IconPicker` it would land on the pinned resolved row — the row that IS the selected
  // one — erasing exactly the fill a GM needs to see. So their ABSENCE is asserted, not implied.
  //
  // The negative offset is the second half: it draws the ring INSIDE the row's border box, which
  // is what tells it apart from the positive-offset focus ring `.fabricate [tabindex]:focus-visible`
  // paints. Options never take DOM focus, so the two never collide — but the sign is what makes
  // that legible rather than lucky.
  const selector =
    ".fabricate-picker-popover.manager-travel-popover .manager-travel-option[data-active-option='true']";
  assert.ok(
    css.includes(`${selector} {`),
    `the active-option rule must be written at exactly \`${selector}\` — (0,4,0), so it out-ranks ` +
      'a caller`s deepened state rule, and rooted at the primitive`s own class, which is the ' +
      'only root a shared rule may double'
  );
  const block = css.slice(css.indexOf(`${selector} {`));
  const body = block.slice(0, block.indexOf('}'));
  assert.match(body, /outline:\s*2px solid var\(--fab-accent\);/, 'the cursor is an accent outline');
  assert.match(body, /outline-offset:\s*-2px;/, 'the outline is INSET, which is what tells it apart from the focus ring');
  assert.ok(
    !/background:/.test(body),
    'the cursor declares a `background`, so it would REPLACE the selected fill on the row that ' +
      'is both — which is the defect the outline channel exists to avoid'
  );
  assert.ok(
    !/border-color:/.test(body),
    'the cursor declares a `border-color`, so it would overwrite the selected edge rather than ' +
      'composing over it'
  );
});

test('the grid form is EMITTED by the sheet, not by an inline style', () => {
  // CRITERION 3(a)(i). `anchoredPopover` writes the list's whole `style` attribute with
  // `setAttribute('style', …)` whenever a caller registers `targets.list`, so neither the grid
  // template nor the column count may ride an inline style — they would be replaced on the first
  // measure. The primitive stamps `data-picker-as` and `data-picker-columns` on the list element
  // instead, and these two rungs are what paint from them.
  //
  // Without them `as="grid"` would only re-map the arrow keys: the shared list rule declares
  // `display: flex`, which ties the caller's old (0,2,0) rule and wins on source order, so the
  // source picker's two-column panel would render as a single column.
  const display = css.match(
    /\.fabricate-picker-popover \.manager-travel-popover-options\[data-picker-as='grid'\] \{[\s\S]*?\}/
  );
  assert.ok(display, 'the grid form must have a `display: grid` rung keyed on `data-picker-as`');
  assert.ok(display[0].includes('display: grid;'), 'the grid form must actually declare `display: grid`');

  const columns = css.match(
    /\.fabricate-picker-popover \.manager-travel-popover-options\[data-picker-columns='2'\] \{[\s\S]*?\}/
  );
  assert.ok(columns, 'the two-column count must have a `grid-template-columns` rung of its own');
  assert.ok(
    columns[0].includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'the two-column rung must state the template the source picker`s panel had before it moved'
  );
});

test('the whole-row flooring counts every box the sheet puts between the rows', () => {
  // A HAND-MAINTAINED MIRROR, and this is the gate that stops it rotting (issue 1503).
  //
  // `IconPicker.measurePopoverMetrics` promises the shared panel measurements from which
  // `computeIconPickerPopoverLayout` can floor the list to a WHOLE number of rows. `rowPitch` is
  // a row's BORDER BOX (`getBoundingClientRect`) plus the list's `row-gap`, so any box the sheet
  // puts between the rows that is OUTSIDE a border box — a margin — is height the list renders
  // and the pitch cannot see. Uncounted it is height nothing knows about, and the panel clips the
  // last row by exactly that many pixels: the published AFTER frame sliced 8 of row seven's 38,
  // which is `--fab-space-2` to the pixel.
  //
  // The two facts live in different files and neither is derived from the other, so this reads
  // both: every outer margin the sheet declares on a row inside the list must be measured by the
  // component AND handed over as `listExtra`. Adding a margin rung to the sheet without measuring
  // it reds here.
  //
  // WHAT THIS CLAUSE DOES NOT DO, and why the arithmetic is not here. A text-presence check
  // proves a term is mentioned, never that the sum is right: folding the margin into
  // `chromeHeight` mentions it, and leaves the list exactly one margin too short, because chrome
  // is subtracted from the budget the floor divides while the list's height comes back as
  // `rows * pitch - trailingGap` with no term for it. That is the defect this file's earlier
  // shape was green over. The OUTCOME is pinned numerically in `tests/iconPickerPopover.test.js`
  // ("the shipped pinned-row panel resolves to seven whole rows plus the margin, exactly"), on
  // the real measured inputs, where a sign inversion in either half reds on the value 310.
  const marginRules = [
    ...css.matchAll(
      /\.fabricate-icon-picker-popover\.essence-icon-picker-popover \.essence-icon-picker-option[^{]*\{([\s\S]*?)\}/g
    ),
  ].filter((rule) => /\bmargin(-block-end|-bottom|-block|\b)/.test(rule[1]));

  assert.ok(
    marginRules.length > 0,
    'the pinned resolved row carries the extra gap that separates it from the alphabetical list, ' +
      'so this clause has something to be about; a sheet with no such margin has silently ' +
      'removed the very thing the metric below exists for'
  );

  const source = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/IconPicker.svelte'),
    'utf8'
  );
  const measure = source.slice(source.indexOf('function measurePopoverMetrics'));
  const chromeSum = measure.match(/const chromeHeight =[\s\S]*?;/);
  assert.ok(chromeSum, '`measurePopoverMetrics` still composes a `chromeHeight`');
  assert.ok(
    /getComputedStyle\([^)]*\)\.marginBottom/.test(measure),
    'the sheet gives a row inside the list an outer MARGIN, and `measurePopoverMetrics` does not ' +
      'read it at all. `rowPitch` is a border box plus `row-gap` and cannot see a margin, so the ' +
      'layout floors the list to less height than its content needs and the panel clips the last ' +
      'row by the margin'
  );
  assert.match(
    measure,
    /listExtra:\s*pinnedMargin\b/,
    'the measured margin must be handed over as `listExtra`, positively and by itself: that is ' +
      'the key `floorListToWholeRows` takes off the budget AND adds back to the list`s own height'
  );
  assert.doesNotMatch(
    chromeSum[0],
    /pinnedMargin/,
    'and it must NOT be summed into `chromeHeight` as well, which counts it against the row ' +
      'budget without ever giving the list the height to render it — the panel then keeps the ' +
      'margin as slack and clips the last row by it, exactly as it did before the metric existed'
  );
});

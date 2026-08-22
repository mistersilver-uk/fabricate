/**
 * `RowDisclosure`, the product's ONE row disclosure (issue 1096).
 *
 * `ui-integration/spec.md` §Shared product UI primitives states this control's contract in
 * normative terms — `aria-expanded`, `aria-controls` and an accessible name — and until this
 * file existed nothing held it to any of them. Its two sibling primitives (`FillBar`,
 * `ThresholdBandStrip`) each landed with a suite; this one landed with the assertion that its
 * only consumer renders SOMETHING, which cannot see a chevron that announces nothing.
 *
 * The name is the sharpest of the three requirements and the easiest to lose: this control
 * renders an icon and no text, so without `aria-label` it has NO accessible name at all and a
 * screen reader announces "button, collapsed" for every row on the screen. The name is
 * asserted to be the ROW's, not the action's, because `aria-expanded` already supplies the
 * action and "Expand Outcome preview" read under both states is wrong half the time.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-row-disclosure-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/components/RowDisclosure.svelte'],
  componentPath: 'src/ui/svelte/components/RowDisclosure.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const control = (root) => root.querySelector('.fab-row-disclosure');

describe('RowDisclosure (mounted)', () => {
  it('is a real button carrying the whole disclosure contract', async () => {
    const root = await harness.mount({
      expanded: false,
      controls: 'checks-rail-odds-body',
      label: 'Chance per outcome',
    });
    const button = control(root);
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('type'), 'button', 'never a submit inside a form');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-controls'), 'checks-rail-odds-body');
    assert.equal(
      button.getAttribute('aria-label'),
      'Chance per outcome',
      'the name is the ROW, not the action — aria-expanded supplies the rest'
    );
  });

  it('reflects the expanded state in both the attribute and the glyph', async () => {
    const collapsed = await harness.mount({ expanded: false, label: 'Outcome preview' });
    assert.equal(control(collapsed).getAttribute('aria-expanded'), 'false');
    assert.ok(!control(collapsed).classList.contains('is-expanded'));
    const collapsedIcon = collapsed.querySelector('.fab-row-disclosure > i').className;

    harness.remount();
    const expanded = await harness.mount({ expanded: true, label: 'Outcome preview' });
    assert.equal(control(expanded).getAttribute('aria-expanded'), 'true');
    assert.ok(control(expanded).classList.contains('is-expanded'));
    const expandedIcon = expanded.querySelector('.fab-row-disclosure > i').className;

    assert.notEqual(collapsedIcon, expandedIcon, 'the two states are visually distinguishable');
    // The glyph is decorative: the state is already announced by `aria-expanded`, so an
    // icon that ALSO announced it would be read twice.
    assert.equal(expanded.querySelector('.fab-row-disclosure > i').getAttribute('aria-hidden'), 'true');
  });

  it('points the collapsed chevron either way, without changing anything announced', async () => {
    const trailing = await harness.mount({ expanded: false, side: 'trailing', label: 'Row' });
    const trailingIcon = trailing.querySelector('i').className;
    harness.remount();
    const leading = await harness.mount({ expanded: false, side: 'leading', label: 'Row' });
    assert.notEqual(leading.querySelector('i').className, trailingIcon);
    assert.equal(
      control(leading).getAttribute('aria-expanded'),
      'false',
      'side is a drawing decision and nothing else'
    );
  });

  it('emits the NEXT state, so a caller assigns rather than negates', async () => {
    const seen = [];
    const collapsed = await harness.mount({
      expanded: false,
      label: 'Row',
      onToggle: (next) => seen.push(next),
    });
    control(collapsed).click();
    assert.deepEqual(seen, [true], 'pressing a collapsed row asks for open');

    harness.remount();
    const expanded = await harness.mount({
      expanded: true,
      label: 'Row',
      onToggle: (next) => seen.push(next),
    });
    control(expanded).click();
    assert.deepEqual(seen, [true, false], 'and pressing an open one asks for closed');
  });

  it('does not emit while disabled', async () => {
    const seen = [];
    const root = await harness.mount({
      expanded: false,
      disabled: true,
      label: 'Row',
      onToggle: (next) => seen.push(next),
    });
    assert.ok(control(root).disabled, 'the DOM control is genuinely disabled, not just dimmed');
    control(root).click();
    assert.deepEqual(seen, [], 'a disabled disclosure changes nothing');
  });

  it('omits aria-controls entirely rather than pointing at nothing', async () => {
    // An `aria-controls=""` is an IDREF to nowhere, which assistive technology reports as a
    // broken relationship. A caller with no stable id has a layout problem, not an ARIA one.
    const root = await harness.mount({ expanded: false, label: 'Row' });
    assert.ok(!control(root).hasAttribute('aria-controls'));
  });

  it('offers an optional test hook that is genuinely absent when unset', async () => {
    const hooked = await harness.mount({
      expanded: false,
      label: 'Row',
      dataAttr: 'data-checks-odds-disclosure',
    });
    assert.ok(control(hooked).hasAttribute('data-checks-odds-disclosure'));
    harness.remount();
    const plain = await harness.mount({ expanded: false, label: 'Row' });
    assert.ok(
      !control(plain).hasAttribute('data-checks-odds-disclosure'),
      'spread, so a selector cannot match an unhooked instance'
    );
  });

  it('carries the Foundry button reset, or the host sheet stretches it out of its row', async () => {
    // Asserted against the DECLARATION: happy-dom performs no layout, so a measured box is
    // zeros here. Foundry's own sheet centres button content and pins a fixed height, which
    // is exactly what turns a 24px chevron into a full-height block beside a row's text.
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(resolve(repoRoot, 'src/ui/svelte/components/RowDisclosure.svelte'), 'utf8')
    );
    const styleStart = source.indexOf('<style>');
    assert.notEqual(styleStart, -1, 'the component still has a scoped style block to read');
    const styles = source.slice(styleStart);
    for (const declaration of ['width: 24px;', 'height: 24px;', 'min-height: 24px;', 'padding: 0;']) {
      assert.ok(styles.includes(declaration), `the reset declares ${declaration}`);
    }
    assert.match(styles, /:focus-visible\s*\{[^}]*outline:/, 'and keeps a visible focus ring');
  });
});

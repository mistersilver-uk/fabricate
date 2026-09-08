import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMountedComponentHarness,
  PLAYER_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Standalone fixture constants (NO model imports) so the mounted graph stays on
// the harness allowlist (importing a model would hang the suite as # cancelled).
const ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }];
const RESULT = { componentId: 'out', name: 'Vigor Elixir', img: null, quantity: 1, essences: ESSENCES };
const BENCH = [{ componentId: 'emberroot', name: 'Emberroot', img: null, qty: 1 }];
const BENCH_WITH_ESSENCES = [
  { componentId: 'emberroot', name: 'Emberroot', img: null, qty: 2, essences: ESSENCES }
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alchemy-workbench-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    // The shared notice the last-brew banner composes (issue 1505) plus the tile and the label
    // the bench and the Produces heading draw (issue 1514), as ONE spread. A compiled component
    // missing from this list does not fail the suite, it HANGS it (# cancelled).
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
    'src/ui/svelte/apps/alchemy/Workbench.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/alchemy/Workbench.svelte'
});

function brewButton(target) {
  return target.querySelector('[data-alchemy-brew]');
}
function statusPill(target) {
  return target.querySelector('[data-alchemy-status]');
}

describe('Workbench (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('empty mode: status pill reflects empty and Brew is disabled', async () => {
    const target = await harness.mount({ mode: 'empty', benchEmpty: true });
    assert.match(statusPill(target).getAttribute('data-alchemy-status'), /empty/);
    assert.equal(brewButton(target).disabled, true, 'empty mode disables Brew');
  });

  it('ready mode: status names the target and Brew is enabled', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'Elixir of Vigor',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true
    });
    assert.equal(statusPill(target).getAttribute('data-alchemy-status'), 'ready');
    assert.ok(statusPill(target).textContent.includes('Elixir of Vigor'), 'status names the ready recipe');
    assert.equal(brewButton(target).disabled, false, 'ready mode enables Brew');
    assert.equal(target.querySelector('[data-alchemy-status]').getAttribute('aria-live'), 'polite');
  });

  it('assembling mode: Brew is disabled (mid-build)', async () => {
    const target = await harness.mount({
      mode: 'assembling',
      targetName: 'Elixir of Vigor',
      benchEmpty: false,
      benchChips: BENCH,
      brewEnabled: false
    });
    assert.equal(brewButton(target).disabled, true);
  });

  it('untried mode: Brew is enabled and no undiscovered recipe identity is rendered', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      brewEnabled: true
    });
    assert.equal(brewButton(target).disabled, false, 'untried can experiment');
    // The untried Produces panel must NOT confirm a reaction or name any hidden
    // recipe/result — only its own props are ever rendered.
    const html = target.innerHTML;
    assert.ok(!html.includes('SECRET_UNDISCOVERED'), 'no undiscovered recipe name leaks');
    assert.ok(!html.includes('Vigor Elixir'), 'no result is shown for an untried bench');
    assert.ok(target.querySelector('[data-alchemy-unknown]'), 'the neutral unknown-outcome card is shown');
  });

  it('brew-in-flight disables Brew even when the mode would enable it', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'X',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true,
      brewInFlight: true
    });
    assert.equal(brewButton(target).disabled, true, 'in-flight guard blocks double-submit');
  });

  // -------------------------------------------------------------------------
  // D — chip interaction event hit-tests (add / remove-one / remove-all)
  // -------------------------------------------------------------------------

  function mountChip(calls) {
    return harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      onAdd: (id) => calls.push(['add', id]),
      onRemoveOne: (id) => calls.push(['removeOne', id]),
      onRemoveAll: (id) => calls.push(['removeAll', id])
    });
  }

  it('chip body left-click ADDS one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip="emberroot"]').click();
    assert.deepEqual(calls, [['add', 'emberroot']]);
  });

  it('chip body Enter ADDS one; Shift+Enter REMOVES one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    chip.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chip.dispatchEvent(
      new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    );
    assert.deepEqual(calls, [['add', 'emberroot'], ['removeOne', 'emberroot']]);
  });

  it('chip right-click (contextmenu) REMOVES one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    chip.dispatchEvent(new globalThis.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.deepEqual(calls, [['removeOne', 'emberroot']]);
  });

  it('the `−` control REMOVES one and does NOT also add (stopPropagation)', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip-remove-one="emberroot"]').click();
    assert.deepEqual(calls, [['removeOne', 'emberroot']], 'no add fires from the − control');
  });

  it('the `×` control REMOVES all and does NOT also add (stopPropagation)', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip-remove="emberroot"]').click();
    assert.deepEqual(calls, [['removeAll', 'emberroot']], 'the × removes all and never adds');
  });

  it('Enter on the focused `×` REMOVES all and does NOT bubble to the chip-body add', async () => {
    // Regression: without the target===currentTarget guard, an Enter keydown from a
    // focused nested button bubbles to the chip-body handler, which preventDefaults
    // the button's native activation and fires onAdd — so Enter on × would ADD.
    const calls = [];
    const target = await mountChip(calls);
    const removeAll = target.querySelector('[data-alchemy-chip-remove="emberroot"]');
    // A real activation dispatches keydown (bubbling) AND the native click; the
    // guard must let the click through while ignoring the bubbled keydown.
    removeAll.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    removeAll.click();
    assert.deepEqual(calls, [['removeAll', 'emberroot']], 'Enter on × removes all and never adds');
  });

  it('Enter on the focused `−` REMOVES one and does NOT bubble to the chip-body add', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const removeOne = target.querySelector('[data-alchemy-chip-remove-one="emberroot"]');
    removeOne.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    removeOne.click();
    assert.deepEqual(calls, [['removeOne', 'emberroot']], 'Enter on − removes one and never adds');
  });

  it('renders essence icons + counts on a bench chip carrying essences', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH_WITH_ESSENCES
    });
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    const essence = chip.querySelector('[data-alchemy-essence="fire"]');
    assert.ok(essence, 'the essence chip renders on the bench chip');
    assert.ok(essence.querySelector('i.fa-fire'), 'the essence icon renders');
    assert.ok(essence.textContent.includes('×2'), 'the per-unit essence count renders');
  });

  // The aggregate readout is the only progress signal an essence-authored recipe
  // gets (no `concrete` multiset -> resolution fails safe to `untried`).
  it('renders the aggregate essence readout under the bench signature', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      signatureText: 'Emberroot ×2',
      benchEssences: [
        { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 4 },
        { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 }
      ]
    });
    const readout = target.querySelector('[data-alchemy-bench-essences]');
    assert.ok(readout, 'the aggregate essence readout renders');
    const toxic = readout.querySelector('[data-alchemy-essence="toxic"]');
    assert.ok(toxic.querySelector('i.fa-skull'), 'the aggregate essence icon renders');
    assert.ok(toxic.textContent.includes('×4'), 'the summed essence total renders');
    assert.ok(
      readout.querySelector('[data-alchemy-essence="water"]').textContent.includes('×1'),
      'every aggregated essence renders'
    );
  });

  it('omits the aggregate essence readout when the bench carries no essences', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      benchEssences: []
    });
    assert.equal(
      target.querySelector('[data-alchemy-bench-essences]'),
      null,
      'no readout for an essence-less bench'
    );
  });

  it('renders essence icons + counts on the Produces result card', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'Elixir',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true
    });
    const essence = target.querySelector('[data-alchemy-result] [data-alchemy-essence="fire"]');
    assert.ok(essence, 'the Produces result surfaces essence chips');
    assert.ok(essence.textContent.includes('×2'));
  });
  // THE LAST-BREW BANNER, ALL FOUR TONES (issue 1505). No published View Lab case reaches
  // `{#if lastBrew}` — `lastBrew` initialises null and is set only inside the brew flow, none
  // of the three alchemy cases clicks `[data-alchemy-brew]`, and the smoke's alchemy walk does
  // not brew — so the conversion of this banner onto the shared `Notice` is UNPHOTOGRAPHED and
  // these assertions are its stated substitute. They act on the tone, the glyph and both root
  // hooks, which is the whole of what the conversion moved.
  describe('the last-brew banner', () => {
    const BANNER_STATES = [
      { status: 'success', tone: 'success', glyph: 'fa-circle-check' },
      { status: 'tiered-tier', tone: 'success', glyph: 'fa-circle-check' },
      { status: 'produced-on-failure', tone: 'warning', glyph: 'fa-triangle-exclamation' },
      { status: 'brewing', tone: 'info', glyph: 'fa-hourglass-half' },
      { status: 'no-match-fizzle', tone: 'danger', glyph: 'fa-circle-xmark' }
    ];

    for (const { status, tone, glyph } of BANNER_STATES) {
      it(`paints ${status} as the ${tone} notice, with its own glyph`, async () => {
        const target = await harness.mount({
          mode: 'ready',
          targetName: 'Elixir',
          benchEmpty: false,
          benchChips: BENCH,
          brewEnabled: true,
          lastBrew: { status, discovered: null, message: 'Banner copy' }
        });
        const banner = target.querySelector('[data-alchemy-banner]');
        assert.ok(Boolean(banner), 'the banner renders whenever a brew has resolved');
        assert.equal(banner.getAttribute('data-notice-tone'), tone, `${status} takes ${tone}`);
        assert.ok(
          Boolean(banner.querySelector(`i.${glyph}`)),
          'the state keeps its own glyph — a per-tone default could not tell these apart'
        );
        assert.equal(
          banner.getAttribute('data-alchemy-banner-status'),
          status,
          'the status hook carries the state verbatim'
        );
        assert.equal(
          banner.getAttribute('data-alchemy-banner'),
          '',
          'and the bare hook stays bare rather than becoming data-alchemy-banner="true"'
        );
      });
    }

    it('states the brew message, and keeps the notice out of the DOM before any brew', async () => {
      const withBrew = await harness.mount({
        mode: 'ready',
        targetName: 'Elixir',
        benchEmpty: false,
        benchChips: BENCH,
        brewEnabled: true,
        lastBrew: { status: 'success', discovered: null, message: 'Two doses brewed' }
      });
      assert.match(
        withBrew.querySelector('[data-alchemy-banner]').textContent,
        /Two doses brewed/,
        'the resolved brew copy is the notice title'
      );

      harness.remount();
      const withoutBrew = await harness.mount({
        mode: 'ready',
        targetName: 'Elixir',
        benchEmpty: false,
        benchChips: BENCH,
        brewEnabled: true
      });
      assert.ok(
        !withoutBrew.querySelector('[data-alchemy-banner]'),
        'nothing has happened yet, so there is nothing for a notice to report'
      );
    });
  });
});

/**
 * The Workbench's adoption of the shared tile and label, and the two conversions this phase
 * measured and REFUSED (issue 1514, phase 3).
 *
 * The refusals are asserted as well as the conversions, because a deferral recorded only in a
 * comment is a deferral the next author reverses without reading it. Both are stated as the
 * measurement that produced them: the status strip is the one banner in the tab whose resting
 * tone no `Notice` can paint, and the still-needed well is the one whose body no `Callout` can
 * hold.
 */
describe('Workbench primitive adoption (issue 1514)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  const MISSING = [{ componentId: 'ash', name: 'Ashroot', need: 2 }];

  it('draws the bench chip and the result tile at the sizes their rules drew, glyph and ink carried', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'Elixir',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true
    });
    const tiles = {
      chip: target.querySelector('[data-alchemy-chip="emberroot"] .fab-medallion'),
      result: target.querySelector('[data-alchemy-result] .fab-medallion')
    };
    assert.deepEqual(
      {
        chip: /width:\s*(\d+)px/.exec(tiles.chip.getAttribute('style'))?.[1],
        result: /width:\s*(\d+)px/.exec(tiles.result.getAttribute('style'))?.[1]
      },
      { chip: '40', result: '46' },
      'the 40px bench chip and the 46px result tile keep the boxes their own rules drew'
    );
    for (const [name, tile] of Object.entries(tiles)) {
      assert.equal(tile.getAttribute('data-medallion-tint'), 'peach', `${name} keeps the peach ink`);
      assert.ok(Boolean(tile.querySelector('i.fa-flask')), `${name} keeps the flask face`);
    }
    assert.match(
      tiles.result.getAttribute('style'),
      /--fab-medallion-glyph:\s*19px/,
      "the result tile keeps its rule's 19px glyph rather than the tile's 0.9rem default"
    );
  });

  it('draws the Produces label as the shared kicker, with its 28px of separation on the wrapper', async () => {
    const target = await harness.mount({ mode: 'empty', benchEmpty: true });
    const slot = target.querySelector('.alchemy-produces-slot');
    assert.ok(Boolean(slot), 'the wrapper carrying the margin survives the conversion');
    const kicker = slot.querySelector('.fab-kicker');
    assert.ok(Boolean(kicker), 'the label itself is the shared kicker');
    assert.equal(kicker.tagName.toLowerCase(), 'p', 'the `div` host becomes the kicker`s `p` fallback');
    assert.ok(
      !target.querySelector('.alchemy-produces-label'),
      'the hand-rolled label class is gone rather than left beside the primitive'
    );
  });

  it('draws both bench signature labels as the shared kicker', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      signatureText: 'Emberroot ×1',
      benchEssences: [{ id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 4 }]
    });
    const labels = [
      target.querySelector('.alchemy-signature .fab-kicker'),
      target.querySelector('[data-alchemy-bench-essences] .fab-kicker')
    ];
    assert.deepEqual(
      labels.map((label) => label?.tagName.toLowerCase()),
      ['span', 'span'],
      'both are `span` hosts, which the kicker renders natively rather than falling back'
    );
  });

  it('leaves the live status strip hand-rolled, because its RESTING tone is one no notice paints', async () => {
    const target = await harness.mount({ mode: 'empty', benchEmpty: true });
    const strip = target.querySelector('[data-alchemy-status]');
    assert.ok(Boolean(strip), 'the strip still reports the bench state');
    assert.equal(strip.getAttribute('aria-live'), 'polite', 'and still announces it');
    assert.ok(
      !strip.classList.contains('fab-notice'),
      'a `Notice` has no neutral tone and falls back to DANGER, which would paint the empty ' +
        "bench's own instruction as an alert — see the markup comment"
    );
    assert.ok(
      strip.classList.contains('alchemy-status-empty'),
      'the neutral resting mode is the class this strip keeps for exactly that reason'
    );
  });

  it('leaves the still-needed well hand-rolled, because its body is a wrapping chip row', async () => {
    const target = await harness.mount({
      mode: 'assembling',
      benchEmpty: false,
      benchChips: BENCH,
      missing: MISSING
    });
    const well = target.querySelector('[data-alchemy-missing]');
    assert.ok(Boolean(well), 'the assembling bench lists what is still needed');
    assert.ok(
      !well.classList.contains('manager-callout'),
      '`Callout` takes `title` and `text` as strings and one non-wrapping `actions` cluster, ' +
        'none of which can hold this row — see the markup comment'
    );
    assert.equal(
      well.querySelectorAll('.alchemy-missing-chip').length,
      MISSING.length,
      'and the chips it could not hold are still chips'
    );
  });
});

/**
 * Characterization suite for `TintPicker` (issue 1036); its naming and marks (issue 2257); its
 * popover as `SearchablePopover`'s grid form (issue 2459). The shared cases run over both layouts.
 */

import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-color-popover-characterization-',
  // The shared colour-token constant (issue 1036). The popover localizes its eight preset
  // labels through it, so it is a static import of the component under test; the harness's
  // own closure validator reports the omission by name rather than hanging on it.
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/managerColorTokens.js',
  ],
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'src/ui/svelte/components/TintPicker.svelte',
  ],
  componentPath: 'src/ui/svelte/components/TintPicker.svelte',
});

/** The shipped palette, in its shipped order, with its shipped English labels. */
const PRESETS = [
  ['sage', 'Sage'],
  ['mist', 'Mist'],
  ['lavender', 'Lavender'],
  ['rose', 'Rose'],
  ['peach', 'Peach'],
  ['butter', 'Butter'],
  ['aqua', 'Aqua'],
  ['mauve', 'Mauve'],
];

const PANEL = '.fabricate-color-picker-popover.fabricate-picker-popover';

/** The caller's own control the popover opens from, inside an application root of its own. */
let anchorHost = null;
function stageAnchor() {
  anchorHost = document.createElement('div');
  anchorHost.className = 'fabricate-manager';
  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.dataset.testAnchor = '';
  anchorHost.append(anchor);
  document.body.append(anchorHost);
  return anchor;
}

/**
 * The two layouts under one face: `mount` answers the scope its swatches render in, `mark` is the
 * attribute that marks the selected swatch, and `group` is the element the palette label names.
 */
const LAYOUTS = Object.freeze({
  inline: Object.freeze({
    mark: 'aria-pressed',
    group: '[role="group"]',
    mount: (props) => harness.mount({ layout: 'inline', ...props }),
  }),
  popover: Object.freeze({
    mark: 'aria-selected',
    group: `${PANEL} [role="listbox"]`,
    mount: async (props) => {
      const anchor = stageAnchor();
      await harness.mount({ anchor: () => anchor, open: true, ...props });
      return document;
    },
  }),
});

function presetCells(scope) {
  return [...scope.querySelectorAll('[data-manager-color-token]')];
}

/** Every preset's mark, by token. */
function markStates(scope, mark) {
  return Object.fromEntries(
    presetCells(scope).map((cell) => [cell.dataset.managerColorToken, cell.getAttribute(mark)])
  );
}

/** `markStates` with only `marked` true. */
function onlyMarked(marked) {
  return Object.fromEntries(PRESETS.map(([token]) => [token, String(marked === token)]));
}

/** The inline strip's `aria-pressed`, the No-colour cell first under `none` when it renders. */
function pressedStates(target) {
  const none = target.querySelector('[data-manager-color-none]');
  const marks = markStates(target, 'aria-pressed');
  return none ? { none: none.getAttribute('aria-pressed'), ...marks } : marks;
}

function onlyPressed(pressed, { none = false } = {}) {
  const marks = onlyMarked(pressed);
  return none ? { none: String(pressed === 'none'), ...marks } : marks;
}

/** The panel's footer action, by its text: the popover's No colour. */
function footerAction() {
  return document.querySelector(`${PANEL} .fabricate-picker-footer-action`);
}

const TINT_PICKER_KEYS = {
  'FABRICATE.Common.TintPicker.Presets': '[presets]',
  'FABRICATE.Common.TintPicker.CustomHex': '[custom-hex]',
  'FABRICATE.Common.TintPicker.None': '[none]',
};

/** Swap the ambient `game.i18n` for `i18n`, returning a restore thunk. */
function withI18n(i18n) {
  const previous = globalThis.game.i18n;
  globalThis.game.i18n = i18n;
  return () => {
    globalThis.game.i18n = previous;
  };
}

before(async () => {
  await harness.setup();
});
after(() => harness.teardown());
afterEach(() => {
  harness.remount();
  anchorHost?.remove();
  anchorHost = null;
});

for (const [layout, { mark, group, mount }] of Object.entries(LAYOUTS)) {
  describe(`1036 TintPicker — characterization (${layout})`, () => {
    it('renders exactly the eight shipped presets, in order, as real buttons', async () => {
      const scope = await mount({ colorToken: 'sage' });
      const cells = presetCells(scope);

      assert.deepEqual(
        cells.map((cell) => cell.dataset.managerColorToken),
        PRESETS.map(([token]) => token),
        'eight cells, in the shipped palette order'
      );
      for (const cell of cells) {
        assert.equal(cell.tagName, 'BUTTON', 'each cell is a real button');
        assert.equal(cell.getAttribute('type'), 'button', 'and never submits a host form');
      }
    });

    it('gives each cell the same accessible name through aria-label AND title', async () => {
      const scope = await mount({ colorToken: 'sage' });
      for (const [token, label] of PRESETS) {
        const cell = scope.querySelector(`[data-manager-color-token="${token}"]`);
        assert.equal(cell.getAttribute('aria-label'), label, `${token} names itself`);
        assert.equal(cell.getAttribute('title'), label, `${token} names itself on hover too`);
      }
    });

    it('marks the selected token alone, and marks NOTHING when the caller is unset', async () => {
      const scope = await mount({ colorToken: 'rose' });
      assert.deepEqual(markStates(scope, mark), onlyMarked('rose'), 'a token marks its cell');

      await harness.setProps({ colorToken: 'rose', unset: true });
      assert.deepEqual(
        markStates(scope, mark),
        onlyMarked(null),
        '`unset` suppresses the Sage-by-default marking a bare fold would produce'
      );

      await harness.setProps({ colorToken: '', unset: false });
      assert.deepEqual(
        markStates(scope, mark),
        onlyMarked('sage'),
        'and WITHOUT `unset` an absent value still folds onto sage — the trap `unset` exists for'
      );
    });

    it('names the palette by its label (issue 2257)', async () => {
      const scope = await mount({ colorToken: 'sage', presetGridLabel: 'Biome colours' });
      const named = scope.querySelector(group);
      assert.ok(Boolean(named), `the cells sit in ${group}`);
      assert.equal(named.getAttribute('aria-label'), 'Biome colours', 'named by its label');
      assert.equal(named.querySelectorAll('[data-manager-color-token]').length, 8);
    });

    it('names the palette through the shared keys when a caller passes no label (issue 2257)', async () => {
      const restore = withI18n({
        localize: (key) => TINT_PICKER_KEYS[key] ?? key,
        format: (key) => key,
      });
      try {
        const scope = await mount({
          colorToken: 'sage',
          allowCustom: true,
          allowNone: true,
          onClear: () => {},
        });
        assert.equal(scope.querySelector(group).getAttribute('aria-label'), '[presets]');
        assert.equal(
          scope.querySelector('.manager-color-custom').textContent.trim(),
          '[custom-hex]'
        );
        const none =
          layout === 'inline'
            ? scope.querySelector('[data-manager-color-none]').getAttribute('aria-label')
            : footerAction().textContent.trim();
        assert.equal(none, '[none]');
      } finally {
        restore();
      }
    });

    it('falls back to English when no i18n is installed (issue 2257)', async () => {
      const restore = withI18n(undefined);
      try {
        const scope = await mount({ colorToken: 'sage' });
        assert.equal(scope.querySelector(group).getAttribute('aria-label'), 'Colour presets');
      } finally {
        restore();
      }
    });

    it('emits both axes on a preset click, carrying the current custom colour through', async () => {
      const emitted = [];
      const scope = await mount({
        colorToken: 'sage',
        customColor: '#AABBCC',
        onChange: (next) => {
          emitted.push(next);
        },
      });

      scope.querySelector('[data-manager-color-token="aqua"]').click();

      assert.equal(emitted.length, 1);
      assert.deepEqual(
        emitted[0],
        { colorToken: 'aqua', customColor: '#AABBCC' },
        'the payload is always the whole pair, never a partial patch'
      );
    });

    it('offers the free-hex entry only while `allowCustom` is on', async () => {
      const scope = await mount({ colorToken: 'sage', allowCustom: true });
      assert.ok(
        Boolean(scope.querySelector('[data-manager-custom-color]')),
        'a caller that opts in, the gathering biome, gets the hex field'
      );

      await harness.setProps({ allowCustom: false });
      assert.ok(
        !scope.querySelector('[data-manager-custom-color]'),
        'the per-essence colour caller (issue 917) has the palette as its whole vocabulary'
      );
      assert.ok(!scope.querySelector('.manager-color-custom'), 'and no hex caption either');
      assert.equal(presetCells(scope).length, 8, 'and still exactly eight cells');
    });

    it('offers no free-hex entry to a caller that does not pass `allowCustom`', async () => {
      const scope = await mount({ colorToken: 'sage' });
      assert.ok(!scope.querySelector('[data-manager-custom-color]'), 'no hex field by default');
      assert.ok(!scope.querySelector('.manager-color-custom'), 'and no hex caption');
    });

    it('paints each swatch from its own token through the `--manager-color-swatch` vehicle', async () => {
      const scope = await mount({ colorToken: 'sage', customColor: '#AABBCC' });
      const cell = scope.querySelector('[data-manager-color-token="mauve"]');
      const painted = layout === 'inline' ? cell : cell.querySelector('.manager-color-swatch');
      assert.match(
        painted.getAttribute('style'),
        /--manager-color-swatch:\s*var\(--fab-tag-mauve\)/,
        'a preset swatch shows its OWN token, never the caller custom hex'
      );
    });
  });
}

describe('1036 TintPicker — the inline strip (issue 2257)', () => {
  it('presses the selected cell alone, across every selection state', async () => {
    const onClear = () => {};
    const target = await LAYOUTS.inline.mount({ colorToken: 'rose' });
    assert.deepEqual(pressedStates(target), onlyPressed('rose'), 'a token presses its cell');

    await harness.setProps({ colorToken: '', unset: true, allowNone: true, onClear });
    assert.deepEqual(
      pressedStates(target),
      onlyPressed('none', { none: true }),
      'with the No-colour cell offered, unset presses that cell'
    );

    await harness.setProps({ noneSelected: false });
    assert.deepEqual(
      pressedStates(target),
      onlyPressed(null, { none: true }),
      'a bulk stage left unchanged presses nothing at all'
    );
  });

  it('keeps the strip root apart from the panel compound every popover suite keys on', async () => {
    const target = await LAYOUTS.inline.mount({ colorToken: 'sage' });
    const root = target.querySelector('.fabricate-color-picker-popover');
    assert.ok(root.classList.contains('manager-color-picker-popover'), 'the shipped class');
    assert.equal(root.dataset.managerColorLayout, 'inline');
    assert.ok(!target.querySelector(PANEL), 'the strip is no picker panel');
  });
});

describe('2459 TintPicker — the popover is the picker grid form', () => {
  it('renders no panel while closed', async () => {
    const anchor = stageAnchor();
    const target = await harness.mount({ anchor: () => anchor, colorToken: 'sage' });
    assert.ok(
      !document.querySelector('.fabricate-color-picker-popover'),
      'a closed popover-layout mount draws no box of its own'
    );
    assert.ok(!target.querySelector('[data-manager-color-token]'), 'and no swatch');
  });

  it('draws the panel as square tiles in four columns, named by the palette label', async () => {
    await LAYOUTS.popover.mount({ colorToken: 'sage' });
    const panel = document.querySelector(PANEL);
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-label'), 'Colour presets');
    assert.ok(panel.classList.contains('manager-color-picker-popover'));
    const list = panel.querySelector('[role="listbox"]');
    assert.equal(list.dataset.pickerAs, 'grid');
    assert.equal(list.dataset.pickerColumns, '4');
    assert.equal(list.dataset.pickerTiles, 'square');
    assert.equal(panel.querySelector('[data-popover-filtered-count]').textContent, '8 of 8');
    assert.equal(
      panel.querySelector('input[role="combobox"]').getAttribute('aria-label'),
      'Search colours'
    );
  });

  it('closes on a pick', async () => {
    const picked = [];
    await LAYOUTS.popover.mount({
      colorToken: 'sage',
      onChange: (next) => {
        picked.push(next);
      },
    });
    document.querySelector(`${PANEL} [data-manager-color-token="mist"]`).click();
    await harness.setProps({});
    assert.deepEqual(picked, [{ colorToken: 'mist', customColor: '' }]);
    assert.ok(!document.querySelector(PANEL), 'a pick closes the panel');
  });

  it('offers No colour as the footer action, which clears and then closes', async () => {
    const order = [];
    await LAYOUTS.popover.mount({
      colorToken: 'sage',
      unset: true,
      allowNone: true,
      onClear: () => {
        order.push(document.querySelector(PANEL) ? 'clear-open' : 'clear');
      },
    });
    const action = footerAction();
    assert.equal(action.textContent.trim(), 'No colour');
    action.click();
    await harness.setProps({});
    assert.deepEqual(order, ['clear-open'], 'onClear runs once, while the panel is still open');
    assert.ok(!document.querySelector(PANEL), 'and then the panel closes');
  });

  it('offers no No colour without both the gate and a handler', async () => {
    await LAYOUTS.popover.mount({ colorToken: 'sage', onClear: () => {} });
    assert.ok(Boolean(document.querySelector(PANEL)), 'the panel is open');
    assert.ok(!footerAction(), 'a handler without `allowNone` offers nothing');

    await harness.setProps({ allowNone: true, onClear: null });
    assert.ok(!footerAction(), 'the gate without a handler offers nothing');
  });
});

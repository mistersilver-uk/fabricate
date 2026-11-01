/**
 * Issue 2483: `--fab-text-muted` clears 4.5:1 on the seven grounds hints and captions sit on, in
 * all seven themes, and `--fab-text-secondary` still reads at least 1.3:1 above it on the soft well.
 * The step is the two inks' contrast ratios divided, on the same flattened ground.
 * Issue 2841: on the danger fill over `--fab-bg-2` the muted ink falls short in four palettes, pinned
 * ratio for ratio. Every fill naming `--fab-danger-soft` in a published component's own block is
 * ledgered with the inks drawn on it, and every muted rule of a ledgered file, or of a component it
 * composes, is a pinned body, a part a ledgered rule overrides on the fill, or off the fill.
 * Limit: the ledger reads the published components' scoped blocks, not the module sheet; it sees a
 * composed child by a direct `./<Name>.svelte` import, not content a companion draws in a slot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const SOFT = ['--fab-surface-soft', '--fab-bg-2'];
const STEP = 1.3;
const DANGER = '--fab-danger-soft';
const FOUR = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];

for (const stack of [
  SOFT,
  ['--fab-bg-1'],
  ['--fab-bg-2'],
  ...FOUR.slice(0, 3).map((ground) => [DANGER, ground]),
  ['--fab-surface-raised', '--fab-bg-1'],
]) {
  test(`muted ink clears 4.5:1 on ${stack.join(' over ')} in every palette`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', stack), []);
  });
}

/** The muted ink's shortfall on the danger fill over `--fab-bg-2`, which no token change closes in-app. */
const MUTED_ON_DANGER_BG2 = Object.freeze([
  'fabricate: --fab-text-muted on --fab-danger-soft over --fab-bg-2 4.32:1',
  'hearth-herb: --fab-text-muted on --fab-danger-soft over --fab-bg-2 4.40:1',
  'starglass-arcana: --fab-text-muted on --fab-danger-soft over --fab-bg-2 4.45:1',
  'foundry-native: --fab-text-muted on --fab-danger-soft over --fab-bg-2 4.30:1',
]);

test('muted ink falls short on the danger fill over --fab-bg-2 in exactly four palettes, at these ratios', () => {
  assert.deepEqual(shortfalls(themes, '--fab-text-muted', [DANGER, '--fab-bg-2']), [
    ...MUTED_ON_DANGER_BG2,
  ]);
});

test('secondary ink clears 4.5:1 on the danger fill over the four grounds in every palette', () => {
  for (const ground of FOUR) {
    assert.deepEqual(shortfalls(themes, '--fab-text-secondary', [DANGER, ground]), [], ground);
  }
});

test(`secondary ink reads at least ${STEP}:1 above muted on the soft well in every palette`, () => {
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const collapsed = [...themes].flatMap(([theme, tokens]) => {
    const ground = stackGround(tokens, SOFT);
    const step =
      contrast(tokens.get('--fab-text-secondary'), ground) /
      contrast(tokens.get('--fab-text-muted'), ground);
    return step < STEP
      ? [`${theme}: secondary over muted on ${SOFT.join(' over ')} ${step.toFixed(2)}:1`]
      : [];
  });
  assert.deepEqual(collapsed, []);
});

const COMPONENTS = 'src/ui/svelte/components';
/** A part drawn on a fill: its rule, and 4.5 for text or 3 for a glyph. */
const textPart = (selector) => ({ selector, floor: 4.5 });
const glyphPart = (selector) => ({ selector, floor: 3 });

/**
 * Each published component's own danger fill, by file and selector, with the parts drawn on it.
 * `pinned` names the muted parts the specimen keeps muted, whose shortfall is the token's own.
 */
const DANGER_FILLS = Object.freeze({
  [`${COMPONENTS}/StatBox.svelte`]: {
    '.fab-stat-box.is-danger': [
      textPart('.fab-stat-box.is-danger .fab-stat-box-value'),
      textPart('.fab-stat-box.is-danger .fab-stat-box-note'),
      textPart('.fab-stat-box.is-danger > :global(.fab-kicker)'),
      glyphPart('.fab-stat-box.is-danger .fab-stat-box-value i'),
    ],
  },
  [`${COMPONENTS}/Notice.svelte`]: {
    '.fab-notice': [
      textPart('.fab-notice-title'),
      { ...textPart('.fab-notice-detail'), pinned: true },
      textPart('.fab-notice-evidence'),
      glyphPart('.fab-notice > i'),
    ],
  },
  [`${COMPONENTS}/Callout.svelte`]: {
    '.manager-callout.is-danger': [
      textPart('.manager-callout.is-danger .manager-callout-title'),
      { ...textPart('.manager-callout'), pinned: true },
      textPart('.manager-callout-item-lead'),
      glyphPart('.manager-callout.is-danger > i'),
    ],
  },
  [`${COMPONENTS}/Chip.svelte`]: {
    '.manager-chip.is-danger': [textPart('.manager-chip.is-danger')],
    '.manager-chip.is-negative': [textPart('.manager-chip.is-negative')],
    '.manager-chip-remove:hover:not(:disabled)': [
      glyphPart('.manager-chip-remove:hover:not(:disabled)'),
    ],
    '.manager-chip-remove:focus-visible': [glyphPart('.manager-chip-remove:focus-visible')],
  },
  [`${COMPONENTS}/Medallion.svelte`]: {
    '.fab-medallion.is-tone-danger': [glyphPart('.fab-medallion.is-tone-danger')],
  },
  [`${COMPONENTS}/SegmentedControl.svelte`]: {
    '.manager-segment.is-active.is-danger': [
      textPart('.manager-segment.is-active.is-danger'),
      textPart('.manager-segment.is-active .manager-segment-count'),
    ],
  },
});

/** Every selector painting the danger fill in a published component's own scoped block, by file. */
function dangerFillsInPublishedBlocks() {
  const found = {};
  for (const { path } of PUBLISHED_COMPONENT_MANIFEST) {
    for (const rule of corpus[path] ? rulesIn(corpus[path]) : []) {
      const properties = propertiesOf(rule);
      const paints = ['background', 'background-color'].some((property) =>
        properties.get(property)?.includes(DANGER)
      );
      if (paints) (found[path] ??= []).push(...splitSelectorList(rule.selector));
    }
  }
  return found;
}

test('the ledger names every danger fill a published component paints in its own block', () => {
  const ledger = Object.fromEntries(
    Object.entries(DANGER_FILLS).map(([file, fills]) => [file, Object.keys(fills)])
  );
  const sorted = (byFile) =>
    Object.fromEntries(
      Object.entries(byFile).map(([file, list]) => [
        file,
        list.toSorted((a, b) => a.localeCompare(b)),
      ])
    );
  assert.deepEqual(sorted(dangerFillsInPublishedBlocks()), sorted(ledger));
});

for (const [file, fills] of Object.entries(DANGER_FILLS)) {
  const rules = rulesIn(corpus[file]);
  for (const [fill, parts] of Object.entries(fills)) {
    test(`on ${fill}, every part clears its floor over the four grounds, or is a pinned muted body`, () => {
      assert.equal(declaredToken(rules, fill, 'background', file), DANGER);
      for (const { selector, floor, pinned } of parts) {
        const ink = declaredToken(rules, selector, 'color', file);
        const short = FOUR.flatMap((ground) => shortfalls(themes, ink, [DANGER, ground], floor));
        if (pinned) {
          assert.equal(ink, '--fab-text-muted', `${selector} is pinned as the muted body`);
          assert.deepEqual(short, [...MUTED_ON_DANGER_BG2], selector);
        } else {
          assert.notEqual(ink, '--fab-text-muted', `${selector} inks muted on the danger fill`);
          assert.deepEqual(short, [], selector);
        }
      }
    });
  }
}

const MUTED = 'var(--fab-text-muted)';
const byText = (a, b) => a.localeCompare(b);
/** A muted rule the fill's rule `selector` re-inks there, the reason a muted rule is never on the fill, or a pinned body. */
const overriddenBy = (selector) => ({ overriddenBy: selector });
const offFill = (reason) => ({ offFill: reason });
const PINNED = Object.freeze({ pinned: true });

/** The components each ledgered file composes by import, whose muted rules it answers for. */
const COMPOSED = Object.freeze({
  [`${COMPONENTS}/StatBox.svelte`]: [`${COMPONENTS}/Kicker.svelte`],
});

/** Every rule inking `--fab-text-muted` in a ledgered file or a component it composes, classified. */
const MUTED_RULES = Object.freeze({
  [`${COMPONENTS}/StatBox.svelte`]: {
    '.fab-stat-box-value i': overriddenBy('.fab-stat-box.is-danger .fab-stat-box-value i'),
    '.fab-stat-box-note': overriddenBy('.fab-stat-box.is-danger .fab-stat-box-note'),
    '.fab-kicker': overriddenBy('.fab-stat-box.is-danger > :global(.fab-kicker)'),
  },
  [`${COMPONENTS}/Notice.svelte`]: { '.fab-notice-detail': PINNED },
  [`${COMPONENTS}/Callout.svelte`]: { '.manager-callout': PINNED },
  [`${COMPONENTS}/Chip.svelte`]: {
    '.manager-chip.is-neutral': offFill('the neutral tone paints no danger fill'),
    '.manager-chip-remove': offFill(
      'the remove control is a 3:1 glyph the published Chip never draws'
    ),
  },
  [`${COMPONENTS}/Medallion.svelte`]: {},
  [`${COMPONENTS}/SegmentedControl.svelte`]: {
    ...Object.fromEntries(
      ['compact', 'field', 'inline', 'tag', 'accent', 'info', 'accent-soft'].map((form) => [
        `.manager-segmented.is-${form} .manager-segment:not(.is-active)`,
        offFill('an idle segment paints no fill; only the active danger segment does'),
      ])
    ),
    '.manager-segment': overriddenBy('.manager-segment.is-active.is-danger'),
    '.manager-segment-count': overriddenBy('.manager-segment.is-active .manager-segment-count'),
    '.manager-segment-count.is-badge': overriddenBy(
      '.manager-segment-input:checked ~ .manager-segment-count.is-badge'
    ),
  },
});

/** The selectors of `file`'s rules whose `color` names the muted ink. */
const mutedSelectorsOf = (file) =>
  rulesIn(corpus[file]).flatMap((rule) =>
    propertiesOf(rule).get('color')?.includes('--fab-text-muted')
      ? splitSelectorList(rule.selector)
      : []
  );

test('each ledgered file composes exactly the components the ledger answers for', () => {
  for (const file of Object.keys(DANGER_FILLS)) {
    const source = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
    const imported = [...source.matchAll(/import \w+ from '\.\/(\w+)\.svelte'/gu)].map(
      ([, name]) => `${COMPONENTS}/${name}.svelte`
    );
    assert.deepEqual(imported, COMPOSED[file] ?? [], file);
  }
});

for (const [file, classified] of Object.entries(MUTED_RULES)) {
  test(`every muted rule of ${file} and what it composes is pinned, overridden on the fill or off it`, () => {
    const found = [file, ...(COMPOSED[file] ?? [])].flatMap(mutedSelectorsOf);
    assert.deepEqual(
      found.toSorted(byText),
      Object.keys(classified).toSorted(byText),
      'unclassified muted ink'
    );
    const rules = rulesIn(corpus[file]);
    const parts = Object.values(DANGER_FILLS[file]).flat();
    for (const [selector, { overriddenBy: over, offFill: reason, pinned }] of Object.entries(
      classified
    )) {
      if (pinned) {
        assert.ok(
          parts.some((part) => part.selector === selector && part.pinned),
          `${selector} is no pinned part`
        );
      } else if (reason) {
        assert.ok(reason.length > 0, selector);
      } else {
        const rule = rules.find((entry) => splitSelectorList(entry.selector).includes(over));
        const ink = rule && propertiesOf(rule).get('color');
        assert.ok(
          ink && ink !== MUTED,
          `${selector} is overridden by ${over}, which re-inks nothing`
        );
      }
    }
  });
}

// One combined suite for the four Recipe Studio behavioural primitives (issue 643
// §7). They are import-free leaves, so each mounts from a one-entry harness; the
// harnesses are built from a table rather than four near-identical files, because
// `tests/**` duplication counts against the SonarCloud new-code gate.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Every primitive is a leaf: no rawModules, no sibling components. If one of these
// ever grows an import, this list is where the omission shows up — as a hang
// (`# cancelled`), never a failure.
const PRIMITIVES = ['Stepper', 'StatusPill', 'Medallion', 'CollapsibleGroupHeader'];

const harnesses = new Map(
  PRIMITIVES.map((name) => {
    const componentPath = `src/ui/svelte/components/${name}.svelte`;
    return [
      name,
      createMountedComponentHarness({
        repoRoot,
        tmpPrefix: `fabricate-primitive-${name.toLowerCase()}-`,
        compiledModules: [componentPath],
        componentPath
      })
    ];
  })
);

function harnessFor(name) {
  return harnesses.get(name);
}

before(async () => {
  for (const harness of harnesses.values()) await harness.setup();
});
after(() => {
  for (const harness of harnesses.values()) harness.teardown();
});
afterEach(() => {
  for (const harness of harnesses.values()) harness.remount();
});

describe('Recipe Studio primitives are import-free leaves', () => {
  it('never imports foundryBridge, a model, or a util', () => {
    for (const name of PRIMITIVES) {
      const source = readFileSync(resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`), 'utf8');
      const imports = source.match(/^\s*import\s.*$/gm) || [];
      assert.deepEqual(
        imports,
        [],
        `${name}.svelte must stay props-only — an import here propagates a required raw-module entry into every mount-harness allowlist`
      );
    }
  });

  it('renders no gradient surfaces', () => {
    for (const name of PRIMITIVES) {
      const source = readFileSync(resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`), 'utf8');
      assert.ok(
        !/\b(?:linear|radial|conic)-gradient\s*\(/.test(source),
        `${name}.svelte must stay flat (flat-ui-style-contract)`
      );
    }
  });
});

describe('Stepper (mounted)', () => {
  it('exposes a typeable number input, not a click-only control', async () => {
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, ariaLabel: 'Quantity' });
    const input = root.querySelector('[data-stepper-input]');

    assert.equal(input.tagName, 'INPUT');
    assert.equal(input.getAttribute('type'), 'number');
    assert.equal(input.getAttribute('aria-label'), 'Quantity');
    assert.equal(input.value, '3');
  });

  it('commits a typed value through onChange', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, onChange: (next) => changes.push(next) });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '7';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [7]);
  });

  it('clamps a typed value to the max on blur', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, onChange: (next) => changes.push(next) });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '40';
    input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [9]);
  });

  it('steps with the adjunct buttons and disables them at the bounds', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 1, min: 1, max: 2, step: 1, onChange: (next) => changes.push(next) });

    const decrement = root.querySelector('[data-stepper-decrement]');
    const increment = root.querySelector('[data-stepper-increment]');
    assert.equal(decrement.disabled, true, 'the − adjunct is disabled at the min');

    increment.click();
    flushSync();
    assert.deepEqual(changes, [2]);
  });
});

describe('StatusPill (mounted)', () => {
  const TONES = [
    { tone: 'subtle', icon: '', label: 'Disabled' },
    { tone: 'accent', icon: 'fas fa-lock', label: 'Locked' },
    { tone: 'danger', icon: 'fas fa-circle-exclamation', label: "Can't enable" },
    { tone: 'warning', icon: 'fas fa-pen-ruler', label: 'Incomplete' }
  ];

  for (const { tone, icon, label } of TONES) {
    it(`renders the ${tone} tone with its label and icon`, async () => {
      const root = await harnessFor('StatusPill').mount({ tone, icon, label });
      const pill = root.querySelector(`[data-status-pill="${tone}"]`);

      assert.ok(pill, `a ${tone} pill should render`);
      assert.equal(pill.textContent.trim(), label);
      const glyph = pill.querySelector('i');
      assert.equal(!!glyph, !!icon, `a ${tone} pill renders its glyph only when one is supplied`);
      // Svelte appends its scoping class, so assert containment rather than equality.
      if (icon) for (const token of icon.split(' ')) assert.ok(glyph.classList.contains(token));
    });
  }

  // ── THE OUTLINED EMPHASIS (issue 1371) ────────────────────────────────────────────────
  //
  // `emphasis` is the second axis this pill has ever had, and it is opt-in for the reason the
  // lane that measured it could not use anything else: the reference's attribution pill
  // (`proto:834`, `Linked Foundry item`) is a hairline-edged micro pill in the SECONDARY ink,
  // and `subtle` — the only tone whose fill already matches — also paints the Off pill on
  // three other screens, so re-toning it in place would move them. A parity lane proved the
  // difference is unreachable from `styles/fabricate.css` at ANY specificity, because Foundry
  // imports the module sheet at `layer(modules)` while this block is injected unlayered.
  //
  // The assertions that matter most are the two NEGATIVE ones: an absent `emphasis` must
  // render byte-identically to what shipped, and an unrecognised one must fall back rather
  // than emit a class nothing paints — the rule this component already states for `tone`.
  const statusPillSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/components/StatusPill.svelte'),
    'utf8'
  );

  it('renders no emphasis class or hook when none is asked for', async () => {
    const root = await harnessFor('StatusPill').mount({ tone: 'subtle', label: 'Off' });
    const pill = root.querySelector('[data-status-pill="subtle"]');
    const authored = [...pill.classList].filter((name) => !name.startsWith('svelte-')).sort();
    assert.deepEqual(
      authored,
      ['fab-status-pill', 'is-subtle'],
      'the shipped pill is exactly its stem and its tone — a new prop that leaked a class here would repaint thirteen call sites at once'
    );
    assert.ok(
      !pill.hasAttribute('data-status-pill-emphasis'),
      'and it stamps no emphasis hook, so the default DOM is unchanged'
    );
  });

  it('adds is-outlined and reports the resolved emphasis when asked', async () => {
    const root = await harnessFor('StatusPill').mount({
      tone: 'subtle',
      emphasis: 'outlined',
      icon: 'fas fa-lock',
      label: 'Linked Foundry item'
    });
    const pill = root.querySelector('[data-status-pill="subtle"]');
    assert.ok(pill.classList.contains('is-outlined'), 'the emphasis paints its own class');
    assert.ok(
      pill.classList.contains('is-subtle'),
      'and it composes with the tone rather than replacing it'
    );
    assert.equal(
      pill.getAttribute('data-status-pill-emphasis'),
      'outlined',
      'the hook reports the RESOLVED emphasis, so a test can watch the fallback happen'
    );
  });

  it('FALLS BACK on an unrecognised emphasis rather than emitting a dead class', async () => {
    const root = await harnessFor('StatusPill').mount({ tone: 'subtle', emphasis: 'ghost' });
    const pill = root.querySelector('[data-status-pill="subtle"]');
    assert.ok(!pill.className.includes('is-ghost'), 'a typo renders the shipped pill');
    assert.ok(
      !pill.hasAttribute('data-status-pill-emphasis'),
      'and reports no emphasis at all, exactly as an unrecognised tone reports `subtle`'
    );
  });

  it('paints every declared emphasis in the scoped style block', () => {
    // The mirror guard. An emphasis added to the accepted set but never given a rule renders
    // as the shipped pill while the class-emission assertion above still passes — the class is
    // there, the treatment is not, and nothing says so.
    const start = statusPillSource.indexOf('const EMPHASES = new Set([');
    assert.notEqual(start, -1, 'StatusPill still declares its emphasis vocabulary as `EMPHASES`');
    const body = statusPillSource.slice(
      statusPillSource.indexOf('[', start),
      statusPillSource.indexOf(']);', start)
    );
    const declared = [...body.matchAll(/'([\w-]+)'/g)].map(([, name]) => name);
    assert.ok(declared.length > 0, 'at least one emphasis is declared');
    const styleBlock = statusPillSource.slice(statusPillSource.indexOf('<style>'));
    assert.deepEqual(
      declared.filter((name) => !styleBlock.includes(`.fab-status-pill.is-${name}`)),
      [],
      'every accepted emphasis declares a treatment'
    );
  });

  it('states the outlined pill in tokens, at the reference band', () => {
    // `proto:834`: `padding:2px 8px; border:1px solid var(--border); font:600 9px; color:
    // var(--text2)`, with an 8px glyph. Every one of those is a theme-root token here —
    // `--fab-space-2xs`/`--fab-space-2` are exactly 2px and 8px, so the band costs the spacing
    // ratchet nothing, and `--fab-text-secondary` IS the reference's `--text2`.
    const rule = statusPillSource.slice(
      statusPillSource.indexOf('.fab-status-pill.is-outlined {'),
      statusPillSource.lastIndexOf('</style>')
    );
    assert.match(rule, /padding:\s*var\(--fab-space-2xs\) var\(--fab-space-2\)/);
    assert.match(rule, /border-color:\s*var\(--fab-border\)/);
    assert.match(rule, /color:\s*var\(--fab-text-secondary\)/);
    assert.match(rule, /font-size:\s*9px/);
    assert.match(rule, /font-size:\s*8px/, 'and the leading glyph drops to the reference 8px');
  });
});

/**
 * `emphasis` IS ONE AXIS ACROSS THE TWO PRIMITIVES THAT HAVE IT (issue 1371).
 *
 * The same parity round gave `StatusPill` and the manager's `Chip` a prop of the same name with
 * the same single value, and the two are now a hand-maintained mirror of each other: a caller
 * who learns `emphasis="outlined"` on one expects it to mean the same word on the other, and
 * nothing in either file can see the other rename its value, spell it `outline`, or add a
 * second one on one side only. That is the rot this guard stops.
 *
 * IT LIVES HERE, in the file that owns `StatusPill`'s emphasis tests, because the claim is
 * about the PAIR. Written in `Chip`'s own suite it would be a second copy of the same parse,
 * and per-file copies of one block are exactly what the duplication gate counts; written in
 * neither, the alignment is a comment in two docblocks and nothing else. It reads both sources
 * as text and mounts nothing, so it needs no entry in this file's harness table.
 *
 * WHAT IT MUST NOT DO is demand the two TREATMENTS match, because they deliberately do not.
 * Each supersedes the opposite axis, and each is right for what its own reference draws:
 * `StatusPill`'s attribution badge (`proto:834`) is one neutral face whatever state it
 * annotates, so its emphasis neutralises the EDGE and the INK and keeps the tone's fill;
 * `Chip`'s catalogue badge (`proto:1313`) is a coloured badge that must not melt into the
 * coloured panel it sits on, so its emphasis neutralises the FILL and keeps the tone's edge and
 * ink. A later change that "harmonised" the two would break one of those screens, so the
 * inversion is pinned as deliberate rather than left to read as an oversight.
 *
 * ── AND IT IS AN ASYMMETRY RATCHET, NOT AN EQUALITY (issue 1371, parity round 5) ─────────────
 * It began as `deepEqual(Chip, StatusPill)`, which says the two vocabularies must be the SAME
 * LIST. That is the wrong shape, and round 5 is where it showed: the reference draws a lit face
 * — the family's colour on the ink over a wash of itself — on the world-tag CHIP and on nothing
 * else, so `Chip` grows `lit` and `StatusPill` has no reference asking it for one. Under an
 * equality the only ways to land that are to add a second dead value to `StatusPill` (dead API
 * on a shared primitive, which is the finding this same round is closing one file over) or to
 * delete the guard.
 *
 * So the guard keeps its teeth by pinning the DIFFERENCE instead. A value present in both must
 * be spelled identically — that is the rename and the `outlined`/`outline` typo, which is what
 * the mirror was written for — and a value present in only one is listed here BY NAME with its
 * reason. Adding a third value to either side still reds, because the pin does not know about
 * it; what it no longer does is force a primitive to grow a face nothing draws.
 */
describe('emphasis is one axis across the two primitives that have it', () => {
  const SOURCES = {
    StatusPill: 'src/ui/svelte/components/StatusPill.svelte',
    Chip: 'src/ui/svelte/apps/manager/Chip.svelte'
  };

  /**
   * The accepted emphasis vocabulary, read from a component's own `EMPHASES` literal.
   *
   * @param {string} name
   * @returns {string[]}
   */
  function declaredEmphases(name) {
    const source = readFileSync(resolve(repoRoot, SOURCES[name]), 'utf8');
    const start = source.indexOf('const EMPHASES = new Set([');
    assert.notEqual(start, -1, `${name} still declares its emphasis vocabulary as \`EMPHASES\``);
    const body = source.slice(source.indexOf('[', start), source.indexOf(']);', start));
    const declared = [...body.matchAll(/'([\w-]+)'/g)].map(([, value]) => value);
    assert.ok(declared.length > 0, `${name} declares at least one emphasis`);
    return declared;
  }

  /**
   * The declarations one component's emphasis rule states, with its comments stripped so a
   * paragraph that mentions a property cannot answer for a declaration that states it.
   *
   * @param {string} name
   * @param {string} stem the rule's class stem, e.g. `fab-status-pill`
   * @returns {string[]} the property names, in source order
   */
  function emphasisProperties(name, stem) {
    const source = readFileSync(resolve(repoRoot, SOURCES[name]), 'utf8');
    const block = source.slice(source.search(/^<style>$/m)).replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
    const open = block.indexOf(`.${stem}.is-outlined {`);
    assert.notEqual(open, -1, `${name} paints the outlined emphasis on \`.${stem}\``);
    const body = block.slice(open, block.indexOf('}', open));
    return [...body.matchAll(/(?:^|\n)\s*([a-z-]+)\s*:/g)].map(([, property]) => property);
  }

  /**
   * The values one primitive draws and the other does not, with the reason each is asymmetric.
   *
   * A value NOT listed here must be spelled the same on both sides. Growing this map is the
   * deliberate act the guard asks for: an entry has to be written, which is where the reason for
   * a one-sided face gets recorded instead of being inferred from a green run.
   */
  const ASYMMETRIC = {
    // `Chip` only. The reference's lit world-tag chip inks the label in the family's own colour
    // over a wash of it (`proto:5401`, `proto:5665`); no `StatusPill` in the reference does that,
    // and the pill has no `--fab-chip-color` vehicle to do it through.
    Chip: ['lit'],
    StatusPill: []
  };

  it('spells the SAME word for every face BOTH primitives draw', () => {
    const chip = declaredEmphases('Chip');
    const pill = declaredEmphases('StatusPill');
    const shared = chip.filter((value) => pill.includes(value));

    // POSITIVE FIRST: an empty intersection would satisfy every equality below while meaning the
    // two prop vocabularies had stopped overlapping entirely, which is the failure this pair was
    // written against.
    assert.ok(
      shared.includes('outlined'),
      'both still draw the outlined face, which is the value the pair was written for'
    );
    assert.deepEqual(
      chip.filter((value) => !ASYMMETRIC.Chip.includes(value)),
      shared,
      'every Chip emphasis except the pinned one-sided ones is answered on StatusPill — a rename or a near-miss spelling reds here'
    );
    assert.deepEqual(
      pill.filter((value) => !ASYMMETRIC.StatusPill.includes(value)),
      shared,
      'and every StatusPill emphasis except its own pinned ones is answered on Chip'
    );
  });

  it('and every one-sided value is PINNED with a reason, not merely tolerated', () => {
    // The ratchet half. Without this, the two assertions above would pass on a pin that named a
    // value neither primitive declares, and would keep passing after a third one-sided value was
    // added if the pin happened to be widened without being read.
    for (const [name, oneSided] of Object.entries(ASYMMETRIC)) {
      const declared = declaredEmphases(name);
      const other = name === 'Chip' ? 'StatusPill' : 'Chip';
      const otherDeclared = declaredEmphases(other);
      for (const value of oneSided) {
        assert.ok(declared.includes(value), `${name} still declares the pinned one-sided \`${value}\``);
        assert.ok(
          !otherDeclared.includes(value),
          `and \`${value}\` is still one-sided — once ${other} draws it too, delete the pin rather than keeping both`
        );
      }
    }
  });

  it('supersedes the OPPOSITE axis in each, which is deliberate and stays pinned', () => {
    const pill = emphasisProperties('StatusPill', 'fab-status-pill');
    const chip = emphasisProperties('Chip', 'manager-chip');

    assert.ok(
      pill.includes('border-color') && pill.includes('color'),
      "the pill's emphasis neutralises the edge and the ink"
    );
    assert.ok(
      !pill.includes('background'),
      'and keeps the tone FILL, because its attribution badge is one neutral face whatever state it annotates'
    );

    assert.deepEqual(
      chip,
      ['background'],
      "the chip's emphasis states the FILL and nothing else, so the tone keeps its edge and its ink and every tone is outlined by one rule"
    );
  });
});

describe('Medallion (mounted)', () => {
  it('renders the resolved image when one is passed', async () => {
    const root = await harnessFor('Medallion').mount({ src: 'icons/svg/book.svg', icon: 'fas fa-scroll' });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'image');
    assert.equal(medallion.querySelector('img').getAttribute('src'), 'icons/svg/book.svg');
    assert.equal(medallion.querySelector('i'), null);
  });

  it('falls back to the glyph when src is falsy', async () => {
    const root = await harnessFor('Medallion').mount({ src: '', icon: 'fas fa-flask' });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'glyph');
    assert.equal(medallion.querySelector('img'), null);
    assert.ok(medallion.querySelector('i.fas.fa-flask'));
  });

  it('sizes the tile from the size prop', async () => {
    const root = await harnessFor('Medallion').mount({ src: '', size: 52 });
    const style = root.querySelector('[data-medallion]').getAttribute('style').replace(/\s+/g, '');
    assert.match(style, /width:52px;height:52px/);
  });
});

/**
 * THE GLYPH-CHIP VARIANT (issue 1371, parity round 5, UX finding F12).
 *
 * The reference's list rows draw their leading chip as a BORDERLESS rounded square carrying a
 * tinted glyph on one shared slate surface (`proto:600` at 38px, `proto:1078`'s cohort at 40px).
 * The shipped tile is that shape with a hairline around it and, once tinted, a per-category wash
 * behind the glyph. One parity run measured that single difference as fourteen `compare` lines
 * across three regions on three screens.
 *
 * The variant is OPT-IN, so the assertion that matters most is the negative one: a medallion that
 * does not ask for it must render exactly the tile ~40 call sites across the manager render today.
 * The rest of the geometry is the caller's — `size` and `glyph` are existing props and the variant
 * deliberately restates neither, because a primitive that took the row's dimensions as an
 * argument and then hard-coded them in a variant would hold two answers to one question.
 */
describe('Medallion glyph-chip variant (mounted)', () => {
  const medallionSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/components/Medallion.svelte'),
    'utf8'
  );
  const styleBlock = medallionSource.slice(medallionSource.search(/^<style>$/m));

  /**
   * The declarations one rule states, comments stripped so a paragraph naming a property cannot
   * answer for a declaration that states it.
   *
   * @param {string} head the rule's full selector, e.g. `.fab-medallion.is-glyph-chip`
   * @returns {string[]} `property: value` pairs, in source order
   */
  function declarationsOf(head) {
    const block = styleBlock.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
    const open = block.indexOf(`${head} {`);
    assert.notEqual(open, -1, `the style block declares \`${head}\``);
    return block
      .slice(block.indexOf('{', open) + 1, block.indexOf('}', open))
      .split(';')
      .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
  }

  it('emits NOTHING by default, so every shipped medallion is unchanged', async () => {
    const root = await harnessFor('Medallion').mount({ src: '', icon: 'fas fa-flask' });
    const classes = [...root.querySelector('[data-medallion]').classList].filter(
      (name) => !name.startsWith('svelte-')
    );
    assert.deepEqual(
      classes,
      ['fab-medallion'],
      'an unset variant is the hook class and nothing else — a leaked class here repaints every call site at once'
    );
  });

  it('adds is-glyph-chip when asked, and composes with the tint', async () => {
    const root = await harnessFor('Medallion').mount({ variant: 'glyph-chip', tint: 'sage' });
    const classes = [...root.querySelector('[data-medallion]').classList].filter(
      (name) => !name.startsWith('svelte-')
    );
    assert.deepEqual(
      classes.toSorted((a, b) => a.localeCompare(b)),
      ['fab-medallion', 'has-tint', 'is-glyph-chip'],
      'the variant and the tint are two axes, and a row chip needs both'
    );
  });

  it('DROPS an unrecognised variant rather than emitting a dead class', async () => {
    const root = await harnessFor('Medallion').mount({ variant: 'borderless' });
    const classes = [...root.querySelector('[data-medallion]').classList].filter(
      (name) => !name.startsWith('svelte-')
    );
    assert.deepEqual(classes, ['fab-medallion'], 'a typo renders the shipped tile');
  });

  it('states the borderless edge and NO geometry of its own', () => {
    // `border-width: 0` rather than `border: 0`: the shorthand would carry the style and the
    // colour with it, and `has-tint` states a `border-color` this rule deliberately leaves alone
    // (a colour on a zero-width edge paints nothing). And no size: 38 and 40 are the CALLER's
    // `size`, so a width or a height here would be a second copy of the row's geometry.
    assert.deepEqual(declarationsOf('.fab-medallion.is-glyph-chip'), ['border-width: 0']);
  });

  it('cancels the tint WASH while keeping the tinted glyph, at a specificity that decides it', () => {
    // The reference's row chips all share one surface and differ only in the glyph's colour, so a
    // per-category wash would be this repo's invention. The cancellation is (0,3,0) against
    // `has-tint`'s (0,2,0), so it does not depend on which rule is written later.
    assert.deepEqual(declarationsOf('.fab-medallion.is-glyph-chip.has-tint'), [
      'background: var(--fab-bg-3)'
    ]);
    assert.ok(
      declarationsOf('.fab-medallion.has-tint').some((declaration) =>
        declaration.startsWith('background:')
      ),
      'and the wash it cancels is really there, so the cancellation is not answering an absence'
    );
    assert.ok(
      !declarationsOf('.fab-medallion.is-glyph-chip.has-tint').some((declaration) =>
        declaration.startsWith('color:')
      ),
      'while the GLYPH colour is untouched — the tint is the whole point of the reference chip'
    );
  });
});

describe('CollapsibleGroupHeader (mounted)', () => {
  it('is a button carrying aria-expanded and aria-controls', async () => {
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Alchemy',
      countText: '4 recipes',
      expanded: true,
      controls: 'group-alchemy'
    });
    const header = root.querySelector('[data-group-header="Alchemy"]');

    assert.equal(header.tagName, 'BUTTON');
    assert.equal(header.getAttribute('aria-expanded'), 'true');
    assert.equal(header.getAttribute('aria-controls'), 'group-alchemy');
    assert.ok(header.textContent.includes('Alchemy'));
    assert.ok(header.textContent.includes('4 recipes'));
    assert.ok(header.querySelector('i.fa-chevron-down'), 'an expanded group shows the down chevron');

    // A tight LEFT CLUSTER: chevron, folder, name, count — then empty bar. `flex: 1 1 auto`
    // on the name grew it to fill the row and flung the count to the far right edge, which
    // made the bar read as a table header with a column of counts. The trailing spacer is
    // what keeps the bar full-bleed while the cluster stays left.
    const children = [...header.children].map((child) => child.classList[0]);
    assert.deepEqual(
      children.slice(-2),
      ['fab-group-count', 'fab-group-spacer'],
      'the count sits beside the name, with the empty bar after it'
    );
  });

  it('shows the collapsed chevron and toggles on activation', async () => {
    let toggles = 0;
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Smithing',
      countText: '2 recipes',
      expanded: false,
      controls: 'group-smithing',
      onToggle: () => { toggles += 1; }
    });
    const header = root.querySelector('[data-group-header="Smithing"]');

    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.ok(header.querySelector('i.fa-chevron-right'), 'a collapsed group shows the right chevron');

    header.click();
    flushSync();
    assert.equal(toggles, 1);
  });
});

/**
 * Motion is one token on a control's state change (issue 1523). `design-system/spec.md`'s "Every
 * interactive primitive declares its full state set" names `--fab-motion-control` as the only
 * motion and the sheet's one `prefers-reduced-motion` block as the only way it is removed. This
 * gate reads the global sheet and every Svelte `<style>` under `src/`, player apps included.
 *
 * Svelte `<style>` blocks are component-scoped and mount inside the roots, so they need no root
 * of their own; the sheet's own transitions must each sit under one of the block's roots. Three
 * Fabricate surfaces draw outside every root and carry no motion today: the environment dialog
 * (`environmentDialog.js:46`), the player character types menu (`playerCharacterTypesMenu.js:119`)
 * and the compendium directory context menu (`compendiumDirectoryContext.js:103`). Giving one a
 * transition means rooting it first. The 150ms tooltip grace the tab strips keep
 * (`editor-tabs-capabilities`, `world-downtime-tabs-a11y`) is a pointer timer, not motion.
 *
 * Motion written anywhere else under `src/` fails too: a Svelte motion directive or import, a
 * script-set `transition` or `animate()`, an inline `transition`, `@keyframes` and smooth scroll.
 * A data field named `duration:` is not motion and is not read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  MODULE_CORPUS,
  STYLE_CORPUS,
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  exemptAt,
  gateOver,
  styleCorpusOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { splitSelectorList, varReferencesIn } from '../helpers/styleBlockScan.js';

const MOTION_TOKEN = '--fab-motion-control';
const MOTION_FIGURE = '140ms ease';
const SHEET = 'styles/fabricate.css';

/** Every transition and animation property, longhands too, so no longhand carries what the shorthand may not. */
const VENDOR_PREFIX = /^-(?:webkit|moz|o)-/u;
const MOTION_PROPERTY = /^(?:-(?:webkit|moz|o)-)?(?:transition|animation)(?:-[a-z]+)*$/u;
const PLAIN_PROPERTY = /^-{0,2}[a-z][\w-]*$/iu;
const IMPORTANT = /\s*!important\s*$/iu;
const REDUCE_CONDITION = '(prefers-reduced-motion: reduce)';
/** Every root the sheet's reduced-motion block names; a sheet transition sits under one. */
const ROOTS = [
  '.fabricate',
  '.fabricate-craft-chat',
  '.fabricate-gather-chat',
  '.fabricate-dice-tiles',
  '.fabricate-interaction-prompt',
];
const LITERAL_TIME = /(?<![\w.])-?(?:\d+(?:\.\d+)?|\.\d+)m?s\b/iu;
const TIMING_FUNCTION =
  /\b(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end)\b|\b(?:steps|cubic-bezier)\(/iu;
const REDUCED_MOTION_MEDIA = /@media\b([^{]*prefers-reduced-motion[^{]*)\{/giu;
const READS_TOKEN = `var(${MOTION_TOKEN})`;

/** `value` with each `var()` name blanked, so a token name never reads as a time; fallbacks stay. */
function withoutVarNames(value) {
  let out = '';
  let cursor = 0;
  for (const reference of varReferencesIn(value)) {
    out += value.slice(cursor, reference.start);
    out += reference.fallback === null ? 'var()' : `var(, ${withoutVarNames(reference.fallback)})`;
    cursor = reference.end;
  }
  return out + value.slice(cursor);
}

/** One `transition` item: a named property, not `all`, at the token and nothing else. */
function transitionItemProblem(item) {
  const [property, ...rest] = item.split(/\s+/u);
  if (property === READS_TOKEN) return 'names no property';
  if (!PLAIN_PROPERTY.test(property)) return 'names its property other than by a plain identifier';
  if (property.toLowerCase() === 'all') return 'transitions all';
  return rest.join(' ') === READS_TOKEN ? null : `does not read ${MOTION_TOKEN}`;
}

/** Any other motion property's item: the token alone. */
const tokenItemProblem = (item) => (item === READS_TOKEN ? null : `does not read ${MOTION_TOKEN}`);

/**
 * Why a motion declaration breaks the rule, or `null` when it is `none` or reads the token.
 * `!important` is the reduced-motion reset's alone, so `isReset` is the only way past it.
 */
function motionValueProblem(property, value, isReset = false) {
  if (IMPORTANT.test(value) && !isReset) return 'an !important motion';
  const text = value.replace(IMPORTANT, '').trim();
  if (text.toLowerCase() === 'none') return null;
  const bare = withoutVarNames(text);
  if (LITERAL_TIME.test(bare)) return 'a literal time';
  if (TIMING_FUNCTION.test(bare)) return 'a timing function';
  const itemProblem =
    property.toLowerCase().replace(VENDOR_PREFIX, '') === 'transition'
      ? transitionItemProblem
      : tokenItemProblem;
  // A selector list and a transition list both split on their top-level commas.
  const items = splitSelectorList(text).map((item) => item.replaceAll(/\s+/gu, ' '));
  return items.map(itemProblem).find((problem) => problem !== null) ?? null;
}

/** Each `@media` testing `prefers-reduced-motion` in one file's CSS, with its line and condition. */
function reducedMotionBlocks(file, css) {
  const found = [];
  REDUCED_MOTION_MEDIA.lastIndex = 0;
  for (let match = REDUCED_MOTION_MEDIA.exec(css); match; match = REDUCED_MOTION_MEDIA.exec(css)) {
    found.push({
      file,
      line: css.slice(0, match.index).split('\n').length,
      condition: match[1].trim().replaceAll(/\s+/gu, ' ').toLowerCase(),
    });
  }
  return found;
}

/**
 * Scopes that only ever mount inside a `.fabricate` window, so a selector led by one is under a
 * root without naming it: the manager shell and the shared toggle the sheet styles for it.
 */
const INSIDE_A_ROOT = ['.fabricate-manager', '.fabricate-toggle'];

/** Whether a selector is a root, or a compound or descendant of one, and not a longer class name. */
const underRoot = (selector) =>
  [...ROOTS, ...INSIDE_A_ROOT].some(
    (root) => selector.startsWith(root) && !/[\w-]/u.test(selector.charAt(root.length) || ' ')
  );

const isReducedMotion = (declaration) =>
  declaration.context.toLowerCase().includes('prefers-reduced-motion');

const PREFIXED_MOTION =
  /(?:^|[;{}])\s*(-(?:webkit|moz|o)-(?:transition|animation)[\w-]*)\s*:\s*([^;{}]*)/giu;

/** The vendor-prefixed motion declarations, which the shared declaration scan does not read. */
function prefixedMotionDeclarations(styleCorpus) {
  return styleCorpus.rules.flatMap((rule) =>
    [...rule.body.matchAll(PREFIXED_MOTION)].map((match) => ({
      file: rule.file,
      at:
        rule.bodyLine +
        rule.body.slice(0, match.index + match[0].indexOf(match[1])).split('\n').length -
        1,
      property: match[1],
      value: match[2].trim(),
      selector: rule.selector,
      context: rule.context,
    }))
  );
}

/** Whether `declaration` is the one token declaration the rule allows. */
const isTheTokenDeclaration = (declaration) =>
  declaration.file === SHEET && declaration.selector === ':root';

/** Every site breaking the motion rule on one side: a declaration, a block or a redeclaration. */
function motionSites(styleCorpus) {
  const sites = [];
  let tokenSeen = false;
  for (const declaration of [
    ...styleCorpus.declarations,
    ...prefixedMotionDeclarations(styleCorpus),
  ]) {
    const { file, at, property, value } = declaration;
    if (property === MOTION_TOKEN) {
      if (isTheTokenDeclaration(declaration) && !tokenSeen) tokenSeen = true;
      else sites.push({ file, line: at, id: `${MOTION_TOKEN} declared again` });
      continue;
    }
    if (!MOTION_PROPERTY.test(property.toLowerCase())) continue;
    const isReset =
      file === SHEET && isReducedMotion(declaration) && property.toLowerCase() === 'transition';
    const problem = motionValueProblem(property, value, isReset);
    if (problem !== null) sites.push({ file, line: at, id: `${property}: ${value} (${problem})` });
    if (
      !file.endsWith('.svelte') &&
      !isReset &&
      value.replace(IMPORTANT, '').trim().toLowerCase() !== 'none'
    ) {
      for (const selector of splitSelectorList(declaration.selector)) {
        if (underRoot(selector)) continue;
        sites.push({ file, line: at, id: `${selector} transitions outside a Fabricate root` });
      }
    }
  }
  for (const [file, css] of Object.entries(styleCorpus.styles)) {
    const blocks = reducedMotionBlocks(file, css);
    const extra = file === SHEET ? blocks.slice(1) : blocks;
    const id = file === SHEET ? 'a second reduced-motion block' : 'a scoped reduced-motion block';
    for (const block of extra) sites.push({ file, line: block.line, id });
    for (const { line, condition } of blocks) {
      if (condition !== REDUCE_CONDITION) {
        sites.push({ file, line, id: `a reduced-motion block testing ${condition}` });
      }
    }
  }
  return sites;
}

const MOTION_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  motionSites(styleCorpusOf(readFile, files))
);

let cached = null;
function tree() {
  if (cached === null) {
    const { readFile, listFiles } = workingTree(STYLE_CORPUS);
    cached = styleCorpusOf(readFile, listFiles());
  }
  return cached;
}

const GUIDANCE =
  `A control's state change reads \`${MOTION_TOKEN}\` and names the properties that change ` +
  '(`border-color var(--fab-motion-control)`); nothing else animates. Reduced motion is the ' +
  "sheet's one block, so a component writes none of its own. See `design-system/spec.md`'s " +
  '"Every interactive primitive declares its full state set".';

test('no motion declaration carries a time or timing of its own', (t) => {
  checkGate(t, MOTION_GATE, GUIDANCE);
});

test('the working tree holds no unmarked motion site, whatever the base', () => {
  const corpus = tree();
  const unmarked = motionSites(corpus).filter(
    (site) => !exemptAt(site.file, corpus.sources[site.file], site.line)
  );
  assert.deepEqual(
    unmarked.map((site) => `${site.file}:${site.line} ${site.id}`),
    [],
    GUIDANCE
  );
});

test('the corpus is read: Svelte style blocks, and transitions reading the token', () => {
  const corpus = tree();
  const svelteBlocks = Object.keys(corpus.styles).filter((file) => file.endsWith('.svelte'));
  assertFloor('Svelte <style> blocks', svelteBlocks.length, 200);
  const readers = corpus.declarations.filter(
    (declaration) =>
      declaration.property.toLowerCase() === 'transition' && declaration.value.includes(READS_TOKEN)
  );
  assertFloor(`transitions reading ${MOTION_TOKEN}`, readers.length, 5);
  assert.ok(
    readers.some((declaration) => declaration.file.endsWith('.svelte')),
    'no Svelte transition reads the token, so the Svelte half of the scan reads nothing'
  );
  // `apps/alchemy` (the Workbench) is the player reader; the manager is the other half.
  assert.ok(
    readers.some((declaration) =>
      /^src\/ui\/svelte\/apps\/(?:alchemy|crafting)\//u.test(declaration.file)
    ),
    'no player app reads the token, so the player half of the scan reads nothing'
  );
});

test(`${MOTION_TOKEN} is declared once, in the sheet's :root, at the spec's figure`, () => {
  const declared = tree().declarations.filter(
    (declaration) => declaration.property === MOTION_TOKEN
  );
  assert.deepEqual(
    declared.map(({ file, selector, value }) => ({ file, selector, value })),
    [{ file: SHEET, selector: ':root', value: MOTION_FIGURE }]
  );
  const spec = readFileSync(join(repoRoot, 'openspec/specs/design-system/spec.md'), 'utf8');
  const heading = '### Requirement: Every interactive primitive declares its full state set';
  const start = spec.indexOf(heading);
  assert.ok(start !== -1, `the spec no longer carries "${heading}"; retarget this gate`);
  const requirement = spec.slice(start, spec.indexOf('\n### ', start + heading.length));
  assert.ok(requirement.includes(`\`${MOTION_TOKEN}\``), 'the requirement names the token');
  assert.ok(requirement.includes(MOTION_FIGURE), `the requirement states ${MOTION_FIGURE}`);
});

test('reduced motion is one sheet block removing every transition, and nothing under src', () => {
  const corpus = tree();
  const blocks = Object.entries(corpus.styles).flatMap(([file, css]) =>
    reducedMotionBlocks(file, css)
  );
  assert.deepEqual(
    blocks.map(({ file, condition }) => ({ file, condition })),
    [{ file: SHEET, condition: REDUCE_CONDITION }],
    'prefers-reduced-motion appears once, in the sheet, and tests reduce'
  );
  const inside = corpus.declarations.filter(
    (declaration) => declaration.file === SHEET && isReducedMotion(declaration)
  );
  assert.deepEqual(
    inside.map(({ property, value }) => `${property}: ${value}`),
    ['transition: none !important'],
    'the block removes transitions, and only transitions: no keyframes ship to reset'
  );
  const selectors = splitSelectorList(inside[0].selector);
  for (const root of ROOTS) {
    assert.ok(
      selectors.includes(root) && selectors.includes(`${root} *`),
      `the block reaches ${root} and everything inside it`
    );
  }
});

test('the value rule fails a time, a timing or an unread token, and passes the token', () => {
  const fails = [
    ['transition', 'color 120ms'],
    ['transition', 'opacity 0.12s ease'],
    ['transition', 'color var(--fab-motion-control) 50ms'],
    ['transition', 'color var(--fab-motion-control, 120ms)'],
    ['transition', 'color ease'],
    ['transition', 'color cubic-bezier(0.4, 0, 0.2, 1)'],
    ['transition', 'color var(--fab-other-motion)'],
    ['transition', 'all var(--fab-motion-control)'],
    ['transition', 'var(--fab-motion-control)'],
    ['transition', 'opacity'],
    ['transition-duration', '120ms'],
    ['animation', 'spin 2.2s linear infinite'],
    ['animation-duration', '.5s'],
    ['-webkit-transition', 'opacity 120ms ease'],
    ['-moz-transition', 'opacity var(--fab-motion-control) 1s'],
    ['-o-animation', 'spin 1s'],
    ['transition', 'var(--p) var(--fab-motion-control)'],
    ['transition', 'opacity var(--fab-motion-control) !important'],
    ['transition', 'none !important'],
  ];
  for (const [property, value] of fails) {
    assert.notEqual(motionValueProblem(property, value), null, `${property}: ${value}`);
  }
  const passes = [
    ['transition', 'none'],
    ['transition', 'color var(--fab-motion-control)'],
    ['transition', 'color var(--fab-motion-control), opacity var(--fab-motion-control)'],
    ['animation', 'none'],
  ];
  for (const [property, value] of passes) {
    assert.equal(motionValueProblem(property, value), null, `${property}: ${value}`);
  }
  assert.equal(motionValueProblem('transition', 'none !important', true), null, 'the reset');
  assert.equal(
    motionValueProblem('-webkit-transition', 'color var(--fab-motion-control)'),
    null,
    'a prefixed property reading the token'
  );
});

/* ───────────────────────── proofs against throwaway repositories ───────────────────────── */

const RESET =
  '@media (prefers-reduced-motion: reduce) { .fabricate * { transition: none !important; } }';

const sheetWith = (...lines) =>
  [
    `:root { ${MOTION_TOKEN}: ${MOTION_FIGURE}; }`,
    `.fabricate .a { transition: color var(${MOTION_TOKEN}); }`,
    RESET,
    ...lines,
    '',
  ].join('\n');

const svelteWith = (...rules) =>
  ['<div class="p"></div>', '<style>', ...rules.map((rule) => `  ${rule}`), '</style>', ''].join(
    '\n'
  );

const WIRING_BASE = Object.freeze({ [SHEET]: sheetWith(), 'README.md': 'unrelated\n' });

const MANAGER = 'src/ui/svelte/apps/manager/Probe.svelte';
const COMPONENT = 'src/ui/svelte/components/Probe.svelte';
const PLAYER = 'src/ui/svelte/apps/crafting/Probe.svelte';
const SCOPED_RESET = '@media (prefers-reduced-motion: reduce) { .p { transition: none; } }';

test('the gate fails a literal time anywhere under src or styles, and passes the token', (t) => {
  const at = (file, rule, failures) => ({ head: { [file]: svelteWith(rule) }, failures });
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    {
      head: { [SHEET]: sheetWith('.fabricate .b { transition: color 120ms; }') },
      failures: [`${SHEET}: transition: color 120ms (a literal time) is new (1)`],
    },
    at(MANAGER, '.p { transition: opacity 0.12s; }', [
      `${MANAGER}: transition: opacity 0.12s (a literal time) is new (1)`,
    ]),
    at(COMPONENT, '.p { transition: opacity 120ms ease; }', [
      `${COMPONENT}: transition: opacity 120ms ease (a literal time) is new (1)`,
    ]),
    at(PLAYER, '.p { transition: transform 120ms ease; }', [
      `${PLAYER}: transition: transform 120ms ease (a literal time) is new (1)`,
    ]),
    at(PLAYER, `.p { transition: color var(${MOTION_TOKEN}); }`, []),
  ]);
});

test('the gate fails a scoped reduced-motion block, a second sheet reset and a redeclaration', (t) => {
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    {
      head: { [PLAYER]: svelteWith(SCOPED_RESET) },
      failures: [`${PLAYER}: a scoped reduced-motion block is new (1)`],
    },
    {
      head: { [SHEET]: sheetWith(RESET) },
      failures: [`${SHEET}: a second reduced-motion block is new (1)`],
    },
    {
      head: { [COMPONENT]: svelteWith(`.p { ${MOTION_TOKEN}: 120ms ease; }`) },
      failures: [`${COMPONENT}: ${MOTION_TOKEN} declared again is new (1)`],
    },
  ]);
});

test('the gate fails a reduced-motion block that does not test reduce, whatever its case', (t) => {
  const sheet = (reset) => ({
    [SHEET]: [
      `:root { ${MOTION_TOKEN}: ${MOTION_FIGURE}; }`,
      `.fabricate .a { transition: color var(${MOTION_TOKEN}); }`,
      reset,
      '',
    ].join('\n'),
  });
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    {
      head: sheet(RESET.replace('reduce)', 'no-preference)')),
      failures: [
        `${SHEET}: a reduced-motion block testing (prefers-reduced-motion: no-preference) is new (1)`,
      ],
    },
    { head: sheet(RESET.replace('@media', '@MEDIA').replace('reduce)', 'REDUCE)')), failures: [] },
    {
      head: { [SHEET]: sheetWith(RESET.replace('@media', '@MEDIA')) },
      failures: [`${SHEET}: a second reduced-motion block is new (1)`],
    },
  ]);
});

test('the gate fails a prefixed, aliased or !important motion and a transition outside a root', (t) => {
  const inSheet = (css, failures) => ({ head: { [SHEET]: sheetWith(css) }, failures });
  const fabric = (body) => `.fabricate .b { ${body} }`;
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    inSheet(fabric('-webkit-transition: opacity 120ms ease;'), [
      `${SHEET}: -webkit-transition: opacity 120ms ease (a literal time) is new (1)`,
    ]),
    inSheet(fabric(`transition: var(--p) var(${MOTION_TOKEN});`), [
      `${SHEET}: transition: var(--p) var(${MOTION_TOKEN}) (names its property other than by a plain identifier) is new (1)`,
    ]),
    inSheet(fabric(`transition: opacity var(${MOTION_TOKEN}) !important;`), [
      `${SHEET}: transition: opacity var(${MOTION_TOKEN}) !important (an !important motion) is new (1)`,
    ]),
    inSheet(fabric(`-webkit-transition: opacity var(${MOTION_TOKEN});`), []),
    inSheet(`.fabricate-extra .b { transition: opacity var(${MOTION_TOKEN}); }`, [
      `${SHEET}: .fabricate-extra .b transitions outside a Fabricate root is new (1)`,
    ]),
    inSheet(`.outside, .fabricate-dice-tiles .c { transition: opacity var(${MOTION_TOKEN}); }`, [
      `${SHEET}: .outside transitions outside a Fabricate root is new (1)`,
    ]),
    inSheet(`.fabricate-dice-tiles .c:hover { transition: opacity var(${MOTION_TOKEN}); }`, []),
  ]);
});

/* ─────────────────── motion written anywhere else under src is not the token ─────────────────── */

const SRC_FILE = /^src\/.*\.(?:svelte|js)$/u;

/** `text` with each match of `pattern` blanked to its newlines, so later lines keep their numbers. */
const blanked = (text, pattern) =>
  text.replaceAll(pattern, (match) => match.replaceAll(/[^\n]/gu, ''));

const MARKUP_MOTION = [
  ['a Svelte motion directive', /\s(?:transition|in|out|animate):[A-Za-z_$][\w$]*(?=[\s=|/>])/gu],
  ['an inline style transition', /\bstyle\s*=\s*(?:"[^"]*|'[^']*|\{[^}]*)\btransition\s*:/giu],
  ['a style: transition directive', /\bstyle:transition\b/gu],
];
const CODE_MOTION = [
  [
    'a svelte/transition, animate or motion import',
    /['"]svelte\/(?:transition|animate|motion)['"]/gu,
  ],
  ['a script-set transition', /\.style\.transition\b|style\.setProperty\(\s*['"]transition/gu],
  ['an animate() call', /\.animate\(/gu],
];
const ANY_MOTION = [
  ['a keyframes rule', /@keyframes\b/giu],
  ['smooth scrolling', /scroll-behavior\s*:\s*smooth/giu],
];

/** Every site under `src/` that moves something other than a state change reading the token. */
function strayMotionSites(readFile, files) {
  const sites = [];
  for (const file of files) {
    const source = SRC_FILE.test(file) ? readFile(file) : undefined;
    if (source === undefined) continue;
    const code = blanked(source, /<style\b[\s\S]*?<\/style>/giu);
    const markup = blanked(
      blanked(blanked(code, /<script\b[\s\S]*?<\/script>/giu), /<!--[\s\S]*?-->/gu),
      /\{\/\*[\s\S]*?\*\/\}/gu
    );
    const scan = [
      ...(file.endsWith('.svelte') ? MARKUP_MOTION.map((row) => [...row, markup]) : []),
      ...CODE_MOTION.map((row) => [...row, code]),
      ...ANY_MOTION.map((row) => [...row, source]),
    ];
    for (const [id, pattern, text] of scan) {
      for (const match of text.matchAll(pattern)) {
        sites.push({ file, line: text.slice(0, match.index).split('\n').length, id });
      }
    }
  }
  return sites;
}

const STRAY_GATE = {
  ...gateOver([MODULE_CORPUS, TEMPLATE_CORPUS], strayMotionSites),
  include: (file) => SRC_FILE.test(file),
};

test('nothing under src moves outside the token: no directive, import, script, keyframe or smooth scroll', () => {
  const { readFile, listFiles } = workingTree(MODULE_CORPUS, TEMPLATE_CORPUS);
  const files = listFiles();
  assertFloor('src files', files.filter((file) => SRC_FILE.test(file)).length, 500);
  assert.deepEqual(
    strayMotionSites(readFile, files).map((site) => `${site.file}:${site.line} ${site.id}`),
    [],
    GUIDANCE
  );
});

test('the stray-motion scan fails each form and passes a data field named duration', (t) => {
  const SVELTE = 'src/ui/svelte/components/Stray.svelte';
  const MODULE = 'src/ui/Stray.js';
  const IMPORT = 'a svelte/transition, animate or motion import';
  const withMarkup = (markup) => ({ [SVELTE]: `${markup}\n` });
  const withScript = (code) => ({ [SVELTE]: `<script>\n${code}\n</script>\n<div></div>\n` });
  const withStyle = (css) => ({ [SVELTE]: `<div></div>\n<style>\n  ${css}\n</style>\n` });
  const fail = (head, file, id) => ({ head, failures: [`${file}: ${id} is new (1)`] });
  assertGateCases(t, STRAY_GATE, { 'src/ui/Base.js': 'export const base = 1;\n' }, [
    fail(withMarkup('<div transition:fade></div>'), SVELTE, 'a Svelte motion directive'),
    fail(withMarkup('<div in:fly={{ y: 4 }}></div>'), SVELTE, 'a Svelte motion directive'),
    fail(withMarkup('<div out:fade|local></div>'), SVELTE, 'a Svelte motion directive'),
    fail(withMarkup('<li animate:flip></li>'), SVELTE, 'a Svelte motion directive'),
    fail(
      withMarkup('<div style="color: red; transition: opacity 1s"></div>'),
      SVELTE,
      'an inline style transition'
    ),
    fail(
      withMarkup('<div style:transition="opacity 1s"></div>'),
      SVELTE,
      'a style: transition directive'
    ),
    fail(withScript("import { fade } from 'svelte/transition';"), SVELTE, IMPORT),
    fail(withScript("import { flip } from 'svelte/animate';"), SVELTE, IMPORT),
    fail({ [MODULE]: "import { tweened } from 'svelte/motion';\n" }, MODULE, IMPORT),
    fail(
      { [MODULE]: "element.style.transition = 'opacity 1s';\n" },
      MODULE,
      'a script-set transition'
    ),
    fail({ [MODULE]: 'element.animate([], 100);\n' }, MODULE, 'an animate() call'),
    fail(withStyle('@keyframes spin { to { opacity: 1; } }'), SVELTE, 'a keyframes rule'),
    fail(withStyle('.p { scroll-behavior: smooth; }'), SVELTE, 'smooth scrolling'),
    { head: { [MODULE]: 'export const task = { duration: 3, in: 4 };\n' }, failures: [] },
    { head: withMarkup('<div class="in:x">text transition: none</div>'), failures: [] },
    { head: withStyle('.p { transition: color var(--fab-motion-control); }'), failures: [] },
  ]);
});

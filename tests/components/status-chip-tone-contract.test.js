/**
 * THE CONVERTED SITES READ THEIR TONE THROUGH THE MAP, AND ONE CHIP WEARS THE PLATE (issue 1506).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { listSvelteComponents, toRepositoryPaths } from '../../scripts/lib/svelteComponentFiles.js';
import { openingTagsNamed } from '../helpers/svelteTagScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const MAP_MODULE = 'util/statusChipTone.js';
const MAP_CALL = 'statusChipTone(';

/** Every `.svelte` under `src/`, as `{ path, source }`, read once. */
const COMPONENT_FILES = listSvelteComponents(join(repoRoot, 'src'));
const COMPONENTS = toRepositoryPaths(repoRoot, COMPONENT_FILES).map((path, index) => ({
  path,
  source: readFileSync(COMPONENT_FILES[index], 'utf8'),
}));

/** The corpus: every component that imports the map. */
const MAP_READERS = COMPONENTS.filter(({ source }) => source.includes(MAP_MODULE));

/** THE CONVERTED SITES, COUNTED, so the clause below cannot pass over nothing. */
// #1648 replaces HistoryRow's mapped status chip with a labeled outcome glyph.
const MAPPED_TONE_SITES = 25;

/** The one shipped chip that asks for the flat plate. */
const OUTLINED_CHIP = 'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte';

/**
 * The `tone={…}` expression a chip tag binds, or `null` when it binds a literal or none.
 *
 * @param {string} tag one `<Chip …>` opening tag's source text
 * @returns {string|null}
 */
function dynamicToneOf(tag) {
  const start = tag.indexOf('tone={');
  if (start === -1) return null;
  let depth = 0;
  for (let index = start + 'tone='.length; index < tag.length; index += 1) {
    if (tag[index] === '{') depth += 1;
    else if (tag[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return tag
          .slice(start + 'tone={'.length, index)
          .replaceAll(/\s+/g, ' ')
          .trim();
      }
    }
  }
  return null;
}

describe('1506 the tone map — its landed domain', () => {
  it('is read by the eighteen files retaining mapped status chips', () => {
    assert.equal(
      MAP_READERS.length,
      18,
      'the number of files importing the tone map moved. A file JOINING it is a later phase ' +
        'converting more sites and this pin moves with it; a file LEAVING it is a converted ' +
        'site that must be checked for retired chips or a projected tone bound directly, which ' +
        'renders untoned and fails nothing else. Found: ' +
        MAP_READERS.map(({ path }) => path).join(', ')
    );
  });

  it('is CALLED by every file that imports it', () => {
    const unused = MAP_READERS.filter(({ source }) => !source.includes(MAP_CALL)).map(
      ({ path }) => path
    );
    assert.deepEqual(
      unused,
      [],
      'an import with no call is a file that stopped routing its tone but kept the line that ' +
        'makes this guard count it'
    );
  });

  it('binds no chip tone in that corpus except through the map', () => {
    const mapped = [];
    const unmapped = [];
    for (const { path, source } of MAP_READERS) {
      for (const tag of openingTagsNamed(source, 'Chip')) {
        const expression = dynamicToneOf(tag);
        if (expression === null) continue;
        (expression.startsWith(MAP_CALL) ? mapped : unmapped).push(`${path}: tone={${expression}}`);
      }
    }
    assert.deepEqual(
      unmapped,
      [],
      'a chip in a converted file binds a tone the map never sees. `Chip` drops a tone it does ' +
        'not know, so this renders an untoned chip with no class, no error and no other failing ' +
        'test. A NATIVE chip site whose projection already emits chip tones belongs in a file ' +
        'that imports no map — measured, the four in this tree do — or, if a later conversion ' +
        'puts one in this corpus, in a pinned exemption stating why'
    );
    assert.equal(
      mapped.length,
      MAPPED_TONE_SITES,
      'the number of mapped tone bindings moved, so the clause above may be quantifying over a ' +
        `smaller corpus than the conversion left behind. Found: ${mapped.join(', ')}`
    );
  });
});

describe('1506 the outlined emphasis — an exact census', () => {
  it('ships on exactly ONE chip in `src/`, and it is the identity strip', () => {
    const sites = [];
    for (const { path, source } of COMPONENTS) {
      for (const tag of openingTagsNamed(source, 'Chip')) {
        if (/emphasis=(?:"outlined"|'outlined'|\{'outlined'\})/.test(tag)) sites.push(path);
      }
    }
    assert.deepEqual(
      sites,
      [OUTLINED_CHIP],
      'the flat `--fab-bg-1` plate has exactly one caller, and a second one is almost certainly ' +
        "a badge carrying the RETIRED pill's prop of the same name forward — a value this chip " +
        'recognises and draws as the opposite face, silently. The shipped pair for that face is ' +
        '`tone="secondary" density="list"`'
    );
  });
});

/**
 * The class the journal rows pass to their status chip. It is the caller's own name rather
 * than the chip's, so the rule below cannot be answered by a rule about chips in general.
 */
const RUN_CHIP_CLASS = 'journal-run-status';

// Read RULE BLOCKS rather than matching the class immediately before a brace. A caller that
// groups the row's two chips into one selector list — `:global(.a), :global(.b) {` — satisfies
// this requirement exactly, and a regex anchored on `)` `{` would call that a missing
// declaration. The block's selector list is what has to name the chip; its body is what has to
// carry the property. Comments are stripped first and the selector is required to precede the
// block's own `{`, so a comment mentioning the selector immediately above an UNRELATED rule that
// happens to carry `flex: 0 0 auto;` cannot satisfy this — only the selector list belonging to
// that rule's own opening brace can.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const declaresShrinkProtection = (source) =>
  stripComments(source)
    .split('}')
    .some((block) => {
      const braceIndex = block.indexOf('{');
      if (braceIndex === -1) return false;
      return (
        block.slice(0, braceIndex).includes(`:global(.${RUN_CHIP_CLASS})`) &&
        /flex:\s*0 0 auto;/.test(block.slice(braceIndex + 1))
      );
    });

describe('1506 the journal run chip — its shrink protection is restated per caller', () => {
  it('is declared by every file that renders it, and by no other', () => {
    const callers = COMPONENTS.filter(({ source }) => source.includes(`class="${RUN_CHIP_CLASS}"`));
    assert.equal(
      callers.length,
      2,
      'RunCard owns the Active list row chip and RecentResults the Finished list row chip; two ' +
        `row chip callers remain. Found: ${callers.map(({ path }) => path).join(', ')}`
    );

    const missing = callers
      .filter(({ source }) => !declaresShrinkProtection(source))
      .map(({ path }) => path);
    assert.deepEqual(
      missing,
      [],
      'a journal row renders the status chip without restating `flex: 0 0 auto` for it. The ' +
        'retired pill carried that on itself; the shared chip carries no flex at all, so the ' +
        'chip gives up width to a name beside it that was meant to absorb the squeeze. Position ' +
        'stays with the caller, which is exactly why each caller has to say it'
    );
  });

  it('is not satisfied by a comment mentioning the selector above an unrelated rule', () => {
    // The defect this guards against.
    const trap = `
      /* :global(.${RUN_CHIP_CLASS}) is mentioned here but this rule is unrelated */
      .something-else {
        flex: 0 0 auto;
      }
    `;
    assert.equal(declaresShrinkProtection(trap), false, 'a comment mention must not satisfy the guard');

    // The guard must still accept a real grouped selector list, which is a correct declaration.
    const grouped = `
      .journal-run-card-heading :global(.${RUN_CHIP_CLASS}),
      .journal-run-card-heading :global(.journal-run-attention) {
        flex: 0 0 auto;
      }
    `;
    assert.equal(declaresShrinkProtection(grouped), true, 'a grouped selector list must still pass');

    // And it must fail outright when the declaration is simply absent.
    const absent = `
      .journal-run-card-heading :global(.${RUN_CHIP_CLASS}) {
        color: red;
      }
    `;
    assert.equal(declaresShrinkProtection(absent), false, 'no flex declaration must fail');
  });
});

/** THE ICON-ONLY CHIP CARRIES A NAME (issue 1506). */
describe('1506 the icon-only chip — the accessible name it must carry', () => {
  it('ships with an `aria-label` at every one of its call sites', () => {
    const sites = [];
    const unnamed = [];
    for (const { path, source } of COMPONENTS) {
      for (const tag of openingTagsNamed(source, 'Chip')) {
        if (!/(?:^|\s)iconOnly(?![\w-])/.test(tag)) continue;
        sites.push(path);
        if (!/(?:^|\s)aria-label=/.test(tag)) unnamed.push(path);
      }
    }

    assert.deepEqual(
      unnamed,
      [],
      'an icon-only chip ships with no `aria-label`. Its glyph is `aria-hidden` and its label is ' +
        'suppressed, so it is announced as nothing at all — and a `title` is a tooltip rather ' +
        'than a name, which is precisely the defect this face was converted to stop reproducing'
    );

    assert.equal(
      sites.length,
      1,
      'the icon-only face has exactly one caller — the recipe browser row, whose status is ' +
        'already spelled out in words beside it. The count is pinned so the clause above cannot ' +
        `be satisfied by a tree that has stopped rendering the face at all. Found: ${sites}`
    );
  });
});

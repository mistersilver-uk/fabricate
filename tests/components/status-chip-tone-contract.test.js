/**
 * THE CONVERTED SITES READ THEIR TONE THROUGH THE MAP, AND ONE CHIP WEARS THE PLATE (issue 1506).
 *
 * Two source contracts over the same corpus, both guarding a failure that is SILENT in the
 * rendered DOM and invisible to every mounted suite in the repository.
 *
 * ── WHY THE DOMAIN IS DERIVED FROM DISK AND NOT LISTED ──────────────────────────────────────
 * "The converted set" cannot be "every `<Chip tone={…}>` in `src/`": about thirty chip callers
 * bind an opaque tone that never came from a status pill and never needs mapping. And it cannot
 * be a hand-typed list of the converted files either — that is a second copy of the very
 * enumeration whose incompleteness is the risk. So the corpus is every `src/` file that IMPORTS
 * the map, read from disk at run time, with the file COUNT pinned: a domain that can silently
 * shrink is not a guard, so a converted file dropping its import reds here rather than quietly
 * leaving the population this file quantifies over.
 *
 * Nothing here reads git history. The comparison that could only be made while both components
 * existed — the pill's tones against the chip's — was made in the phase that deleted the pill and
 * pasted into the PR; on the integrated branch its second side does not exist, so a test shaped
 * that way would be green for one commit and red forever after.
 *
 * ── THE TONE FAILURE ────────────────────────────────────────────────────────────────────────
 * `Chip` DROPS a tone it does not know — no class, no error, no failing test — while the retired
 * pill resolved one to `subtle`. The projections behind these sites emit the pill's vocabulary,
 * in which `success` is the commonest name and is not a chip tone at all. A site that binds a
 * projected tone straight onto a chip therefore renders an untoned chip on a green suite: the
 * salvage yields, the bulk report's outcomes, the recipe row pills and the Tool player preview
 * lose their green and nothing anywhere says so.
 *
 * ── THE SHRINK FAILURE, WHICH IS A MIRROR RATHER THAN A DROP ────────────────────────────────
 * The journal's retired run pill declared `flex: 0 0 auto` on ITSELF. `Chip` declares no flex at
 * all, because position is the caller's and geometry is the primitive's — so the property has to
 * be restated once per call site, and four copies of one rule is a mirror that rots the first time
 * a fifth row renders the chip and nobody remembers. The clause below is what keeps them honest.
 *
 * ── THE EMPHASIS FAILURE, WHICH IS THE OPPOSITE SHAPE ───────────────────────────────────────
 * `emphasis="outlined"` is RECOGNISED on the chip and means the opposite of what it meant on the
 * pill: the pill's outlined face superseded the tone's edge and ink and kept its fill, and the
 * chip's supersedes the FILL and draws a flat `--fab-bg-1` plate. So a site carrying that prop
 * forward from the pill does not fall back to the shipped face — it draws the WRONG face, and
 * only a census can see it. Exactly one chip in `src/` asks for the plate, and it is the caller
 * that has always meant it.
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

/**
 * THE CONVERTED SITES, COUNTED, so the clause below cannot pass over nothing.
 *
 * Twelve of the retired status pill's 36 sites bound their tone dynamically — six opaque
 * projection reads and six ternaries — and every one of them routes through the map. The four
 * journal run sites join them: each reads a `RunModel.derivedStatus` through the run-status
 * vocabulary, whose `ready`, `succeeded` and `cancelled` entries emit `success` and `neutral`,
 * neither of which is a chip tone under that spelling. The two recipe browse-status sites join
 * them on the same fact, from the crafting vocabulary's `AVAILABLE` and `LOCKED`, and so do the
 * six have/need readings, four of which pass `success` inline from a satisfied-or-not ternary.
 *
 * The floor is stated rather than derived because the clause it guards is a NEGATIVE: "no chip in
 * this corpus binds a tone the map never sees" is satisfied by a corpus with no dynamic chips in
 * it at all, which is exactly what a regression that reverted the conversion would produce.
 */
// #1648 replaces HistoryRow's mapped status chip with a labeled outcome glyph, and adds the
// run-attention chip (M10) beside the status chip in BOTH journal run surfaces — the Active
// list row and the run header. Both route through the map, so the floor rises by two rather
// than the negative clause above quantifying over a corpus that quietly lost them.
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
    // The defect this guards against: a comment mentioning `:global(.journal-run-status)`
    // immediately above an unrelated rule that happens to carry `flex: 0 0 auto;` used to pass,
    // because the old check searched the whole block rather than only the text before `{`.
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

/**
 * THE ICON-ONLY CHIP CARRIES A NAME (issue 1506).
 *
 * `iconOnly` suppresses the label, and the glyph the chip draws is `aria-hidden`, so an icon-only
 * chip with no `aria-label` is announced as nothing at all. The primitive states `role="img"`
 * where it can, but it cannot supply a name it was never given — the `title` the retired badge
 * carried is a tooltip, and a tooltip is not an accessible name.
 *
 * This is a CALL-SITE census rather than a mounted case for that reason: the defect is a caller
 * omitting a prop, which renders perfectly and fails nothing. The floor is stated beside it so the
 * negative cannot pass over an empty corpus — exactly one converted caller ships today.
 */
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

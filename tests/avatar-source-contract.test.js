/** Source contract: an actor's portrait says what its artwork is for (issue 1506). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { defineClosedTokenContract } from './helpers/primitiveSourceContract.js';
import { openingTagsNamed } from './helpers/svelteTagScan.js';

/** The class only the primitive may write. A NEW token: nothing else in the tree writes it. */
const CONTRACT_CLASS = 'fab-avatar';

const PRIMITIVE = 'src/ui/svelte/components/Avatar.svelte';

/**
 * Does this tag name `prop`, in either binding form?
 *
 * @param {string} tag one opening tag's source text
 * @param {string} prop the prop name
 */
function names(tag, prop) {
  return (
    new RegExp(String.raw`(?<![\w-])${prop}=`).test(tag) ||
    new RegExp(String.raw`\{\s*${prop}\s*\}`).test(tag)
  );
}

const contract = defineClosedTokenContract({
  label: 'avatar',
  tag: 'Avatar',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,

  // Exactly 2 files render the primitive as this lands — the GM Knowledge surface's roster row
  // and its detail header — which is the membership bar itself, so the floor is the measurement.
  callSiteFloor: 2,

  // Two tokens, asserted separately so a failure names the one that went missing. The class is what
  // the restatement clause polices.
  emits: Object.freeze([`class="${CONTRACT_CLASS}"`, "data-avatar={art ? 'image' : 'initials'}"]),

  primitiveWrites: {
    count: 5,
    why:
      'the primitive itself, which writes the class so that no call site has to remember it. ' +
      'The count is 5 rather than 1 because the token is the STEM of two element classes ' +
      'beneath it — `fab-avatar-img` and `fab-avatar-initials` — and of the two custom ' +
      'properties the box style interpolates, `--fab-avatar-initials` and `--fab-avatar-tint`, ' +
      'and the shared clause matches by SUBSTRING. That is the shape a caller writing any of ' +
      'the five would be caught by, so the count is pinned rather than the match narrowed',
  },

  classOnlyRemedy:
    'an actor\'s portrait is an `<Avatar>`, never a hand-written `class="fab-avatar"` and never ' +
    'a fresh scoped rule restating the round corner, the cover fit and the initials fallback',

  keepInstead:
    'A site that needs a flex row, a gap or a min-width keeps its OWN wrapper element and nests ' +
    'the portrait inside it, with the layout on the wrapper — see `Avatar.svelte`',

  hookAdvice:
    'This primitive owns its own hooks — `data-avatar` and `data-avatar-tint` — so a selector ' +
    'narrows by the CALLER-owned element around it rather than by an attribute passed through',
});

/**
 * `<Avatar …>` opening tags across the corpus the shared spine already built, as `{ file, tag }`.
 */
const TAGS = contract.callSiteTags.map(([file, tag]) => ({ file, tag }));

test('the avatar census is the five shipped call sites, so no clause below is vacuous', () => {
  contract.assertCallSitesAlive();
  assert.equal(
    TAGS.length,
    5,
    'the avatar render-site census moved. That is not itself wrong — the third caller is what ' +
      'put this component on the mount harnesses` SHARED_PRIMITIVES list (issue 1514), and the ' +
      'crafting source bar added the fourth and fifth in the phase after it: the row of source ' +
      'portraits in the Crafting tab`s top bar and the picker option beneath it — but the count ' +
      'is what keeps the clauses below honest, so it is re-measured deliberately.'
  );
  assert.equal(
    TAGS.filter(({ tag }) => names(tag, 'art')).length,
    5,
    'every site passes an actor image, and the INITIALS FALLBACK IS NOW REACHABLE at three of ' +
      'them. This message used to read "the initials fallback is the state neither reaches", ' +
      'and issue 1514 falsified it: the two GM Knowledge sites pass an image the projection ' +
      'always resolves, while the player inventory inspector and both crafting source sites ' +
      'pass the empty string for an actor with no portrait, which is the state that draws the ' +
      'mark — and it is the state the three of them drew an `fa-user` glyph for before. Naming ' +
      '`art` and PASSING artwork are different facts, and this clause measures the first'
  );
});

test('`alt` is a decision, not a default, at every call site that passes artwork', () => {
  contract.assertCallSitesAlive();

  const silent = TAGS.filter(({ tag }) => names(tag, 'art') && !names(tag, 'alt')).map(
    ({ file, tag }) => `${file}: ${tag.replaceAll(/\s+/g, ' ')}`
  );

  assert.deepEqual(
    silent,
    [],
    'an avatar passing artwork must say what the artwork is for. `alt=""` is the right answer ' +
      'wherever the actor name is adjacent text, which is both shipped sites — but it has to be ' +
      'WRITTEN, because an absent attribute is an author who never asked the question.'
  );
});

test('the alt detector reads a tag it has never seen, in both directions', () => {
  // THE DISCRIMINATION CLAUSE. The clause above is a negative over a corpus whose whole point is
  // that it contains no positive case, so a detector that had silently stopped matching would
  // report clean and read exactly like a completed conversion.
  const fixture = [
    '<Avatar art={character.img} name={character.name} size={34} />',
    '<Avatar art={character.img} name={character.name} size={34} alt="" />',
    '<Avatar {art} {alt} name={character.name} />',
    '<Avatar art={character.img} data-alt="x" />',
    '<Avatar name={character.name} size={34} />',
  ].join('\n');
  const tags = openingTagsNamed(fixture, 'Avatar');
  assert.equal(tags.length, 5, 'the tag reader finds every call in the fixture');
  assert.deepEqual(
    tags.map(
      (tag) => `${names(tag, 'art') ? 'art' : 'initials'}/${names(tag, 'alt') ? 'alt' : 'silent'}`
    ),
    ['art/silent', 'art/alt', 'art/alt', 'art/silent', 'initials/silent'],
    'the detector reads the shorthand binding as well as the attribute one, and does NOT read ' +
      '`data-alt` as this attribute — the two ways a silent site would otherwise escape'
  );
});

/**
 * The clause that is this primitive's own beyond `alt`: WHAT SHAPE IT MAY BE, and that none of it
 * is interactive.
 */
test('the avatar renders one of two published, non-interactive shapes, and nothing else', () => {
  const source = contract.primitiveMarkup();

  const shapes = contract.declaredList({
    declaration: /const SHAPES = new Set\(\[([^\]]*)\]\)/,
    member: /'([^']+)'/g,
    absent: 'the primitive no longer declares its shape union as a literal Set',
  });

  assert.deepEqual(
    shapes,
    ['round', 'square'],
    'the shape union is what `library.html:1431` publishes: round for people, rounded-square ' +
      'for parties, vehicles and places. A third member is a ruling about what an actor mark may be'
  );

  // The guard that makes the union a union rather than a suggestion.
  assert.match(
    source,
    /SHAPES\.has\(shape\) \? shape : FALLBACK_SHAPE/,
    'an unrecognised `shape` must fall back to the published default rather than being rendered, ' +
      'or the union above is advisory and this clause is policing a list nothing reads'
  );

  contract.assertNothingInteractive(
    'an avatar is a MARK, so an interactive element or a handler here is a routing error rather ' +
      'than a feature — a portrait a GM can click is a control and belongs to a control primitive'
  );
});

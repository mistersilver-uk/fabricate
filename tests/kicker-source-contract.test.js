/**
 * Source contract: the uppercase micro-label is written in ONE place (issue 1505). The eyebrow is
 * the most-restated shape in the product, and it was never a component — it was a set of CSS
 * conventions that had drifted apart from each other.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import test from 'node:test';

import { listSvelteComponents } from '../scripts/lib/svelteComponentFiles.js';
import { defineClosedTokenContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. A NEW token: nothing else in the tree writes it. */
const CONTRACT_CLASS = 'fab-kicker';

const PRIMITIVE = 'src/ui/svelte/components/Kicker.svelte';

const contract = defineClosedTokenContract({
  label: 'kicker',
  tag: 'Kicker',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,

  // 10 files render the primitive as this lands — eight in the player crafting detail tree, the
  // manager's recipe-item Overview tab, and `StatBox`, which composes it.
  callSiteFloor: 10,

  // Pinned in its RENDERED form — `class="fab-kicker"` — rather than as a quoted JS literal,
  // because this component writes the token straight onto the element rather than composing a class
  // list.
  emits: `class="${CONTRACT_CLASS}"`,

  primitiveWrites: {
    count: 1,
    why:
      'the primitive itself, which writes the class once so that no call site has to remember ' +
      'it. The count is 1 rather than the 2 the card and the icon button record because this ' +
      "component's prop notes live in the leading HTML comment, which `withoutComments` does " +
      'strip, and its accent modifier is a `class:` directive that names a different token',
  },

  classOnlyRemedy:
    'an uppercase micro-label is a `<Kicker>`, never a hand-written `class="fab-kicker"` and ' +
    'never a fresh scoped rule restating 8.5px / 700 / 0.11em / uppercase / --fab-text-muted',

  keepInstead:
    'A site that needs a flex row, an ellipsis or a min-width keeps its OWN wrapper element ' +
    'and nests the kicker inside it, with the layout on the wrapper — see `Kicker.svelte`',

  hookAdvice: 'Pass the hook as `dataAttr="data-x"` and leave `dataValue` at its default',
});

/** The clause that is this primitive's own: WHAT IT RENDERS, and that none of it is interactive. */
test('the kicker renders one of three measured, non-interactive hosts, and nothing else', () => {
  const source = contract.primitiveMarkup();

  const hosts = contract.declaredList({
    declaration: /const HOSTS = new Set\(\[([^\]]*)\]\)/,
    member: /'([^']+)'/g,
    absent: 'the primitive no longer declares its host union as a literal Set',
  });

  assert.deepEqual(
    hosts,
    ['p', 'span', 'h3'],
    'the host union is the MEASURED set of eyebrow hosts (62 `<p>`, 3 `<span>`, 1 `<h3>`). ' +
      'Adding a member is a design ruling about what a micro-label may be, and adding an ' +
      'interactive one would make every kicker a focus stop'
  );

  // The guard that makes the union a union rather than a suggestion.
  assert.match(
    source,
    /HOSTS\.has\(as\) \? as : FALLBACK_HOST/,
    'an unrecognised `as` must fall back to the measured default rather than being rendered, ' +
      'or the union above is advisory and this clause is policing a list nothing reads'
  );

  contract.assertNothingInteractive(
    'a kicker is a LABEL, so an interactive element or a handler here is a routing error ' +
      'rather than a feature'
  );
});
/** THE INK, WHICH IS THE SECOND CORRECTION TO `library.html:120` AND THE ONE A PALETTE HID. */
test('the kicker inks at the muted tone, which is the contrast correction the specimen carries too', () => {
  const source = readFileSync(resolve(import.meta.dirname, '..', PRIMITIVE), 'utf8');
  const base = source.slice(source.indexOf('.fab-kicker {'));
  const body = base.slice(0, base.indexOf('}'));

  assert.match(
    body,
    /color:\s*var\(--fab-text-muted\)/,
    'the base kicker inks at `--fab-text-muted`: at 8.5px the specimen`s subtle tone is under ' +
      'the small-text contrast floor on six of the seven palettes, clearing it only on `mythwright`'
  );
  assert.ok(
    !body.includes('--fab-text-subtle'),
    'and the subtle tone is gone rather than left beside the correction'
  );

  const specimen = readFileSync(
    resolve(import.meta.dirname, '../openspec/specs/design-system/library.html'),
    'utf8'
  );
  const rule = specimen.slice(specimen.indexOf('.k-kicker{'));
  assert.match(
    rule.slice(0, rule.indexOf('}')),
    /color:var\(--fab-text-muted\)/,
    'and `library.html`s own specimen carries the correction, so the drawn example and the ' +
      'shipped component do not disagree — the same way the `.11em` tracking correction was made'
  );
});


/**
 * A NESTED CHILD MUST NOT RE-DECLARE THE MARK'S INK (issue 1514). The remedy is always to DELETE
 * the child's `color`, never to narrow the primitive: the ink is right for all of its render sites,
 * and re-breaking them to spare one caller inverts the trade.
 */
const KICKER_BLOCK = /<Kicker\b[^>]*>([\s\S]*?)<\/Kicker\s*>/g;
const NESTED_CLASS = /class="([\w\s-]+)"/g;

test('no element nested inside a Kicker re-declares the mark`s ink', () => {
  const repoRoot = resolve(import.meta.dirname, '..');
  const offenders = [];

  for (const file of listSvelteComponents(resolve(repoRoot, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('<Kicker')) continue;

    const nestedClasses = new Set();
    for (const [, inner] of source.matchAll(KICKER_BLOCK)) {
      for (const [, value] of inner.matchAll(NESTED_CLASS)) {
        for (const className of value.split(/\s+/).filter(Boolean)) nestedClasses.add(className);
      }
    }
    if (nestedClasses.size === 0) continue;

    for (const className of nestedClasses) {
      // The class's OWN rule in this file's scoped block, matched as a whole selector so that
      // `.a-note` does not answer for `.a-note-icon`, and read only as far as its closing brace.
      const rule = new RegExp(String.raw`\.${className}\b[^{;}]*\{([^}]*)\}`);
      const body = rule.exec(source)?.[1];
      if (body && /(^|[\s;])color\s*:/.test(body)) {
        offenders.push(
          `${relative(repoRoot, file).split(sep).join('/')} declares \`color\` on ` +
            `.${className}, which it nests INSIDE a <Kicker>`
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a nested child that declares its own `color` splits one line of text into two inks the ' +
      'moment the mark`s ink moves; delete the child`s `color` and let it inherit:\n- ' +
      offenders.join('\n- ')
  );
});

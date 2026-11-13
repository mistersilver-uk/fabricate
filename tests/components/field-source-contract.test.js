/** The END STATE of the `.fabricate-field` conversion, pinned in source (issue 1428). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SOURCES, definePrimitiveAdoptionContract } from '../helpers/primitiveAdoptionContract.js';

/** The primitive whose adoption this file pins. */
const FIELD_PATH = 'src/ui/svelte/components/Field.svelte';

/** No component writes a raw `.fabricate-field`, and the empty array is the claim (issue 1777). */
const RAW_FIELD_ALLOWLIST = Object.freeze([]);

const { callSites } = definePrimitiveAdoptionContract({
  label: 'fabricate-field',
  tag: 'Field',
  primitive: FIELD_PATH,
  contractClass: 'fabricate-field',
  allowlist: RAW_FIELD_ALLOWLIST,
  callSiteFloor: 70,
  fileFloor: 20,

  detectorFixture: {
    source: [
      '<!--',
      '  Prose mentioning fabricate-field, which is how five real components document the box.',
      '-->',
      '<script>',
      "  import Field from '../../components/Field.svelte';",
      '</script>',
      '',
      '<label class="fabricate-field">a converted-looking site that is still raw</label>',
      '<div class="wrapper fabricate-field manager-thing">a second one, mid-list</div>',
      '<span class="manager-field-error">a different class entirely</span>',
      '<div class="fab-manager-fields">a different class again</div>',
      '<Field as="div" class="manager-thing">the converted shape</Field>',
      '',
      '<style>',
      '  .fabricate-field { color: red; }',
      '</style>',
    ].join('\n'),
    expected: 2,
    lowered: ['class="fabricate-field"', 'class="manager-box"'],
    loweredExpected: 1,
  },

  rawRemedy:
    'these components hand-roll the `.fabricate-field` box that `src/ui/svelte/components/' +
    'Field.svelte` owns. Render `<Field as="label|div|fieldset">` instead — and choose the ' +
    '`as` from what the markup MEANS, because a `<label>` names the control it wraps and a ' +
    '`<div>` does not',

  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread. Six sites in this conversion carried one, and all six are now explicit. ' +
    'Nothing in the tree reads these by VALUE today — every consumer is a `[data-x]` presence ' +
    'selector — so this is markup fidelity rather than a live defect. It is pinned anyway ' +
    'because the cost of getting it wrong is a `[data-x=""]` selector or a `dataset.x` ' +
    'truthiness test flipping silently on a screen nobody was changing',
});

/** The host set the primitive itself declares, read out of its source rather than re-typed. */
function declaredHosts() {
  const source = SOURCES[FIELD_PATH];
  const declaration = /const HOSTS = new Set\(\[([^\]]*)\]\)/.exec(source);
  assert.ok(declaration, `${FIELD_PATH} no longer declares \`const HOSTS = new Set([…])\``);
  return [...declaration[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
}

/** Every call site's declared host, or `null` where it is missing or computed. */
const literalHosts = callSites.map((site) => {
  const declared = site.attribute('as') ?? '';
  const literal = /^as="([a-z]+)"$/.exec(declared);
  return { file: site.file, raw: declared, as: literal ? literal[1] : null };
});

test('every Field renders with a literal host from the closed set', () => {
  const hosts = declaredHosts();
  const bad = literalHosts
    .filter((site) => !site.as || !hosts.includes(site.as))
    .map((site) => `${site.file}: ${site.raw || '<Field> with no `as`'}`)
    .sort();
  assert.deepEqual(
    bad,
    [],
    'a `<Field>` must state its host as a LITERAL `as="label" | "div" | "fieldset"`. A missing ' +
      '`as` renders a `<div>` and the field stops naming its control; a computed one puts the ' +
      `host back into per-site data, which is what this primitive exists to end:\n  ${bad.join('\n  ')}`
  );
});

test('the host set is the closed three, and all three still have real users', () => {
  assert.deepEqual(
    declaredHosts(),
    ['label', 'div', 'fieldset'],
    'the `as` set changed. It is closed on purpose: a fourth host is a new accessibility ' +
      'contract, not a styling variant, and it is also the cheapest way to green a call site ' +
      'that should have picked one of these three.'
  );
  // Floors, not exact counts — a new field is an ordinary edit. What is NOT ordinary is the
  // SPLIT collapsing: flattening the 31 `<div>` fields into `<label>`s renders identically and
  // changes what a screen reader announces on 31 screens.
  // The `label` floor dropped 45 → 40 when the checks studio's selects moved onto the `Select`
  // primitive: each wrapper existed to name a native `<select>`, and the primitive now carries
  // that name itself (`ariaLabelledBy`/`ariaLabel`), so no site changed which host announces it.
  // It dropped again 40 → 36 when the gathering task editor's four captioned selects converted:
  // each `<Field as="label">` demoted to `as="div"` and the caption's id became the trigger's
  // `ariaLabelledBy`, so the same caption still names the same control. And again 36 → 35 when the
  // environment overview's danger ceiling converted, the one captioned select of that commit. And
  // 35 → 34 when the environments browser's conditions card converted its current-value picker.
  for (const [host, floor] of [
    ['label', 34],
    ['div', 28],
    ['fieldset', 1],
  ]) {
    const count = literalHosts.filter((site) => site.as === host).length;
    assert.ok(
      count >= floor,
      `only ${count} \`<Field as="${host}">\` call sites remain, below the floor of ${floor}. ` +
        'Each host is a different announcement, so a host losing its users means sites were ' +
        'moved onto another one.'
    );
  }
});

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** The spec's `<Field>` bullet: the line that opens with its path and runs to the next bullet. */
function fieldBullet(spec) {
  const lines = spec.split('\n');
  const start = lines.findIndex((line) => line.includes(`exists at \`${FIELD_PATH}\``));
  assert.ok(start !== -1, 'the ui-visual-style spec no longer has a bullet for Field.svelte');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('- '));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/**
 * What the bullet claims remains deferred: `null` when it says none does, else the stated count of
 * sites. A claim of neither shape is a prose the contract cannot read, and is reported as such.
 */
function statedDeferral(bullet) {
  if (/NO raw `\.fabricate-field` remains/.test(bullet)) return 0;
  const stated = /(\w+) sites? across (\w+) files? (?:remain|stay)/.exec(bullet);
  return stated ? { sites: stated[1], files: stated[2] } : null;
}

test('the spec states exactly the raw `.fabricate-field` deferral the allowlist holds (issue 1873)', () => {
  const spec = readFileSync(
    resolve(import.meta.dirname, '../../openspec/specs/ui-visual-style/spec.md'),
    'utf8'
  );
  const bullet = fieldBullet(spec);
  const stated = statedDeferral(bullet);
  const remaining = RAW_FIELD_ALLOWLIST.reduce((total, entry) => total + entry.count, 0);
  if (RAW_FIELD_ALLOWLIST.length === 0) {
    assert.equal(stated, 0, 'the allowlist is empty, so the bullet must say no raw field remains');
    assert.ok(!/stays deferred/.test(bullet), 'the bullet still describes a deferral');
    return;
  }
  const files = RAW_FIELD_ALLOWLIST.length;
  assert.deepEqual(
    stated && {
      sites: NUMBER_WORDS.indexOf(stated.sites),
      files: NUMBER_WORDS.indexOf(stated.files),
    },
    { sites: remaining, files },
    `the bullet must state ${remaining} sites across ${files} files, matching the allowlist`
  );
});

test('the deferral reader tells an empty claim from a counted one and from neither', () => {
  assert.equal(statedDeferral('NO raw `.fabricate-field` remains'), 0);
  assert.deepEqual(statedDeferral('five sites across three files remain'), {
    sites: 'five',
    files: 'three',
  });
  assert.equal(statedDeferral('nothing stated'), null);
  assert.ok(
    fieldBullet(`- THE manager's field exists at \`${FIELD_PATH}\`\nmore\n- next`).includes('more')
  );
});

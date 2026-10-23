/** Source contract: the manager's icon-only button is written in ONE place (issue 1422). */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import {
  definePrimitiveSourceContract,
  defineSoleWriterClauses,
} from './helpers/primitiveSourceContract.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { openingTagsNamed } from './helpers/svelteTagScan.js';

/**
 * The class only the primitive may write, and the root `styles/fabricate.css` paints the control
 * from (issues 1502 and 1507).
 */
const CONTRACT_CLASS = 'fabricate-icon-button';

const PRIMITIVE = 'src/ui/svelte/components/IconButton.svelte';

/**
 * The `.svelte` files under `src/` that may write the class, each with its reason and the exact
 * number of times it writes it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 1,
    why:
      'the primitive itself, which writes the class once so that no call site has to ' +
      'remember it. The count was 2 while a `//` note on the `class` prop naming the token ' +
      'in prose counted alongside the emission; issue 1515 taught the shared reader to blank ' +
      '`//` comments inside `<script>` — quote-aware, and confined to script so a bare URL in ' +
      'markup survives — so the count is now exactly the one place that writes it',
  }),
]);

/**
 * `component/ComponentIdentityStrip.svelte` WAS the third exemption and is DELIBERATELY GONE,
 * written out rather than deleted so the resolution is legible. Issue 1477 removed the premise
 * rather than doing that work. `CraftingSystemManagerRoot.svelte` wrote the class 6x until issue
 * 1707 moved them, de-duplicated to three, into `environment/GatheringModifierEditor.svelte`;
 * issue 1782 converted one and issue 1777 the last two, so the primitive is the only writer.
 */

/** A role an icon button takes through `role` (issue 2541), never as a class. */
const ROLE_CLASS = /\bis-(?:primary|ghost|danger)\b/;

/** A `class` value, or an `ActionMenu`'s `triggerClass` value, quoted or braced. */
const CLASS_VALUE = /(?:^|\s)class=("[^"]*"|\{[^}]*\})/;
const TRIGGER_CLASS = /\btriggerClass=("[^"]*"|\{[^}]*\})/;

/** A tooltip Foundry would show beside the one the primitive writes from `ariaLabel` or `tooltip`. */
const HAND_WRITTEN_TOOLTIP = /(?:^|\s)(?:title|data-tooltip(?:-html|-text)?)=/;

// Each would still WORK from a call site — the rest spread lands last and `class` appends —
// which is why each needs a gate: the site renders identically and the contract is a convention
// again. A hand-written tooltip also stacks a native `title` or mutes the focus tooltip.
const RESTATEMENTS = Object.freeze([
  Object.freeze({ name: 'type', present: (tag) => /\btype=/.test(tag) }),
  Object.freeze({ name: 'aria-label', present: (tag) => /\baria-label=/.test(tag) }),
  Object.freeze({ name: CONTRACT_CLASS, present: (tag) => tag.includes(CONTRACT_CLASS) }),
  Object.freeze({
    name: 'a role class',
    present: (tag) => ROLE_CLASS.test(CLASS_VALUE.exec(tag)?.[1] ?? ''),
  }),
  Object.freeze({
    name: 'a hand-written tooltip',
    present: (tag) => HAND_WRITTEN_TOOLTIP.test(tag),
  }),
]);

const contract = definePrimitiveSourceContract({
  label: 'icon-button',
  tag: 'IconButton',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // 40 components render the primitive at issue 1777 (35 as it landed); 28 is a real floor.
  callSiteFloor: 28,

  primitiveEmits: {
    // Two tokens, each asserted separately (issue 1502).
    source: Object.freeze([`'${CONTRACT_CLASS}'`, 'data-keyboard-focus="true"']),
    otherwise:
      'the primitive no longer emits something it is the single source of, so a clause here is ' +
      'policing a token that reaches nothing',
  },

  restatements: RESTATEMENTS,

  classOnlyRemedy:
    'a manager icon button is an `<IconButton>`, never a hand-written ' +
    '`class="fabricate-icon-button"`. A role travels as `role` and a per-site state as a ' +
    'pass-through on `class`, the accessible name is the required `ariaLabel` prop, and a per-site ' +
    '`data-*` hook rides the rest spread — see `IconButton.svelte`',

  restatementRemedy:
    'the primitive emits `type="button"` and `fabricate-icon-button` itself, takes the ' +
    'accessible name as `ariaLabel` and shows it as its tooltip, and maps `role` to the ' +
    '`is-primary`/`is-ghost`/`is-danger` classes; an information-bearing hint passes `tooltip`. ' +
    'Restating any of them from a call site re-opens the convention this component exists to close',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on ' +
    'an element, so the rest spread renders `="true"` where the hand-rolled button rendered ' +
    '`=""`. 17 attributes were written bare before this conversion; spell it `data-x=""`',
});

defineSoleWriterClauses({
  label: 'icon-button',
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,
  components: contract.components,
  tokens: [CONTRACT_CLASS],
});

test('every icon button is given an accessible name', () => {
  contract.assertCallSitesAlive();

  // Positive control: the clause is only meaningful while the primitive actually turns `ariaLabel`
  // into an `aria-label`.
  const primitive = contract.components[PRIMITIVE] ?? '';
  assert.ok(
    primitive.includes('aria-label={accessibleName}'),
    'the primitive no longer emits `aria-label` from `ariaLabel`, so this clause is ' +
      'measuring a prop that reaches nothing'
  );

  const offenders = contract.callSiteTags
    .filter(([, tag]) => !/(?:^|\s)(?:ariaLabel=|\{ariaLabel\})/.test(tag))
    .map(([file, tag]) => `${file}: ${tag.replaceAll(/\s+/g, ' ').slice(0, 120)}`);

  assert.deepEqual(
    offenders,
    [],
    'an icon-only control whose accessible name is missing announces itself as "button" and ' +
      'nothing else. It is invisible on screen, so no frame and no geometry probe can catch ' +
      'it — `design-system/spec.md:173-177` requires the name to be a REQUIRED prop:\n  ' +
      offenders.join('\n  ')
  );
});

test('a tag NAMED in a `//` comment is not read as a call site', () => {
  // THE CONTROL FOR THE CORPUS READER, rather than for the primitive (issue 1515).
  contract.assertCallSitesAlive();

  // NON-VACUITY, and it is the whole clause: read from the RAW tree rather than from the corpus,
  // because the corpus is the thing under test.
  const raw = collectSources(path.join(repoRoot, 'src'), { extensions: ['.svelte'] });
  const prose = Object.keys(raw).filter((file) => /^\s*\/\/.*<IconButton\b/m.test(raw[file]));
  assert.ok(
    prose.length > 0,
    'no component names `<IconButton>` inside a `//` comment any more, so this control is ' +
      'measuring nothing and the reader is unguarded'
  );

  // `<IconButton>` with nothing between the name and the `>` is the shape prose produces and the
  // shape no call site has: a bare one would render an icon button with no glyph and no
  // accessible name. `</IconButton>` does not match — the `/` sits where the `I` would.
  const readAsMarkup = prose.filter((file) => /<IconButton>/.test(contract.components[file]));
  assert.deepEqual(
    readAsMarkup,
    [],
    'the corpus reader is returning comment prose as an opening tag, so every clause stated ' +
      'over `callSiteTags` is now accusing files of what their documentation says:\n  ' +
      readAsMarkup.join('\n  ')
  );
});

test('no ActionMenu trigger takes a role class on `triggerClass`', () => {
  const triggers = Object.entries(contract.components).flatMap(([file, source]) =>
    openingTagsNamed(source, 'ActionMenu').map((tag) => [file, tag])
  );
  assert.ok(triggers.length > 10, `found only ${triggers.length} ActionMenu tags`);
  const offenders = triggers
    .filter(([, tag]) => ROLE_CLASS.test(TRIGGER_CLASS.exec(tag)?.[1] ?? ''))
    .map(([file]) => file);
  assert.deepEqual(offenders, [], 'the trigger is an `IconButton`, whose role is its `role`');
});

/** The View Lab fixtures that wire a primitive as a shipped caller does, copying its call sites. */
const LAB_FIXTURES = 'tests/view-lab/primitives/fixtures';

test('the View Lab fixtures copy the swept call sites, not the old ones', () => {
  const fixtures = collectSources(path.join(repoRoot, LAB_FIXTURES), { extensions: ['.svelte'] });
  const tags = (name) =>
    Object.entries(fixtures).flatMap(([file, source]) =>
      openingTagsNamed(source, name).map((tag) => [file, tag])
    );
  const iconButtons = tags('IconButton');
  const triggers = tags('ActionMenu');
  // NON-VACUITY: `LogListHistory` wires HistoryList's dismiss, `ListRowDefaultBrowse` a row menu.
  assert.ok(iconButtons.length > 0, `no fixture under ${LAB_FIXTURES} renders an IconButton`);
  assert.ok(triggers.length > 0, `no fixture under ${LAB_FIXTURES} renders an ActionMenu`);
  const offenders = [
    ...iconButtons.flatMap(([file, tag]) =>
      RESTATEMENTS.filter(({ present }) => present(tag)).map(({ name }) => `${file}: ${name}`)
    ),
    ...triggers
      .filter(([, tag]) => ROLE_CLASS.test(TRIGGER_CLASS.exec(tag)?.[1] ?? ''))
      .map(([file]) => `${file}: a role class on \`triggerClass\``),
  ];
  assert.deepEqual(
    offenders,
    [],
    'a fixture draws what its caller ships, so it passes `role`, `icon` and the name tooltip too'
  );
});

test('the role vocabulary is a named mapping in the primitive, with no neutral class', () => {
  const source = contract.primitiveMarkup();
  const mapping = /const ROLE_CLASSES = \{([\s\S]*?)\};/.exec(source);
  assert.ok(mapping, 'IconButton declares no `ROLE_CLASSES` mapping');
  const roles = [...mapping[1].matchAll(/^\s*'?([\w-]+)'?:/gm)].map(([, role]) => role);
  assert.deepEqual(roles, ['primary', 'ghost', 'danger', 'ghost-danger']);
});
